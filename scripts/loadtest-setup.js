#!/usr/bin/env node

/**
 * Load test setup — creates 50 test users and captures session cookies.
 *
 * Usage: node scripts/loadtest-setup.js
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL from web/.env.local.
 * Outputs scripts/loadtest-sessions.json with per-user cookie data that k6 can consume.
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ── Load env from web/.env.local ──────────────────────────────────────────────
require("dotenv").config({ path: path.join(__dirname, "..", "web", ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error("Missing SUPABASE_URL, SERVICE_ROLE_KEY, or ANON_KEY in web/.env.local");
  process.exit(1);
}

const VU_COUNT = 50;
const EMAIL_DOMAIN = "thestoryboundapp.com";
const MAX_CHUNK_SIZE = 3180;

// Derive the cookie storage key from the Supabase URL
// supabase-js uses: sb-{hostname.split('.')[0]}-auth-token
const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
const STORAGE_KEY = `sb-${projectRef}-auth-token`;

// ── Base64url encoding (matches @supabase/ssr internals) ──────────────────────

function stringToBase64URL(str) {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ── Cookie chunking (matches @supabase/ssr chunker.ts) ────────────────────────

function createChunks(key, value) {
  const encoded = encodeURIComponent(value);

  if (encoded.length <= MAX_CHUNK_SIZE) {
    return [{ name: key, value }];
  }

  const chunks = [];
  let remaining = encoded;

  while (remaining.length > 0) {
    let head = remaining.slice(0, MAX_CHUNK_SIZE);

    // Don't split in the middle of a percent-encoded sequence
    const lastPct = head.lastIndexOf("%");
    if (lastPct > MAX_CHUNK_SIZE - 3) {
      head = head.slice(0, lastPct);
    }

    // Validate unicode boundary
    let decoded;
    let tryHead = head;
    while (tryHead.length > 0) {
      try {
        decoded = decodeURIComponent(tryHead);
        break;
      } catch {
        if (tryHead.length > 3 && tryHead.slice(-3, -2) === "%") {
          tryHead = tryHead.slice(0, -3);
        } else {
          throw new Error("Failed to decode chunk");
        }
      }
    }

    chunks.push(decoded);
    remaining = remaining.slice(tryHead.length);
  }

  return chunks.map((val, i) => ({ name: `${key}.${i}`, value: val }));
}

// ── Build cookies from a Supabase session ─────────────────────────────────────

function sessionToCookies(session) {
  // Replicate what @supabase/ssr stores: the full session JSON
  const sessionJson = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  });

  // Apply base64url encoding with the "base64-" prefix (@supabase/ssr cookies.ts:226-228)
  const encodedValue = "base64-" + stringToBase64URL(sessionJson);

  // Chunk the value
  const chunks = createChunks(STORAGE_KEY, encodedValue);

  // Build cookie objects
  const cookieOptions = {
    path: "/",
    httpOnly: false,
    secure: true,
    sameSite: "lax",
  };

  return chunks.map(({ name, value }) => ({
    name,
    value,
    ...cookieOptions,
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // User-scoped client for signInWithPassword
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const sessions = [];
  let created = 0;
  let skipped = 0;

  for (let i = 1; i <= VU_COUNT; i++) {
    const email = `loadtest+vu${i}@${EMAIL_DOMAIN}`;
    const password = crypto.randomBytes(24).toString("base64url");

    // Create user (skip if already exists)
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      if (createError.message.includes("already been registered")) {
        // Update password so we can sign in
        const { data: users } = await admin.auth.admin.listUsers();
        const existing = users?.users?.find((u) => u.email === email);
        if (existing) {
          await admin.auth.admin.updateUserById(existing.id, { password });
        }
        skipped++;
      } else {
        console.error(`Failed to create ${email}:`, createError.message);
        continue;
      }
    } else {
      created++;
    }

    // Rate-limit guard: pause 300ms between sign-ins to stay under Supabase auth limits
    if (i > 1) await new Promise((r) => setTimeout(r, 300));

    // Sign in to get a real session (retry once after 2s on rate limit)
    let signInData, signInError;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await anonClient.auth.signInWithPassword({ email, password });
      signInData = result.data;
      signInError = result.error;
      if (!signInError) break;
      if (signInError.message.includes("rate limit") && attempt === 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    if (signInError || !signInData.session) {
      console.error(`Failed to sign in ${email}:`, signInError?.message ?? "no session");
      continue;
    }

    const cookies = sessionToCookies(signInData.session);

    sessions.push({
      email,
      password,
      userId: signInData.user.id,
      cookies,
    });

    process.stdout.write(`\r  Users: ${sessions.length}/${VU_COUNT}`);
  }

  console.log(); // newline after progress

  const outPath = path.join(__dirname, "loadtest-sessions.json");
  fs.writeFileSync(outPath, JSON.stringify(sessions, null, 2));

  console.log(`\nCreated ${created} new users, ${skipped} already existed.`);
  console.log(`Sessions written to ${outPath}`);
  console.log(`Total sessions: ${sessions.length}`);
  console.log(`Cookies per session: ${sessions[0]?.cookies.length ?? 0} chunks`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
