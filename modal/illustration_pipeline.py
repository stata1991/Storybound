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
    .apt_install(
        "libgl1-mesa-glx",
        "libglib2.0-0",
        "git",
    )
    .pip_install(
        "torch>=2.0.0",
        "torchvision>=0.15.0",
        "diffusers>=0.25.0",
        "transformers>=4.35.0",
        "accelerate>=0.25.0",
        "peft>=0.7.0",
        "Pillow>=10.0.0",
        "fastapi[standard]",
        "opencv-python-headless>=4.8.0",
        "httpx>=0.27.0",
        "git+https://github.com/tencent-ailab/IP-Adapter.git",
        "insightface",
        "onnxruntime",
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
        # Pre-download madebyollin fp16-stable VAE
        "python -c \""
        "from huggingface_hub import snapshot_download; "
        "snapshot_download("
        "'madebyollin/sdxl-vae-fp16-fix', "
        f"cache_dir='{MODEL_CACHE_PATH}'"
        ")\"",
        # Pre-download Real-ESRGAN weights for cover upscaling
        "python -c \""
        "import urllib.request, os; "
        "os.makedirs('/root/.cache/realesrgan', exist_ok=True); "
        "urllib.request.urlretrieve("
        "'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-animevideov3.pth', "
        "'/root/.cache/realesrgan/realesr-animevideov3.pth'"
        ")\"",
        # Pre-download InsightFace buffalo_l model for face embedding extraction
        "python -c \""
        "from insightface.app import FaceAnalysis; "
        "app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider']); "
        "app.prepare(ctx_id=0, det_size=(640, 640))"
        "\"",
        # Pre-download IP-Adapter FaceID SDXL weights
        "python -c \""
        "from huggingface_hub import hf_hub_download; "
        "hf_hub_download("
        "repo_id='h94/IP-Adapter-FaceID', "
        "filename='ip-adapter-faceid_sdxl.bin', "
        f"local_dir='{MODEL_CACHE_PATH}'"
        ")\"",
    )
)

# ─── Style suffix ────────────────────────────────────────────────────────────

# Kept short (~7 tokens) to stay within CLIP 77-token budget
STYLE_SUFFIX = ", gouache illustration, children's book, warm colors"

COVER_NEGATIVE_PROMPT = (
    "text, title, logo, watermark, signature, words, letters, "
    "blurry, deformed, extra limbs, cropped, "
    "teenager, adult, woman, man, older person, "
    "mature face, adult proportions"
)

SCENE_NEGATIVE_PROMPT = (
    "text, title, logo, watermark, signature, words, letters, "
    "blurry, deformed, extra limbs, cropped, "
    "teenager, adult, woman, man, older person, "
    "mature face, adult proportions, earrings on adult, "
    "adult jewelry"
)


# ─── Age prefix (Fix 1) ─────────────────────────────────────────────────────


def get_age_prefix(age: int, pronouns: str = "they_them") -> str:
    """
    Short age-anchoring prefix for SDXL prompts (~4 tokens).
    Must come FIRST — before LoRA token and scene description.
    Kept minimal to stay within CLIP 77-token budget.
    """
    if "she" in pronouns.lower() or pronouns == "she_her":
        word = "girl"
    elif "he" in pronouns.lower() or pronouns == "he_him":
        word = "boy"
    else:
        word = "child"

    clamped = max(3, min(10, age))

    if clamped <= 4:
        return f"3-year-old toddler {word}"
    elif clamped <= 6:
        return f"5-year-old little {word}"
    elif clamped <= 8:
        return f"8-year-old {word}"
    else:
        return f"10-year-old preteen {word}"


def truncate_scene_description(prompt: str, max_words: int = 20) -> str:
    """Take first sentence only, max N words. Strips [FACE REF...] tags."""
    import re
    # Remove [FACE REF: ...] tags — SDXL can't use text as image references
    prompt = re.sub(r"\[FACE REF[^\]]*\]", "", prompt).strip()
    # Take first sentence
    first_sentence = prompt.split(".")[0].strip()
    words = first_sentence.split()
    if len(words) > max_words:
        first_sentence = " ".join(words[:max_words])
    return first_sentence


def extract_core_appearance(description: str, max_words: int = 10) -> str:
    """Extract the 3 most distinctive visual features, max N words."""
    if not description:
        return ""
    # Split on commas, take first 3 meaningful parts
    parts = [p.strip() for p in description.split(",") if p.strip()]
    result = ", ".join(parts[:3])
    words = result.split()
    if len(words) > max_words:
        result = " ".join(words[:max_words])
    return result


# ─── Color mood from memory photos (Fix 8B) ─────────────────────────────────


def get_dominant_color_mood(photos_b64: list) -> str:
    """
    Analyze up to 3 memory photos to extract color/lighting mood keywords.
    Appended to style suffix for scene generation.
    """
    from PIL import Image

    moods = set()
    for b64 in photos_b64[:3]:
        try:
            img = Image.open(
                io.BytesIO(base64.b64decode(b64))
            ).convert("RGB").resize((50, 50))
            pixels = list(img.getdata())
            avg_r = sum(p[0] for p in pixels) / len(pixels)
            avg_g = sum(p[1] for p in pixels) / len(pixels)
            avg_b = sum(p[2] for p in pixels) / len(pixels)

            if avg_r > 180 and avg_g > 140:
                moods.add("warm golden lighting")
            elif avg_b > 180:
                moods.add("cool bright daylight")
            elif avg_r > 160 and avg_b < 120:
                moods.add("warm cozy indoor lighting")
            else:
                moods.add("soft natural lighting")
        except Exception:
            continue

    return ", ".join(moods) if moods else ""


# ─── Cover helpers ────────────────────────────────────────────────────────────


def build_cover_prompt(character_sheet: str = "") -> str:
    """Build a dedicated cover prompt using the character identity token."""
    base = (
        "A full-body portrait of sks child standing in a magical storybook "
        "landscape, looking at the viewer with a warm smile, golden hour lighting"
    )
    return base + STYLE_SUFFIX


def upscale_with_realesrgan(image: "Image.Image") -> "Image.Image":
    """
    2x upscale using Real-ESRGAN animevideov3 weights.
    Pure PyTorch implementation — no basicsr or realesrgan packages.
    """
    import numpy as np
    import torch
    import torch.nn as nn
    from PIL import Image

    model_path = "/root/.cache/realesrgan/realesr-animevideov3.pth"

    if not os.path.exists(model_path):
        raise RuntimeError(
            f"Real-ESRGAN weights not found at {model_path}. "
            "Rebuild the Modal image with: modal deploy modal/illustration_pipeline.py"
        )

    # SRVGGNetCompact architecture — matches animevideov3 weights exactly
    # Implementing inline to avoid any external package dependency
    class SRVGGNetCompact(nn.Module):
        def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64,
                     num_conv=16, upscale=4, act_type='prelu'):
            super().__init__()
            self.num_in_ch = num_in_ch
            self.num_out_ch = num_out_ch
            self.num_feat = num_feat
            self.num_conv = num_conv
            self.upscale = upscale
            self.act_type = act_type

            self.body = nn.ModuleList()
            self.body.append(nn.Conv2d(num_in_ch, num_feat, 3, 1, 1))
            if act_type == 'relu':
                activation = nn.ReLU(inplace=True)
            elif act_type == 'prelu':
                activation = nn.PReLU(num_parameters=num_feat)
            elif act_type == 'leakyrelu':
                activation = nn.LeakyReLU(negative_slope=0.1, inplace=True)
            self.body.append(activation)

            for _ in range(num_conv):
                self.body.append(nn.Conv2d(num_feat, num_feat, 3, 1, 1))
                if act_type == 'relu':
                    activation = nn.ReLU(inplace=True)
                elif act_type == 'prelu':
                    activation = nn.PReLU(num_parameters=num_feat)
                elif act_type == 'leakyrelu':
                    activation = nn.LeakyReLU(negative_slope=0.1, inplace=True)
                self.body.append(activation)

            self.body.append(
                nn.Conv2d(num_feat, num_out_ch * upscale * upscale, 3, 1, 1)
            )
            self.upsampler = nn.PixelShuffle(upscale)

        def forward(self, x):
            out = x
            for layer in self.body:
                out = layer(out)
            out = self.upsampler(out)
            # add the nearest upsampled input as residual
            base = torch.nn.functional.interpolate(
                x, scale_factor=self.upscale,
                mode='nearest'
            )
            return out + base

    # Load model
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = SRVGGNetCompact(
        num_in_ch=3, num_out_ch=3,
        num_feat=64, num_conv=16,
        upscale=4, act_type='prelu'
    )

    # Load weights — handle both raw state dict and wrapped formats
    weights = torch.load(model_path, map_location=device)
    if 'params' in weights:
        model.load_state_dict(weights['params'], strict=True)
    elif 'params_ema' in weights:
        model.load_state_dict(weights['params_ema'], strict=True)
    else:
        model.load_state_dict(weights, strict=True)

    model = model.to(device)
    model.eval()

    # Convert PIL to tensor
    img_np = np.array(image.convert("RGB")).astype(np.float32) / 255.0
    img_tensor = torch.from_numpy(img_np).permute(2, 0, 1).unsqueeze(0).to(device)

    # Upscale with autocast on GPU
    # A10G has 24GB — 1024x1024 at fp32 is fine without tiling
    _, _, h, w = img_tensor.shape

    with torch.no_grad():
        if torch.cuda.is_available():
            with torch.cuda.amp.autocast():
                output_4x = model(img_tensor)
        else:
            output_4x = model(img_tensor)

    # Downsample from 4x to 2x
    output_2x = torch.nn.functional.interpolate(
        output_4x,
        size=(h * 2, w * 2),
        mode='bicubic',
        align_corners=False
    )

    # Convert back to PIL
    output_np = output_2x.squeeze(0).permute(1, 2, 0).cpu().numpy()
    output_np = (output_np * 255.0).clip(0, 255).astype(np.uint8)
    return Image.fromarray(output_np)


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

    # ── Parse webhook callback params (optional — enables async flow) ──────
    callback_url = body.get("callback_url")
    child_id = body.get("child_id")
    harvest_id = body.get("harvest_id")

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
    import cv2
    import numpy as np

    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )

    pil_images = []
    n_cropped = 0

    for i, b64_str in enumerate(photos_b64):
        img_bytes = base64.b64decode(b64_str)
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        w, h = img.size

        # Face detection on grayscale numpy array
        gray = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
        faces = face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(50, 50)
        )

        if len(faces) > 0:
            # Use largest face by area
            fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])

            # Add 40% padding around face bounding box
            pad_x = int(fw * 0.4)
            pad_y = int(fh * 0.4)
            x1 = max(0, fx - pad_x)
            y1 = max(0, fy - pad_y)
            x2 = min(w, fx + fw + pad_x)
            y2 = min(h, fy + fh + pad_y)

            # Make it square (expand the shorter side)
            crop_w = x2 - x1
            crop_h = y2 - y1
            if crop_w > crop_h:
                diff = crop_w - crop_h
                y1 = max(0, y1 - diff // 2)
                y2 = min(h, y1 + crop_w)
            elif crop_h > crop_w:
                diff = crop_h - crop_w
                x1 = max(0, x1 - diff // 2)
                x2 = min(w, x1 + crop_h)

            img = img.crop((x1, y1, x2, y2))
            n_cropped += 1
            print(f"Photo {i}: face detected, cropped to {x2-x1}x{y2-y1}")
        else:
            # Fallback: center-crop to square
            side = min(w, h)
            left = (w - side) // 2
            top = (h - side) // 2
            img = img.crop((left, top, left + side, top + side))
            print(f"Photo {i}: no face detected, using original")

        img = img.resize((512, 512), Image.LANCZOS)
        pil_images.append(img)

    print(f"Preprocessed {n_cropped}/{len(photos_b64)} photos with face crops")

    # ── Extract face embedding via InsightFace (for IP-Adapter at gen time) ─

    from insightface.app import FaceAnalysis

    face_app = FaceAnalysis(
        name="buffalo_l",
        providers=["CUDAExecutionProvider"],
    )
    face_app.prepare(ctx_id=0, det_size=(640, 640))

    best_embedding = None
    best_face_size = 0

    for idx, img in enumerate(pil_images):
        img_np = np.array(img)
        faces = face_app.get(img_np)
        if faces:
            face = max(
                faces,
                key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
            )
            face_size = (face.bbox[2] - face.bbox[0]) * (face.bbox[3] - face.bbox[1])
            if face_size > best_face_size:
                best_face_size = face_size
                best_embedding = face.normed_embedding
                print(f"Photo {idx}: InsightFace embedding extracted (face_size={face_size:.0f})")

    # Save embedding to volume (done after LoRA save below)
    # We store the raw numpy array for now, convert to tensor at save time
    _face_embedding_np = best_embedding

    if best_embedding is not None:
        print(f"Best face embedding ready (size={best_face_size:.0f})")
    else:
        print("WARNING: No InsightFace embedding extracted from any photo")

    # Free InsightFace from GPU
    del face_app
    gc.collect()
    import torch
    torch.cuda.empty_cache()

    # ── Load base model ─────────────────────────────────────────────────────

    pipe = StableDiffusionXLPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0",
        cache_dir=MODEL_CACHE_PATH,
        torch_dtype=torch.bfloat16,
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
        r=16,
        lora_alpha=16,
        target_modules=[
            "to_q",
            "to_k",
            "to_v",
            "to_out.0",
        ],
        lora_dropout=0.0,
    )
    unet = get_peft_model(unet, lora_config)
    unet.to(torch.bfloat16)
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
            img_tensor = transform(img).unsqueeze(0).to("cuda", dtype=torch.bfloat16)
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

    optimizer = torch.optim.AdamW(unet.parameters(), lr=5e-5, weight_decay=1e-2)

    lora_params = [p for p in unet.parameters() if p.requires_grad]
    print(f"Trainable LoRA params: {len(lora_params)}")
    print(f"Total param tensors: {sum(1 for _ in unet.parameters())}")
    print(f"Training config: steps=800, rank=16, lr=5e-5")

    num_steps = 800
    num_images = len(latents_list)

    # SDXL additional conditioning: time_ids
    add_time_ids = torch.tensor(
        [[512.0, 512.0, 0.0, 0.0, 512.0, 512.0]],
        device="cuda",
        dtype=torch.bfloat16,
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

        # Forward pass in bf16 autocast (optimizer stays float32)
        with torch.amp.autocast("cuda", dtype=torch.bfloat16):
            added_cond_kwargs = {
                "text_embeds": pooled_prompt_embeds.to(dtype=torch.bfloat16),
                "time_ids": add_time_ids,
            }
            noise_pred = unet(
                noisy_latent,
                timesteps,
                encoder_hidden_states=prompt_embeds.to(dtype=torch.bfloat16),
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

    print(f"Training LoRA for face_model_id: {face_model_id}")
    print(f"Saving LoRA weights to: {save_dir}")

    # Abort on NaN/Inf — prevent corrupted checkpoint
    for name, param in unet.named_parameters():
        if param.requires_grad:
            if torch.isnan(param).any() or torch.isinf(param).any():
                raise RuntimeError(
                    f"NaN/Inf detected in {name} before save. "
                    "Aborting to prevent corrupted checkpoint."
                )

    # Save only the LoRA adapter weights
    unet.save_pretrained(str(save_dir))

    # Save face embedding alongside LoRA weights (for IP-Adapter at gen time)
    if _face_embedding_np is not None:
        embed_path = save_dir / "face_embedding.pt"
        torch.save(
            torch.from_numpy(_face_embedding_np).unsqueeze(0),
            str(embed_path),
        )
        print(f"Face embedding saved: {embed_path}")

    await lora_volume.commit.aio()

    # Weight magnitude check — detect unstable LoRA weights
    lora_weights = [p for p in unet.parameters() if p.requires_grad]
    if lora_weights:
        max_val = max(p.abs().max().item() for p in lora_weights)
        print(f"LoRA weight max absolute value: {max_val:.4f}")
        if max_val > 2.0:
            print(f"WARNING: LoRA weights are unstable (max={max_val:.4f} > 2.0)")
    else:
        print("WARNING: No trainable LoRA parameters found")

    # Verify weights were actually saved
    volume_path = str(save_dir)
    if os.path.exists(volume_path):
        files = os.listdir(volume_path)
        print(f"LoRA saved successfully: {files}")
        total_size = sum(
            os.path.getsize(os.path.join(volume_path, f))
            for f in files
            if os.path.isfile(os.path.join(volume_path, f))
        )
        print(f"Total size: {total_size} bytes")
    else:
        print(f"ERROR: LoRA path not found after commit: {volume_path}")

    # ── Cleanup GPU memory ──────────────────────────────────────────────────

    del unet, vae, text_encoder, text_encoder_2, pipe
    del latents_list, noise, noisy_latent, noise_pred
    del optimizer
    gc.collect()
    torch.cuda.empty_cache()

    # ── Fire webhook callback if provided (async flow) ───────────────────
    if callback_url and harvest_id:
        import httpx

        webhook_secret = os.environ.get("WEBHOOK_SECRET", "")
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                await client.post(
                    callback_url,
                    json={
                        "harvest_id": harvest_id,
                        "child_id": child_id,
                        "face_model_id": face_model_id,
                        "status": "ok",
                    },
                    headers={
                        "x-webhook-secret": webhook_secret,
                        "Content-Type": "application/json",
                    },
                )
            print(f"Webhook callback sent to {callback_url}")
        except Exception as e:
            print(f"Webhook callback failed (non-blocking): {e}")

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
    skip_lora = body.get("skip_lora", False)
    child_age = body.get("age", 6)
    child_pronouns = body.get("pronouns", "they_them")
    character_description = body.get("character_description", "")
    memory_photos_b64 = body.get("memory_photos_b64", [])

    if not skip_lora and not face_model_id:
        web_error({"error": "face_model_id required (or set skip_lora: true)"})

    if not prompts or len(prompts) > 12:
        web_error({"error": "Between 1 and 12 prompts required"})

    print(f"Received {len(prompts)} scene prompts")
    print(f"Generating {len(prompts)} scenes + 1 cover")
    print(f"Child age: {child_age}, pronouns: {child_pronouns}")

    # ── Build prompt components ─────────────────────────────────────────────

    age_prefix = get_age_prefix(child_age, child_pronouns)
    core_appearance = extract_core_appearance(character_description)
    lora_token = "sks child"

    color_mood = ""
    if memory_photos_b64:
        color_mood = get_dominant_color_mood(memory_photos_b64)
        if color_mood:
            print(f"Memory photo color mood: {color_mood}")

    # ── Load pipeline + LoRA verification ─────────────────────────────────

    lora_loaded = False
    lora_dir = None

    if skip_lora:
        print("Skipping LoRA — running with base model only (no face conditioning)")
    else:
        lora_dir = Path(LORA_VOLUME_PATH) / face_model_id
        print(f"Loading LoRA for face_model_id: {face_model_id}")
        print(f"Looking for LoRA at: {lora_dir}")

        if not lora_dir.exists():
            print(f"LoRA not found — listing volume root:")
            root_contents = (
                os.listdir(LORA_VOLUME_PATH)
                if os.path.exists(LORA_VOLUME_PATH)
                else "volume not mounted"
            )
            print(f"Volume contents: {root_contents}")
            print("Proceeding WITHOUT face conditioning")
        else:
            lora_files = os.listdir(str(lora_dir))
            print(f"Found LoRA files: {lora_files}")

    from diffusers import AutoencoderKL

    vae = AutoencoderKL.from_pretrained(
        "madebyollin/sdxl-vae-fp16-fix",
        cache_dir=MODEL_CACHE_PATH,
        torch_dtype=torch.float16,
    )

    pipe = StableDiffusionXLPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0",
        cache_dir=MODEL_CACHE_PATH,
        torch_dtype=torch.float16,
        variant="fp16",
    )
    pipe.vae = vae
    pipe.to("cuda")

    if not skip_lora and lora_dir and lora_dir.exists():
        try:
            from safetensors.torch import load_file, save_file
            import tempfile

            lora_path = str(lora_dir / "adapter_model.safetensors")
            state_dict = load_file(lora_path)

            remapped = {}
            for k, v in state_dict.items():
                new_key = k.replace("base_model.model.", "unet.")
                remapped[new_key] = v

            print(f"Remapped {len(remapped)} LoRA keys. Sample: {list(remapped.keys())[:3]}")

            with tempfile.TemporaryDirectory() as tmp_dir:
                remapped_path = os.path.join(tmp_dir, "adapter_model.safetensors")
                save_file(remapped, remapped_path)
                pipe.load_lora_weights(tmp_dir, weight_name="adapter_model.safetensors")

            pipe.fuse_lora(lora_scale=0.7)
            lora_loaded = True
            print("LoRA loaded and fused successfully")
        except Exception as e:
            print(f"ERROR loading LoRA: {e}")
            print("Proceeding without face conditioning")

    # ── Load IP-Adapter FaceID (if face embedding exists) ──────────────────

    import torch

    face_embedding = None
    ip_model = None

    if not skip_lora and face_model_id:
        embed_path = Path(LORA_VOLUME_PATH) / face_model_id / "face_embedding.pt"
        if embed_path.exists():
            face_embedding = torch.load(str(embed_path), map_location="cuda")
            try:
                from ip_adapter.ip_adapter_faceid import IPAdapterFaceIDXL

                ip_model = IPAdapterFaceIDXL(
                    pipe,
                    f"{MODEL_CACHE_PATH}/ip-adapter-faceid_sdxl.bin",
                    device="cuda",
                )
                print("IP-Adapter FaceID loaded with face embedding")
            except Exception as e:
                print(f"WARNING: Failed to load IP-Adapter FaceID: {e}")
                ip_model = None
        else:
            print(f"No face embedding at {embed_path}, using LoRA only")

    # ── Build cover prompt (budget-aware) ────────────────────────────────

    illustrations = []

    if not cover_prompt_text:
        cover_prompt_text = build_cover_prompt()

    # Assemble cover prompt within CLIP token budget
    cover_scene_desc = truncate_scene_description(cover_prompt_text)
    cover_parts = [age_prefix, lora_token]
    if core_appearance:
        cover_parts.append(core_appearance)
    cover_parts.append(cover_scene_desc)
    cover_parts.append(STYLE_SUFFIX.lstrip(", "))
    if color_mood:
        cover_parts.append(color_mood)
    styled_cover = ", ".join(cover_parts)

    word_count = len(styled_cover.split())
    if word_count > 60:
        print(f"WARNING: Cover prompt too long: {word_count} words")
    print(f"Cover prompt ({word_count} words): {styled_cover}")

    if ip_model is not None and face_embedding is not None:
        images = ip_model.generate(
            prompt=styled_cover,
            negative_prompt=COVER_NEGATIVE_PROMPT,
            faceid_embeds=face_embedding,
            width=1024,
            height=1024,
            scale=0.8,
            num_inference_steps=40,
            guidance_scale=8.5,
            num_images_per_prompt=1,
        )
        cover_image = images[0]
        print("Cover generated with IP-Adapter FaceID")
    else:
        result = pipe(
            prompt=styled_cover,
            negative_prompt=COVER_NEGATIVE_PROMPT,
            width=1024,
            height=1024,
            num_inference_steps=40,
            guidance_scale=8.5,
            output_type="latent",
        )

        # Clamp NaNs from UNet before decode
        latents = result.images
        latents = torch.nan_to_num(latents, nan=0.0, posinf=1.0, neginf=-1.0)
        latents = latents.clamp(-4, 4)

        # Unscale and decode with madebyollin fp16 VAE
        latents = latents / pipe.vae.config.scaling_factor
        with torch.no_grad():
            decoded = pipe.vae.decode(latents, return_dict=False)[0]
        cover_image = pipe.image_processor.postprocess(
            decoded, output_type="pil"
        )[0]
        print("Cover generated with LoRA only (no IP-Adapter)")

    # Free SDXL pipe + IP-Adapter before loading Real-ESRGAN to avoid OOM
    del pipe
    if ip_model is not None:
        del ip_model
        ip_model = None
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

    from diffusers import AutoencoderKL

    vae = AutoencoderKL.from_pretrained(
        "madebyollin/sdxl-vae-fp16-fix",
        cache_dir=MODEL_CACHE_PATH,
        torch_dtype=torch.float16,
    )

    pipe = StableDiffusionXLPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0",
        cache_dir=MODEL_CACHE_PATH,
        torch_dtype=torch.float16,
        variant="fp16",
    )
    pipe.vae = vae
    pipe.to("cuda")

    if lora_loaded and lora_dir and lora_dir.exists():
        try:
            from safetensors.torch import load_file, save_file
            import tempfile

            lora_path = str(lora_dir / "adapter_model.safetensors")
            state_dict = load_file(lora_path)

            remapped = {}
            for k, v in state_dict.items():
                new_key = k.replace("base_model.model.", "unet.")
                remapped[new_key] = v

            with tempfile.TemporaryDirectory() as tmp_dir:
                remapped_path = os.path.join(tmp_dir, "adapter_model.safetensors")
                save_file(remapped, remapped_path)
                pipe.load_lora_weights(tmp_dir, weight_name="adapter_model.safetensors")

            pipe.fuse_lora(lora_scale=0.7)
            print("LoRA reloaded for scene generation")
        except Exception as e:
            print(f"ERROR reloading LoRA for scenes: {e}")

    # ── Reload IP-Adapter FaceID for scene generation ──────────────────────

    if face_embedding is not None:
        try:
            from ip_adapter.ip_adapter_faceid import IPAdapterFaceIDXL

            ip_model = IPAdapterFaceIDXL(
                pipe,
                f"{MODEL_CACHE_PATH}/ip-adapter-faceid_sdxl.bin",
                device="cuda",
            )
            print("IP-Adapter FaceID reloaded for scene generation")
        except Exception as e:
            print(f"WARNING: Failed to reload IP-Adapter for scenes: {e}")
            ip_model = None

    # ── Generate scene images (index 1+): 768×768 ───────────────────────

    for i, raw_prompt in enumerate(prompts):
        scene_desc = truncate_scene_description(raw_prompt)
        parts = [age_prefix, lora_token]
        if core_appearance:
            parts.append(core_appearance)
        parts.append(scene_desc)
        parts.append(STYLE_SUFFIX.lstrip(", "))
        if color_mood:
            parts.append(color_mood)
        styled_prompt = ", ".join(parts)

        word_count = len(styled_prompt.split())
        if word_count > 60:
            print(f"WARNING: Scene {i+1} prompt too long: {word_count} words")
        print(f"Scene {i+1} prompt ({word_count} words): {styled_prompt[:200]}")

        if ip_model is not None and face_embedding is not None:
            images = ip_model.generate(
                prompt=styled_prompt,
                negative_prompt=SCENE_NEGATIVE_PROMPT,
                faceid_embeds=face_embedding,
                width=768,
                height=768,
                scale=0.8,
                num_inference_steps=30,
                guidance_scale=7.5,
                num_images_per_prompt=1,
            )
            image = images[0]
        else:
            result = pipe(
                prompt=styled_prompt,
                negative_prompt=SCENE_NEGATIVE_PROMPT,
                width=768,
                height=768,
                num_inference_steps=30,
                guidance_scale=7.5,
                output_type="latent",
            )

            # Clamp NaNs from UNet before decode
            latents = result.images
            latents = torch.nan_to_num(latents, nan=0.0, posinf=1.0, neginf=-1.0)
            latents = latents.clamp(-4, 4)

            # Unscale and decode with madebyollin fp16 VAE
            latents = latents / pipe.vae.config.scaling_factor
            with torch.no_grad():
                decoded = pipe.vae.decode(latents, return_dict=False)[0]
            image = pipe.image_processor.postprocess(
                decoded, output_type="pil"
            )[0]

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
        "face_model_id": face_model_id or "none",
        "skip_lora": skip_lora,
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
    await lora_volume.commit.aio()

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
