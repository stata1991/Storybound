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
        "ffmpeg",
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
        "insightface",
        "onnxruntime",
        "ip-adapter",
        "einops",
        "supabase",
        "storage3",
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
        # Pre-download InsightFace buffalo_l model for face embedding extraction + swap
        "python -c \""
        "from insightface.app import FaceAnalysis; "
        "app = FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider']); "
        "app.prepare(ctx_id=0, det_size=(640, 640))"
        "\"",
        # Pre-download inswapper_128 face swap model
        "python -c \""
        "from huggingface_hub import hf_hub_download; "
        "hf_hub_download("
        "repo_id='hacksider/deep-live-cam', "
        "filename='inswapper_128_fp16.onnx', "
        f"local_dir='{MODEL_CACHE_PATH}'"
        ")\"",
        # Pre-download IP-Adapter FaceID weights
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

STYLE_SUFFIX = (
    ", gouache illustration, children's book, "
    "soft colors, Studio Ghibli"
)

NEGATIVE_PROMPT = (
    "oil painting, photorealistic, photograph, realistic rendering, "
    "back of head, facing away, looking away, turned away, "
    "black and white, monochrome, sketch, line art, coloring book, "
    "text, watermark, signature, "
    "blurry, deformed, extra limbs, "
    "adult, teenager, older person, "
    "low quality face, blurry face, "
    "overly dark skin, too dark complexion"
)


# ─── Age prefix (Fix 1) ─────────────────────────────────────────────────────


def get_age_prefix(age: int, pronouns: str = "they_them", lora_active: bool = False) -> str:
    """
    Short age-anchoring prefix for SDXL prompts.
    When LoRA is active, keep it minimal — just age + gender word.
    The LoRA already encodes the child's real facial structure.
    When skip-lora, add facial descriptors to guide the base model.
    """
    if "she" in pronouns.lower() or pronouns == "she_her":
        word = "girl"
    elif "he" in pronouns.lower() or pronouns == "he_him":
        word = "boy"
    else:
        word = "child"

    clamped = max(3, min(10, age))

    if lora_active:
        # Minimal — LoRA handles facial structure
        if clamped <= 4:
            return f"3-year-old toddler {word}"
        elif clamped <= 6:
            return f"5-year-old young {word}"
        elif clamped <= 8:
            return f"8-year-old {word}"
        else:
            return f"10-year-old {word}"
    else:
        # Skip-lora — base model needs facial guidance
        if clamped <= 4:
            return f"3-year-old toddler {word}, baby face, chubby cheeks, very young child"
        elif clamped <= 6:
            return f"5-year-old little {word}, round face, chubby cheeks, young child"
        elif clamped <= 8:
            return f"8-year-old {word}, young face, child proportions"
        else:
            return f"10-year-old preteen {word}, young face"


def truncate_scene_description(prompt: str, max_words: int = 20) -> str:
    """Take first sentence only, max N words. Strips [FACE REF...] tags."""
    import re
    # Remove [FACE REF: ...] tags — SDXL can't use text as image references
    prompt = re.sub(r"\[FACE REF[^\]]*\]", "", prompt).strip()
    # Remove child name references (e.g. "Samarth with wavy hair...")
    # Replace "Name with/and [physical desc]" with just the action
    prompt = re.sub(r'\b[A-Z][a-z]+\s+(with|and)\s+[^,\.]+[,\.]?', '', prompt)
    # Remove any remaining standalone proper names at sentence start
    prompt = re.sub(r'^[A-Z][a-z]+\s+', '', prompt.strip())
    # Replace directional movement phrases that cause rear-facing composition
    prompt = re.sub(r'\b(walking toward|running toward|moving toward|heading toward)\b',
                    'standing near', prompt, flags=re.IGNORECASE)
    prompt = prompt.strip().lstrip(',').strip()
    # Take first sentence
    first_sentence = prompt.split(".")[0].strip()
    words = first_sentence.split()
    if len(words) > max_words:
        first_sentence = " ".join(words[:max_words])
    return first_sentence


def extract_core_appearance(description: str, max_words: int = 10) -> str:
    """Extract physical features only (hair, eyes, skin). No clothing."""
    if not description:
        return ""
    clothing_words = {
        "wear", "wears", "wearing", "dress", "dressed", "outfit",
        "boots", "shirt", "pants", "skirt", "jacket", "hat", "headband",
        "shoes", "socks", "coat", "hoodie", "sweater", "clothing",
        "carries", "carry", "carrying", "backpack", "glasses",
    }
    parts = [p.strip() for p in description.split(",") if p.strip()]
    filtered_out = [p for p in parts if any(w in p.lower().split() for w in clothing_words)]
    physical = [
        p for p in parts
        if not any(w in p.lower().split() for w in clothing_words)
    ]
    print(f"extract_core_appearance input: {parts}")
    print(f"extract_core_appearance filtered out (clothing): {filtered_out}")
    print(f"extract_core_appearance kept (physical): {physical}")
    result = ", ".join(physical[:3])
    words = result.split()
    if len(words) > max_words:
        result = " ".join(words[:max_words])
    print(f"extract_core_appearance result: {result}")
    return result


# ─── Face swap via inswapper_128 ──────────────────────────────────────────────


def apply_face_swap(
    source_face_path: str,
    target_image,  # PIL Image
    model_path: str,
) -> "Image":
    """Swap face from source photo onto target illustration using inswapper."""
    import cv2
    import numpy as np
    from PIL import Image
    from insightface.app import FaceAnalysis
    from insightface.model_zoo import get_model

    # Source face detector — high res, real photo
    source_app = FaceAnalysis(
        name="buffalo_l",
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
    )
    source_app.prepare(ctx_id=0, det_size=(640, 640))

    swapper = get_model(model_path, providers=["CUDAExecutionProvider", "CPUExecutionProvider"])

    # Get source face
    source_img = cv2.imread(source_face_path)
    source_faces = source_app.get(source_img)
    if not source_faces:
        print("WARNING: No face in source image, skipping swap")
        return target_image
    source_face = max(
        source_faces,
        key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
    )
    print(f"Source face detected: bbox size {(source_face.bbox[2]-source_face.bbox[0]):.0f}x{(source_face.bbox[3]-source_face.bbox[1]):.0f}")

    # Convert target illustration to BGR for InsightFace
    target_np = cv2.cvtColor(np.array(target_image), cv2.COLOR_RGB2BGR)

    target_app = FaceAnalysis(
        name="buffalo_l",
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
    )
    # Use strict threshold — illustrated faces should pass this or not be swapped.
    # Do NOT lower this. False positives at low thresholds destroy illustrations.
    target_app.prepare(ctx_id=0, det_size=(640, 640), det_thresh=0.55)
    target_faces = target_app.get(target_np)
    print(f"Target face detection (640, thresh=0.55): found {len(target_faces)} faces in illustration")

    if not target_faces:
        print("No face detected in target illustration — skipping swap (illustration preserved as-is)")
        return target_image

    # Swap the largest face in the target
    target_face = max(
        target_faces,
        key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
    )
    print(f"Target face selected: bbox size {(target_face.bbox[2]-target_face.bbox[0]):.0f}x{(target_face.bbox[3]-target_face.bbox[1]):.0f}")

    # Quality gate: skip swap if detected face bbox is implausibly small
    # (likely a false positive artifact, not a real illustrated face)
    face_w = target_face.bbox[2] - target_face.bbox[0]
    face_h = target_face.bbox[3] - target_face.bbox[1]
    img_w, img_h = target_image.size
    face_area_pct = (face_w * face_h) / (img_w * img_h)
    if face_area_pct < 0.10:  # face must be at least 10% of image area
        print(f"WARNING: Detected face too small ({face_area_pct:.3%} of image) — likely false positive, skipping swap")
        return target_image
    print(f"Face area: {face_area_pct:.1%} of image — proceeding with swap")

    result = swapper.get(target_np, target_face, source_face, paste_back=True)
    result_rgb = cv2.cvtColor(result, cv2.COLOR_BGR2RGB)
    return Image.fromarray(result_rgb)


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


def build_cover_prompt(age_prefix: str = "", hair: str = "", skin_tone: str = "") -> str:
    """Build a dedicated cover prompt — self-contained, under 60 words."""
    parts = []
    if age_prefix:
        parts.append(age_prefix)
    parts.append("sks child")
    if skin_tone:
        parts.append(skin_tone)
    if hair:
        # Truncate hair to first 6 words max
        hair_words = hair.split()
        parts.append(" ".join(hair_words[:6]))
    parts.append("portrait, magical storybook world")
    parts.append("looking at viewer, warm smile")
    parts.append(
        "gouache illustration, children's picture book art, "
        "soft warm painterly style, Studio Ghibli inspired, "
        "NOT photorealistic, NOT oil painting"
    )
    return ", ".join(parts)


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
            with torch.amp.autocast("cuda"):
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
    timeout=2400,  # 40 min max for training (1024px @ 2000 steps)
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
    # Read body IMMEDIATELY — before any other processing.
    # Vercel may disconnect after 120s; reading the body first ensures
    # we have the payload before the client hangs up.
    from starlette.requests import ClientDisconnect

    try:
        body = await req.json()
    except ClientDisconnect:
        return {"error": "Client disconnected before body was read"}

    if not verify_auth(req):
        auth_error()

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

        img = img.resize((1024, 1024), Image.LANCZOS)
        pil_images.append(img)

    print(f"Preprocessed {n_cropped}/{len(photos_b64)} photos with face crops (512x512)")

    # ── Extract face embedding via InsightFace (for IP-Adapter at gen time) ─

    from insightface.app import FaceAnalysis

    face_app = FaceAnalysis(
        name="buffalo_l",
        providers=["CUDAExecutionProvider"],
    )
    face_app.prepare(ctx_id=0, det_size=(640, 640))

    best_face_idx = -1
    best_face_size = 0
    import torch as _torch
    face_embeddings = []

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
                best_face_idx = idx
            face_embeddings.append(_torch.from_numpy(face.normed_embedding).unsqueeze(0))
            print(f"Photo {idx}: InsightFace face detected (face_size={face_size:.0f})")

    if best_face_idx >= 0:
        print(f"Best face crop: photo {best_face_idx} (face_size={best_face_size:.0f})")
    else:
        print("WARNING: No face detected in any photo by InsightFace")

    # Average face embeddings for IP-Adapter FaceID conditioning at generation
    if face_embeddings:
        avg_embedding = _torch.cat(face_embeddings, dim=0).mean(dim=0, keepdim=True)
        print(f"Face embedding extracted: averaged across {len(face_embeddings)} photos, shape={avg_embedding.shape}")
    else:
        avg_embedding = None
        print("WARNING: No face embeddings extracted — IP-Adapter will be skipped at generation")

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
        r=32,
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

    # Save best face crop bytes before deleting source photos
    _best_face_crop_bytes = None
    if best_face_idx >= 0:
        _face_buf = io.BytesIO()
        pil_images[best_face_idx].save(_face_buf, format="JPEG", quality=95)
        _best_face_crop_bytes = _face_buf.getvalue()
        del _face_buf
        print(f"Best face crop buffered ({len(_best_face_crop_bytes)} bytes)")

    # ── DELETE source photos from memory immediately after encoding ──────────
    # Privacy: constraint step 3 — source photos deleted from Modal memory
    del pil_images
    del img_bytes
    del img
    del img_tensor
    photos_b64.clear()
    gc.collect()

    # ── Training loop ───────────────────────────────────────────────────────

    optimizer = torch.optim.AdamW(unet.parameters(), lr=1e-5, weight_decay=1e-2)

    lora_params = [p for p in unet.parameters() if p.requires_grad]
    print(f"Trainable LoRA params: {len(lora_params)}")
    print(f"Total param tensors: {sum(1 for _ in unet.parameters())}")
    print(f"Training config: steps=2000, rank=32, lr=1e-5, resolution=1024")

    num_steps = 2000
    num_images = len(latents_list)

    # SDXL additional conditioning: time_ids
    add_time_ids = torch.tensor(
        [[1024.0, 1024.0, 0.0, 0.0, 1024.0, 1024.0]],
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

            # MSE loss against actual noise (per-element, unreduced)
            loss = torch.nn.functional.mse_loss(noise_pred, noise, reduction="none")
            loss = loss.mean(dim=list(range(1, loss.ndim)))  # per-sample mean

            # Min-SNR-gamma weighting (gamma=5.0) for stable training
            alphas_cumprod = noise_scheduler.alphas_cumprod.to(device=timesteps.device)
            alpha_t = alphas_cumprod[timesteps]
            snr = alpha_t / (1.0 - alpha_t)
            snr_gamma = 5.0
            mse_loss_weights = torch.clamp(snr, max=snr_gamma) / snr
            loss = (loss * mse_loss_weights).mean()

        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(
            [p for p in unet.parameters() if p.requires_grad],
            max_norm=1.0,
        )
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

    unet.save_pretrained(str(save_dir))

    # Save best face crop for face swap stage during generation
    if _best_face_crop_bytes is not None:
        face_crop_path = save_dir / "best_face_crop.jpg"
        face_crop_path.write_bytes(_best_face_crop_bytes)
        del _best_face_crop_bytes
        print(f"Best face crop saved: {face_crop_path}")

    # Save averaged face embedding for IP-Adapter FaceID conditioning
    if avg_embedding is not None:
        embedding_path = save_dir / "face_embedding.pt"
        _torch.save(avg_embedding, str(embedding_path))
        print(f"Face embedding saved: {embedding_path}")

    await lora_volume.commit.aio()

    # ── Upload LoRA to Supabase Storage (primary persistence) ────────────
    try:
        from supabase import create_client as _create_sb

        _sb_url = os.environ.get("SUPABASE_URL")
        _sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        _sb = _create_sb(_sb_url, _sb_key)

        for filename in ["adapter_model.safetensors", "adapter_config.json", "README.md"]:
            filepath = save_dir / filename
            if filepath.exists():
                with open(filepath, "rb") as f:
                    _sb.storage.from_("lora-weights").upload(
                        f"{face_model_id}/{filename}",
                        f.read(),
                        {"content-type": "application/octet-stream", "upsert": "true"},
                    )

        face_crop_sb = save_dir / "best_face_crop.jpg"
        if face_crop_sb.exists():
            with open(face_crop_sb, "rb") as f:
                _sb.storage.from_("lora-weights").upload(
                    f"{face_model_id}/best_face_crop.jpg",
                    f.read(),
                    {"content-type": "image/jpeg", "upsert": "true"},
                )

        embedding_path_sb = save_dir / "face_embedding.pt"
        if embedding_path_sb.exists():
            with open(embedding_path_sb, "rb") as f:
                _sb.storage.from_("lora-weights").upload(
                    f"{face_model_id}/face_embedding.pt",
                    f.read(),
                    {"content-type": "application/octet-stream", "upsert": "true"},
                )

        print(f"LoRA uploaded to Supabase Storage: lora-weights/{face_model_id}/")
    except Exception as e:
        print(f"WARNING: Supabase upload failed (volume backup still exists): {e}")

    # Weight magnitude check — detect unstable LoRA weights
    lora_weights = [p for p in unet.parameters() if p.requires_grad]
    if lora_weights:
        max_val = max(p.abs().max().item() for p in lora_weights)
        print(f"LoRA weight max absolute value: {max_val:.4f}")
        if max_val > 1.5:
            raise RuntimeError(
                f"LoRA weights exploded (max={max_val:.4f} > 1.5). "
                "Aborting — lr still too high or grad clip not working."
            )
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
        print(f"Firing webhook to {callback_url} (harvest_id={harvest_id}, face_model_id={face_model_id})")
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    callback_url,
                    follow_redirects=True,
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
                print(f"Webhook response: {resp.status_code} — {resp.text[:500]}")
                resp.raise_for_status()
        except Exception as e:
            print(f"Webhook callback failed: {e}")

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
    hair_description = body.get("hair_description", "")
    memory_photos_b64 = body.get("memory_photos_b64", [])
    episode_seed = body.get("episode_seed", None)
    if episode_seed is None:
        import hashlib
        episode_seed = int(hashlib.md5(face_model_id.encode()).hexdigest()[:8], 16)
        print(f"No episode_seed provided — derived from face_model_id: {episode_seed}")

    if not skip_lora and not face_model_id:
        web_error({"error": "face_model_id required (or set skip_lora: true)"})

    if not prompts or len(prompts) > 12:
        web_error({"error": "Between 1 and 12 prompts required"})

    print(f"Received {len(prompts)} scene prompts")
    print(f"Generating {len(prompts)} scenes + 1 cover")
    print(f"Child age: {child_age}, pronouns: {child_pronouns}")

    # ── Build prompt components ─────────────────────────────────────────────

    lora_active = not skip_lora and bool(face_model_id)
    age_prefix = get_age_prefix(child_age, child_pronouns, lora_active=lora_active)
    core_appearance = extract_core_appearance(character_description)
    lora_token = "sks child"

    # When LoRA is active, it already encodes the child's real appearance from photos.
    # Story bible hair/appearance descriptions are fabricated (no photo access) and fight the LoRA.
    # Only use them as fallback for skip-lora mode.
    if not skip_lora and face_model_id:
        print(f"LoRA active — ignoring story bible hair_description ({hair_description!r}) and core_appearance ({core_appearance!r})")
        hair_description = ""
        core_appearance = ""

    # Keep skin tone hint even when LoRA active — helps override SDXL's
    # base model bias toward lighter skin tones
    skin_tone_hint = ""
    if not skip_lora and face_model_id and character_description:
        desc_lower = character_description.lower()
        if "dark brown" in desc_lower:
            skin_tone_hint = "medium brown skin tone"
        elif "warm brown" in desc_lower or "golden brown" in desc_lower:
            skin_tone_hint = "warm medium brown skin, South Asian skin tone"
        elif "brown skin" in desc_lower:
            skin_tone_hint = "medium brown skin"
        elif "light brown" in desc_lower or "fair" in desc_lower:
            skin_tone_hint = "light brown skin"
        if skin_tone_hint:
            print(f"Skin tone hint (LoRA active): {skin_tone_hint}")

    if hair_description:
        print(f"Hair description (from story bible): {hair_description}")
        print(f"Core appearance (extracted): {core_appearance}")
    else:
        print(f"No explicit hair_description, using core_appearance: {core_appearance}")

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
        # Download LoRA from Supabase Storage
        import tempfile
        from supabase import create_client as _create_sb_gen

        _sb_url = os.environ.get("SUPABASE_URL")
        _sb_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        _sb = _create_sb_gen(_sb_url, _sb_key)

        lora_dir = Path(tempfile.mkdtemp()) / face_model_id
        lora_dir.mkdir(parents=True, exist_ok=True)

        files_to_download = [
            "adapter_model.safetensors",
            "adapter_config.json",
            "README.md",
            "best_face_crop.jpg",
            "face_embedding.pt",
        ]

        downloaded = []
        for filename in files_to_download:
            try:
                data = _sb.storage.from_("lora-weights").download(
                    f"{face_model_id}/{filename}"
                )
                (lora_dir / filename).write_bytes(data)
                downloaded.append(filename)
            except Exception as e:
                print(f"Could not download {filename}: {e}")

        if "adapter_model.safetensors" not in downloaded:
            print(f"ERROR: LoRA adapter not found in Supabase for {face_model_id}")
            print("Proceeding without face conditioning")
            lora_dir = None
        else:
            print(f"LoRA downloaded from Supabase: {downloaded}")

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

            pipe.fuse_lora(lora_scale=0.4)
            lora_loaded = True
            print("LoRA loaded and fused successfully")
        except Exception as e:
            print(f"ERROR loading LoRA: {e}")
            print("Proceeding without face conditioning")

    # Load face embedding for IP-Adapter FaceID conditioning
    face_embedding = None
    if not skip_lora and lora_dir and lora_dir.exists():
        embedding_path = lora_dir / "face_embedding.pt"
        if embedding_path.exists():
            import torch as _torch
            face_embedding = _torch.load(str(embedding_path), map_location="cuda")
            print(f"Face embedding loaded: shape={face_embedding.shape}")
        else:
            print("No face_embedding.pt found — IP-Adapter conditioning disabled")

    # Resolve face swap source
    source_face_path = None
    swap_model_path = f"{MODEL_CACHE_PATH}/inswapper_128_fp16.onnx"

    if not skip_lora and lora_dir and lora_dir.exists():
        candidate_crop = str(lora_dir / "best_face_crop.jpg")
        if os.path.exists(candidate_crop) and os.path.exists(swap_model_path):
            source_face_path = candidate_crop
            print(f"Face swap enabled: {source_face_path}")
        else:
            print(f"Face swap disabled: crop={os.path.exists(candidate_crop)}, "
                  f"model={os.path.exists(swap_model_path)}")

    import torch

    ip_adapter_embeds = None
    ip_adapter_path = f"{MODEL_CACHE_PATH}/ip-adapter-faceid_sdxl.bin"

    if face_embedding is not None and os.path.exists(ip_adapter_path):
        try:
            pipe.load_ip_adapter(
                "h94/IP-Adapter-FaceID",
                subfolder=None,
                weight_name="ip-adapter-faceid_sdxl.bin",
                image_encoder_folder=None,
            )
            pipe.set_ip_adapter_scale(0.2)
            ip_adapter_embeds = face_embedding.to("cuda", dtype=torch.float16)
            # SDXL expects ip_adapter_image_embeds as list of 3D tensors [batch, num_tokens, dim]
            # face_embedding is [1, 512] — unsqueeze to [1, 1, 512]
            ip_adapter_embeds = ip_adapter_embeds.unsqueeze(1)
            # SDXL CFG requires both negative and positive ip_adapter embeds
            # Stack zeros (negative/unconditional) with face embedding (positive)
            negative_embeds = torch.zeros_like(ip_adapter_embeds)
            ip_adapter_embeds = torch.cat([negative_embeds, ip_adapter_embeds], dim=0)
            print(f"IP-Adapter embeds shape (neg+pos): {ip_adapter_embeds.shape}")
            # Expected: torch.Size([2, 1, 512])
            print("IP-Adapter loaded via pipe.load_ip_adapter, scale=0.2")
        except Exception as e:
            print(f"WARNING: IP-Adapter load failed: {e}")
            ip_adapter_embeds = None
    else:
        print("IP-Adapter skipped: no embedding or weights not found")

    # ── Build cover prompt (budget-aware) ────────────────────────────────

    illustrations = []

    styled_cover = build_cover_prompt(
        age_prefix=age_prefix,
        hair=hair_description if hair_description else core_appearance,
        skin_tone=skin_tone_hint,
    )

    word_count = len(styled_cover.split())
    if word_count > 50:
        print(f"WARNING: Cover prompt too long: {word_count} words")
    print(f"Cover prompt ({word_count} words): {styled_cover}")

    generator = torch.Generator(device="cuda").manual_seed(episode_seed) if episode_seed is not None else None

    cover_negative = NEGATIVE_PROMPT + ", photograph, photo, realistic, photorealistic, blurry, out of focus"

    result = pipe(
        prompt=styled_cover,
        negative_prompt=cover_negative,
        width=1024,
        height=1024,
        num_inference_steps=40,
        guidance_scale=8.5,
        output_type="latent",
        generator=generator,
        ip_adapter_image_embeds=[ip_adapter_embeds] if ip_adapter_embeds is not None else None,
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
    print("Cover generated with LoRA")

    # Face swap temporarily disabled — re-enable after tuning
    # if source_face_path:
    #     try:
    #         cover_image = apply_face_swap(
    #             source_face_path, cover_image, swap_model_path
    #         )
    #         print("Cover face swap applied")
    #     except Exception as e:
    #         print(f"Cover face swap failed ({e}), keeping original")

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

            pipe.fuse_lora(lora_scale=0.4)
            print("LoRA reloaded for scene generation")
        except Exception as e:
            print(f"ERROR reloading LoRA for scenes: {e}")

    # Re-load IP-Adapter for scene pipe
    if ip_adapter_embeds is not None:
        try:
            pipe.load_ip_adapter(
                "h94/IP-Adapter-FaceID",
                subfolder=None,
                weight_name="ip-adapter-faceid_sdxl.bin",
                image_encoder_folder=None,
            )
            pipe.set_ip_adapter_scale(0.2)
            print("IP-Adapter reloaded for scenes via pipe.load_ip_adapter, scale=0.2")
        except Exception as e:
            print(f"WARNING: IP-Adapter reload for scenes failed: {e}")
            ip_adapter_embeds = None

    # ── Generate scene images (index 1+): 768×768 ───────────────────────

    for i, raw_prompt in enumerate(prompts):
        scene_desc = truncate_scene_description(raw_prompt)
        parts = [age_prefix, lora_token]
        if skin_tone_hint:
            parts.append(skin_tone_hint)
        if hair_description:
            parts.append(hair_description)
        elif core_appearance:
            parts.append(core_appearance)
        parts.append("foreground, facing camera")
        parts.append(scene_desc)
        parts.append(STYLE_SUFFIX.lstrip(", "))
        if color_mood:
            parts.append(color_mood)
        styled_prompt = ", ".join(parts)

        word_count = len(styled_prompt.split())
        if word_count > 50:
            print(f"WARNING: Scene {i+1} prompt too long: {word_count} words")
        print(f"Scene {i+1} prompt ({word_count} words): {styled_prompt[:200]}")

        result = pipe(
            prompt=styled_prompt,
            negative_prompt=NEGATIVE_PROMPT,
            width=768,
            height=768,
            num_inference_steps=40,
            guidance_scale=7.5,
            output_type="latent",
            generator=generator,
            num_images_per_prompt=3,
            ip_adapter_image_embeds=[ip_adapter_embeds] if ip_adapter_embeds is not None else None,
        )
        print(f"Scene {i+1}: 3 candidates generated" + (" with IP-Adapter" if ip_adapter_embeds is not None else ""))

        # Clamp NaNs from UNet before decode
        latents = result.images
        latents = torch.nan_to_num(latents, nan=0.0, posinf=1.0, neginf=-1.0)
        latents = latents.clamp(-4, 4)

        # Decode all 3 candidates
        candidates = []
        for j in range(3):
            single_latent = latents[j:j+1] / pipe.vae.config.scaling_factor
            with torch.no_grad():
                decoded = pipe.vae.decode(single_latent, return_dict=False)[0]
            candidate = pipe.image_processor.postprocess(decoded, output_type="pil")[0]
            candidates.append(candidate)

        # Rerank by face similarity to reference embedding
        best_image = candidates[0]  # fallback
        best_score = -1.0

        if face_embedding is not None:
            try:
                import cv2
                import numpy as np
                from insightface.app import FaceAnalysis

                rank_app = FaceAnalysis(
                    name="buffalo_l",
                    providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
                )
                rank_app.prepare(ctx_id=0, det_size=(640, 640))

                # face_embedding is [1, 512] — the raw reference
                ref_emb = face_embedding.cpu().float()

                for idx, candidate in enumerate(candidates):
                    candidate_np = cv2.cvtColor(
                        np.array(candidate), cv2.COLOR_RGB2BGR
                    )
                    faces = rank_app.get(candidate_np)
                    if not faces:
                        print(f"  Scene {i+1} candidate {idx}: no face detected")
                        continue
                    face = max(
                        faces,
                        key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
                    )
                    gen_emb = torch.from_numpy(
                        face.normed_embedding
                    ).unsqueeze(0).float()  # [1, 512]
                    score = torch.nn.functional.cosine_similarity(
                        ref_emb, gen_emb, dim=1
                    ).item()
                    print(f"  Scene {i+1} candidate {idx}: cosine={score:.3f}")
                    if score > best_score:
                        best_score = score
                        best_image = candidate

                del rank_app
                print(f"Scene {i+1} reranking: best_score={best_score:.3f}")

            except Exception as e:
                print(f"Scene {i+1} reranking failed ({e}), using first candidate")

        image = best_image

        # Face swap temporarily disabled — re-enable after tuning
        # if source_face_path:
        #     try:
        #         image = apply_face_swap(source_face_path, image, swap_model_path)
        #         print(f"Scene {i+1} face swap applied")
        #     except Exception as e:
        #         print(f"Scene {i+1} face swap failed ({e}), keeping reranked image")

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

    # 1. Delete from Supabase Storage (primary store)
    supabase_deleted = 0
    try:
        from supabase import create_client as _create_sb_del
        _sb = _create_sb_del(
            os.environ.get("SUPABASE_URL"),
            os.environ.get("SUPABASE_SERVICE_ROLE_KEY"),
        )
        listed = _sb.storage.from_("lora-weights").list(face_model_id)
        if listed:
            paths = [f"{face_model_id}/{f['name']}" for f in listed]
            _sb.storage.from_("lora-weights").remove(paths)
            supabase_deleted = len(paths)
            print(f"Supabase lora-weights: deleted {supabase_deleted} files for {face_model_id}")
    except Exception as e:
        print(f"WARNING: Supabase lora-weights cleanup failed (continuing): {e}")

    # 2. Delete from Modal Volume (backup store)
    lora_dir = Path(LORA_VOLUME_PATH) / face_model_id
    volume_deleted = False
    if lora_dir.exists():
        shutil.rmtree(str(lora_dir))
        await lora_volume.commit.aio()
        volume_deleted = True

    if not volume_deleted and supabase_deleted == 0:
        return {
            "deleted": False,
            "face_model_id": face_model_id,
            "note": "Not found — may have already been deleted",
        }

    return {
        "deleted": True,
        "face_model_id": face_model_id,
        "supabase_files_deleted": supabase_deleted,
        "volume_deleted": volume_deleted,
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
