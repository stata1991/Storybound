/* ─── Storybound Email Templates ───────────────────────────────────────────── */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://storybound.co";

/* ─── Brand constants ──────────────────────────────────────────────────────── */

const NAVY = "#1B2A4A";
const GOLD = "#C8963E";
const CREAM = "#FDF8F0";
const MUTED = "#8A93A6";

/* ─── Shared layout ────────────────────────────────────────────────────────── */

function layout(body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="padding:32px 32px 0 32px;">
          <p style="margin:0;font-size:20px;font-weight:700;color:${NAVY};font-family:Georgia,serif;">Storybound</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:24px 32px 32px 32px;">
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 32px;border-top:1px solid #E8E4DF;">
          <p style="margin:0 0 8px 0;font-size:13px;color:${MUTED};line-height:1.5;">
            Questions? Reply to this email or contact us at storybound@gmail.com
          </p>
          <p style="margin:0;font-size:13px;color:${MUTED};line-height:1.5;">
            The Storybound team
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(text: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td style="background-color:${GOLD};border-radius:9999px;padding:14px 32px;">
      <a href="${url}" style="color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;display:inline-block;">${text}</a>
    </td></tr>
  </table>`;
}

function formatCloseDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/* ─── Template params ──────────────────────────────────────────────────────── */

interface DropParams {
  childName: string;
  season: string;
  childId: string;
  windowCloses: string;
}

interface SubmittedParams {
  childName: string;
  season: string;
}

/* ─── Template 1: Memory Drop Open ─────────────────────────────────────────── */

export function memoryDropOpen(params: DropParams) {
  const name = capitalize(params.childName);
  const season = capitalize(params.season);
  const closes = formatCloseDate(params.windowCloses);
  const url = `${APP_URL}/dashboard/memory-drop/${params.childId}`;

  const subject = `${name}'s ${season} memory drop is open`;

  const html = layout(`
    <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${NAVY};font-family:Georgia,serif;line-height:1.3;">
      It's time to share ${name}'s latest chapter.
    </h1>
    <p style="margin:0 0 16px 0;font-size:15px;color:${NAVY};line-height:1.6;">
      ${name}'s ${season} memory drop window is now open. Here's what to have ready:
    </p>
    <ul style="margin:0 0 16px 0;padding-left:20px;font-size:15px;color:${NAVY};line-height:1.8;">
      <li>2–3 recent photos</li>
      <li>Their biggest moment this season</li>
      <li>What they're obsessed with right now</li>
    </ul>
    <p style="margin:0 0 4px 0;font-size:14px;color:${MUTED};line-height:1.5;">
      Window closes ${closes}.
    </p>
    ${ctaButton("Open memory drop \u2192", url)}
    <p style="margin:0;font-size:14px;color:${MUTED};line-height:1.5;">
      It only takes a few minutes — and it makes their story real.
    </p>
  `);

  return { subject, html };
}

/* ─── Template 2: Memory Drop Reminder (7 days) ───────────────────────────── */

export function memoryDropReminder(params: DropParams) {
  const name = capitalize(params.childName);
  const season = capitalize(params.season);
  const closes = formatCloseDate(params.windowCloses);
  const url = `${APP_URL}/dashboard/memory-drop/${params.childId}`;

  const subject = `Don't forget \u2014 ${name}'s memory drop closes in 7 days`;

  const html = layout(`
    <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${NAVY};font-family:Georgia,serif;line-height:1.3;">
      ${name}'s ${season} memories are waiting.
    </h1>
    <p style="margin:0 0 16px 0;font-size:15px;color:${NAVY};line-height:1.6;">
      You have 7 days left to share ${name}'s latest photos and milestones. We'll use them to craft their next chapter.
    </p>
    <p style="margin:0 0 4px 0;font-size:14px;color:${MUTED};line-height:1.5;">
      Window closes ${closes}.
    </p>
    ${ctaButton("Submit memory drop \u2192", url)}
    <p style="margin:0;font-size:14px;color:${MUTED};line-height:1.5;">
      It only takes a few minutes.
    </p>
  `);

  return { subject, html };
}

/* ─── Template 3: Memory Drop Final (3 days) ──────────────────────────────── */

export function memoryDropFinal(params: DropParams) {
  const name = capitalize(params.childName);
  const season = capitalize(params.season);
  const closes = formatCloseDate(params.windowCloses);
  const url = `${APP_URL}/dashboard/memory-drop/${params.childId}`;

  const subject = `Last chance \u2014 ${name}'s memory drop closes in 3 days`;

  const html = layout(`
    <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${NAVY};font-family:Georgia,serif;line-height:1.3;">
      ${name}'s ${season} window closes soon.
    </h1>
    <p style="margin:0 0 16px 0;font-size:15px;color:${NAVY};line-height:1.6;">
      This is your last chance to share ${name}'s memories for their ${season} chapter. After ${closes}, we'll work with what we have.
    </p>
    ${ctaButton("Submit now \u2192", url)}
    <p style="margin:0;font-size:14px;color:${MUTED};line-height:1.5;">
      A few photos and a sentence or two is all we need.
    </p>
  `);

  return { subject, html };
}

/* ─── Template 4: Memory Submitted ─────────────────────────────────────────── */

export function memorySubmitted(params: SubmittedParams) {
  const name = capitalize(params.childName);
  const season = capitalize(params.season);

  const subject = `${name}'s story is being written \u2728`;

  const html = layout(`
    <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${NAVY};font-family:Georgia,serif;line-height:1.3;">
      We received ${name}'s memories.
    </h1>
    <p style="margin:0 0 16px 0;font-size:15px;color:${NAVY};line-height:1.6;">
      Our team is now crafting ${name}'s ${season} chapter. Every photo, every milestone, every little detail you shared — it all goes into making their story feel real.
    </p>
    <p style="margin:0 0 16px 0;font-size:15px;color:${NAVY};line-height:1.6;">
      We'll be in touch when your book ships.
    </p>
    <p style="margin:0;font-size:14px;color:${GOLD};font-weight:600;line-height:1.5;">
      Thank you for being part of ${name}'s story.
    </p>
  `);

  return { subject, html };
}
