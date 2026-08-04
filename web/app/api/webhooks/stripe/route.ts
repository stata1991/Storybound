import * as Sentry from "@sentry/node";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { logEvent } from "@/lib/audit";
import { sendEmail } from "@/lib/email/resend";
import { physicalSubscriptionConfirmed, paymentReceived } from "@/lib/email/templates";
import { placePrintOrder } from "@/lib/print-orders";
import type { OrderRecipient } from "@/lib/prodigi";

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

/* ─── Price ID → subscription mapping ──────────────────────────────────────── */

const PRICE_ID_MAP: Record<string, string> = {
  [process.env.STRIPE_PRICE_FOUNDING_PHYSICAL!]: "founding",
  [process.env.STRIPE_PRICE_GIFT_PHYSICAL!]: "gift",
  [process.env.STRIPE_PRICE_ONETIME_PHYSICAL!]: "one_time",
};

const PRICE_AMOUNTS: Record<string, number> = {
  founding: 89.0,
  one_time: 29.0,
  gift: 89.0,
};

function resolvePriceId(priceId: string | null): string | null {
  if (priceId && PRICE_ID_MAP[priceId]) return PRICE_ID_MAP[priceId];
  // Unknown price: never default to a subscription plan — a $35 one-time
  // book payment must not be misread as "founding".
  return null;
}

/* ─── Email helpers (inline — matches lib/email/templates.ts brand) ───────── */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://storybound.co";
const NAVY = "#1B2A4A";
const GOLD = "#C8963E";
const CREAM = "#FDF8F0";
const MUTED = "#8A93A6";

function emailLayout(body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:${CREAM};">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:32px 32px 0 32px;">
          <p style="margin:0;font-size:20px;font-weight:700;color:${NAVY};font-family:Georgia,serif;">Storybound</p>
        </td></tr>
        <tr><td style="padding:24px 32px 32px 32px;">
          ${body}
        </td></tr>
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

function emailCta(text: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td style="background-color:${GOLD};border-radius:9999px;padding:14px 32px;">
      <a href="${url}" style="color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;display:inline-block;">${text}</a>
    </td></tr>
  </table>`;
}

/* ─── One-time physical book payment ───────────────────────────────────────── */
// API-version note (2026-02-25.clover, verified against the real paid session
// cs_test_a1FhaBs…): collected shipping lives at
// session.collected_information.shipping_details {name, address{line1, line2,
// city, state, postal_code, country}} — a top-level shipping_details field is
// absent in this version. Email + phone live on customer_details.

type CollectedShipping = {
  name?: string | null;
  address?: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country?: string | null;
  } | null;
} | null;

function extractShipping(s: Stripe.Checkout.Session): CollectedShipping {
  return (
    (s as unknown as {
      collected_information?: { shipping_details?: CollectedShipping };
    }).collected_information?.shipping_details ?? null
  );
}

async function handlePhysicalBookPayment(
  session: Stripe.Checkout.Session,
  admin: ReturnType<typeof getAdmin>
) {
  const episodeId =
    session.metadata?.episode_id ?? session.client_reference_id ?? null;
  const harvestId = session.metadata?.harvest_id ?? undefined;

  if (!episodeId) {
    logEvent({
      event_type: "print.order",
      status: "error",
      message: `physical_book payment ${session.id} carries no episode_id — manual resolution required`,
      metadata: { source: "stripe_webhook" },
    });
    return NextResponse.json({ received: true, note: "No episode id" });
  }

  // Cheap idempotency guard. Retries are already safe by construction
  // (pending-row reuse → same Prodigi idempotencyKey); this just skips the
  // work when an order is verifiably placed.
  const { data: existingRaw } = await admin
    .from("print_orders")
    .select("id, status, prodigi_order_id, created_at")
    .eq("episode_id", episodeId)
    .not("prodigi_order_id", "is", null)
    .neq("status", "pending")
    .limit(1)
    .maybeSingle();

  if (existingRaw) {
    const existing = existingRaw as {
      prodigi_order_id: string;
      created_at: string;
    };
    // Distinguish a webhook retry of the original session (session created
    // before/around the order row) from a genuinely NEW checkout for an
    // already-ordered episode — the latter means someone paid twice.
    const freshPayment =
      session.created * 1000 >
      new Date(existing.created_at).getTime() + 60_000;

    logEvent({
      event_type: "print.order",
      status: freshPayment ? "warn" : "info",
      harvest_id: harvestId,
      message: freshPayment
        ? `POSSIBLE DOUBLE PAYMENT: fresh checkout ${session.id} completed for episode ${episodeId} which already has order ${existing.prodigi_order_id} — manual refund likely required`
        : `physical_book payment ${session.id}: order ${existing.prodigi_order_id} already placed — retry ignored`,
      metadata: { source: "stripe_webhook", session_id: session.id },
    });
    if (freshPayment) {
      Sentry.captureMessage("POSSIBLE DOUBLE PAYMENT", {
        level: "warning",
        extra: { sessionId: session.id, episodeId },
      });
      await Sentry.flush(2000).catch(() => {});
    }
    return NextResponse.json({ received: true, note: "Already placed" });
  }

  // Recipient from Stripe-collected shipping (event snapshots can be sparse —
  // re-fetch the session if absent).
  let shipping = extractShipping(session);
  if (!shipping) {
    try {
      shipping = extractShipping(
        await getStripe().checkout.sessions.retrieve(session.id)
      );
    } catch {
      // fall through to the completeness guard
    }
  }

  const cd = session.customer_details;
  const name = shipping?.name?.trim() || cd?.name?.trim() || "";
  const a = shipping?.address;

  if (!name || !a?.line1 || !a?.postal_code || !a?.city || !a?.country) {
    logEvent({
      event_type: "print.order",
      status: "error",
      harvest_id: harvestId,
      message: `physical_book payment ${session.id}: incomplete shipping details — admin must place the order manually`,
      metadata: { source: "stripe_webhook" },
    });
    return NextResponse.json({ received: true, note: "Incomplete shipping details" });
  }

  const recipient: OrderRecipient = {
    name,
    email: cd?.email ?? undefined,
    phoneNumber: cd?.phone ?? undefined,
    address: {
      line1: a.line1,
      line2: a.line2 ?? undefined,
      postalOrZipCode: a.postal_code,
      countryCode: a.country,
      townOrCity: a.city,
      stateOrCounty: a.state ?? undefined,
    },
  };

  const { data: epRaw } = await admin
    .from("episodes")
    .select("id, status, child_id, harvest_id")
    .eq("id", episodeId)
    .single();

  if (!epRaw) {
    logEvent({
      event_type: "print.order",
      status: "error",
      message: `physical_book payment ${session.id}: episode ${episodeId} not found`,
      metadata: { source: "stripe_webhook" },
    });
    return NextResponse.json({ received: true, note: "Episode not found" });
  }
  const ep = epRaw as {
    id: string;
    status: string;
    child_id: string;
    harvest_id: string;
  };

  // Payment IS approval — a parent who paid from book_ready approved by paying
  // (mirrors approveBookPreview's write).
  if (ep.status === "book_ready") {
    await admin
      .from("episodes")
      .update({ status: "parent_approved" })
      .eq("id", ep.id);
    logEvent({
      event_type: "book.approve",
      status: "success",
      harvest_id: ep.harvest_id,
      child_id: ep.child_id,
      message: `Payment ${session.id} auto-approved episode (payment-is-approval)`,
      metadata: { source: "stripe_webhook" },
    });
  } else if (ep.status !== "parent_approved") {
    logEvent({
      event_type: "print.order",
      status: "error",
      harvest_id: ep.harvest_id,
      message: `physical_book payment ${session.id}: episode status '${ep.status}' — not placing automatically, admin recovery required`,
      metadata: { source: "stripe_webhook" },
    });
    return NextResponse.json({ received: true, note: "Episode not in orderable status" });
  }

  const result = await placePrintOrder({
    supa: admin,
    episodeId: ep.id,
    recipient,
    shippingMethod: "Budget",
    source: "stripe_webhook",
  });

  if ("error" in result) {
    // 200 — Stripe must not retry into a double-charge-shaped hole; the
    // pending row is the retry ticket and the admin button the recovery path.
    logEvent({
      event_type: "print.order",
      status: "error",
      harvest_id: ep.harvest_id,
      message: `physical_book payment ${session.id}: order placement failed after payment — ${result.error}`,
      metadata: { source: "stripe_webhook" },
    });
    Sentry.captureMessage("payment taken but print order failed", {
      level: "error",
      extra: { episodeId: ep.id, error: result.error },
    });
    await Sentry.flush(2000).catch(() => {});
    return NextResponse.json({ received: true, note: "Order placement failed — logged" });
  }

  if (cd?.email) {
    const { data: childRaw } = await admin
      .from("children")
      .select("name")
      .eq("id", ep.child_id)
      .single();
    if (childRaw) {
      const email = paymentReceived({
        childName: (childRaw as { name: string }).name,
      });
      await sendEmail({
        to: cd.email,
        subject: email.subject,
        html: email.html,
      }).catch((err) => console.error("[email] payment received:", err));
    }
  }

  return NextResponse.json({ received: true, order: result.prodigiOrderId });
}

/* ─── POST handler ─────────────────────────────────────────────────────────── */

export async function POST(request: Request) {
  // Unexpected throws still become a 500 (Stripe retries); Sentry just sees
  // them first.
  try {
    return await handleStripeEvent(request);
  } catch (err) {
    Sentry.captureException(err);
    await Sentry.flush(2000).catch(() => {});
    throw err;
  }
}

async function handleStripeEvent(request: Request) {
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
    // Rotated secret or forged signature — must not stay invisible.
    Sentry.captureException(err);
    await Sentry.flush(2000).catch(() => {});
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  const admin = getAdmin();

  // Log every webhook event received
  logEvent({
    event_type: "stripe.webhook",
    status: "success",
    message: `Stripe event received: ${event.type}`,
    metadata: { stripe_event_type: event.type, stripe_event_id: event.id },
  });

  // ── checkout.session.completed ─────────────────────────────────────────────

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // ── One-time physical book purchase ──────────────────────────────────
    // Fully separate from subscription handling — must NEVER touch the
    // families subscription fields. Branch BEFORE any PRICE_ID_MAP logic.
    if (session.metadata?.kind === "physical_book") {
      return handlePhysicalBookPayment(session, admin);
    }

    const customerId = session.customer as string | null;
    const customerEmail = session.customer_details?.email;

    // Fetch line items to get the price ID
    let priceId: string | null = null;
    try {
      const lineItems = await getStripe().checkout.sessions.listLineItems(
        session.id,
        { limit: 1 }
      );
      priceId = lineItems.data[0]?.price?.id ?? null;
    } catch {
      // Fall through — resolvePriceId handles null
    }

    const subscriptionType = resolvePriceId(priceId);
    if (!subscriptionType) {
      logEvent({
        event_type: "stripe.checkout",
        status: "warn",
        message:
          "Unknown price id on checkout.session.completed with no physical_book metadata — no writes",
        metadata: { price_id: priceId, session_id: session.id },
      });
      return NextResponse.json({ received: true, note: "Unknown price id" });
    }
    const isFounding = subscriptionType === "founding";

    if (!customerEmail) {
      return NextResponse.json({ received: true, note: "No customer email" });
    }

    // Find existing family via parent email (family must exist from onboarding)
    let familyId: string | null = null;

    const { data: existingParent } = await admin
      .from("parents")
      .select("family_id")
      .eq("email", customerEmail)
      .single();

    if (!existingParent) {
      logEvent({
        event_type: "stripe.checkout",
        status: "error",
        message: "CRITICAL: payment received but no family record — customer needs manual resolution",
        metadata: { customer_email: customerEmail, price_id: priceId },
      });
      return NextResponse.json({ received: true, note: "No family found for email" });
    }

    familyId = existingParent.family_id;

    // Check previous subscription_type for upgrade detection
    const { data: prevFamily } = await admin
      .from("families")
      .select("subscription_type")
      .eq("id", familyId)
      .single();
    const previousType = (prevFamily?.subscription_type as string) ?? "none";

    // Activate the family — all Stripe checkouts become physical_digital
    const updateFields: Record<string, unknown> = {
      subscription_status: "active",
      subscription_type: "physical_digital",
      subscription_plan: subscriptionType, // preserve original plan (founding/gift/one_time)
      subscription_tier: "physical_digital",
      subscription_price: PRICE_AMOUNTS[subscriptionType] ?? 89.0,
      is_founding_member: isFounding,
      billing_cycle_start: new Date().toISOString().split("T")[0],
    };
    if (customerId) {
      updateFields.stripe_customer_id = customerId;
    }

    await admin
      .from("families")
      .update(updateFields)
      .eq("id", familyId);

    const isUpgrade = previousType === "digital_only";
    const eventType = isUpgrade
      ? "subscription.upgraded_to_physical"
      : "subscription.physical_chosen";

    logEvent({
      event_type: eventType,
      status: "success",
      family_id: familyId ?? undefined,
      message: isUpgrade
        ? "Digital subscriber upgraded to physical"
        : "Checkout session completed — family activated as physical",
      metadata: {
        subscription_plan: subscriptionType,
        price_id: priceId,
        customer_email: customerEmail,
        stripe_customer_id: customerId,
        previous_type: previousType,
      },
    });

    // Auto-approve most recent book_ready episode for this family
    const { data: bookReadyEpisode } = await admin
      .from("episodes")
      .select("id, harvest_id, child_id")
      .in(
        "child_id",
        (
          await admin
            .from("children")
            .select("id")
            .eq("family_id", familyId)
        ).data?.map((c: { id: string }) => c.id) ?? []
      )
      .eq("status", "book_ready")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (bookReadyEpisode) {
      await admin
        .from("episodes")
        .update({ status: "parent_approved" })
        .eq("id", bookReadyEpisode.id);

      await admin
        .from("harvests")
        .update({ status: "complete" })
        .eq("id", bookReadyEpisode.harvest_id);

      logEvent({
        event_type: "episode.auto_approved",
        status: "success",
        family_id: familyId ?? undefined,
        child_id: bookReadyEpisode.child_id,
        message: "Book auto-approved after physical subscription payment",
      });

      // Send physical subscription confirmed email
      const { data: childForEmail } = await admin
        .from("children")
        .select("name")
        .eq("id", bookReadyEpisode.child_id)
        .single();
      const { data: harvestForEmail } = await admin
        .from("harvests")
        .select("season")
        .eq("id", bookReadyEpisode.harvest_id)
        .single();

      if (childForEmail && harvestForEmail && customerEmail) {
        const { subject: confirmSubject, html: confirmHtml } =
          physicalSubscriptionConfirmed({
            childName: childForEmail.name,
            season: harvestForEmail.season,
          });
        await sendEmail({
          to: customerEmail,
          subject: confirmSubject,
          html: confirmHtml,
        }).catch((err) => console.error('[email] subscription confirmed:', err));
      }
    }

    // ── Gift claim token ──────────────────────────────────────────────────────

    let claimToken: string | null = null;

    if (subscriptionType === "gift" && familyId) {
      try {
        claimToken = crypto.randomUUID();
        const expiresAt = new Date(
          Date.now() + 90 * 24 * 60 * 60 * 1000
        ).toISOString();

        const { error: claimError } = await admin
          .from("gift_claims")
          .insert({
            family_id: familyId,
            claim_token: claimToken,
            status: "pending",
            expires_at: expiresAt,
          });

        if (claimError) {
          claimToken = null;
          logEvent({
            event_type: "stripe.gift_claim",
            status: "error",
            family_id: familyId,
            message: `Failed to create gift claim: ${claimError.message}`,
          });
        } else {
          logEvent({
            event_type: "stripe.gift_claim",
            status: "success",
            family_id: familyId,
            message: "Gift claim token created",
            metadata: { claim_token: claimToken, expires_at: expiresAt },
          });
        }
      } catch (err) {
        claimToken = null;
        logEvent({
          event_type: "stripe.gift_claim",
          status: "error",
          family_id: familyId,
          message: `Gift claim creation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
      }
    }

    // ── Welcome email ─────────────────────────────────────────────────────────

    if (customerEmail) {
      try {
        const isGift = subscriptionType === "gift";
        const planLabel =
          subscriptionType === "founding"
            ? "Founding Member"
            : subscriptionType === "one_time"
              ? "One-Time Book"
              : "Gift Subscription";

        let emailBody: string;

        if (isGift && claimToken) {
          const claimUrl = `${APP_URL}/gift/claim?token=${claimToken}`;
          emailBody = emailLayout(`
            <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${NAVY};font-family:Georgia,serif;line-height:1.3;">
              Your gift is ready to share.
            </h1>
            <p style="margin:0 0 16px 0;font-size:15px;color:${NAVY};line-height:1.6;">
              You've purchased a Storybound gift subscription &mdash; a personalized storybook for a child you love. Here's what happens next:
            </p>
            <p style="margin:0 0 16px 0;font-size:15px;color:${NAVY};line-height:1.6;">
              Share the link below with the recipient. They'll create their child's profile and start their first memory drop.
            </p>
            ${emailCta("Share gift link \u2192", claimUrl)}
            <p style="margin:0 0 16px 0;font-size:14px;color:${MUTED};line-height:1.5;">
              The claim link expires in 90 days. If you need help, just reply to this email.
            </p>
            <p style="margin:0;font-size:14px;color:${GOLD};font-weight:600;line-height:1.5;">
              Thank you for giving a story that lasts.
            </p>
          `);
        } else {
          emailBody = emailLayout(`
            <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${NAVY};font-family:Georgia,serif;line-height:1.3;">
              Welcome to Storybound.
            </h1>
            <p style="margin:0 0 16px 0;font-size:15px;color:${NAVY};line-height:1.6;">
              Your ${planLabel} subscription is confirmed. Here's how the magic works:
            </p>
            <ol style="margin:0 0 16px 0;padding-left:20px;font-size:15px;color:${NAVY};line-height:1.8;">
              <li><strong>Memory drops</strong> &mdash; Each season, we open a window for you to share your child's latest photos, milestones, and interests.</li>
              <li><strong>Story creation</strong> &mdash; We weave your memories into a beautifully illustrated chapter, starring your child.</li>
              <li><strong>Book delivery</strong> &mdash; Your child's personalized book arrives each season, beautifully crafted from the memories you share.</li>
            </ol>
            <p style="margin:0 0 4px 0;font-size:15px;color:${NAVY};line-height:1.6;">
              Your first memory drop window is open now.
            </p>
            ${emailCta("Go to your dashboard \u2192", `${APP_URL}/dashboard`)}
            <p style="margin:0;font-size:14px;color:${GOLD};font-weight:600;line-height:1.5;">
              Thank you for being part of your child's story.
            </p>
          `);
        }

        const result = await sendEmail({
          to: customerEmail,
          subject: "Welcome to Storybound \ud83c\udf89",
          html: emailBody,
        });
        logEvent({
          event_type: "stripe.welcome_email",
          status: result.success ? "success" : "error",
          family_id: familyId ?? undefined,
          message: result.success
            ? "Welcome email sent"
            : `Welcome email failed: ${result.error}`,
          metadata: { customer_email: customerEmail, subscription_type: subscriptionType },
        });
      } catch (err) {
        logEvent({
          event_type: "stripe.welcome_email",
          status: "error",
          family_id: familyId ?? undefined,
          message: `Welcome email error: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
      }
    }

    return NextResponse.json({
      received: true,
      type: event.type,
      subscription_type: subscriptionType,
      customer: customerEmail,
    });
  }

  // ── invoice.payment_failed ────────────────────────────────────────────────

  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;
    const customerEmail = invoice.customer_email ?? null;

    const { error: updateError } = await admin
      .from("families")
      .update({ subscription_status: "past_due" })
      .eq("stripe_customer_id", customerId);

    logEvent({
      event_type: "stripe.payment_failed",
      status: updateError ? "error" : "success",
      message: updateError
        ? `Failed to mark family as past_due: ${updateError.message}`
        : "Family marked as past_due",
      metadata: { stripe_customer_id: customerId, customer_email: customerEmail },
    });

    if (customerEmail) {
      try {
        const html = emailLayout(`
          <h1 style="margin:0 0 16px 0;font-size:22px;font-weight:700;color:${NAVY};font-family:Georgia,serif;line-height:1.3;">
            Action needed on your Storybound account.
          </h1>
          <p style="margin:0 0 16px 0;font-size:15px;color:${NAVY};line-height:1.6;">
            We weren't able to process your latest payment. This means your child's next personalized book could be delayed.
          </p>
          <p style="margin:0 0 16px 0;font-size:15px;color:${NAVY};line-height:1.6;">
            Please update your payment method to keep their story going.
          </p>
          ${emailCta("Update payment method \u2192", `${APP_URL}/dashboard`)}
          <p style="margin:0;font-size:14px;color:${MUTED};line-height:1.5;">
            If you believe this is an error, reply to this email and we'll sort it out.
          </p>
        `);

        const result = await sendEmail({
          to: customerEmail,
          subject: "Action needed \u2014 update your payment method",
          html,
        });

        logEvent({
          event_type: "stripe.payment_failed_email",
          status: result.success ? "success" : "error",
          message: result.success
            ? "Payment failed email sent"
            : `Payment failed email failed: ${result.error}`,
          metadata: { customer_email: customerEmail },
        });
      } catch (err) {
        logEvent({
          event_type: "stripe.payment_failed_email",
          status: "error",
          message: `Payment failed email error: ${err instanceof Error ? err.message : "Unknown error"}`,
        });
      }
    }

    return NextResponse.json({ received: true, type: event.type });
  }

  // ── customer.subscription.deleted ──────────────────────────────────────────

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    const { error: updateError } = await admin
      .from("families")
      .update({ subscription_status: "canceled" })
      .eq("stripe_customer_id", customerId);

    logEvent({
      event_type: "stripe.subscription_deleted",
      status: updateError ? "error" : "success",
      message: updateError
        ? `Subscription cancellation failed: ${updateError.message}`
        : "Subscription canceled",
      metadata: { stripe_customer_id: customerId },
    });

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
