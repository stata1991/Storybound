"""
Storybound — Photo Quality Validator (Modal.com)

Validates a set of user-uploaded photos for face quality, identity
consistency, and basic image quality before they enter the LoRA
training pipeline. Pure compute — no DB writes, no webhooks.

Usage:
  modal run modal/photo_validator.py --input-path /tmp/test_set.json
"""

import modal
import json
import time
from fastapi import Request
from fastapi.responses import JSONResponse

# ─── Thresholds ──────────────────────────────────────────────────────────────

# Per-photo: hard-fail thresholds
REQUIRED_FACE_COUNT = 1                # face_count != 1 → no_face / multiple_faces
MIN_LAPLACIAN_VARIANCE = 50.0         # cv2.Laplacian variance → blurry
MIN_DET_SCORE = 0.5                   # insightface det_score → low_det_score

# Per-photo: warning thresholds
SMALL_FACE_MIN_PX = 200               # face bbox short side < 200px → small_face warning
WARN_SHORT_SIDE_PX = 512              # < 512 → low_resolution

# Set-level thresholds
NEAR_DUPLICATE_COSINE = 0.92          # pairwise cosine above this → near-duplicate
MIN_EFFECTIVE_PHOTOS = 8              # set_pass requires this many effective unique photos
IDENTITY_OUTLIER_SIGMA = 2.0          # mean_cosine - 2*std → outlier threshold

# ─── Modal app ───────────────────────────────────────────────────────────────

app = modal.App("storybound-photo-validator")

validator_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install([
        "insightface==0.7.3",
        "onnxruntime",
        "opencv-python-headless",
        "httpx",
        "numpy",
        "Pillow>=10.0.0",
        "fastapi[standard]",
    ])
    .run_commands(
        # Pre-download InsightFace buffalo_l at image build time
        "python -c \"import insightface; "
        "from insightface.app import FaceAnalysis; "
        "app = FaceAnalysis(name='buffalo_l'); "
        "app.prepare(ctx_id=-1, det_size=(640,640))\"",
    )
)


# ─── Validator ───────────────────────────────────────────────────────────────

@app.function(
    image=validator_image,
    memory=4096,
    timeout=180,
)
def validate_photos(urls: list[str]) -> dict:
    """
    Validate a set of photo URLs for face quality and identity consistency.

    Downloads photos in parallel via httpx.AsyncClient, processes face
    analysis sequentially (insightface is not thread-safe), then computes
    set-level identity consistency via pairwise cosine similarity.
    """
    import asyncio
    import io

    import cv2
    import httpx
    import numpy as np
    from insightface.app import FaceAnalysis
    from PIL import Image

    t_start = time.monotonic()

    # ── Step 1: Download all photos in parallel ──────────────────────────

    async def _download_all() -> list[tuple[str, bytes | None, str | None]]:
        async def download_one(
            client: httpx.AsyncClient, url: str
        ) -> tuple[str, bytes | None, str | None]:
            try:
                resp = await client.get(url, follow_redirects=True)
                resp.raise_for_status()
                return (url, resp.content, None)
            except Exception as e:
                return (url, None, str(e))

        async with httpx.AsyncClient(timeout=10.0) as client:
            tasks = [download_one(client, url) for url in urls]
            return await asyncio.gather(*tasks)

    downloads = asyncio.run(_download_all())

    # ── Step 2: Init FaceAnalysis (once per container invocation) ─────────

    face_app = FaceAnalysis(
        name="buffalo_l",
        providers=["CPUExecutionProvider"],
    )
    face_app.prepare(ctx_id=-1, det_size=(640, 640))

    # ── Step 3: Analyze each photo sequentially ──────────────────────────

    per_photo: list[dict] = []
    embeddings_by_index: dict[int, np.ndarray] = {}

    for idx, (url, photo_bytes, dl_error) in enumerate(downloads):
        # Download failure → hard fail, nullable metrics
        if dl_error is not None or photo_bytes is None:
            per_photo.append({
                "url": url,
                "verdict": "fail",
                "hard_fails": ["download_failed"],
                "warnings": [],
                "metrics": {
                    "face_count": 0,
                    "det_score": None,
                    "bbox_area_ratio": None,
                    "face_short_side_px": None,
                    "laplacian_variance": 0.0,
                    "short_side_px": 0,
                    "embedding_present": False,
                },
            })
            continue

        # Decode image
        try:
            pil_img = Image.open(io.BytesIO(photo_bytes)).convert("RGB")
            img_bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        except Exception:
            per_photo.append({
                "url": url,
                "verdict": "fail",
                "hard_fails": ["download_failed"],
                "warnings": [],
                "metrics": {
                    "face_count": 0,
                    "det_score": None,
                    "bbox_area_ratio": None,
                    "face_short_side_px": None,
                    "laplacian_variance": 0.0,
                    "short_side_px": 0,
                    "embedding_present": False,
                },
            })
            continue

        hard_fails: list[str] = []
        warnings: list[str] = []

        h, w = img_bgr.shape[:2]
        short_side_px = min(h, w)
        image_area = h * w

        # Laplacian variance — full image, not face crop
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        if laplacian_var < MIN_LAPLACIAN_VARIANCE:
            hard_fails.append("blurry")

        if short_side_px < WARN_SHORT_SIDE_PX:
            warnings.append("low_resolution")

        # Face detection via InsightFace
        faces = face_app.get(img_bgr)
        face_count = len(faces)

        det_score: float | None = None
        bbox_area_ratio: float | None = None
        face_short_side_px: int | None = None
        embedding_present = False

        if face_count == 0:
            hard_fails.append("no_face")
        elif face_count > 1:
            hard_fails.append("multiple_faces")
        else:
            face = faces[0]
            det_score = float(face.det_score)
            x1, y1, x2, y2 = face.bbox
            bbox_w = x2 - x1
            bbox_h = y2 - y1
            bbox_area = bbox_w * bbox_h
            bbox_area_ratio = float(bbox_area / image_area)
            face_short_side_px = int(min(bbox_w, bbox_h))

            if det_score < MIN_DET_SCORE:
                hard_fails.append("low_det_score")

            if face_short_side_px < SMALL_FACE_MIN_PX:
                warnings.append("small_face")

            if (
                hasattr(face, "normed_embedding")
                and face.normed_embedding is not None
            ):
                embeddings_by_index[idx] = face.normed_embedding
                embedding_present = True

        # Verdict
        if hard_fails:
            verdict = "fail"
        elif warnings:
            verdict = "warn"
        else:
            verdict = "pass"

        per_photo.append({
            "url": url,
            "verdict": verdict,
            "hard_fails": hard_fails,
            "warnings": warnings,
            "metrics": {
                "face_count": face_count,
                "det_score": det_score,
                "bbox_area_ratio": bbox_area_ratio,
                "face_short_side_px": face_short_side_px,
                "laplacian_variance": laplacian_var,
                "short_side_px": short_side_px,
                "embedding_present": embedding_present,
            },
        })

    # ── Step 4: Set-level analysis ───────────────────────────────────────

    hard_pass_count = sum(1 for p in per_photo if not p["hard_fails"])

    # --- Identity consistency (unchanged) ---
    mean_pairwise_cosine: float | None = None
    outlier_indices: list[int] = []
    outlier_threshold: float | None = None

    emb_indices = sorted(embeddings_by_index.keys())

    if len(emb_indices) >= 2:
        emb_matrix = np.stack(
            [embeddings_by_index[i] for i in emb_indices]
        )
        # L2-normalize (insightface normed_embedding is already normalized,
        # but re-normalize for safety)
        norms = np.linalg.norm(emb_matrix, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1.0, norms)
        emb_matrix = emb_matrix / norms

        # Cosine similarity matrix (NxN)
        sim_matrix = emb_matrix @ emb_matrix.T
        n = len(emb_indices)

        # Overall stats from upper triangle (excluding diagonal)
        upper_tri = sim_matrix[np.triu_indices(n, k=1)]
        mean_pairwise_cosine = float(np.mean(upper_tri))
        std_pairwise = float(np.std(upper_tri))

        outlier_threshold = mean_pairwise_cosine - (
            IDENTITY_OUTLIER_SIGMA * std_pairwise
        )

        # Per-photo: mean cosine to all other photos with embeddings
        for local_idx in range(n):
            others = [
                sim_matrix[local_idx, j]
                for j in range(n)
                if j != local_idx
            ]
            per_photo_mean = float(np.mean(others))
            if per_photo_mean < outlier_threshold:
                global_idx = emb_indices[local_idx]
                outlier_indices.append(global_idx)
                per_photo[global_idx]["warnings"].append("identity_outlier")
                if per_photo[global_idx]["verdict"] == "pass":
                    per_photo[global_idx]["verdict"] = "warn"

    # --- Near-duplicate clustering (usable photos only) ---
    usable_indices = [
        i for i, p in enumerate(per_photo)
        if not p["hard_fails"] and p["metrics"]["embedding_present"]
    ]

    near_duplicate_clusters: list[list[int]] = []
    effective_photo_count = len(usable_indices)

    if len(usable_indices) >= 2:
        # Build embedding matrix for usable photos
        usable_embs = np.stack(
            [embeddings_by_index[i] for i in usable_indices]
        )
        u_norms = np.linalg.norm(usable_embs, axis=1, keepdims=True)
        u_norms = np.where(u_norms == 0, 1.0, u_norms)
        usable_embs = usable_embs / u_norms

        usable_sim = usable_embs @ usable_embs.T
        nu = len(usable_indices)

        # Union-Find
        parent = list(range(nu))

        def find(x: int) -> int:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a: int, b: int) -> None:
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb

        for i in range(nu):
            for j in range(i + 1, nu):
                if usable_sim[i, j] > NEAR_DUPLICATE_COSINE:
                    union(i, j)

        # Build connected components
        components: dict[int, list[int]] = {}
        for local_idx in range(nu):
            root = find(local_idx)
            components.setdefault(root, []).append(usable_indices[local_idx])

        effective_photo_count = len(components)
        near_duplicate_clusters = [
            members for members in components.values() if len(members) > 1
        ]

    timing_seconds = round(time.monotonic() - t_start, 3)

    return {
        "per_photo": per_photo,
        "set": {
            "hard_pass_count": hard_pass_count,
            "effective_photo_count": effective_photo_count,
            "near_duplicate_clusters": near_duplicate_clusters,
            "set_pass": effective_photo_count >= MIN_EFFECTIVE_PHOTOS,
            "identity_consistency": {
                "mean_pairwise_cosine": mean_pairwise_cosine,
                "outlier_indices": outlier_indices,
                "outlier_threshold": outlier_threshold,
            },
        },
        "timing_seconds": timing_seconds,
    }


# ─── HTTP endpoint ───────────────────────────────────────────────────────────

@app.function(
    image=validator_image,
    memory=4096,
    timeout=180,
    secrets=[modal.Secret.from_name("storybound-secrets")],
)
def run_validation(
    urls: list[str],
    harvest_id: str,
    webhook_url: str,
    webhook_secret: str,
):
    """
    Run validation and POST results to webhook.
    Called asynchronously via .spawn() from the HTTP endpoint.
    """
    import httpx

    result = validate_photos.local(urls)
    result["harvest_id"] = harvest_id

    try:
        resp = httpx.post(
            webhook_url,
            json=result,
            headers={
                "x-webhook-secret": webhook_secret,
                "Content-Type": "application/json",
            },
            timeout=30.0,
            follow_redirects=True,
        )
        print(f"Webhook fired to {webhook_url}: {resp.status_code}")
    except Exception as e:
        print(f"Webhook failed: {e}")


@app.function(
    image=validator_image,
    secrets=[modal.Secret.from_name("storybound-secrets")],
)
@modal.fastapi_endpoint(method="POST")
async def validate_photos_http(req: Request):
    """
    HTTP wrapper for photo validation.

    POST /
    Headers: x-webhook-secret: <MODAL_WEBHOOK_SECRET>
    Body:    { "urls": [str], "harvest_id": str, "webhook_url": str }
    Returns: 202 {"status":"queued"} immediately
    """
    import os

    secret = req.headers.get("x-webhook-secret")
    expected = os.environ.get("MODAL_WEBHOOK_SECRET", "")
    if not expected or secret != expected:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    body = await req.json()
    urls = body.get("urls", [])
    harvest_id = body.get("harvest_id", "")
    webhook_url = body.get("webhook_url", "")

    run_validation.spawn(
        urls=urls,
        harvest_id=harvest_id,
        webhook_url=webhook_url,
        webhook_secret=expected,
    )

    return JSONResponse({"status": "queued"}, status_code=202)


# ─── Local entrypoint ───────────────────────────────────────────────────────

@app.local_entrypoint()
def main(input_path: str):
    """
    Local test harness.

    Usage:
      modal run modal/photo_validator.py --input-path /tmp/test_set.json

    Input JSON format: {"urls": ["https://...", ...]}
    """
    from pathlib import Path

    data = json.loads(Path(input_path).read_text())
    urls = data["urls"]
    print(f"Validating {len(urls)} photo(s)...")

    result = validate_photos.remote(urls)
    print(json.dumps(result, indent=2))
