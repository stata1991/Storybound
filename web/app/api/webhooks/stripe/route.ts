import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { logEvent } from "@/lib/audit";
import { sendEmail } from "@/lib/email/resend";

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

const PRICE_ID_MAP: Record<string, { subscription_type: string; format: string }> = {
  [process.env.STRIPE_PRICE_FOUNDING_PHYSICAL!]: { subscription_type: "founding", format: "physical" },
  [process.env.STRIPE_PRICE_FOUNDING_DIGITAL!]: { subscription_type: "founding", format: "digital" },
  [process.env.STRIPE_PRICE_GIFT_PHYSICAL!]: { subscription_type: "gift", format: "physical" },
  [process.env.STRIPE_PRICE_GIFT_DIGITAL!]: { subscription_type: "gift", format: "digital" },
  [process.env.STRIPE_PRICE_ONETIME_PHYSICAL!]: { subscription_type: "one_time", format: "physical" },
  [process.env.STRIPE_PRICE_ONETIME_DIGITAL!]: { subscription_type: "one_time", format: "digital" },
};

const PRICE_AMOUNTS: Record<string, number> = {
  founding: 89.0,
  one_time: 29.0,
  gift: 89.0,
};

const FORMAT_TO_TIER: Record<string, string> = {
  physical: "physical_digital",
  digital: "digital_only",
};

function resolvePriceId(
  priceId: string | null
): { subscription_type: string; format: string } {
  if (priceId && PRICE_ID_MAP[priceId]) return PRICE_ID_MAP[priceId];
  return { subscription_type: "founding", format: "physical" };
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

  console.log("[stripe-webhook] event received:", event.type, "id:", event.id);

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
    const customerId = session.customer as string | null;
    const customerEmail = session.customer_details?.email;
    console.log("[stripe-webhook] customerEmail:", customerEmail);

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

    const { subscription_type: subscriptionType, format } = resolvePriceId(priceId);
    const tier = FORMAT_TO_TIER[format] ?? "physical_digital";
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
        message: "No family found for checkout email",
        metadata: { customer_email: customerEmail, price_id: priceId },
      });
      console.log("[stripe-webhook] No family found for email:", customerEmail);
      return NextResponse.json({ received: true, note: "No family found for email" });
    }

    familyId = existingParent.family_id;

    // Activate the family and link Stripe customer if available
    const updateFields: Record<string, unknown> = {
      subscription_status: "active",
      subscription_type: subscriptionType,
      subscription_tier: tier,
      subscription_price: PRICE_AMOUNTS[subscriptionType] ?? 89.0,
      is_founding_member: isFounding,
    };
    if (customerId) {
      updateFields.stripe_customer_id = customerId;
    }

    const { data: updateData, error: updateError } = await admin
      .from("families")
      .update(updateFields)
      .eq("id", familyId)
      .select();

    console.log("[stripe-webhook] family update result:", JSON.stringify({ data: updateData, error: updateError }));
    console.log("[stripe-webhook] familyId (activated):", familyId, "stripe_customer_id:", customerId);

    logEvent({
      event_type: "stripe.checkout",
      status: "success",
      family_id: familyId,
      message: "Checkout session completed — family activated",
      metadata: {
        subscription_type: subscriptionType,
        format,
        tier,
        price_id: priceId,
        customer_email: customerEmail,
        stripe_customer_id: customerId,
      },
    });

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

        console.log("[stripe-webhook] Sending welcome email to:", customerEmail);
        const result = await sendEmail({
          to: customerEmail,
          subject: "Welcome to Storybound \ud83c\udf89",
          html: emailBody,
        });
        console.log("[stripe-webhook] sendEmail result:", JSON.stringify(result));

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
      format,
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
