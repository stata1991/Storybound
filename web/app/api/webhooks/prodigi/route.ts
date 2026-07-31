import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";
import { getOrder, ProdigiError } from "@/lib/prodigi";
import { logEvent } from "@/lib/audit";
import { sendEmail } from "@/lib/email/resend";
import { bookShipped } from "@/lib/email/templates";

export const maxDuration = 30;

/* Monotonic status ladder — callbacks may arrive out of order; never move
   a print order backward. */
const STATUS_RANK: Record<string, number> = {
  pending: 0,
  submitted: 1,
  printing: 2,
  shipped: 3,
  delivered: 4,
};

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  // ── Auth: constant-time token comparison, unset-env guarded ───────────────
  const expected = process.env.PRODIGI_WEBHOOK_TOKEN;
  const provided = req.nextUrl.searchParams.get("token");

  if (!expected || !provided) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Extract order id from the CloudEvent envelope ─────────────────────────
  // Never 4xx/5xx on junk — Prodigi's retry system must not be taught to
  // hammer us.
  let body: {
    subject?: unknown;
    data?: { order?: { id?: unknown }; id?: unknown };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ignored: true });
  }

  const candidate =
    (typeof body.subject === "string" && body.subject) ||
    (typeof body.data?.order?.id === "string" && body.data.order.id) ||
    (typeof body.data?.id === "string" && body.data.id) ||
    null;

  if (!candidate) {
    return NextResponse.json({ ignored: true });
  }
  const orderId = candidate;

  // ── Verify-by-fetch: the fetched order is the sole source of truth ────────
  let order;
  try {
    order = await getOrder(orderId);
  } catch (e) {
    if (e instanceof ProdigiError && e.httpStatus === 404) {
      // Permanent: junk id, foreign environment, or nothing of ours.
      return NextResponse.json({ ignored: true });
    }
    const msg =
      e instanceof ProdigiError
        ? `httpStatus=${e.httpStatus} outcome=${e.outcome}`
        : e instanceof Error
          ? e.message
          : "unknown";
    console.error(`[prodigi-webhook] verify fetch failed for ${orderId}: ${msg}`);
    // Deferred = a subsequent stage-change callback will trigger a fresh
    // verify-fetch (every path returns 200, so Prodigi never retries because
    // of our response).
    return NextResponse.json({ deferred: true });
  }

  const admin = getAdmin();

  const { data: rowRaw } = await admin
    .from("print_orders")
    .select("id, episode_id, status")
    .eq("prodigi_order_id", orderId)
    .maybeSingle();

  if (!rowRaw) {
    // Sandbox strays / other environments — not ours.
    return NextResponse.json({ ignored: true });
  }
  const row = rowRaw as { id: string; episode_id: string; status: string };

  const { data: epRaw } = await admin
    .from("episodes")
    .select("harvest_id, child_id")
    .eq("id", row.episode_id)
    .single();
  const episode = epRaw as { harvest_id: string; child_id: string } | null;

  // ── Map fetched state to our status ───────────────────────────────────────
  const stage = order.status?.stage;
  const details = order.status?.details ?? {};

  if (stage === "Cancelled") {
    // Our enum has no cancelled value — log loudly, admin handles manually.
    logEvent({
      event_type: "print.order",
      status: "error",
      harvest_id: episode?.harvest_id,
      message: `Prodigi order ${orderId} cancelled at Prodigi — print_orders row ${row.id} left at '${row.status}', manual handling required`,
    });
    return NextResponse.json({ ok: true, cancelled: true });
  }

  const shipments = order.shipments ?? [];
  const hasShippedShipment =
    shipments.some((s) => s.status === "Shipped") ||
    details.shipping === "Complete";

  let mapped: "printing" | "shipped" | null = null;
  if (hasShippedShipment) {
    mapped = "shipped";
  } else if (
    details.inProduction === "InProgress" ||
    details.inProduction === "Complete"
  ) {
    mapped = "printing";
  }

  if (!mapped || STATUS_RANK[mapped] <= (STATUS_RANK[row.status] ?? 0)) {
    // Nothing new, or an out-of-order callback mapping earlier than current
    // status — no-op write-wise, still 200.
    return NextResponse.json({ ok: true, noop: true });
  }

  // ── Apply: printing ───────────────────────────────────────────────────────
  if (mapped === "printing") {
    await admin
      .from("print_orders")
      .update({ status: "printing" })
      .eq("id", row.id);
    await admin
      .from("episodes")
      .update({ print_status: "printing" })
      .eq("id", row.episode_id);

    logEvent({
      event_type: "print.order",
      status: "success",
      harvest_id: episode?.harvest_id,
      message: `Prodigi order ${orderId} in production — status ${row.status} → printing`,
    });
    return NextResponse.json({ ok: true, status: "printing" });
  }

  // ── Apply: shipped (transition guaranteed — rank check excludes repeats) ──
  const newestShipment = shipments
    .slice()
    .sort((x, y) =>
      String(y.dispatchDate ?? "").localeCompare(String(x.dispatchDate ?? ""))
    )[0];

  const trackingNumber = newestShipment?.tracking?.number ?? null;
  const trackingUrl = newestShipment?.tracking?.url ?? null;
  const carrier = newestShipment?.carrier?.name ?? null;
  // Defensive parse — malformed or absent dispatchDate both fall back to now.
  const parsedDispatch = newestShipment?.dispatchDate
    ? new Date(String(newestShipment.dispatchDate))
    : null;
  const shippedAt =
    parsedDispatch && !isNaN(parsedDispatch.getTime())
      ? parsedDispatch.toISOString()
      : new Date().toISOString();

  await admin
    .from("print_orders")
    .update({
      status: "shipped",
      tracking_number: trackingNumber,
      tracking_url: trackingUrl,
      carrier,
      charges: order.charges ?? null,
    })
    .eq("id", row.id);

  await admin
    .from("episodes")
    .update({
      print_status: "shipped",
      shipped_at: shippedAt,
      tracking_number: trackingNumber,
    })
    .eq("id", row.episode_id);

  // ── Shipped email — once (row transitioned away from non-shipped above) ───
  if (episode) {
    const { data: childRaw } = await admin
      .from("children")
      .select("name, family_id")
      .eq("id", episode.child_id)
      .single();
    const child = childRaw as { name: string; family_id: string } | null;

    let parentEmail: string | null = null;
    if (child) {
      const { data: parentRaw } = await admin
        .from("parents")
        .select("email")
        .eq("family_id", child.family_id)
        .single();
      parentEmail = (parentRaw as { email: string } | null)?.email ?? null;
    }

    if (child && parentEmail) {
      const email = bookShipped({
        childName: child.name,
        trackingNumber,
        trackingUrl,
        carrier,
      });
      const sent = await sendEmail({
        to: parentEmail,
        subject: email.subject,
        html: email.html,
      });
      if (!sent.success) {
        console.error(`[prodigi-webhook] shipped email failed: ${sent.error}`);
      }
    } else {
      console.error(
        `[prodigi-webhook] no parent email for episode ${row.episode_id} — shipped email skipped`
      );
    }
  }

  logEvent({
    event_type: "print.order",
    status: "success",
    harvest_id: episode?.harvest_id,
    message: `Prodigi order ${orderId} shipped — tracking ${trackingNumber ?? "n/a"} (${carrier ?? "carrier unknown"})`,
  });

  return NextResponse.json({ ok: true, status: "shipped" });
}
