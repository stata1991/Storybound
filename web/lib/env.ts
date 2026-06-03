import { z } from "zod";

/**
 * Server-side environment variable schema.
 *
 * Validated once at startup via instrumentation.ts.
 * Call sites still use process.env directly — this file
 * exists only to fail fast on missing / malformed vars.
 */
const serverSchema = z.object({
  // ── Supabase ──────────────────────────────────────────
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // ── Stripe ────────────────────────────────────────────
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_FOUNDING_PHYSICAL: z.string().min(1),
  STRIPE_PRICE_GIFT_PHYSICAL: z.string().min(1),
  STRIPE_PRICE_ONETIME_PHYSICAL: z.string().min(1),

  // ── Resend ────────────────────────────────────────────
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email().optional(),

  // ── Auth / Admin ──────────────────────────────────────
  ADMIN_EMAIL: z.string().email(),
  CRON_SECRET: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),

  // ── Modal – pipeline endpoints ────────────────────────
  MODAL_AUTH_TOKEN: z.string().min(1),
  MODAL_WEBHOOK_SECRET: z.string().min(1),
  MODAL_FLUX_TRAIN_URL: z.string().url(),
  MODAL_FLUX_GENERATE_URL: z.string().url(),
  MODAL_FLUX_REGEN_URL: z.string().url(),
  MODAL_PDF_URL: z.string().url(),
  MODAL_VALIDATE_PHOTOS_URL: z.string().url(),
  PHOTO_VALIDATION_COMPLETE_WEBHOOK_URL: z.string().url(),

  // ── Feature flags / load testing ─────────────────────
  LOADTEST_ENABLED: z.string().optional(),
  LOADTEST_SECRET: z.string().optional(),

  // ── Client-side (also readable server-side) ───────────
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_STRIPE_FOUNDING_PHYSICAL_LINK: z.string().url().optional(),
  NEXT_PUBLIC_STRIPE_GIFT_PHYSICAL_LINK: z.string().url().optional(),
  NEXT_PUBLIC_STRIPE_ONETIME_PHYSICAL_LINK: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let _validated: ServerEnv | null = null;

export function validateEnv(): ServerEnv {
  if (_validated) return _validated;

  const result = serverSchema.safeParse(process.env);

  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  ${i.path.join(".")}: ${i.message}`
    );
    throw new Error(
      `\nEnvironment validation failed:\n${lines.join("\n")}\n`
    );
  }

  _validated = result.data;
  return _validated;
}
