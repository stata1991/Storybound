"""
Storybound — FLUX.1-dev Illustration Pipeline (Modal.com)

Replaces SDXL pipeline with FLUX.1-dev for higher quality illustrations.
The SDXL pipeline (illustration_pipeline.py) remains as fallback.

Architecture:
  - Base model: black-forest-labs/FLUX.1-dev (DiT, not UNet)
  - Training: LoRA on FLUX transformer blocks
  - GPU: L40S for training, A10G for generation
  - Identity: InsightFace face embedding + reranking
  - Text encoders: T5-XXL (no 77-token limit) + CLIP-L
  - No IP-Adapter needed — FLUX handles identity through LoRA alone

Privacy contract (same as SDXL pipeline):
  1. Photos uploaded → Supabase Storage private bucket
  2. Processing triggered → photos downloaded to Modal memory only
  3. LoRA training completes → source photos deleted from Modal memory immediately
  4. Face reference saved → source photos deleted from Supabase Storage
  5. Book generation complete → LoRA weights deleted
  6. Nothing reversible to original photo is ever retained after step 4
"""

import modal

# ─── Modal app ───────────────────────────────────────────────────────────────

app = modal.App("storybound-flux")

FLUX_MODEL_ID = "black-forest-labs/FLUX.1-dev"
MODEL_CACHE = "/model-cache"
LORA_VOLUME_NAME = "storybound-lora-weights-flux"

flux_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install([
        "torch==2.5.1",
        "torchvision==0.20.1",
        "diffusers>=0.30.0",
        "transformers>=4.44.0",
        "accelerate>=0.33.0",
        "peft>=0.12.0",
        "safetensors>=0.4.3",
        "sentencepiece",
        "protobuf",
        "insightface==0.7.3",
        "onnxruntime-gpu",
        "opencv-python-headless",
        "Pillow>=10.0.0",
        "huggingface_hub>=0.24.0",
        "bitsandbytes>=0.43.0",
        "boto3",
        "supabase",
        "requests",
        "fastapi[standard]",
    ])
    .run_commands(
        # Pre-download FLUX.1-dev model at image build time
        "python -c \""
        "import os; "
        "from huggingface_hub import snapshot_download; "
        "snapshot_download("
        "'black-forest-labs/FLUX.1-dev', "
        f"local_dir='{MODEL_CACHE}/flux', "
        "allow_patterns=['*.safetensors', '*.json', '*.txt'], "
        "token=os.environ.get('HF_TOKEN')"
        ")\"",
        # Pre-download InsightFace buffalo_l
        "python -c \"import insightface; "
        "from insightface.app import FaceAnalysis; "
        "app = FaceAnalysis(name='buffalo_l'); "
        "app.prepare(ctx_id=-1, det_size=(640,640))\"",
        secrets=[modal.Secret.from_name("storybound-secrets")],
    )
)

lora_volume = modal.Volume.from_name(
    LORA_VOLUME_NAME, create_if_missing=True
)


# ─── Training ────────────────────────────────────────────────────────────────

@app.function(
    image=flux_image,
    gpu="L40S",
    timeout=3600,
    volumes={"/lora-weights": lora_volume},
    secrets=[modal.Secret.from_name("storybound-secrets")],
    memory=65536,
)
def train_flux_lora(
    photos_b64: list[str],
    face_model_id: str,
    harvest_id: str,
    callback_url: str,
    webhook_secret: str,
):
    """
    Train a FLUX.1-dev LoRA on parent-uploaded photos.

    Key differences from SDXL:
    - Target modules: transformer blocks not UNet attention
    - Optimizer: AdamW with weight decay (FLUX is larger)
    - No VAE separate step — FLUX uses its own VAE
    - Training resolution: 1024x1024
    - Trigger token: same "sks child" pattern
    """
    import os
    import gc
    import torch
    import numpy as np
    import cv2
    from PIL import Image
    from pathlib import Path
    import requests
    import io
    import base64

    from diffusers import FluxPipeline
    from peft import LoraConfig
    from insightface.app import FaceAnalysis

    os.environ["HF_TOKEN"] = os.environ.get("HF_TOKEN", "")

    # ── STEP 1: Decode and preprocess photos ──
    pil_images = []
    for i, b64 in enumerate(photos_b64):
        try:
            img_bytes = base64.b64decode(b64)
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")

            # Face detection with OpenCV Haar cascade
            img_np = np.array(img)
            gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
            face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades +
                "haarcascade_frontalface_default.xml"
            )
            faces = face_cascade.detectMultiScale(
                gray, scaleFactor=1.1,
                minNeighbors=5, minSize=(50, 50)
            )

            if len(faces) > 0:
                x, y, w, h = max(faces,
                    key=lambda f: f[2] * f[3])
                pad = int(max(w, h) * 0.4)
                x1 = max(0, x - pad)
                y1 = max(0, y - pad)
                x2 = min(img.width, x + w + pad)
                y2 = min(img.height, y + h + pad)
                side = max(x2 - x1, y2 - y1)
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                x1 = max(0, cx - side // 2)
                y1 = max(0, cy - side // 2)
                x2 = min(img.width, x1 + side)
                y2 = min(img.height, y1 + side)
                img = img.crop((x1, y1, x2, y2))
                print(f"Photo {i}: face detected, cropped")
            else:
                w, h = img.size
                s = min(w, h)
                img = img.crop((
                    (w-s)//2, (h-s)//2,
                    (w+s)//2, (h+s)//2
                ))
                print(f"Photo {i}: no face, center crop")

            img = img.resize((1024, 1024), Image.LANCZOS)
            pil_images.append(img)
        except Exception as e:
            print(f"Photo {i} failed: {e}")

    if not pil_images:
        raise RuntimeError("No valid photos after preprocessing")

    print(f"Preprocessed {len(pil_images)} photos at 1024x1024")

    # ── STEP 2: Extract face embedding via InsightFace ──
    face_app = FaceAnalysis(
        name="buffalo_l",
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"]
    )
    face_app.prepare(ctx_id=0, det_size=(640, 640))

    embeddings = []
    best_face_img = None
    best_face_size = 0

    for i, img in enumerate(pil_images):
        img_bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        faces = face_app.get(img_bgr)
        if faces:
            face = max(faces,
                key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]))
            face_size = ((face.bbox[2]-face.bbox[0]) *
                        (face.bbox[3]-face.bbox[1]))

            # Check for forehead marks before including embedding
            fx1, fy1, fx2, fy2 = [int(c) for c in face.bbox]
            face_crop = img_bgr[fy1:fy2, fx1:fx2]
            fh = int(face_crop.shape[0] * 0.35)
            if fh > 0:
                forehead = face_crop[:fh]
                fb, fg, fr = forehead[:,:,0], forehead[:,:,1], forehead[:,:,2]
                red_mask = (fr > 150) & (fg < 100) & (fb < 100)
                yellow_mask = (fr > 200) & (fg > 150) & (fb < 80)
                if (red_mask | yellow_mask).any():
                    print(f"Skipping embedding for photo {i} — forehead mark detected")
                else:
                    embeddings.append(
                        torch.from_numpy(face.normed_embedding).unsqueeze(0)
                    )
            else:
                embeddings.append(
                    torch.from_numpy(face.normed_embedding).unsqueeze(0)
                )

            if face_size > best_face_size:
                best_face_size = face_size
                best_face_img = img
            print(f"Photo {i}: InsightFace detected (size={int(face_size)})")

    if not embeddings:
        # All photos had forehead marks — fall back to using all embeddings
        print("WARNING: All photos had forehead marks, using all embeddings")
        for img in pil_images:
            img_bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
            faces = face_app.get(img_bgr)
            if faces:
                face = max(faces,
                    key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]))
                embeddings.append(
                    torch.from_numpy(face.normed_embedding).unsqueeze(0)
                )
        if not embeddings:
            raise RuntimeError("No faces detected by InsightFace")

    avg_embedding = torch.cat(embeddings).mean(dim=0, keepdim=True)
    print(f"Face embedding: averaged across {len(embeddings)} photos, "
          f"shape={avg_embedding.shape}")

    # Buffer best face crop — crop to face bbox, remove forehead marks
    best_face_buffer = io.BytesIO()
    if best_face_img:
        img_bgr = cv2.cvtColor(np.array(best_face_img), cv2.COLOR_RGB2BGR)
        faces = face_app.get(img_bgr)
        if faces:
            face = max(faces,
                key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]))
            x1, y1, x2, y2 = [int(c) for c in face.bbox]
            h, w = img_bgr.shape[:2]
            x1, y1 = max(0, x1 - 20), max(0, y1 - 20)
            x2, y2 = min(w, x2 + 20), min(h, y2 + 20)
            crop = img_bgr[y1:y2, x1:x2].copy()

            # Remove forehead marks in top 35% of crop
            fh = int(crop.shape[0] * 0.35)
            forehead = crop[:fh]
            b, g, r = forehead[:,:,0], forehead[:,:,1], forehead[:,:,2]
            red_mask = (r > 150) & (g < 100) & (b < 100)
            yellow_mask = (r > 200) & (g > 150) & (b < 80)
            mark_mask = red_mask | yellow_mask

            if mark_mask.any():
                kernel = np.ones((3, 3), np.float32) / 9.0
                blurred = cv2.filter2D(forehead, -1, kernel)
                ys, xs = np.where(mark_mask)
                forehead[ys, xs] = blurred[ys, xs]
                crop[:fh] = forehead
                print(f"Forehead mark removal: {len(ys)} pixels replaced")

            crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
            Image.fromarray(crop_rgb).save(
                best_face_buffer, format="JPEG", quality=95)
        else:
            best_face_img.save(best_face_buffer, format="JPEG", quality=95)

    # ── STEP 3: Privacy cleanup ──
    del face_app
    gc.collect()

    # ── STEP 4: Load FLUX pipeline for training ──
    print("Loading FLUX.1-dev pipeline...")

    pipe = FluxPipeline.from_pretrained(
        f"{MODEL_CACHE}/flux",
        torch_dtype=torch.bfloat16,
    ).to("cuda")

    transformer = pipe.transformer
    vae = pipe.vae
    text_encoder = pipe.text_encoder      # CLIP-L
    text_encoder_2 = pipe.text_encoder_2  # T5-XXL
    tokenizer = pipe.tokenizer
    tokenizer_2 = pipe.tokenizer_2

    # Freeze everything except transformer LoRA
    vae.requires_grad_(False)
    text_encoder.requires_grad_(False)
    text_encoder_2.requires_grad_(False)
    transformer.requires_grad_(False)

    # ── STEP 5: Apply LoRA to FLUX transformer ──
    # FLUX uses transformer blocks — different target modules than SDXL UNet
    lora_config = LoraConfig(
        r=32,
        lora_alpha=16,
        target_modules=[
            "to_q", "to_k", "to_v", "to_out.0",
            "add_q_proj", "add_k_proj", "add_v_proj",
            "to_add_out",
        ],
        lora_dropout=0.0,
        bias="none",
    )
    transformer.add_adapter(lora_config)
    transformer.to(torch.bfloat16)
    transformer.train()

    trainable = sum(p.numel() for p in transformer.parameters()
                   if p.requires_grad)
    print(f"Trainable LoRA params: {trainable:,}")

    # ── STEP 6: Encode training images ──
    # FLUX VAE encodes at 8x spatial compression, 16 channels
    vae.to("cuda")
    latents_list = []

    for img in pil_images:
        img_tensor = torch.from_numpy(
            np.array(img)
        ).float().permute(2, 0, 1).unsqueeze(0) / 127.5 - 1.0
        img_tensor = img_tensor.to("cuda", dtype=torch.bfloat16)

        with torch.no_grad():
            latent = vae.encode(img_tensor).latent_dist.sample()
            shift_factor = getattr(vae.config, 'shift_factor', 0.0)
            scaling_factor = getattr(vae.config, 'scaling_factor', 0.18215)
            latent = (latent - shift_factor) * scaling_factor
        latents_list.append(latent.cpu())

    # Cache latent dimensions for packing
    _, latent_c, latent_h, latent_w = latents_list[0].shape
    print(f"Latent shape: [1, {latent_c}, {latent_h}, {latent_w}]")

    vae.to("cpu")
    gc.collect()
    torch.cuda.empty_cache()

    # ── STEP 6b: Latent packing helpers ──
    # FLUX transformer expects packed 3D tensors, not raw 4D latents.
    # Packing: [B, C, H, W] → [B, (H/2)*(W/2), C*4]

    def pack_latents(x):
        b, c, h, w = x.shape
        x = x.view(b, c, h // 2, 2, w // 2, 2)
        x = x.permute(0, 2, 4, 1, 3, 5)
        x = x.reshape(b, (h // 2) * (w // 2), c * 4)
        return x

    # Pre-compute position IDs (constant across training)
    packed_h, packed_w = latent_h // 2, latent_w // 2
    img_ids = torch.zeros(packed_h, packed_w, 3, dtype=torch.bfloat16)
    img_ids[..., 1] = torch.arange(packed_h, dtype=torch.bfloat16)[:, None]
    img_ids[..., 2] = torch.arange(packed_w, dtype=torch.bfloat16)[None, :]
    img_ids = img_ids.reshape(1, packed_h * packed_w, 3).cuda()

    print(f"Packed latent: [1, {packed_h * packed_w}, {latent_c * 4}]")

    # ── STEP 7: Encode text prompt ──
    instance_prompt = "a photo of sks child"

    # FLUX uses both CLIP-L and T5-XXL — no 77-token limit on T5
    with torch.no_grad():
        # CLIP-L tokens — use pooler_output for pooled_projections
        clip_tokens = tokenizer(
            instance_prompt,
            padding="max_length",
            max_length=77,
            truncation=True,
            return_tensors="pt"
        ).input_ids.to("cuda")
        clip_output = text_encoder(clip_tokens,
                                   output_hidden_states=False,
                                   return_dict=True)
        clip_pooled = clip_output.pooler_output  # shape [1, 768]

        # T5-XXL tokens — up to 512 tokens
        t5_tokens = tokenizer_2(
            instance_prompt,
            padding="max_length",
            max_length=512,
            truncation=True,
            return_tensors="pt"
        ).input_ids.to("cuda")
        t5_embeds = text_encoder_2(t5_tokens)[0]

    # Pre-compute text position IDs
    txt_ids = torch.zeros(1, t5_embeds.shape[1], 3,
                          device="cuda", dtype=torch.bfloat16)

    text_encoder.to("cpu")
    text_encoder_2.to("cpu")
    gc.collect()
    torch.cuda.empty_cache()

    # ── STEP 8: Training loop ──
    optimizer = torch.optim.AdamW(
        [p for p in transformer.parameters() if p.requires_grad],
        lr=5e-5,
        weight_decay=1e-2,
        betas=(0.9, 0.999),
        eps=1e-8,
    )

    num_steps = 2000
    print(f"Training config: steps={num_steps}, rank=32, "
          f"lr=5e-5, resolution=1024, model=FLUX.1-dev, "
          f"min-snr-gamma=5.0")

    transformer.to("cuda")

    for step in range(num_steps):
        latent = latents_list[step % len(latents_list)].to(
            "cuda", dtype=torch.bfloat16
        )

        # Pack 4D latent → 3D for FLUX transformer
        packed_latent = pack_latents(latent)

        # FLUX flow matching noise (in packed space)
        noise = torch.randn_like(packed_latent)
        # Sample timestep — FLUX uses continuous timesteps [0, 1]
        t = torch.rand(1, device="cuda", dtype=torch.bfloat16)
        # Flow matching interpolation
        noisy_latent = (1 - t) * packed_latent + t * noise
        # Target is the noise direction (velocity)
        target = noise - packed_latent

        bsz = noisy_latent.shape[0]

        # FLUX transformer forward pass with packed latents + position IDs
        # guidance=1.0 during training (no classifier-free guidance)
        noise_pred = transformer(
            hidden_states=noisy_latent,
            timestep=t.expand(bsz),
            guidance=torch.ones(bsz, device="cuda", dtype=torch.bfloat16),
            encoder_hidden_states=t5_embeds.to("cuda", dtype=torch.bfloat16),
            pooled_projections=clip_pooled.to("cuda", dtype=torch.bfloat16),
            img_ids=img_ids,
            txt_ids=txt_ids,
            return_dict=False,
        )[0]

        loss = torch.nn.functional.mse_loss(
            noise_pred.float(), target.float(), reduction="none"
        )
        loss = loss.mean(dim=list(range(1, loss.ndim)))  # per-sample mean

        # Min-SNR-gamma weighting — same as SDXL pipeline
        # Prevents high-noise timesteps from dominating training
        # Critical for fine facial detail learning
        snr = (1 - t) / (t + 1e-8)
        mse_loss_weights = torch.clamp(snr, max=5.0) / (snr + 1e-8)
        loss = (loss * mse_loss_weights).mean()

        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(
            transformer.parameters(), max_norm=1.0
        )
        optimizer.step()

        if step % 100 == 0:
            print(f"Step {step}/{num_steps} — loss={loss.item():.4f}")

    print("Training complete")

    # ── STEP 9: Save and upload ──
    save_dir = Path(f"/lora-weights/{face_model_id}")
    save_dir.mkdir(parents=True, exist_ok=True)

    # Save LoRA adapter weights only (not full model)
    from peft import get_peft_model_state_dict
    from safetensors.torch import save_file
    lora_state_dict = get_peft_model_state_dict(transformer)
    save_file(lora_state_dict, str(save_dir / "adapter_model.safetensors"))
    # Save adapter config
    transformer.peft_config["default"].save_pretrained(str(save_dir))
    print(f"LoRA saved to {save_dir}")

    # Save face artifacts
    if best_face_buffer.tell() > 0:
        best_face_buffer.seek(0)
        (save_dir / "best_face_crop.jpg").write_bytes(
            best_face_buffer.read()
        )
    torch.save(avg_embedding, str(save_dir / "face_embedding.pt"))
    print("Face artifacts saved")

    # Weight sanity check
    lora_weights = [p for p in transformer.parameters()
                   if p.requires_grad]
    max_val = max(p.abs().max().item() for p in lora_weights)
    print(f"LoRA weight max: {max_val:.4f}")
    if max_val > 2.0:
        raise RuntimeError(
            f"FLUX LoRA weights unstable (max={max_val:.4f})"
        )

    # Upload to Supabase
    import supabase as sb_module
    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    sb = sb_module.create_client(supabase_url, supabase_key)

    for fname in os.listdir(str(save_dir)):
        fpath = save_dir / fname
        if fpath.is_file():
            with open(str(fpath), "rb") as f:
                sb.storage.from_("lora-weights").upload(
                    f"{face_model_id}/{fname}",
                    f.read(),
                    {"content-type": "application/octet-stream",
                     "upsert": "true"}
                )
    print(f"LoRA uploaded to Supabase: lora-weights/{face_model_id}/")

    # Commit to Modal volume
    lora_volume.commit()

    # Privacy: clear photos from memory
    del pil_images
    gc.collect()

    # Fire webhook
    try:
        resp = requests.post(
            callback_url,
            json={
                "harvest_id": harvest_id,
                "face_model_id": face_model_id,
                "status": "ok",
            },
            headers={
                "x-webhook-secret": webhook_secret,
                "Content-Type": "application/json",
            },
            timeout=30,
            allow_redirects=True,
        )
        print(f"Webhook: {resp.status_code}")
    except Exception as e:
        print(f"Webhook failed: {e}")


# ─── Generation ──────────────────────────────────────────────────────────────

@app.function(
    image=flux_image,
    gpu="L40S",
    timeout=1800,
    volumes={"/lora-weights": lora_volume},
    secrets=[modal.Secret.from_name("storybound-secrets")],
    memory=32768,
)
def generate_flux_illustrations(body: dict) -> dict:
    """
    Generate illustrations using FLUX.1-dev + LoRA.

    Key differences from SDXL:
    - No IP-Adapter — FLUX LoRA handles identity directly
    - No 77-token limit — use full scene descriptions
    - No skin tone prompt hack needed — FLUX has less bias
    - Gender in prompt is more reliable
    - Reranking still used for best candidate selection
    """
    import os
    import gc
    import hashlib
    import requests
    import torch
    import numpy as np
    import cv2
    from PIL import Image
    from pathlib import Path
    import base64
    import io
    import tempfile

    from diffusers import FluxPipeline
    from insightface.app import FaceAnalysis

    face_model_id = body.get("face_model_id")
    scene_prompts = body.get("scene_prompts", [])
    scene_has_humans = body.get("scene_has_humans", [False] * len(scene_prompts))
    child_age = body.get("child_age", 3)
    pronouns = body.get("pronouns", "child")
    skin_tone = body.get("skin_tone_hint", "")
    harvest_id = body.get("harvest_id")
    episode_id = body.get("episode_id")
    child_id = body.get("child_id")

    # Gender word from pronouns
    if pronouns == "boy":
        gender_word = "boy"
        gender_clip_reinforcement = (
            "boy, male child, short hair, no forehead mark, no bindi, clear forehead, "
        )
        gender_t5_reinforcement = (
            "boy with short hair, male child, "
            "short straight hair, hair cut above ears, "
            "no hair accessories, no hair ties, "
        )
        gender_negative = (
            "girl, female, feminine, "
            "bindi, tilak, forehead dot, forehead mark, dot on forehead, red dot, sindoor, "
            "pigtails, ponytails, twin tails, side tails, "
            "hair ties, hair ribbons, hair clips, hair bows, "
            "braids, plaits, "
            "dress, skirt, frock, feminine clothing, "
            "long hair, "
        )
    elif pronouns == "girl":
        gender_word = "girl"
        gender_clip_reinforcement = (
            "girl, female child, "
        )
        gender_t5_reinforcement = (
            "girl with long hair, female child, "
        )
        gender_negative = (
            "boy, male, masculine, "
            "short hair, buzz cut, "
        )
    else:
        gender_word = "child"
        gender_clip_reinforcement = ""
        gender_t5_reinforcement = ""
        gender_negative = ""

    age_prefix = f"{child_age}-year-old toddler {gender_word}"

    # Style anchor — applied to EVERY scene and cover without exception
    STYLE_SUFFIX = (
        ", gouache illustration, children's picture book, "
        "soft warm colors, Studio Ghibli inspired, "
        "painterly style, detailed face, "
        "realistic head-to-body ratio, natural proportions"
    )

    NEGATIVE_PROMPT = (
        gender_negative +
        "photorealistic, hyperrealistic, photograph, "
        "realistic photography, photo, camera, DSLR, "
        "3D render, CGI, Pixar, Disney 3D, animated film, "
        "digital painting, oil painting, watercolor, "
        "disproportionate head, oversized head, chibi, bobblehead, "
        "back of head, facing away, looking away, "
        "black and white, monochrome, "
        "sketch, line art, text, watermark, blurry, deformed, "
        "extra limbs, adult, teenager, low quality face, "
        "blurry face"
    )

    # ── Load LoRA weights ──
    import supabase as sb_module
    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    sb = sb_module.create_client(supabase_url, supabase_key)

    lora_dir = None
    face_embedding = None

    if face_model_id:
        with tempfile.TemporaryDirectory() as tmp:
            lora_dir = Path(tmp)
            # Download LoRA files from Supabase with retry
            import time as _time
            for fname in ["adapter_model.safetensors",
                          "adapter_config.json",
                          "face_embedding.pt",
                          "best_face_crop.jpg"]:
                for attempt in range(3):
                    try:
                        data = sb.storage.from_("lora-weights").download(
                            f"{face_model_id}/{fname}"
                        )
                        (lora_dir / fname).write_bytes(data)
                        print(f"Downloaded {fname}")
                        break
                    except Exception as e:
                        if attempt == 2:
                            print(f"Download {fname} failed after 3 attempts: {e}")
                        else:
                            print(f"Download {fname} attempt {attempt+1} failed, retrying...")
                            _time.sleep(2)

            # Load face embedding
            emb_path = lora_dir / "face_embedding.pt"
            if emb_path.exists():
                face_embedding = torch.load(
                    str(emb_path), map_location="cpu"
                )
                print(f"Face embedding: {face_embedding.shape}")

            # Load FLUX pipeline
            print("Loading FLUX.1-dev...")
            pipe = FluxPipeline.from_pretrained(
                f"{MODEL_CACHE}/flux",
                torch_dtype=torch.bfloat16,
            )

            # Load LoRA state dict manually
            from safetensors.torch import load_file
            lora_path = lora_dir / "adapter_model.safetensors"

            if lora_path.exists():
                lora_state_dict = load_file(str(lora_path))

                # PEFT saves: base_model.model.single_transformer_blocks.X...
                # diffusers FluxPipeline.load_lora_weights expects:
                # transformer.single_transformer_blocks.X...
                remapped = {}
                for key, val in lora_state_dict.items():
                    new_key = key
                    # Remove PEFT prefix
                    if key.startswith("base_model.model."):
                        new_key = key[len("base_model.model."):]
                    # Add transformer prefix that diffusers expects
                    new_key = "transformer." + new_key
                    remapped[new_key] = val

                print(f"Remapped {len(remapped)} FLUX LoRA keys")
                print(f"Sample keys: {list(remapped.keys())[:3]}")

                # Save remapped weights to temp file for loading
                from safetensors.torch import save_file
                remapped_path = lora_dir / "adapter_model_remapped.safetensors"
                save_file(remapped, str(remapped_path))

                # Load using remapped file
                pipe.load_lora_weights(
                    str(lora_dir),
                    weight_name="adapter_model_remapped.safetensors"
                )
                pipe.fuse_lora(lora_scale=0.85)
                print("FLUX LoRA loaded and fused")
            else:
                print("No adapter_model.safetensors found — skipping LoRA")

            # Enable CPU offloading — lets diffusers manage VRAM on A10G
            pipe.enable_model_cpu_offload()

            gc.collect()
            torch.cuda.empty_cache()

            # ── Generate cover ──
            # FLUX uses CLIP-L (77 token limit) + T5-XXL (512 tokens)
            # Split prompts: short for CLIP-L, full detail for T5-XXL
            # Cover always gets full people-suppression
            PEOPLE_SUPPRESSION = (
                "multiple children, two children, siblings, brother, sister, "
                "other child, second child, background children, extra person, "
                "parent, mother, father, grandparent, family members, "
                "crowd, group of people, "
            )
            cover_avoid_str = f"avoid: {PEOPLE_SUPPRESSION}{NEGATIVE_PROMPT}. "

            # CLIP-L prompt — short, under 60 tokens
            cover_clip = (
                f"{gender_clip_reinforcement}"
                f"{age_prefix}, sks child, "
                f"realistic proportions, portrait, children's photo book"
            )
            # T5-XXL prompt — full detail with avoid_str
            cover_t5 = (
                f"{cover_avoid_str}"
                f"{gender_t5_reinforcement}"
                f"{age_prefix}, sks child, "
                f"{skin_tone + ', ' if skin_tone else ''}"
                f"portrait, magical storybook world, "
                f"looking at viewer, warm smile"
                f"{STYLE_SUFFIX}"
            )

            print(f"Cover CLIP prompt: {cover_clip}")
            print(f"Cover T5 prompt: {cover_t5}")

            cover_result = pipe(
                prompt=cover_clip,
                prompt_2=cover_t5,
                height=1024,
                width=1024,
                num_inference_steps=35,
                guidance_scale=3.5,
                generator=torch.Generator("cuda").manual_seed(
                    int(hashlib.md5(face_model_id.encode()).hexdigest()[:8], 16)
                ),
            )
            cover_image = cover_result.images[0]
            print("Cover generated")

            # ── Generate scenes with reranking ──
            scene_images = []

            # Init InsightFace for reranking
            rank_app = None
            if face_embedding is not None:
                rank_app = FaceAnalysis(
                    name="buffalo_l",
                    providers=["CUDAExecutionProvider",
                               "CPUExecutionProvider"]
                )
                rank_app.prepare(ctx_id=0, det_size=(640, 640))

            seed_base = int(
                hashlib.md5(face_model_id.encode()).hexdigest()[:8], 16
            ) & 0x7FFFFFFF

            for i, scene_desc in enumerate(scene_prompts):
                has_humans = scene_has_humans[i] if i < len(scene_has_humans) else False

                people_suppression = (
                    "" if has_humans else
                    PEOPLE_SUPPRESSION
                )

                scene_negative = people_suppression + NEGATIVE_PROMPT
                avoid_str = f"avoid: {scene_negative}. "

                # CLIP-L prompt — short, under 60 tokens
                scene_clip = (
                    f"{gender_clip_reinforcement}"
                    f"{age_prefix}, sks child, "
                    f"realistic proportions, foreground, facing camera, "
                    f"{scene_desc}, children's photo book"
                )
                # T5-XXL prompt — full detail with avoid_str
                scene_t5 = (
                    f"{avoid_str}"
                    f"{gender_t5_reinforcement}"
                    f"{age_prefix}, sks child, "
                    f"{skin_tone + ', ' if skin_tone else ''}"
                    f"foreground, facing camera, "
                    f"{scene_desc}"
                    f"{STYLE_SUFFIX}"
                )

                print(f"Scene {i+1} has_humans={has_humans}")
                print(f"Scene {i+1} CLIP ({len(scene_clip.split())} words): "
                      f"{scene_clip[:80]}...")
                print(f"Scene {i+1} T5 ({len(scene_t5.split())} words): "
                      f"{scene_t5[:80]}...")

                # Generate 5 candidates for reranking
                candidates = pipe(
                    prompt=scene_clip,
                    prompt_2=scene_t5,
                    height=768,
                    width=768,
                    num_inference_steps=35,
                    guidance_scale=4.5,
                    num_images_per_prompt=5,
                    generator=torch.Generator("cuda").manual_seed(
                        seed_base
                    ),
                ).images

                print(f"Scene {i+1}: {len(candidates)} candidates generated")

                # Rerank by face similarity
                best_image = candidates[0]
                best_score = -1.0

                if rank_app is not None and face_embedding is not None:
                    ref_emb = face_embedding.cpu().float()
                    for j, candidate in enumerate(candidates):
                        candidate_np = cv2.cvtColor(
                            np.array(candidate), cv2.COLOR_RGB2BGR
                        )
                        faces = rank_app.get(candidate_np)
                        if not faces:
                            print(f"  Scene {i+1} candidate {j}: "
                                  "no face detected")
                            continue
                        face = max(
                            faces,
                            key=lambda f: (
                                (f.bbox[2]-f.bbox[0]) *
                                (f.bbox[3]-f.bbox[1])
                            )
                        )
                        gen_emb = torch.from_numpy(
                            face.normed_embedding
                        ).unsqueeze(0).float()
                        score = torch.nn.functional.cosine_similarity(
                            ref_emb, gen_emb, dim=1
                        ).item()
                        print(f"  Scene {i+1} candidate {j}: "
                              f"cosine={score:.3f}")
                        if score > best_score:
                            best_score = score
                            best_image = candidate

                    print(f"Scene {i+1} reranking: "
                          f"best_score={best_score:.3f}")

                    # Low confidence or all failed — regenerate with offset seed
                    if best_score < 0.2:
                        print(f"Scene {i+1}: low confidence ({best_score:.3f}), "
                              "regenerating with offset seed")
                        candidates_retry = pipe(
                            prompt=scene_clip,
                            prompt_2=scene_t5,
                            height=768,
                            width=768,
                            num_inference_steps=35,
                            guidance_scale=4.5,
                            num_images_per_prompt=5,
                            generator=torch.Generator("cuda").manual_seed(
                                seed_base + 1000
                            ),
                        ).images
                        print(f"Scene {i+1} retry: "
                              f"{len(candidates_retry)} candidates")

                        for j, candidate in enumerate(candidates_retry):
                            candidate_np = cv2.cvtColor(
                                np.array(candidate), cv2.COLOR_RGB2BGR
                            )
                            faces = rank_app.get(candidate_np)
                            if not faces:
                                continue
                            face = max(
                                faces,
                                key=lambda f: (
                                    (f.bbox[2]-f.bbox[0]) *
                                    (f.bbox[3]-f.bbox[1])
                                )
                            )
                            gen_emb = torch.from_numpy(
                                face.normed_embedding
                            ).unsqueeze(0).float()
                            score = torch.nn.functional.cosine_similarity(
                                ref_emb, gen_emb, dim=1
                            ).item()
                            print(f"  Scene {i+1} retry candidate {j}: "
                                  f"cosine={score:.3f}")
                            if score > best_score:
                                best_score = score
                                best_image = candidate

                        if best_score < 0.2:
                            best_image = candidates_retry[0]
                            print(f"Scene {i+1}: retry still low ({best_score:.3f}), "
                                  "using first retry candidate as fallback")
                        else:
                            print(f"Scene {i+1} retry reranking: "
                                  f"best_score={best_score:.3f}")

                scene_images.append(best_image)

            # ── Upload illustrations ──
            all_images = [cover_image] + scene_images
            illustration_paths = []

            for idx, img in enumerate(all_images):
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                buf.seek(0)
                path = f"{child_id}/{episode_id}/{idx}.png"
                sb.storage.from_("illustrations").upload(
                    path, buf.read(),
                    {"content-type": "image/png", "upsert": "true"}
                )
                illustration_paths.append(path)
                print(f"Uploaded illustration {idx}")

            # Update episode
            sb.table("episodes").update({
                "illustration_paths": illustration_paths,
                "illustration_status": "review",
            }).eq("id", episode_id).execute()

            print(f"All {len(all_images)} illustrations uploaded")

            # Fire webhook callback to notify web app
            callback_url = body.get("callback_url")
            if callback_url:
                try:
                    requests.post(
                        callback_url,
                        json={"harvest_id": harvest_id, "status": "complete"},
                        headers={
                            "x-webhook-secret": body.get("webhook_secret", ""),
                            "Content-Type": "application/json",
                        },
                        timeout=30,
                        allow_redirects=True,
                    )
                    print(f"Webhook fired to {callback_url}")
                except Exception as e:
                    print(f"Webhook failed: {e}")

            return {"status": "complete",
                    "count": len(all_images)}

    return {"status": "error", "message": "No face_model_id provided"}


# ─── HTTP wrappers (web endpoints for Next.js integration) ──────────────────
# These map the SDXL payload format to FLUX format so the web app
# can call either pipeline with the same interface.


@app.function(
    image=flux_image,
    gpu="L40S",
    timeout=3600,
    volumes={"/lora-weights": lora_volume},
    secrets=[modal.Secret.from_name("storybound-secrets")],
    memory=65536,
)
@modal.fastapi_endpoint(method="POST")
def train_face_model_http(request: dict) -> dict:
    import os

    # Map SDXL payload format to FLUX format
    photos_b64 = request.get("photos", [])
    face_model_id = request.get("face_model_id") or f"flux-{os.urandom(4).hex()}"
    harvest_id = request.get("harvest_id")
    callback_url = request.get("callback_url")
    webhook_secret = os.environ.get("MODAL_WEBHOOK_SECRET", "")

    # Spawn training as async job
    train_flux_lora.spawn(
        photos_b64=photos_b64,
        face_model_id=face_model_id,
        harvest_id=harvest_id,
        callback_url=callback_url,
        webhook_secret=webhook_secret,
    )

    return {"status": "training_started", "face_model_id": face_model_id}


@app.function(
    image=flux_image,
    gpu="L40S",
    timeout=600,
    volumes={"/lora-weights": lora_volume},
    secrets=[modal.Secret.from_name("storybound-secrets")],
    memory=32768,
)
@modal.fastapi_endpoint(method="POST")
def generate_illustrations_http(request: dict) -> dict:
    import os
    # Map SDXL payload format to FLUX format
    # SDXL sends: prompts, age, pronouns, character_description,
    #             hair_description, face_model_id, cover_prompt
    # FLUX needs: scene_prompts, child_age, pronouns, skin_tone_hint,
    #             face_model_id, harvest_id, episode_id, child_id

    # Extract skin tone from character_description
    char_desc = request.get("character_description", "")
    skin_tone_hint = ""
    if char_desc:
        desc_lower = char_desc.lower()
        if "warm brown" in desc_lower or "golden brown" in desc_lower:
            skin_tone_hint = "warm medium brown skin, South Asian skin tone"
        elif "dark brown" in desc_lower or "deep brown" in desc_lower:
            skin_tone_hint = "medium brown skin"
        elif "light brown" in desc_lower or "fair" in desc_lower:
            skin_tone_hint = "light brown skin"
        elif "brown skin" in desc_lower:
            skin_tone_hint = "warm brown skin"

    # Map pronouns format: SDXL sends "he_him"/"she_her",
    # FLUX expects "boy"/"girl"
    pronouns_raw = request.get("pronouns", "child")
    if pronouns_raw in ["he_him", "boy", "male"]:
        pronouns = "boy"
    elif pronouns_raw in ["she_her", "girl", "female"]:
        pronouns = "girl"
    else:
        pronouns = "child"

    # Strip hair descriptions that conflict with gender enforcement
    import re
    scene_prompts = request.get("prompts", [])
    if pronouns == "boy":
        cleaned_prompts = []
        for p in scene_prompts:
            p = re.sub(r'\b(wavy|curly|long|flowing|bouncing)\s+hair\b', 'short hair', p, flags=re.IGNORECASE)
            p = re.sub(r'\bpigtails?\b|\bponytails?\b|\bbraids?\b', 'short hair', p, flags=re.IGNORECASE)
            cleaned_prompts.append(p)
        scene_prompts = cleaned_prompts

    scene_has_humans = request.get("scene_has_humans", [False] * len(scene_prompts))

    flux_payload = {
        "face_model_id": request.get("face_model_id"),
        "scene_prompts": scene_prompts,
        "scene_has_humans": scene_has_humans,
        "child_age": request.get("age", 3),
        "pronouns": pronouns,
        "skin_tone_hint": skin_tone_hint,
        "harvest_id": request.get("harvest_id"),
        "episode_id": request.get("episode_id"),
        "child_id": request.get("child_id"),
        "skip_lora": request.get("skip_lora", False),
        "callback_url": os.environ.get("ILLUSTRATION_COMPLETE_WEBHOOK_URL", ""),
        "webhook_secret": os.environ.get("MODAL_WEBHOOK_SECRET", ""),
    }

    generate_flux_illustrations.spawn(flux_payload)
    return {"status": "generating", "message": "Generation started"}


@app.function(
    image=flux_image,
    volumes={"/lora-weights": lora_volume},
    secrets=[modal.Secret.from_name("storybound-secrets")],
)
@modal.fastapi_endpoint(method="POST")
def delete_face_model_http(request: dict) -> dict:
    return delete_face_model.local(
        face_model_id=request.get("face_model_id"),
        child_id=request.get("child_id"),
        harvest_id=request.get("harvest_id"),
    )


# ─── Health check ────────────────────────────────────────────────────────────

@app.function(image=flux_image)
def health_check():
    return {"status": "ok", "model": "FLUX.1-dev"}


# ─── Privacy cleanup ─────────────────────────────────────────────────────────

@app.function(
    image=flux_image,
    volumes={"/lora-weights": lora_volume},
    secrets=[modal.Secret.from_name("storybound-secrets")],
)
def delete_face_model(
    face_model_id: str,
    child_id: str,
    harvest_id: str = None,
):
    """
    Delete LoRA weights from Modal Volume and Supabase Storage.
    Also deletes character photos from Supabase Storage.
    Called after book generation is complete — privacy contract.
    """
    import os
    from pathlib import Path
    import supabase as sb_module

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    sb = sb_module.create_client(supabase_url, supabase_key)

    # 1. Delete LoRA weights from Supabase Storage
    try:
        files = sb.storage.from_("lora-weights").list(face_model_id)
        if files:
            paths = [f"{face_model_id}/{f['name']}" for f in files]
            sb.storage.from_("lora-weights").remove(paths)
            print(f"Deleted {len(paths)} LoRA files from Supabase")

        # Also delete text encoder subdirs if present
        for subdir in ["text_encoder", "text_encoder_2"]:
            try:
                te_files = sb.storage.from_("lora-weights").list(
                    f"{face_model_id}/{subdir}"
                )
                if te_files:
                    te_paths = [
                        f"{face_model_id}/{subdir}/{f['name']}"
                        for f in te_files
                    ]
                    sb.storage.from_("lora-weights").remove(te_paths)
                    print(f"Deleted {subdir} LoRA files")
            except Exception as e:
                print(f"No {subdir} to delete: {e}")
    except Exception as e:
        print(f"Supabase LoRA delete error: {e}")

    # 2. Delete character photos from Supabase Storage
    try:
        photos = sb.storage.from_("character-photos").list(child_id)
        if photos:
            photo_paths = [
                f"{child_id}/{p['name']}" for p in photos
            ]
            sb.storage.from_("character-photos").remove(photo_paths)
            print(f"Deleted {len(photo_paths)} character photos "
                  f"for child {child_id}")
    except Exception as e:
        print(f"Character photos delete error: {e}")

    # 3. Delete harvest photos from Supabase Storage
    print(f"Attempting to delete harvest photos for harvest_id={harvest_id}")
    if harvest_id:
        try:
            harvest_photos = sb.storage.from_(
                "harvest-photos"
            ).list(harvest_id)
            print(f"Found {len(harvest_photos)} harvest photos to delete")
            if harvest_photos:
                harvest_paths = [
                    f"{harvest_id}/{p['name']}"
                    for p in harvest_photos
                ]
                sb.storage.from_("harvest-photos").remove(
                    harvest_paths
                )
                print(f"Deleted {len(harvest_paths)} harvest photos "
                      f"for harvest {harvest_id}")
        except Exception as e:
            print(f"Harvest photos delete error: {e}")

    # 4. Delete from Modal Volume
    lora_path = Path(f"/lora-weights/{face_model_id}")
    if lora_path.exists():
        import shutil
        shutil.rmtree(str(lora_path))
        lora_volume.commit()
        print(f"Deleted LoRA from Modal Volume: {lora_path}")
    else:
        print(f"No Modal Volume entry for {face_model_id}")

    print(f"Privacy cleanup complete for face_model_id={face_model_id}, "
          f"child_id={child_id}")
    return {
        "status": "deleted",
        "face_model_id": face_model_id,
        "child_id": child_id,
        "harvest_id": harvest_id,
    }
