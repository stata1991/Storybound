export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // SENTRY_DSN is deliberately NOT in web/lib/env.ts — observability config
    // must never block boot; unset DSN = SDK disabled (Sentry convention).
    // Init BEFORE validateEnv so an env misconfig becomes a Sentry event.
    const Sentry = await import("@sentry/node");
    try {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: 0,
        environment: process.env.VERCEL_ENV ?? "development",
      });
    } catch (e) {
      console.error("Sentry init failed:", e);
    }

    try {
      const { validateEnv } = await import("./lib/env");
      validateEnv();
    } catch (e) {
      Sentry.captureException(e);
      await Sentry.flush(2000).catch(() => {});
      throw e;
    }
  }
}
