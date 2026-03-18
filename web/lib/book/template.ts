/* ─── Storybound Book HTML Template ────────────────────────────────────────── */

import { readFileSync } from "fs";
import { join } from "path";

/* ─── Embedded Nunito font (latin, woff2) ────────────────────────────────── */

const nunitoBase64 = readFileSync(
  join(process.cwd(), "web/lib/book/fonts/Nunito-Latin.woff2")
).toString("base64");

/* ─── Brand colors ────────────────────────────────────────────────────────── */

const NAVY = "#1B2A4A";
const GOLD = "#C8963E";
const CREAM = "#FDF8F0";
const MUTED = "#8A93A6";
const WARM_WHITE = "#FFFDF7";

/* ─── Font stack ─────────────────────────────────────────────────────────── */

const NUNITO = "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const SERIF = "Georgia, 'Playfair Display', serif";

/* ─── Age profiles ───────────────────────────────────────────────────────── */

interface AgeProfile {
  label: string;
  minAge: number;
  maxAge: number;
  layout: "overlay" | "sideBySide";
  fontSize: number;      // scene body text px
  lineHeight: number;    // unitless multiplier
  chapterLabel: boolean; // show "Chapter N" header
  wordsPerScene: number; // max words before truncation (safety net)
}

const AGE_PROFILES: AgeProfile[] = [
  { label: "3-4", minAge: 3, maxAge: 4, layout: "overlay",    fontSize: 24, lineHeight: 1.9, chapterLabel: false, wordsPerScene: 40 },
  { label: "5-6", minAge: 5, maxAge: 6, layout: "overlay",    fontSize: 20, lineHeight: 1.8, chapterLabel: false, wordsPerScene: 60 },
  { label: "7-8", minAge: 7, maxAge: 8, layout: "sideBySide", fontSize: 16, lineHeight: 1.7, chapterLabel: true,  wordsPerScene: 120 },
  { label: "9-10", minAge: 9, maxAge: 10, layout: "sideBySide", fontSize: 14, lineHeight: 1.65, chapterLabel: true,  wordsPerScene: 180 },
];

function getAgeProfile(age: number): AgeProfile {
  const clamped = Math.max(3, Math.min(10, age));
  return AGE_PROFILES.find((p) => clamped >= p.minAge && clamped <= p.maxAge) ?? AGE_PROFILES[0];
}

/* ─── Types ───────────────────────────────────────────────────────────────── */

export interface BookParams {
  childName: string;
  age: number;
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
        font-family: ${SERIF};
        font-size: 36px;
        font-weight: 700;
        color: #ffffff;
        line-height: 1.2;
      ">${escapeHtml(params.title)}</p>
      <p style="
        margin: 0 0 12px 0;
        font-family: ${SERIF};
        font-size: 18px;
        color: ${GOLD};
        font-style: italic;
      ">A story for ${escapeHtml(params.childName)}</p>
      <p style="
        margin: 0;
        font-family: ${NUNITO};
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

/* ─── Scene page — overlay layout (ages 3–6) ─────────────────────────────── */

function sceneOverlay(
  scene: { number: number; text: string; imageBase64: string },
  profile: AgeProfile
): string {
  const safeText = truncateToWords(scene.text, profile.wordsPerScene);
  return page(`
    <img
      src="data:image/png;base64,${scene.imageBase64}"
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
      padding: 40px 48px 48px;
      background: linear-gradient(
        to top,
        rgba(255,253,247,0.97) 0%,
        rgba(255,253,247,0.85) 35%,
        transparent 60%,
        transparent 100%
      );
    ">
      <p style="
        margin: 0;
        font-family: ${NUNITO};
        font-size: ${profile.fontSize}px;
        font-weight: 600;
        color: ${NAVY};
        line-height: ${profile.lineHeight};
        text-align: left;
      ">${escapeHtml(safeText)}</p>
    </div>
  `, "#000000");
}

/* ─── Scene page — side-by-side layout (ages 7–10) ───────────────────────── */

function sceneSideBySide(
  scene: { number: number; text: string; imageBase64: string },
  profile: AgeProfile
): string {
  const safeText = truncateToWords(scene.text, profile.wordsPerScene);
  return page(`
    <div style="
      display: flex;
      width: 100%;
      height: 100%;
    ">
      <div style="
        width: 50%;
        height: 100%;
        overflow: hidden;
        position: relative;
      ">
        <img
          src="data:image/png;base64,${scene.imageBase64}"
          style="
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            object-fit: cover;
          "
        />
      </div>
      <div style="
        width: 50%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 48px 40px;
        box-sizing: border-box;
        background-color: ${CREAM};
      ">
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
          color: ${NAVY};
          line-height: ${profile.lineHeight};
          text-align: left;
        ">${escapeHtml(safeText)}</p>
      </div>
    </div>
  `);
}

/* ─── Scene page dispatcher ──────────────────────────────────────────────── */

function scenePage(
  scene: { number: number; text: string; imageBase64: string },
  profile: AgeProfile
): string {
  return profile.layout === "overlay"
    ? sceneOverlay(scene, profile)
    : sceneSideBySide(scene, profile);
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
      ">From the people who love them.</p>
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

function truncateToWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= max) return text;
  console.warn(`Scene text truncated: ${words.length} words → ${max}`);
  return words.slice(0, max).join(" ") + "\u2026";
}

/* ─── Main export ─────────────────────────────────────────────────────────── */

export function generateBookHTML(params: BookParams): string {
  const profile = getAgeProfile(params.age);
  const pages: string[] = [];

  // 1. Cover
  pages.push(coverPage(params));

  // 2. Dedication
  pages.push(dedicationPage(params.dedication));

  // 3. Scene pages (layout adapts by age)
  for (const scene of params.scenes) {
    pages.push(scenePage(scene, profile));
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
  pages.push(backPage(params.childName));

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
