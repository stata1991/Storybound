"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/* ─── Types ────────────────────────────────────────────────────────────────── */

export type GiftClaimResult =
  | { status: "valid"; recipientEmail: string | null }
  | { status: "already_claimed" }
  | { status: "expired" }
  | { status: "not_found" };

/* ─── Admin client ─────────────────────────────────────────────────────────── */

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/* ─── Queries ──────────────────────────────────────────────────────────────── */

export async function getGiftClaim(token: string): Promise<GiftClaimResult> {
  const admin = getAdmin();

  const { data: claim } = await admin
    .from("gift_claims")
    .select("status, expires_at, recipient_email")
    .eq("claim_token", token)
    .single();

  if (!claim) {
    return { status: "not_found" };
  }

  if (claim.status === "claimed") {
    return { status: "already_claimed" };
  }

  // Explicit expiry check — expired rows may not have been cleaned up
  if (
    claim.status === "expired" ||
    new Date(claim.expires_at) < new Date()
  ) {
    return { status: "expired" };
  }

  return { status: "valid", recipientEmail: claim.recipient_email };
}

/* ─── Start claim (set cookie → redirect to auth) ─────────────────────────── */

export async function startGiftClaim(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("sb-gift-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 30, // 30 minutes
    path: "/",
  });

  redirect("/auth");
}

/* ─── Claim gift (called from auth callback) ───────────────────────────────── */

export async function claimGift(
  token: string,
  userId: string,
  email: string
): Promise<{ success: true } | { success: false; error: string }> {
  const admin = getAdmin();

  // Verify token is valid + unclaimed + not expired
  const { data: claim } = await admin
    .from("gift_claims")
    .select("id, family_id, status, expires_at")
    .eq("claim_token", token)
    .single();

  if (!claim) {
    return { success: false, error: "Gift not found." };
  }

  if (claim.status === "claimed") {
    return { success: false, error: "This gift has already been claimed." };
  }

  if (
    claim.status === "expired" ||
    new Date(claim.expires_at) < new Date()
  ) {
    return { success: false, error: "This gift link has expired." };
  }

  // Check if buyer's family is a founding member (gift inherits founding status)
  const { data: buyerFamily } = await admin
    .from("families")
    .select("is_founding_member")
    .eq("id", claim.family_id)
    .single();

  const isFounding = buyerFamily?.is_founding_member ?? false;

  // Create family for the gift recipient
  const { data: family, error: familyError } = await admin
    .from("families")
    .insert({
      subscription_status: "active",
      subscription_type: "gift",
      subscription_tier: "physical_digital",
      subscription_price: isFounding ? 89.0 : 89.0,
      is_founding_member: isFounding,
      billing_cycle_start: new Date().toISOString().split("T")[0],
    })
    .select("id")
    .single();

  if (familyError || !family) {
    return { success: false, error: "Failed to create account." };
  }

  // Create parent record for recipient
  const { error: parentError } = await admin.from("parents").insert({
    id: userId,
    family_id: family.id,
    email,
  });

  if (parentError) {
    return { success: false, error: "Failed to create profile." };
  }

  // Mark gift as claimed
  const { error: claimError } = await admin
    .from("gift_claims")
    .update({
      claimed_by: family.id,
      claimed_at: new Date().toISOString(),
      status: "claimed",
    })
    .eq("id", claim.id);

  if (claimError) {
    return { success: false, error: "Failed to claim gift." };
  }

  return { success: true };
}
