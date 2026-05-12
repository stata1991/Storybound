import modal
import base64
import sys
import secrets
from pathlib import Path

train_flux_lora = modal.Function.from_name(
    "storybound-flux", "train_flux_lora"
)
generate_flux_illustrations = modal.Function.from_name(
    "storybound-flux", "generate_flux_illustrations"
)

app = modal.App("test-flux")

@app.local_entrypoint()
def main():
    photo_paths = [
        Path.home() / "Downloads" / "WhatsApp Image 2026-03-30 at 1.15.44 PM (1).jpeg",
        Path.home() / "Downloads" / "WhatsApp Image 2026-03-30 at 1.15.44 PM (2).jpeg",
        Path.home() / "Downloads" / "WhatsApp Image 2026-03-30 at 1.15.44 PM (3).jpeg",
        Path.home() / "Downloads" / "WhatsApp Image 2026-03-30 at 1.15.44 PM (4).jpeg",
        Path.home() / "Downloads" / "WhatsApp Image 2026-03-30 at 1.15.44 PM (5).jpeg",
        Path.home() / "Downloads" / "WhatsApp Image 2026-03-30 at 1.15.44 PM (6).jpeg",
        Path.home() / "Downloads" / "WhatsApp Image 2026-03-30 at 1.15.44 PM (7).jpeg",
        Path.home() / "Downloads" / "WhatsApp Image 2026-03-30 at 1.15.44 PM (8).jpeg",
    ]

    photos_b64 = []
    for path in photo_paths:
        if path.exists():
            photos_b64.append(
                base64.b64encode(path.read_bytes()).decode()
            )
            print(f"Loaded: {path.name}")
        else:
            print(f"Not found, skipping: {path.name}")

    if len(photos_b64) < 2:
        print(f"ERROR: Need at least 2 photos, found {len(photos_b64)}")
        sys.exit(1)

    print(f"Loaded {len(photos_b64)} photos successfully")

    face_model_id = f"flux-test-{secrets.token_hex(4)}"
    print(f"face_model_id: {face_model_id}")
    print("Starting FLUX LoRA training on L40S...")

    try:
        train_flux_lora.remote(
            photos_b64=photos_b64,
            face_model_id=face_model_id,
            harvest_id="00000000-0000-0000-0000-000000000003",
            callback_url="https://httpbin.org/post",
            webhook_secret="test-secret",
        )
        print("Training complete")
    except Exception as e:
        print(f"Training FAILED: {e}")
        sys.exit(1)

    print("Starting FLUX illustration generation on A10G...")

    try:
        result = generate_flux_illustrations.remote({
            "face_model_id": face_model_id,
            "scene_prompts": [
                "playing in a sunny garden with colorful flowers",
                "reading a big book under an oak tree",
            ],
            "child_age": 3,
            "pronouns": "boy",
            "skin_tone_hint": "warm brown skin, South Asian",
            "harvest_id": "00000000-0000-0000-0000-000000000003",
            "episode_id": "00000000-0000-0000-0000-000000000001",
            "child_id": "00000000-0000-0000-0000-000000000002",
        })
        print(f"Generation result: {result}")
    except Exception as e:
        print(f"Generation FAILED: {e}")
        sys.exit(1)

    print("FLUX pipeline test complete.")
