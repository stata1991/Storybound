"""
Storybound — Illustration Pipeline (Modal.com)

Self-hosted Stable Diffusion XL + LoRA on Modal serverless GPU.
Photos are processed in memory only — never written to disk.

Privacy contract (matches constraints.md):
  1. Photos uploaded → Supabase Storage private bucket
  2. Processing triggered → photos downloaded to Modal memory only
  3. LoRA training completes → source photos deleted from Modal memory immediately
  4. Face reference saved → source photos deleted from Supabase Storage
  5. Book generation complete → LoRA weights deleted
  6. Nothing reversible to original photo is ever retained after step 4
"""

import base64
import gc
import io
import json
import os
import shutil
import uuid
from pathlib import Path

import modal
from fastapi import Request

# ─── Modal app ───────────────────────────────────────────────────────────────

app = modal.App("storybound-illustration")

# ─── Volume for LoRA weights only (never source photos) ─────────────────────

lora_volume = modal.Volume.from_name(
    "storybound-lora-weights", create_if_missing=True
)

LORA_VOLUME_PATH = "/lora-weights"
MODEL_CACHE_PATH = "/model-cache"

# ─── Secrets ─────────────────────────────────────────────────────────────────

secrets = modal.Secret.from_name("storybound-secrets")

# ─── Container image ────────────────────────────────────────────────────────

pipeline_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch>=2.0.0",
        "torchvision>=0.15.0",
        "diffusers>=0.25.0",
        "transformers>=4.35.0",
        "accelerate>=0.25.0",
        "peft>=0.7.0",
        "Pillow>=10.0.0",
        "fastapi[standard]",
        "basicsr>=1.4.2",
        "realesrgan>=0.3.0",
        "opencv-python-headless>=4.8.0",
    )
    .run_commands(
        # Pre-download SDXL base model into the image so cold starts
        # only pay for weight loading, not a multi-GB download.
        "python -c \""
        "from huggingface_hub import snapshot_download; "
        "snapshot_download("
        "'stabilityai/stable-diffusion-xl-base-1.0', "
        f"cache_dir='{MODEL_CACHE_PATH}'"
        ")\"",
        # Pre-download Real-ESRGAN weights for cover upscaling
        "python -c \""
        "import urllib.request, os; "
        "os.makedirs('/root/.cache/realesrgan', exist_ok=True); "
        "urllib.request.urlretrieve("
        "'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth', "
        "'/root/.cache/realesrgan/RealESRGAN_x2plus.pth'"
        ")\"",
    )
)

# ─── Style suffix ────────────────────────────────────────────────────────────

STYLE_SUFFIX = (
    ", watercolor children's book illustration, "
    "Ghibli-warm, soft lighting, detailed background, age-appropriate"
)

COVER_NEGATIVE_PROMPT = (
    "text, title, logo, watermark, signature, words, letters, "
    "blurry, deformed, extra limbs, cropped"
)


# ─── Cover helpers ────────────────────────────────────────────────────────────


def build_cover_prompt(character_sheet: str = "") -> str:
    """Build a dedicated cover prompt using the character identity token."""
    base = (
        "A full-body portrait of sks child standing in a magical storybook "
        "landscape, looking at the viewer with a warm smile, golden hour lighting"
    )
    return base + STYLE_SUFFIX


def upscale_with_realesrgan(pil_image):
    """Upscale a PIL image 2x using Real-ESRGAN."""
    import numpy as np
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    model = RRDBNet(
        num_in_ch=3, num_out_ch=3, num_feat=64,
        num_block=23, num_grow_ch=32, scale=2,
    )
    upsampler = RealESRGANer(
        scale=2,
        model_path="/root/.cache/realesrgan/RealESRGAN_x2plus.pth",
        model=model,
        half=True,  # fp16 on GPU
    )

    # PIL → numpy (BGR for OpenCV)
    img_np = np.array(pil_image)[:, :, ::-1]
    output, _ = upsampler.enhance(img_np, outscale=2)
    # numpy (BGR) → PIL (RGB)
    from PIL import Image

    output_rgb = output[:, :, ::-1]
    return Image.fromarray(output_rgb)


# ─── Auth helper ─────────────────────────────────────────────────────────────


def verify_auth(req) -> bool:
    """Check Bearer token against MODAL_AUTH_TOKEN secret."""
    expected = os.environ.get("MODAL_AUTH_TOKEN", "")
    if not expected:
        return False
    auth_header = req.headers.get("authorization", "")
    return auth_header == f"Bearer {expected}"


def auth_error():
    """Return a 401 JSON response."""
    import fastapi

    raise fastapi.HTTPException(status_code=401, detail={"error": "Unauthorized"})


def web_error(body: dict, status: int = 400):
    """Raise an HTTP error response."""
    import fastapi

    raise fastapi.HTTPException(status_code=status, detail=body)


# ─── 1. Train face model ────────────────────────────────────────────────────


@app.function(
    image=pipeline_image,
    gpu="A10G",
    timeout=900,  # 15 min max for training
    volumes={LORA_VOLUME_PATH: lora_volume},
    secrets=[secrets],
)
@modal.fastapi_endpoint(method="POST")
async def train_face_model(req: Request):
    """
    Receive base64-encoded photos, run DreamBooth LoRA training on SDXL,
    save only the LoRA adapter weights. Source photos never touch disk.

    Request body:
      { "photos": ["base64...", ...] }

    Response:
      { "face_model_id": "uuid", "steps": 150, "status": "ok" }
    """
    if not verify_auth(req):
        auth_error()

    body = await req.json()

    import torch
    from diffusers import StableDiffusionXLPipeline
    from peft import LoraConfig, get_peft_model
    from PIL import Image
    from torch.utils.data import DataLoader, Dataset
    from transformers import CLIPTokenizer

    # ── Parse photos from base64 (memory only) ─────────────────────────────

    photos_b64 = body.get("photos", [])
    if not photos_b64 or len(photos_b64) < 1:
        web_error({"error": "At least 1 photo required"})

    if len(photos_b64) > 10:
        web_error({"error": "Maximum 10 photos allowed"})

    face_model_id = str(uuid.uuid4())

    # Decode to PIL — pure memory, no disk
    pil_images = []
    for b64_str in photos_b64:
        img_bytes = base64.b64decode(b64_str)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        # Center-crop to square for face focus
        w, h = img.size
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        img = img.crop((left, top, left + side, top + side))
        img = img.resize((512, 512), Image.LANCZOS)
        pil_images.append(img)

    # ── Load base model ─────────────────────────────────────────────────────

    pipe = StableDiffusionXLPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0",
        cache_dir=MODEL_CACHE_PATH,
        torch_dtype=torch.float16,
        variant="fp16",
    )
    pipe.to("cuda")

    vae = pipe.vae
    unet = pipe.unet
    text_encoder = pipe.text_encoder
    text_encoder_2 = pipe.text_encoder_2
    tokenizer = pipe.tokenizer
    tokenizer_2 = pipe.tokenizer_2
    noise_scheduler = pipe.scheduler

    # ── Apply LoRA to UNet ──────────────────────────────────────────────────

    lora_config = LoraConfig(
        r=4,
        lora_alpha=4,
        target_modules=[
            "to_q",
            "to_k",
            "to_v",
            "to_out.0",
        ],
        lora_dropout=0.0,
    )
    unet = get_peft_model(unet, lora_config)
    unet.train()

    # Freeze everything except LoRA
    vae.requires_grad_(False)
    text_encoder.requires_grad_(False)
    text_encoder_2.requires_grad_(False)

    # ── Prepare training data ───────────────────────────────────────────────

    INSTANCE_PROMPT = "a photo of sks child"

    # Tokenize the instance prompt for both encoders
    tokens_1 = tokenizer(
        INSTANCE_PROMPT,
        padding="max_length",
        max_length=tokenizer.model_max_length,
        truncation=True,
        return_tensors="pt",
    ).input_ids.to("cuda")

    tokens_2 = tokenizer_2(
        INSTANCE_PROMPT,
        padding="max_length",
        max_length=tokenizer_2.model_max_length,
        truncation=True,
        return_tensors="pt",
    ).input_ids.to("cuda")

    # Encode text once (frozen encoders)
    with torch.no_grad():
        encoder_hidden_states = text_encoder(tokens_1)[0]
        pooled_output_2 = text_encoder_2(tokens_2, output_hidden_states=True)
        encoder_hidden_states_2 = pooled_output_2.hidden_states[-1]
        pooled_prompt_embeds = pooled_output_2.text_embeds

        # Ensure both have batch dimension (3D) before concatenating
        if encoder_hidden_states.dim() == 2:
            encoder_hidden_states = encoder_hidden_states.unsqueeze(0)
        if encoder_hidden_states_2.dim() == 2:
            encoder_hidden_states_2 = encoder_hidden_states_2.unsqueeze(0)

        # Concatenate text encoder outputs
        prompt_embeds = torch.cat(
            [encoder_hidden_states, encoder_hidden_states_2], dim=-1
        )

    # Encode images with VAE
    import torchvision.transforms as T

    transform = T.Compose(
        [
            T.ToTensor(),
            T.Normalize([0.5], [0.5]),
        ]
    )

    latents_list = []
    with torch.no_grad():
        for img in pil_images:
            img_tensor = transform(img).unsqueeze(0).to("cuda", dtype=torch.float16)
            latent = vae.encode(img_tensor).latent_dist.sample() * vae.config.scaling_factor
            latents_list.append(latent)

    # ── DELETE source photos from memory immediately after encoding ──────────
    # Privacy: constraint step 3 — source photos deleted from Modal memory
    del pil_images
    del img_bytes
    del img
    del img_tensor
    photos_b64.clear()
    gc.collect()

    # ── Training loop ───────────────────────────────────────────────────────

    optimizer = torch.optim.AdamW(unet.parameters(), lr=1e-4, weight_decay=1e-2)

    num_steps = 150
    num_images = len(latents_list)

    # SDXL additional conditioning: time_ids
    add_time_ids = torch.tensor(
        [[512.0, 512.0, 0.0, 0.0, 512.0, 512.0]],
        device="cuda",
        dtype=torch.float16,
    )

    for step in range(num_steps):
        # Cycle through images
        latent = latents_list[step % num_images]

        # Sample noise and timestep
        noise = torch.randn_like(latent)
        timesteps = torch.randint(
            0,
            noise_scheduler.config.num_train_timesteps,
            (1,),
            device="cuda",
        ).long()

        # Add noise to latent
        noisy_latent = noise_scheduler.add_noise(latent, noise, timesteps)

        # Predict noise
        added_cond_kwargs = {
            "text_embeds": pooled_prompt_embeds.to(dtype=torch.float16),
            "time_ids": add_time_ids,
        }
        noise_pred = unet(
            noisy_latent,
            timesteps,
            encoder_hidden_states=prompt_embeds.to(dtype=torch.float16),
            added_cond_kwargs=added_cond_kwargs,
        ).sample

        # MSE loss against actual noise
        loss = torch.nn.functional.mse_loss(noise_pred, noise)

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

    # ── Save LoRA weights to Volume (not source photos) ─────────────────────

    save_dir = Path(LORA_VOLUME_PATH) / face_model_id
    save_dir.mkdir(parents=True, exist_ok=True)

    # Save only the LoRA adapter weights
    unet.save_pretrained(str(save_dir))
    lora_volume.commit()

    # ── Cleanup GPU memory ──────────────────────────────────────────────────

    del unet, vae, text_encoder, text_encoder_2, pipe
    del latents_list, noise, noisy_latent, noise_pred
    del optimizer
    gc.collect()
    torch.cuda.empty_cache()

    return {
        "face_model_id": face_model_id,
        "steps": num_steps,
        "status": "ok",
    }


# ─── 2. Generate illustrations ──────────────────────────────────────────────


@app.function(
    image=pipeline_image,
    gpu="A10G",
    timeout=600,  # 10 min max for generation
    volumes={LORA_VOLUME_PATH: lora_volume},
    secrets=[secrets],
)
@modal.fastapi_endpoint(method="POST")
async def generate_illustrations(req: Request):
    """
    Load LoRA weights and generate illustrations from prompts.
    Index 0 is always a dedicated cover image (1024×1024 + 2x upscale).

    Request body:
      {
        "face_model_id": "uuid",
        "prompts": ["scene 1", "scene 2", ...],
        "cover_prompt": "optional dedicated cover prompt"
      }

    Response:
      {
        "face_model_id": "uuid",
        "illustrations": [
          {"index": 0, "data": "base64...", "prompt": "cover"},
          {"index": 1, "data": "base64...", "prompt": "scene 1"},
          ...
        ]
      }
    """
    if not verify_auth(req):
        auth_error()

    body = await req.json()

    import torch
    from diffusers import StableDiffusionXLPipeline

    face_model_id = body.get("face_model_id", "")
    prompts = body.get("prompts", [])
    cover_prompt_text = body.get("cover_prompt", "")

    if not face_model_id:
        web_error({"error": "face_model_id required"})

    if not prompts or len(prompts) > 12:
        web_error({"error": "Between 1 and 12 prompts required"})

    # Verify LoRA weights exist
    lora_dir = Path(LORA_VOLUME_PATH) / face_model_id
    if not lora_dir.exists():
        web_error({"error": f"Face model {face_model_id} not found"}, status=404)

    # ── Load pipeline + LoRA ────────────────────────────────────────────────

    pipe = StableDiffusionXLPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0",
        cache_dir=MODEL_CACHE_PATH,
        torch_dtype=torch.float16,
        variant="fp16",
    )
    pipe.to("cuda")
    pipe.load_lora_weights(str(lora_dir))

    # ── Generate cover (index 0): 1024×1024, higher quality ────────────────

    illustrations = []

    # Use dedicated cover prompt, or fall back to build_cover_prompt()
    if not cover_prompt_text:
        cover_prompt_text = build_cover_prompt()
    styled_cover = cover_prompt_text.rstrip(". ") + STYLE_SUFFIX

    cover_image = pipe(
        prompt=styled_cover,
        negative_prompt=COVER_NEGATIVE_PROMPT,
        width=1024,
        height=1024,
        num_inference_steps=40,
        guidance_scale=8.5,
    ).images[0]

    # Free SDXL pipe before loading Real-ESRGAN to avoid OOM
    del pipe
    gc.collect()
    torch.cuda.empty_cache()

    # Upscale cover 2x via Real-ESRGAN (~2048×2048)
    cover_image = upscale_with_realesrgan(cover_image)

    buf = io.BytesIO()
    cover_image.save(buf, format="PNG")
    illustrations.append({
        "index": 0,
        "data": base64.b64encode(buf.getvalue()).decode("utf-8"),
        "prompt": cover_prompt_text,
    })
    del cover_image
    gc.collect()

    # ── Reload pipeline for scene generation ─────────────────────────────

    pipe = StableDiffusionXLPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0",
        cache_dir=MODEL_CACHE_PATH,
        torch_dtype=torch.float16,
        variant="fp16",
    )
    pipe.to("cuda")
    pipe.load_lora_weights(str(lora_dir))

    # ── Generate scene images (index 1+): 768×768 ───────────────────────

    for i, raw_prompt in enumerate(prompts):
        styled_prompt = raw_prompt.rstrip(". ") + STYLE_SUFFIX

        image = pipe(
            prompt=styled_prompt,
            width=768,
            height=768,
            num_inference_steps=30,
            guidance_scale=7.5,
        ).images[0]

        buf = io.BytesIO()
        image.save(buf, format="PNG")
        b64_data = base64.b64encode(buf.getvalue()).decode("utf-8")

        illustrations.append({
            "index": i + 1,
            "data": b64_data,
            "prompt": raw_prompt,
        })

    # ── Cleanup ─────────────────────────────────────────────────────────────

    del pipe
    gc.collect()
    torch.cuda.empty_cache()

    return {
        "face_model_id": face_model_id,
        "illustrations": illustrations,
    }


# ─── 3. Delete face model (LoRA weights cleanup) ────────────────────────────


@app.function(
    image=pipeline_image,
    volumes={LORA_VOLUME_PATH: lora_volume},
    secrets=[secrets],
)
@modal.fastapi_endpoint(method="POST")
async def delete_face_model(req: Request):
    """
    Delete LoRA weights from Modal Volume after book generation is complete.
    Maps to constraint step 5: "Book generation complete → LoRA weights deleted"

    Request body:
      { "face_model_id": "uuid" }

    Response:
      { "deleted": true, "face_model_id": "uuid" }
    """
    if not verify_auth(req):
        auth_error()

    body = await req.json()

    face_model_id = body.get("face_model_id", "")
    if not face_model_id:
        web_error({"error": "face_model_id required"})

    lora_dir = Path(LORA_VOLUME_PATH) / face_model_id

    if not lora_dir.exists():
        return {
            "deleted": False,
            "face_model_id": face_model_id,
            "note": "Not found — may have already been deleted",
        }

    shutil.rmtree(str(lora_dir))
    lora_volume.commit()

    return {
        "deleted": True,
        "face_model_id": face_model_id,
    }


# ─── 4. Health check ────────────────────────────────────────────────────────


@app.function(
    image=pipeline_image,
    secrets=[secrets],
)
@modal.fastapi_endpoint(method="POST")
async def health_check(req: Request):
    """
    Lightweight health check — no model loading.

    Response:
      { "status": "ok", "gpu": "A10G", "volume_available": true }
    """
    if not verify_auth(req):
        auth_error()

    volume_ok = Path(LORA_VOLUME_PATH).exists() if LORA_VOLUME_PATH else False

    return {
        "status": "ok",
        "gpu": "A10G",
        "volume_available": volume_ok,
    }
