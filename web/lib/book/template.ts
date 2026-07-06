/* ─── Storybound Book HTML Template ────────────────────────────────────────── */

import {
  NUNITO_400, NUNITO_600, NUNITO_700, NUNITO_400I, NUNITO_600I,
  GELASIO_400, GELASIO_700, GELASIO_400I,
} from "./font-data";

/* ─── Brand colors ────────────────────────────────────────────────────────── */

const NAVY = "#1B2A4A";
const GOLD = "#C8963E";
const CREAM = "#FDF8F0";
const MUTED = "#8A93A6";
const WARM_WHITE = "#FFFDF7";
const TEXT_DARK = "#2C2C2A";

/* ─── Font stack ─────────────────────────────────────────────────────────── */

const NUNITO = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const SERIF = "'Gelasio', Georgia, serif";

/* ─── Print geometry ─────────────────────────────────────────────────────── */
// Prodigi hardcover photo book: content pages must match the book size EXACTLY
// — no bleed, no crop marks. Prodigi generates bleed automatically, so the page
// box is a flat 210mm square. Labels stay ≥11mm from the edge to clear Prodigi's
// 10mm safe-area minimum with margin. (page.pdf in modal/pdf_generator.py must
// use prefer_css_page_size so this @page size is the single source of truth.)
const PAGE_MM = 210; // flat trim, no bleed
const SAFE_INSET_MM = 11; // label safe-area inset from page edge (>10mm Prodigi min)

/* ─── Age profiles ───────────────────────────────────────────────────────── */

interface AgeProfile {
  label: string;
  minAge: number;
  maxAge: number;
  fontSize: number;      // scene body text px
  lineHeight: number;    // unitless multiplier
  chapterLabel: boolean; // show "Chapter N" header on text page
  wordsPerScene: number; // max words before truncation (safety net)
}

const AGE_PROFILES: AgeProfile[] = [
  { label: "1-2", minAge: 1, maxAge: 2, fontSize: 28, lineHeight: 2.1, chapterLabel: false, wordsPerScene: 12 },
  { label: "3-4", minAge: 3, maxAge: 4, fontSize: 24, lineHeight: 1.9, chapterLabel: false, wordsPerScene: 40 },
  { label: "5-6", minAge: 5, maxAge: 6, fontSize: 20, lineHeight: 1.8, chapterLabel: false, wordsPerScene: 60 },
  { label: "7-8", minAge: 7, maxAge: 8, fontSize: 16, lineHeight: 1.7, chapterLabel: true,  wordsPerScene: 120 },
];

function getAgeProfile(age: number): AgeProfile {
  const clamped = Math.min(8, age);
  return AGE_PROFILES.find((p) => clamped >= p.minAge && clamped <= p.maxAge) ?? AGE_PROFILES[0];
}

/* ─── Types ───────────────────────────────────────────────────────────────── */

export interface BookParams {
  childName: string;
  age: number;
  pronouns: string;
  season: string;
  year: number;
  title: string;
  dedication: string;
  scenes: { number: number; text: string; imageBase64: string; beat?: string }[];
  coverImageBase64: string;
  finalPage: string;
  finalPageImageBase64?: string;
}

/* ─── Pronoun helper ─────────────────────────────────────────────────────── */

function objectPronoun(pronouns: string): string {
  if (pronouns === "she_her") return "her";
  if (pronouns === "he_him") return "him";
  return "them";
}

/* ─── Page wrapper ────────────────────────────────────────────────────────── */

function page(content: string, bg = CREAM): string {
  return `<div style="
    width: ${PAGE_MM}mm;
    height: ${PAGE_MM}mm;
    overflow: hidden;
    position: relative;
    background-color: ${bg};
    page-break-after: always;
    box-sizing: border-box;
  ">${content}</div>`;
}

/* ─── Cover page (Fix 5: all fonts → Nunito) ─────────────────────────────── */

function coverPage(params: BookParams): string {
  return page(`
    <img
      src="data:image/jpeg;base64,${params.coverImageBase64}"
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
      /* Gradient panel extends to the page edges (design element); text padding
         (0.5in ≈ 12.7mm) keeps the title clear of Prodigi's 10mm safe area so it
         survives the cut on the outer cover. */
      padding: 0.5in 0.5in 0.5in;
      background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 60%, transparent 100%);
    ">
      <p style="
        margin: 0 0 4px 0;
        font-family: ${NUNITO};
        font-size: 42px;
        font-weight: 700;
        color: #ffffff;
        line-height: 1.2;
        letter-spacing: -0.5px;
        text-shadow: 0 2px 12px rgba(0,0,0,0.4);
      ">${escapeHtml(params.title)}</p>
      <p style="
        margin: 0 0 12px 0;
        font-family: ${NUNITO};
        font-size: 22px;
        color: ${GOLD};
        font-style: italic;
      ">A story for ${escapeHtml(params.childName)}</p>
      <p style="
        margin: 0;
        font-family: ${NUNITO};
        font-size: 12px;
        color: rgba(255,255,255,0.7);
        letter-spacing: 2px;
        text-transform: uppercase;
      ">A Storybound Story &middot; ${escapeHtml(capitalize(params.season))} ${params.year}</p>
    </div>
  `, "#000000");
}

/* ─── Title page (interior — child-appropriate title + imprint line) ──────── */

function titlePage(params: BookParams): string {
  return page(`
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 0.75in;
      box-sizing: border-box;
      text-align: center;
    ">
      <p style="
        margin: 0 0 20px 0;
        font-family: ${SERIF};
        font-size: 38px;
        font-weight: 700;
        color: ${NAVY};
        line-height: 1.2;
      ">${escapeHtml(params.title)}</p>
      <p style="
        margin: 0;
        font-family: ${NUNITO};
        font-size: 12px;
        color: ${MUTED};
        letter-spacing: 2px;
        text-transform: uppercase;
      ">A Storybound Story &middot; ${escapeHtml(capitalize(params.season))} ${params.year}</p>
    </div>
  `);
}

/* ─── Dedication page ─────────────────────────────────────────────────────── */

function dedicationPage(dedication: string): string {
  const flourish = `<p style="
    margin: 0;
    font-family: ${SERIF};
    font-size: 16px;
    color: ${GOLD};
    letter-spacing: 6px;
    text-align: center;
  ">&mdash; &#183; &mdash;</p>`;

  return page(`
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 60px;
      box-sizing: border-box;
    ">
      ${flourish}
      <p style="
        margin: 20px 0;
        font-family: ${SERIF};
        font-size: 18px;
        color: ${NAVY};
        font-style: italic;
        text-align: center;
        line-height: 1.8;
        max-width: 5in;
      ">${escapeHtml(dedication)}</p>
      ${flourish}
    </div>
  `);
}

/* ─── Bookplate page (interior front matter — personalized ownership) ─────── */

function bookplatePage(childName: string): string {
  const flourish = `<p style="
    margin: 0;
    font-family: ${SERIF};
    font-size: 16px;
    color: ${GOLD};
    letter-spacing: 6px;
    text-align: center;
  ">&mdash; &#183; &mdash;</p>`;

  return page(`
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 60px;
      box-sizing: border-box;
    ">
      ${flourish}
      <p style="
        margin: 20px 0;
        font-family: ${SERIF};
        font-size: 22px;
        color: ${NAVY};
        font-style: italic;
        text-align: center;
        line-height: 1.8;
        max-width: 5in;
      ">This book belongs to ${escapeHtml(childName)}</p>
      ${flourish}
    </div>
  `);
}

/* ─── "The End" page (interior back matter — closes story before the teaser) ─ */

function theEndPage(): string {
  const flourish = `<p style="
    margin: 0;
    font-family: ${SERIF};
    font-size: 16px;
    color: ${GOLD};
    letter-spacing: 6px;
    text-align: center;
  ">&mdash; &#183; &mdash;</p>`;

  return page(`
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 60px;
      box-sizing: border-box;
    ">
      ${flourish}
      <p style="
        margin: 20px 0;
        font-family: ${SERIF};
        font-size: 28px;
        color: ${NAVY};
        font-style: italic;
        text-align: center;
        line-height: 1.8;
      ">The End</p>
      ${flourish}
    </div>
  `);
}

/* ─── Scene pages — two-page-per-scene layout (Fix 4) ────────────────────── */

function illustrationPage(
  scene: { number: number; text: string; imageBase64: string }
): string {
  return page(`
    <div style="
      width: 100%;
      height: 100%;
      position: relative;
      background: #000;
    ">
      <img
        src="data:image/jpeg;base64,${scene.imageBase64}"
        style="
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
        "
      />
    </div>
  `, "#000000");
}

function textPage(
  scene: { number: number; text: string; imageBase64: string },
  profile: AgeProfile,
  seasonLabel: string,
  pageNumber: number
): string {
  return page(`
    <div style="
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    ">
      <!-- Gold top bar -->
      <div style="
        width: 100%;
        height: 3px;
        background-color: ${GOLD};
      "></div>
      <!-- Season label — inset into the trim safe area -->
      <div style="
        padding: ${SAFE_INSET_MM}mm ${SAFE_INSET_MM}mm 0 0;
        text-align: right;
      ">
        <span style="
          font-family: ${NUNITO};
          font-size: 12px;
          color: ${MUTED};
          letter-spacing: 1px;
        ">${escapeHtml(seasonLabel)}</span>
      </div>
      <!-- Centered text body -->
      <div style="
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 60px;
        box-sizing: border-box;
      ">
        <div style="max-width: 75%;">
          ${profile.chapterLabel ? `
          <p style="
            margin: 0 0 16px 0;
            font-family: ${NUNITO};
            font-size: 11px;
            font-weight: 700;
            color: ${GOLD};
            letter-spacing: 2px;
            text-transform: uppercase;
          ">Chapter ${scene.number}</p>` : ""}
          ${formatSceneText(scene.text, profile, profile.fontSize, 1.8)}
        </div>
      </div>
      <!-- Page number — inset into the trim safe area -->
      <div style="
        padding: 0 0 ${SAFE_INSET_MM}mm 0;
        text-align: center;
      ">
        <span style="
          font-family: ${NUNITO};
          font-size: 12px;
          color: ${MUTED};
        ">${pageNumber}</span>
      </div>
    </div>
  `, WARM_WHITE);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function scenePage(
  scene: { number: number; text: string; imageBase64: string },
  profile: AgeProfile,
  seasonLabel: string,
  pageNumber: number
): string {
  return illustrationPage(scene) + textPage(scene, profile, seasonLabel, pageNumber);
}

/* ─── Combined scene page — image + text on one page ─────────────────────── */
// Retained intentionally as the future digital-edition layout branch. The print
// path now uses a uniform full-bleed image + facing text-page layout, so this is
// defined but not called until the print and digital paths are decoupled.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function combinedScenePage(
  scene: { number: number; text: string; imageBase64: string },
  profile: AgeProfile,
  seasonLabel: string,
  pageNumber: number
): string {
  const imageHeight = profile.label === "7-8" ? "55%" : "60%";

  return page(`
    <div style="
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      overflow: hidden;
    ">
      <!-- IMAGE SECTION -->
      <div style="
        width: 100%;
        height: ${imageHeight};
        flex-shrink: 0;
        overflow: hidden;
        position: relative;
      ">
        <img
          src="data:image/jpeg;base64,${scene.imageBase64}"
          style="
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center 20%;
            display: block;
          "
        />
      </div>

      <!-- DIVIDER: gold bar separating image from text -->
      <div style="width: 100%; height: 3px; background-color: ${GOLD}; flex-shrink: 0;"></div>

      <!-- TEXT SECTION -->
      <div style="
        width: 100%;
        flex: 1;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        padding: 0 52px;
        overflow: hidden;
      ">
        <!-- Season label -->
        <div style="padding: 12px 0 8px 0; text-align: right;">
          <span style="
            font-family: ${NUNITO};
            font-size: 11px;
            color: ${MUTED};
            letter-spacing: 1px;
          ">${escapeHtml(seasonLabel)}</span>
        </div>

        <!-- Story text -->
        <div style="
          flex: 1;
          display: flex;
          align-items: center;
          overflow: hidden;
        ">
          ${formatSceneText(scene.text, profile, profile.fontSize, profile.lineHeight)}
        </div>

        <!-- Page number -->
        <div style="padding: 8px 0 16px 0; text-align: center;">
          <span style="
            font-family: ${NUNITO};
            font-size: 12px;
            color: ${MUTED};
          ">${pageNumber}</span>
        </div>
      </div>
    </div>
  `, WARM_WHITE);
}

/* ─── Back page (Fix 6: pronouns, Fix 7: warmer privacy text) ────────────── */

function backPage(childName: string, pronouns: string): string {
  const pronoun = objectPronoun(pronouns);
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
        font-family: ${SERIF};
        font-size: 22px;
        color: ${NAVY};
        font-weight: 700;
        line-height: 1.5;
      ">This story was made for ${escapeHtml(childName)}.</p>
      <p style="
        margin: 0 0 48px 0;
        font-family: ${SERIF};
        font-size: 16px;
        color: ${MUTED};
        font-style: italic;
      ">From the people who love ${pronoun}.</p>
      <p style="
        margin: 0 0 48px 0;
        font-family: ${SERIF};
        font-size: 28px;
        font-weight: 700;
        color: ${NAVY};
        letter-spacing: 0.5px;
      ">Storybound</p>
      <p style="
        margin: 0;
        font-family: ${NUNITO};
        font-size: 10px;
        color: ${MUTED};
        line-height: 1.6;
        max-width: 4in;
      ">Illustrated with AI. Your child&rsquo;s photos were used only to create this book and have been permanently deleted. &copy; ${new Date().getFullYear()} Storybound</p>
    </div>
  `);
}

/* ─── Outer back cover (wraparound back — not counted in interior pages) ──── */
// Cream + wordmark only. Deliberately no scene image so a child's face never
// lands on the outer back of the book. Parallel to coverPage (the outer front).

function backCoverPage(): string {
  return page(`
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 0.75in;
      box-sizing: border-box;
      text-align: center;
    ">
      <p style="
        margin: 0;
        font-family: ${SERIF};
        font-size: 30px;
        font-weight: 700;
        color: ${NAVY};
        letter-spacing: 0.5px;
      ">Storybound</p>
    </div>
  `, CREAM);
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

function truncateToWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= max) return text;
  console.warn(`Scene text truncated: ${words.length} words → ${max}`);
  return words.slice(0, max).join(" ") + "\u2026";
}

/* ─── Dialogue formatting (ages 5+) ──────────────────────────────────────── */

function formatSceneText(
  text: string,
  profile: AgeProfile,
  fontSize: number,
  lineHeight: number,
): string {
  const safeText = truncateToWords(text, profile.wordsPerScene);

  // Ages 3-4: plain text, no dialogue formatting
  if (profile.minAge < 5) {
    return `<p style="
      margin: 0;
      font-family: ${NUNITO};
      font-size: ${fontSize}px;
      font-weight: 600;
      color: ${TEXT_DARK};
      line-height: ${lineHeight};
      text-align: left;
      width: 100%;
    ">${escapeHtml(safeText)}</p>`;
  }

  // Ages 5+: detect quoted dialogue and render with indent + italic
  const parts = safeText.split(/(\u201c[^\u201d]*\u201d|"[^"]*")/g);
  let html = "";
  for (const part of parts) {
    if (!part) continue;
    const isDialogue =
      (part.startsWith("\u201c") && part.endsWith("\u201d")) ||
      (part.startsWith('"') && part.endsWith('"'));
    if (isDialogue) {
      html += `<span style="
        display: block;
        margin: 6px 0 6px 24px;
        font-style: italic;
        color: ${NAVY};
      ">${escapeHtml(part)}</span>`;
    } else {
      html += escapeHtml(part);
    }
  }

  return `<p style="
    margin: 0;
    font-family: ${NUNITO};
    font-size: ${fontSize}px;
    font-weight: 600;
    color: ${TEXT_DARK};
    line-height: ${lineHeight};
    text-align: left;
    width: 100%;
  ">${html}</p>`;
}

/* ─── Main export ─────────────────────────────────────────────────────────── */

export function generateBookHTML(params: BookParams): string {
  const profile = getAgeProfile(params.age);
  const seasonLabel = `${capitalize(params.season)} ${params.year}`;
  const pages: string[] = [];

  // 1. Front cover (outer wrap — not counted in interior pages)
  pages.push(coverPage(params));

  // 2. Bookplate (interior front matter — "This book belongs to …")
  pages.push(bookplatePage(params.childName));

  // 3. Title page (interior)
  pages.push(titlePage(params));

  // 4. Dedication (interior)
  pages.push(dedicationPage(params.dedication));

  // 5. Scene pages — uniform layout: every beat is a full-bleed illustration
  // page facing a text page. The text page carries the folio; the facing image
  // page is unnumbered. pageNum runs 1..N across the N text pages, no gaps.
  let pageNum = 1;

  for (const scene of params.scenes) {
    pages.push(illustrationPage(scene));
    pages.push(textPage(scene, profile, seasonLabel, pageNum));
    pageNum += 1; // only the text page is numbered
  }

  // 6. The End (interior back matter — closes the story before the teaser)
  pages.push(theEndPage());

  // 7. Final page (with optional vignette from last scene)
  const finalVignette = params.finalPageImageBase64 ? `
      <div style="
        width: 200px;
        height: 200px;
        margin: 0 auto 24px;
        border-radius: 50%;
        overflow: hidden;
        border: 3px solid ${GOLD};
        opacity: 0.85;
      ">
        <img
          src="data:image/jpeg;base64,${params.finalPageImageBase64}"
          style="width: 100%; height: 100%; object-fit: cover; display: block;"
        />
      </div>` : "";

  pages.push(page(`
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 60px;
      box-sizing: border-box;
    ">
      ${finalVignette}
      <p style="
        margin: 0;
        font-family: ${SERIF};
        font-size: 20px;
        color: ${NAVY};
        font-style: italic;
        text-align: center;
        line-height: 1.8;
        max-width: 5in;
      ">${escapeHtml(params.finalPage)}</p>
    </div>
  `));

  // 8. Colophon (last interior page — keeps privacy/credits content)
  pages.push(backPage(params.childName, params.pronouns));

  // 9. Outer back cover (wraparound back — not counted in interior pages)
  pages.push(backCoverPage());

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @font-face {
      font-family: 'Nunito';
      src: url('data:font/ttf;base64,${NUNITO_400}') format('truetype');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Nunito';
      src: url('data:font/ttf;base64,${NUNITO_600}') format('truetype');
      font-weight: 600;
      font-style: normal;
    }
    @font-face {
      font-family: 'Nunito';
      src: url('data:font/ttf;base64,${NUNITO_700}') format('truetype');
      font-weight: 700;
      font-style: normal;
    }
    @font-face {
      font-family: 'Nunito';
      src: url('data:font/ttf;base64,${NUNITO_400I}') format('truetype');
      font-weight: 400;
      font-style: italic;
    }
    @font-face {
      font-family: 'Nunito';
      src: url('data:font/ttf;base64,${NUNITO_600I}') format('truetype');
      font-weight: 600;
      font-style: italic;
    }
    @font-face {
      font-family: 'Gelasio';
      src: url('data:font/ttf;base64,${GELASIO_400}') format('truetype');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Gelasio';
      src: url('data:font/ttf;base64,${GELASIO_700}') format('truetype');
      font-weight: 700;
      font-style: normal;
    }
    @font-face {
      font-family: 'Gelasio';
      src: url('data:font/ttf;base64,${GELASIO_400I}') format('truetype');
      font-weight: 400;
      font-style: italic;
    }
    @page {
      size: ${PAGE_MM}mm ${PAGE_MM}mm;
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
