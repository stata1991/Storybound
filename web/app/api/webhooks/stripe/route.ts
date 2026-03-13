import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Stripe from "stripe";

/* ─── Stripe client (lazy init — avoids build-time error when key is absent) ── */

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-02-25.clover",
  });
}

/* ─── Admin client ─────────────────────────────────────────────────────────── */

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/* ─── Subscription type mapping ────────────────────────────────────────────── */

const VALID_SUBSCRIPTION_TYPES = new Set([
  "founding",
  "standard",
  "one_time",
  "gift",
]);

function resolveSubscriptionType(metadata: Stripe.Metadata): string {
  const raw = metadata.subscription_type;
  if (raw && VALID_SUBSCRIPTION_TYPES.has(raw)) return raw;
  return "founding"; // default for legacy links
}

const PRICE_MAP: Record<string, number> = {
  founding: 89.0,
  standard: 109.0,
  one_time: 29.0,
  gift: 89.0,
};

/* ─── POST handler ─────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Verify webhook signature
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  const admin = getAdmin();

  // ── checkout.session.completed ─────────────────────────────────────────────

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const customerId = session.customer as string | null;
    const customerEmail = session.customer_details?.email;
    const metadata = session.metadata ?? {};
    const subscriptionType = resolveSubscriptionType(metadata);
    const isFounding = subscriptionType === "founding";

    if (!customerId) {
      return NextResponse.json({ received: true, note: "No customer ID" });
    }

    // Check if family already exists for this Stripe customer
    const { data: existingFamily } = await admin
      .from("families")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .single();

    if (existingFamily) {
      // Already set up — just ensure active
      await admin
        .from("families")
        .update({ subscription_status: "active" })
        .eq("id", existingFamily.id);
    } else {
      // Create new family
      await admin.from("families").insert({
        stripe_customer_id: customerId,
        subscription_status: "active",
        subscription_type: subscriptionType,
        subscription_tier: "physical_digital",
        subscription_price: PRICE_MAP[subscriptionType] ?? 89.0,
        is_founding_member: isFounding,
        billing_cycle_start: new Date().toISOString().split("T")[0],
      });
    }

    return NextResponse.json({
      received: true,
      type: event.type,
      subscription_type: subscriptionType,
      customer: customerEmail,
    });
  }

  // ── customer.subscription.deleted ──────────────────────────────────────────

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    const { error: updateError } = await admin
      .from("families")
      .update({ subscription_status: "canceled" })
      .eq("stripe_customer_id", customerId);

    return NextResponse.json({
      received: true,
      type: event.type,
      customer: customerId,
      error: updateError?.message ?? null,
    });
  }

  // ── Unhandled event types ──────────────────────────────────────────────────

  return NextResponse.json({ received: true, type: event.type });
}
