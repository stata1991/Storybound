/* ─── Storybound Book HTML Template ────────────────────────────────────────── */

/* ─── Brand colors ────────────────────────────────────────────────────────── */

const NAVY = "#1B2A4A";
const GOLD = "#C8963E";
const CREAM = "#FDF8F0";
const MUTED = "#8A93A6";

/* ─── Types ───────────────────────────────────────────────────────────────── */

export interface BookParams {
  childName: string;
  season: string;
  year: number;
  title: string;
  dedication: string;
  scenes: { number: number; text: string; imageBase64: string }[];
  coverImageBase64: string;
  finalPage: string;
}

/* ─── Page wrapper ────────────────────────────────────────────────────────── */

function page(content: string, bg = CREAM): string {
  return `<div style="
    width: 8.5in;
    height: 8.5in;
    overflow: hidden;
    position: relative;
    background-color: ${bg};
    page-break-after: always;
    box-sizing: border-box;
  ">${content}</div>`;
}

/* ─── Cover page ──────────────────────────────────────────────────────────── */

function coverPage(params: BookParams): string {
  return page(`
    <img
      src="data:image/png;base64,${params.coverImageBase64}"
      style="
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        object-fit: cover;
      "
    />
    <div style="
      position: absolute;
      bottom: 0; left: 0; right: 0;
      padding: 48px 40px 40px;
      background: linear-gradient(to top, rgba(27,42,74,0.85) 0%, rgba(27,42,74,0.4) 60%, transparent 100%);
    ">
      <p style="
        margin: 0 0 4px 0;
        font-family: Georgia, 'Playfair Display', serif;
        font-size: 36px;
        font-weight: 700;
        color: #ffffff;
        line-height: 1.2;
      ">${escapeHtml(params.title)}</p>
      <p style="
        margin: 0 0 12px 0;
        font-family: Georgia, 'Playfair Display', serif;
        font-size: 18px;
        color: ${GOLD};
        font-style: italic;
      ">A story for ${escapeHtml(params.childName)}</p>
      <p style="
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 12px;
        color: rgba(255,255,255,0.7);
        letter-spacing: 1.5px;
        text-transform: uppercase;
      ">A Storybound Story &middot; ${escapeHtml(capitalize(params.season))} ${params.year}</p>
    </div>
  `, "#000000");
}

/* ─── Dedication page ─────────────────────────────────────────────────────── */

function dedicationPage(dedication: string): string {
  return page(`
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 60px;
      box-sizing: border-box;
    ">
      <p style="
        margin: 0;
        font-family: Georgia, 'Playfair Display', serif;
        font-size: 18px;
        color: ${NAVY};
        font-style: italic;
        text-align: center;
        line-height: 1.8;
        max-width: 5in;
      ">${escapeHtml(dedication)}</p>
    </div>
  `);
}

/* ─── Illustration page (full bleed) ──────────────────────────────────────── */

function illustrationPage(imageBase64: string): string {
  return page(`
    <img
      src="data:image/png;base64,${imageBase64}"
      style="
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        object-fit: cover;
      "
    />
  `, "#000000");
}

/* ─── Text page ───────────────────────────────────────────────────────────── */

function textPage(sceneNumber: number, text: string): string {
  return page(`
    <div style="
      position: absolute;
      top: 24px;
      right: 28px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 11px;
      color: ${MUTED};
    ">${sceneNumber}</div>
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 60px 56px;
      box-sizing: border-box;
    ">
      <p style="
        margin: 0;
        font-family: Georgia, 'Playfair Display', serif;
        font-size: 18px;
        color: ${NAVY};
        line-height: 1.8;
        text-align: left;
        max-width: 6in;
      ">${escapeHtml(text)}</p>
    </div>
  `);
}

/* ─── Back page ───────────────────────────────────────────────────────────── */

function backPage(childName: string): string {
  return page(`
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 60px;
      box-sizing: border-box;
      text-align: center;
    ">
      <p style="
        margin: 0 0 8px 0;
        font-family: Georgia, 'Playfair Display', serif;
        font-size: 22px;
        color: ${NAVY};
        font-weight: 700;
        line-height: 1.5;
      ">This story was made for ${escapeHtml(childName)}.</p>
      <p style="
        margin: 0 0 48px 0;
        font-family: Georgia, 'Playfair Display', serif;
        font-size: 16px;
        color: ${MUTED};
        font-style: italic;
      ">From the people who love them.</p>
      <p style="
        margin: 0 0 48px 0;
        font-family: Georgia, 'Playfair Display', serif;
        font-size: 28px;
        font-weight: 700;
        color: ${NAVY};
        letter-spacing: 0.5px;
      ">Storybound</p>
      <p style="
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 10px;
        color: ${MUTED};
        line-height: 1.6;
        max-width: 4in;
      ">Illustrations created on private servers. Photos permanently deleted. &copy; ${new Date().getFullYear()} Storybound</p>
    </div>
  `);
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/* ─── Main export ─────────────────────────────────────────────────────────── */

export function generateBookHTML(params: BookParams): string {
  const pages: string[] = [];

  // 1. Cover
  pages.push(coverPage(params));

  // 2. Dedication
  pages.push(dedicationPage(params.dedication));

  // 3. Scene spreads (illustration + text alternating)
  for (const scene of params.scenes) {
    pages.push(illustrationPage(scene.imageBase64));
    pages.push(textPage(scene.number, scene.text));
  }

  // 4. Final page (as a text-only page)
  pages.push(page(`
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 60px;
      box-sizing: border-box;
    ">
      <p style="
        margin: 0;
        font-family: Georgia, 'Playfair Display', serif;
        font-size: 20px;
        color: ${NAVY};
        font-style: italic;
        text-align: center;
        line-height: 1.8;
        max-width: 5in;
      ">${escapeHtml(params.finalPage)}</p>
    </div>
  `));

  // 5. Back page
  pages.push(backPage(params.childName));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page {
      size: 8.5in 8.5in;
      margin: 0;
    }
    * { margin: 0; padding: 0; }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
  </style>
</head>
<body>
${pages.join("\n")}
</body>
</html>`;
}
