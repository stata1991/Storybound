import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createOrder,
  getOrdersByMerchantReference,
  ProdigiError,
  type OrderRecipient,
} from "@/lib/prodigi";
import { logEvent } from "@/lib/audit";

/**
 * Order-placement core — the single path through which Prodigi orders are
 * created (data-models.md: merchantReference = episodeId uniqueness is what
 * recovery-adoption depends on).
 *
 * NOT a server action and carries NO auth: the caller is responsible —
 * admin actions wrap this behind the admin guard, the Stripe webhook
 * behind signature verification.
 */

const PRODIGI_BOOK_SKU = "BOOK-FE-8_3-SQ-HARD-G";

export type PrintOrderSource = "admin" | "stripe_webhook";

export async function placePrintOrder(params: {
  supa: SupabaseClient;
  episodeId: string;
  recipient: OrderRecipient;
  shippingMethod: string;
  source: PrintOrderSource;
}): Promise<
  | { success: true; prodigiOrderId: string; issues?: unknown[]; adopted?: boolean }
  | { error: string }
> {
  const { supa: admin, episodeId, recipient, shippingMethod, source } = params;

  // ── Guards ─────────────────────────────────────────────────────────────────

  const { data: ep } = await admin
    .from("episodes")
    .select("id, harvest_id, status, print_file_path")
    .eq("id", episodeId)
    .single();

  if (!ep) return { error: "Episode not found." };
  const episode = ep as unknown as {
    id: string;
    harvest_id: string;
    status: string;
    print_file_path: string | null;
  };

  if (!episode.print_file_path) {
    return { error: "No PDF has been generated for this episode." };
  }
  if (episode.status !== "parent_approved") {
    return { error: `Episode status is '${episode.status}', expected 'parent_approved'.` };
  }
  if (!recipient?.name?.trim()) return { error: "Recipient name is required." };
  const addr = recipient.address;
  if (!addr?.line1?.trim()) return { error: "Address line 1 is required." };
  if (!addr?.postalOrZipCode?.trim()) return { error: "Postal/ZIP code is required." };
  if (!addr?.townOrCity?.trim()) return { error: "Town/city is required." };
  if (!addr?.countryCode?.trim()) return { error: "Country code is required." };

  // ── Page count from the artifact, not the formula ──────────────────────────
  // Mirrors modal/pdf_generator.py:89 — /Type /Page objects minus /Type /Pages.

  const { data: pdfBlob, error: dlErr } = await admin.storage
    .from("books")
    .download(episode.print_file_path);

  if (dlErr || !pdfBlob) {
    return { error: `Failed to download book PDF: ${dlErr?.message ?? "no data"}` };
  }

  const pdfText = Buffer.from(await pdfBlob.arrayBuffer()).toString("latin1");
  const pageCount =
    (pdfText.match(/\/Type \/Page/g)?.length ?? 0) -
    (pdfText.match(/\/Type \/Pages/g)?.length ?? 0);

  if (!Number.isInteger(pageCount) || pageCount < 24 || pageCount % 2 !== 0) {
    return {
      error: `PDF page count sanity check failed: got ${pageCount}, expected an even integer ≥ 24.`,
    };
  }

  // ── Recovery-first row handling (row id doubles as the idempotencyKey) ─────
  // A pending row means a prior attempt died before writeback. Verify-then-
  // decide: ask Prodigi whether that POST actually landed before re-POSTing.

  const assetUrlExpiresAt = new Date(Date.now() + 604800 * 1000).toISOString();
  let orderRowId: string;

  const { data: pendingRaw } = await admin
    .from("print_orders")
    .select("id")
    .eq("episode_id", episodeId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pendingRaw && (pendingRaw as { id: string }).id) {
    orderRowId = (pendingRaw as { id: string }).id;

    let priorOrders;
    try {
      priorOrders = await getOrdersByMerchantReference(episodeId);
    } catch (e) {
      // Can't safely decide blind — touch nothing.
      const msg =
        e instanceof ProdigiError
          ? `httpStatus=${e.httpStatus} outcome=${e.outcome} traceParent=${e.traceParent}`
          : e instanceof Error
            ? e.message
            : "Unknown error";
      logEvent({
        event_type: "print.order",
        status: "error",
        harvest_id: episode.harvest_id,
        message: `Recovery lookup failed: ${msg} (row ${orderRowId} untouched)`,
        metadata: { source },
      });
      return {
        error: "Could not verify whether an earlier submission reached Prodigi. Nothing was changed — try again.",
      };
    }

    if (priorOrders.length > 0) {
      // The prior POST landed — adopt it, do not POST again.
      const newest = priorOrders
        .slice()
        .sort((a, b) => String(b.created ?? "").localeCompare(String(a.created ?? "")))[0];
      const prodigiOrderId = newest.id;

      await admin
        .from("print_orders")
        .update({ prodigi_order_id: prodigiOrderId, status: "submitted" })
        .eq("id", orderRowId);
      await admin
        .from("episodes")
        .update({ print_status: "submitted" })
        .eq("id", episodeId);

      logEvent({
        event_type: "print.order",
        status: "success",
        harvest_id: episode.harvest_id,
        message: `Adopted existing Prodigi order ${prodigiOrderId} (recovery — prior POST had landed)`,
        metadata: { source },
      });
      return { success: true, prodigiOrderId, adopted: true };
    }

    // The prior POST never landed — refresh the row snapshot to the current
    // values so it matches what we're about to send, then POST with the
    // reused row id as idempotencyKey.
    const { error: refreshErr } = await admin
      .from("print_orders")
      .update({
        recipient,
        shipping_method: shippingMethod,
        page_count: pageCount,
        asset_url_expires_at: assetUrlExpiresAt,
      })
      .eq("id", orderRowId);

    if (refreshErr) {
      return { error: `Failed to refresh pending order row: ${refreshErr.message}` };
    }
  } else {
    const { data: inserted, error: insErr } = await admin
      .from("print_orders")
      .insert({
        episode_id: episodeId,
        status: "pending",
        recipient,
        shipping_method: shippingMethod,
        page_count: pageCount,
        asset_url_expires_at: assetUrlExpiresAt,
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      return { error: `Failed to create print_orders row: ${insErr?.message ?? "no data"}` };
    }
    orderRowId = (inserted as { id: string }).id;
  }

  // ── Signed URL (7 days — matches asset_url_expires_at) ─────────────────────

  const { data: urlData, error: urlErr } = await admin.storage
    .from("books")
    .createSignedUrl(episode.print_file_path, 604800);

  if (urlErr || !urlData?.signedUrl) {
    return { error: "Failed to create signed PDF URL." };
  }

  // ── Place the order ────────────────────────────────────────────────────────

  try {
    const result = await createOrder({
      idempotencyKey: orderRowId,
      merchantReference: episodeId,
      shippingMethod,
      recipient,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/prodigi?token=${process.env.PRODIGI_WEBHOOK_TOKEN}`,
      items: [
        {
          sku: PRODIGI_BOOK_SKU,
          copies: 1,
          sizing: "fillPrintArea",
          assets: [
            { printArea: "default", url: urlData.signedUrl, pageCount },
          ],
        },
      ],
    });

    const prodigiOrderId = result.order.id;

    await admin
      .from("print_orders")
      .update({ prodigi_order_id: prodigiOrderId, status: "submitted" })
      .eq("id", orderRowId);
    await admin
      .from("episodes")
      .update({ print_status: "submitted" })
      .eq("id", episodeId);

    const issues = result.order.status?.issues ?? [];
    if (result.outcome === "CreatedWithIssues" && issues.length > 0) {
      logEvent({
        event_type: "print.order",
        status: "success",
        harvest_id: episode.harvest_id,
        message: `Prodigi order ${prodigiOrderId} created with issues: ${JSON.stringify(issues)}`,
        metadata: { source },
      });
      return { success: true, prodigiOrderId, issues };
    }

    logEvent({
      event_type: "print.order",
      status: "success",
      harvest_id: episode.harvest_id,
      message: `Prodigi order ${prodigiOrderId} (${result.outcome}), ${pageCount} pages, ${shippingMethod}`,
      metadata: { source },
    });
    return { success: true, prodigiOrderId };
  } catch (e) {
    // Row stays 'pending' — it is the retry ticket for the next attempt.
    if (e instanceof ProdigiError) {
      logEvent({
        event_type: "print.order",
        status: "error",
        harvest_id: episode.harvest_id,
        message: `Prodigi order failed: httpStatus=${e.httpStatus} outcome=${e.outcome} traceParent=${e.traceParent} (row ${orderRowId} stays pending)`,
        metadata: { source },
      });
      return {
        error: `Prodigi order failed (${e.httpStatus}${e.outcome ? `, ${e.outcome}` : ""}). Pending order preserved — retrying will reuse it.`,
      };
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    logEvent({
      event_type: "print.order",
      status: "error",
      harvest_id: episode.harvest_id,
      message: `Prodigi order failed: ${msg} (row ${orderRowId} stays pending)`,
      metadata: { source },
    });
    return { error: `Prodigi order failed: ${msg}` };
  }
}
