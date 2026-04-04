/* ─── Storybound Book HTML Template ────────────────────────────────────────── */

import { NUNITO_BASE64 as nunitoBase64 } from "./font-data";

/* ─── Brand colors ────────────────────────────────────────────────────────── */

const NAVY = "#1B2A4A";
const GOLD = "#C8963E";
const CREAM = "#FDF8F0";
const MUTED = "#8A93A6";
const WARM_WHITE = "#FFFDF7";
const TEXT_DARK = "#2C2C2A";

/* ─── Font stack ─────────────────────────────────────────────────────────── */

const NUNITO = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const SERIF = "Georgia, 'Playfair Display', serif";

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
  { label: "3-4", minAge: 3, maxAge: 4, fontSize: 24, lineHeight: 1.9, chapterLabel: false, wordsPerScene: 40 },
  { label: "5-6", minAge: 5, maxAge: 6, fontSize: 20, lineHeight: 1.8, chapterLabel: false, wordsPerScene: 60 },
  { label: "7-8", minAge: 7, maxAge: 8, fontSize: 16, lineHeight: 1.7, chapterLabel: true,  wordsPerScene: 120 },
  { label: "9-10", minAge: 9, maxAge: 10, fontSize: 14, lineHeight: 1.65, chapterLabel: true,  wordsPerScene: 180 },
];

function getAgeProfile(age: number): AgeProfile {
  const clamped = Math.max(3, Math.min(10, age));
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
  scenes: { number: number; text: string; imageBase64: string }[];
  coverImageBase64: string;
  finalPage: string;
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
    width: 8.5in;
    height: 8.5in;
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
      padding: 48px 40px 48px;
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
        font-family: ${SERIF};
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
        src="data:image/png;base64,${scene.imageBase64}"
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
  const safeText = truncateToWords(scene.text, profile.wordsPerScene);
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
      <!-- Season label -->
      <div style="
        padding: 16px 40px 0 0;
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
          <p style="
            margin: 0;
            font-family: ${NUNITO};
            font-size: ${profile.fontSize}px;
            font-weight: 400;
            color: ${TEXT_DARK};
            line-height: 1.8;
            text-align: left;
          ">${escapeHtml(safeText)}</p>
        </div>
      </div>
      <!-- Page number -->
      <div style="
        padding: 0 0 24px 0;
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

function scenePage(
  scene: { number: number; text: string; imageBase64: string },
  profile: AgeProfile,
  seasonLabel: string,
  pageNumber: number
): string {
  return illustrationPage(scene) + textPage(scene, profile, seasonLabel, pageNumber);
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

/* ─── Main export ─────────────────────────────────────────────────────────── */

export function generateBookHTML(params: BookParams): string {
  const profile = getAgeProfile(params.age);
  const seasonLabel = `${capitalize(params.season)} ${params.year}`;
  const pages: string[] = [];

  // 1. Cover
  pages.push(coverPage(params));

  // 2. Dedication
  pages.push(dedicationPage(params.dedication));

  // 3. Scene pages (two pages per scene: illustration + text)
  // Page numbering: dedication is page 1, first illustration is page 2
  let pageNum = 2;
  for (const scene of params.scenes) {
    pages.push(scenePage(scene, profile, seasonLabel, pageNum + 1));
    pageNum += 2; // illustration page + text page
  }

  // 4. Final page
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

  // 5. Back page
  pages.push(backPage(params.childName, params.pronouns));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @font-face {
      font-family: 'Nunito';
      src: url('data:font/woff2;base64,${nunitoBase64}') format('woff2');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Nunito';
      src: url('data:font/woff2;base64,${nunitoBase64}') format('woff2');
      font-weight: 600;
      font-style: normal;
    }
    @font-face {
      font-family: 'Nunito';
      src: url('data:font/woff2;base64,${nunitoBase64}') format('woff2');
      font-weight: 700;
      font-style: normal;
    }
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
