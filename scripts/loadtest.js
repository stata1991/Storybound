/**
 * k6 load test — 50 VU burst against production.
 *
 * Usage:
 *   k6 run scripts/loadtest.js \
 *     --out csv=scripts/loadtest-results-$(date +%s).txt \
 *     -e BASE_URL=https://thestoryboundapp.com \
 *     -e LOADTEST_SECRET=<your-secret>
 *
 * Prerequisites:
 *   - node scripts/loadtest-setup.js (creates loadtest-sessions.json)
 *   - LOADTEST_ENABLED=true + LOADTEST_SECRET set in production env
 */

import http from "k6/http";
import { sleep, check } from "k6";

// ── Load sessions at init time (runs once per VU process) ──────────────────
const sessions = JSON.parse(open("./loadtest-sessions.json"));

const BASE_URL = __ENV.BASE_URL || "https://thestoryboundapp.com";
const LOADTEST_SECRET = __ENV.LOADTEST_SECRET || "";

// ── Scenarios ──────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    browsers: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 40 },
        { duration: "60s", target: 40 },
        { duration: "15s", target: 0 },
      ],
      exec: "browsersFlow",
    },
    signups: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "60s", target: 10 },
        { duration: "15s", target: 0 },
      ],
      exec: "signupsFlow",
    },
  },
  thresholds: {
    "http_req_duration{scenario:browsers}": ["p(95)<1500"],
    "http_req_failed{scenario:browsers}": ["rate<0.01"],
    "http_req_duration{scenario:signups}": ["p(95)<4000"],
    "http_req_failed{scenario:signups}": ["rate<0.05"],
    http_req_failed: ["rate<0.5"],
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function setupCookiesForVU(vuIndex) {
  const session = sessions[vuIndex % sessions.length];
  const jar = http.cookieJar();

  for (const cookie of session.cookies) {
    jar.set(BASE_URL, cookie.name, cookie.value, {
      path: cookie.path || "/",
    });
  }

  return session;
}

function postJson(url, body, extraHeaders) {
  return http.post(url, JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "X-LoadTest-Secret": LOADTEST_SECRET,
      ...extraHeaders,
    },
    tags: { endpoint: url.replace(BASE_URL, "") },
  });
}

// ── Scenario: browsers (GET-only, 40 VUs) ─────────────────────────────────

export function browsersFlow() {
  // VU IDs are 1-indexed; use first 40 sessions for browsers
  setupCookiesForVU(__VU - 1);

  const landing = http.get(`${BASE_URL}/`, {
    tags: { endpoint: "/" },
  });
  check(landing, { "landing 200": (r) => r.status === 200 });

  const auth = http.get(`${BASE_URL}/auth`, {
    tags: { endpoint: "/auth" },
  });
  check(auth, { "auth 200": (r) => r.status === 200 });

  const onboarding = http.get(`${BASE_URL}/onboarding`, {
    tags: { endpoint: "/onboarding" },
  });
  check(onboarding, {
    "onboarding 200|302": (r) => r.status === 200 || r.status === 302,
  });

  sleep(10);
}

// ── Scenario: signups (writes, 10 VUs, one-shot) ──────────────────────────

const signupDone = {};

export function signupsFlow() {
  // Use sessions 40-49 for signups
  const vuIndex = 40 + ((__VU - 1) % 10);

  // One-shot: only run once per VU
  if (signupDone[__VU]) {
    sleep(5);
    return;
  }

  setupCookiesForVU(vuIndex);

  // Step 1: GET onboarding
  const page = http.get(`${BASE_URL}/onboarding`, {
    tags: { endpoint: "/onboarding" },
  });
  check(page, { "onboarding load": (r) => r.status === 200 || r.status === 302 });

  // Step 2: Save draft (step 1 data)
  const draft1 = postJson(`${BASE_URL}/api/test/onboarding/save-draft`, {
    step: 1,
    data: {
      name: `LoadTestChild${__VU}`,
      dateOfBirth: "2021-03-15",
      pronouns: "boy",
      readingLevel: "early_reader",
      interests: "",
      avoidances: "",
      defaultArchetype: "",
      parentFirstName: "",
      shippingName: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      zip: "",
      country: "US",
    },
  });
  check(draft1, { "draft step1 ok": (r) => r.status === 200 });

  sleep(2);

  // Step 3: Save draft (step 2 data)
  const draft2 = postJson(`${BASE_URL}/api/test/onboarding/save-draft`, {
    step: 2,
    data: {
      name: `LoadTestChild${__VU}`,
      dateOfBirth: "2021-03-15",
      pronouns: "boy",
      readingLevel: "early_reader",
      interests: "dinosaurs, painting",
      avoidances: "spiders",
      defaultArchetype: "friendly dragon",
      parentFirstName: "",
      shippingName: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      zip: "",
      country: "US",
    },
  });
  check(draft2, { "draft step2 ok": (r) => r.status === 200 });

  sleep(2);

  // Step 4: Submit child profile (the heavy write path)
  const submit = postJson(
    `${BASE_URL}/api/test/onboarding/submit-child-profile`,
    {
      name: `LoadTestChild${__VU}`,
      dateOfBirth: "2021-03-15",
      pronouns: "boy",
      readingLevel: "early_reader",
      interests: "dinosaurs, painting",
      avoidances: "spiders",
      defaultArchetype: "friendly dragon",
      parentFirstName: `TestParent${__VU}`,
      shippingName: `Test User ${__VU}`,
      addressLine1: "123 Load Test Lane",
      addressLine2: "",
      city: "Testville",
      state: "CA",
      zip: "90210",
      country: "US",
    }
  );
  check(submit, { "submit profile ok": (r) => r.status === 200 });

  signupDone[__VU] = true;
  sleep(5);
}
