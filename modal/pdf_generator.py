"""
Storybound — PDF Generator (Modal.com)

Receives self-contained HTML from Next.js, renders to PDF via Playwright + Chromium.
No data fetching — all content (images, fonts) is already embedded in the HTML.
"""

import base64
import os

import modal
from fastapi import Request

app = modal.App("storybound-pdf")

secrets = modal.Secret.from_name("storybound-secrets")

pdf_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("playwright", "fastapi[standard]")
    .run_commands(["playwright install --with-deps chromium"])
)


def verify_auth(req) -> bool:
    expected = os.environ.get("MODAL_AUTH_TOKEN", "")
    if not expected:
        return False
    auth_header = req.headers.get("authorization", "")
    return auth_header == f"Bearer {expected}"


def auth_error():
    import fastapi
    raise fastapi.HTTPException(status_code=401, detail={"error": "Unauthorized"})


def web_error(body: dict, status: int = 400):
    import fastapi
    raise fastapi.HTTPException(status_code=status, detail=body)


@app.function(image=pdf_image, timeout=120, secrets=[secrets])
@modal.fastapi_endpoint(method="POST")
async def generate_pdf(req: Request):
    """
    Render self-contained HTML to PDF via Playwright Chromium.

    Request body:
      { "html": "<full HTML string>", "episode_id": "uuid" }

    Response:
      { "pdf_base64": "...", "page_count": int, "size_bytes": int }
    """
    if not verify_auth(req):
        auth_error()

    body = await req.json()

    html = body.get("html", "")
    episode_id = body.get("episode_id", "unknown")

    if not html:
        web_error({"error": "html is required"})

    print(f"PDF generation started: episode={episode_id}, html_size={len(html)} bytes")

    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox", "--disable-setuid-sandbox"])
        try:
            page = await browser.new_page()
            await page.set_content(html, wait_until="networkidle")

            pdf_bytes = await page.pdf(
                width="8.5in",
                height="8.5in",
                print_background=True,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            )
        finally:
            await browser.close()

    pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
    size_bytes = len(pdf_bytes)

    # Estimate page count from PDF (each 8.5x8.5 page is roughly consistent)
    # Use PDF /Page object count for accuracy
    page_count = pdf_bytes.count(b"/Type /Page") - pdf_bytes.count(b"/Type /Pages")
    if page_count < 1:
        page_count = 1

    print(f"PDF generation complete: episode={episode_id}, pages={page_count}, size={size_bytes} bytes")

    return {
        "pdf_base64": pdf_base64,
        "page_count": page_count,
        "size_bytes": size_bytes,
    }
