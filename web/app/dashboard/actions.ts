"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/audit";
import { sendEmail } from "@/lib/email/resend";
import { digitalBookReady } from "@/lib/email/templates";
import Stripe from "stripe";

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface HarvestData {
  id: string;
  quarter: number;
  year: number;
  season: string;
  window_opens_at: string | null;
  window_closes_at: string | null;
  submitted_at: string | null;
  status: string;
  photo_count: number | null;
}

export interface EpisodeData {
  id: string;
  quarter: number;
  year: number;
  status: string;
  tracking_number: string | null;
  delivered_at: string | null;
}

export interface ChildWithHarvests {
  id: string;
  name: string;
  date_of_birth: string;
  pronouns: string;
  reading_level: string;
  interests: string[];
  default_archetype: string | null;
  current_year: number;
  character_photos_deleted_at: string | null;
  hasCharacterPhotos: boolean;
  harvests: HarvestData[];
  episodes: EpisodeData[];
}

export interface ParentData {
  first_name: string | null;
  family_id: string;
}

/* ─── Queries ──────────────────────────────────────────────────────────────── */

export async function getParentData(): Promise<ParentData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("parents")
    .select("first_name, family_id")
    .eq("id", user.id)
    .single();

  return data;
}

export async function getChildrenWithHarvests(): Promise<ChildWithHarvests[]> {
  const supabase = await createClient();

  const currentYear = new Date().getFullYear();

  // Fetch active children for the authenticated user's family (RLS scoped)
  const { data: children, error: childErr } = await supabase
    .from("children")
    .select(
      "id, name, date_of_birth, pronouns, reading_level, interests, default_archetype, current_year, character_photos_deleted_at"
    )
    .eq("active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (childErr || !children) return [];

  // Fetch harvests + episodes for current year for all children
  const childIds = children.map((c) => c.id);

  const { data: harvests } = await supabase
    .from("harvests")
    .select(
      "id, child_id, quarter, year, season, window_opens_at, window_closes_at, submitted_at, status, photo_count"
    )
    .in("child_id", childIds)
    .eq("year", currentYear)
    .order("quarter", { ascending: true });

  const { data: episodes } = await supabase
    .from("episodes")
    .select(
      "id, child_id, quarter, year, status, tracking_number, delivered_at"
    )
    .in("child_id", childIds)
    .eq("year", currentYear)
    .order("quarter", { ascending: true });

  // Check character photos for each child
  const photoChecks = await Promise.all(
    children.map(async (c) => {
      const { data: photos } = await supabase.storage
        .from("character-photos")
        .list(c.id, { limit: 1 });
      return { id: c.id, has: Boolean(photos && photos.length > 0) };
    })
  );
  const photoMap = new Map(photoChecks.map((p) => [p.id, p.has]));

  return children.map((child) => ({
    ...child,
    hasCharacterPhotos: photoMap.get(child.id) ?? false,
    harvests: (harvests ?? []).filter((h) => h.child_id === child.id),
    episodes: (episodes ?? []).filter((e) => e.child_id === child.id),
  }));
}

export async function getCurrentQuarter(): Promise<{
  quarter: number;
  season: string;
}> {
  const month = new Date().getMonth(); // 0-indexed
  if (month <= 2) return { quarter: 1, season: "Spring" };
  if (month <= 5) return { quarter: 2, season: "Summer" };
  if (month <= 8) return { quarter: 3, season: "Autumn" };
  return { quarter: 4, season: "Birthday" };
}

/* ─── Preview actions ─────────────────────────────────────────────────────── */

export async function approveBookPreview(
  harvestId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };

  // RLS ensures the parent can only access their own children's data
  const { data: episodeRaw } = await supabase
    .from("episodes")
    .select("id, status")
    .eq("harvest_id", harvestId)
    .single();

  if (!episodeRaw) return { error: "No episode found for this harvest." };

  const ep = episodeRaw as unknown as { id: string; status: string };

  if (ep.status !== "book_ready") {
    return { error: `Book is not awaiting review (status: ${ep.status}).` };
  }

  const { error: updateErr } = await supabase
    .from("episodes")
    .update({ status: "parent_approved" })
    .eq("id", ep.id);

  if (updateErr) return { error: updateErr.message };

  return { success: true };
}

export async function flagBookIssue(
  harvestId: string,
  message: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };

  if (!message || message.length === 0) {
    return { error: "Please describe what looks wrong." };
  }
  if (message.length > 500) {
    return { error: "Message must be 500 characters or fewer." };
  }

  const { data: episodeRaw } = await supabase
    .from("episodes")
    .select("id, status")
    .eq("harvest_id", harvestId)
    .single();

  if (!episodeRaw) return { error: "No episode found for this harvest." };

  const ep = episodeRaw as unknown as { id: string; status: string };

  if (ep.status !== "book_ready") {
    return { error: `Book is not awaiting review (status: ${ep.status}).` };
  }

  const { error: updateErr } = await supabase
    .from("episodes")
    .update({
      status: "parent_flagged",
      parent_flag_message: message,
    })
    .eq("id", ep.id);

  if (updateErr) return { error: updateErr.message };

  return { success: true };
}

/* ─── New subscription flow actions ────────────────────────────────────────── */

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function chooseDigitalOnly(
  harvestId: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };

  // Fetch the episode for this harvest (RLS-scoped)
  const { data: episodeRaw } = await supabase
    .from("episodes")
    .select("id, status, child_id")
    .eq("harvest_id", harvestId)
    .single();

  if (!episodeRaw) return { error: "No episode found for this harvest." };

  const ep = episodeRaw as unknown as {
    id: string;
    status: string;
    child_id: string;
  };

  if (ep.status !== "book_ready") {
    return { error: `Book is not ready for review (status: ${ep.status}).` };
  }

  // Fetch parent's family
  const { data: parent } = await supabase
    .from("parents")
    .select("family_id, email")
    .eq("id", user.id)
    .single();

  if (!parent) return { error: "Parent record not found." };

  const admin = getAdmin();

  // Fetch child name + harvest season for email
  const { data: child } = await admin
    .from("children")
    .select("name")
    .eq("id", ep.child_id)
    .single();

  const { data: harvest } = await admin
    .from("harvests")
    .select("season")
    .eq("id", harvestId)
    .single();

  // Update family to digital_only + active
  const { error: famErr } = await admin
    .from("families")
    .update({
      subscription_type: "digital_only",
      subscription_status: "active",
    })
    .eq("id", parent.family_id);

  if (famErr) return { error: "Failed to update subscription." };

  // Approve episode
  const { error: epErr } = await admin
    .from("episodes")
    .update({ status: "parent_approved" })
    .eq("id", ep.id);

  if (epErr) return { error: "Failed to approve episode." };

  // Complete harvest
  await admin
    .from("harvests")
    .update({ status: "complete" })
    .eq("id", harvestId);

  logEvent({
    event_type: "subscription.digital_chosen",
    status: "success",
    family_id: parent.family_id,
    child_id: ep.child_id,
    message: "Parent chose digital-only path",
  });

  // Send digital book ready email
  if (child && harvest) {
    const { subject, html } = digitalBookReady({
      childName: child.name,
      season: harvest.season,
      harvestId,
    });
    sendEmail({ to: parent.email, subject, html }).catch((err) => console.error('[email] digital book ready:', err));
  }

  return { success: true };
}

export async function saveShippingAddress(data: {
  shippingName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
}): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };

  if (!data.shippingName || !data.addressLine1 || !data.city || !data.state || !data.zip) {
    return { error: "Please fill in all required address fields." };
  }

  const { data: parent } = await supabase
    .from("parents")
    .select("family_id")
    .eq("id", user.id)
    .single();

  if (!parent) return { error: "Parent record not found." };

  const admin = getAdmin();

  const { error: updateErr } = await admin
    .from("families")
    .update({
      shipping_name: data.shippingName,
      address_line1: data.addressLine1,
      address_line2: data.addressLine2 || null,
      city: data.city,
      state: data.state,
      zip: data.zip,
      country: data.country || "US",
    })
    .eq("id", parent.family_id);

  if (updateErr) return { error: "Failed to save address." };

  return { success: true };
}

export async function createPhysicalCheckoutSession(
  harvestId: string
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated." };

  const { data: parent } = await supabase
    .from("parents")
    .select("family_id, email")
    .eq("id", user.id)
    .single();

  if (!parent) return { error: "Parent record not found." };

  // Verify the harvest belongs to this family
  const admin = getAdmin();
  const { data: harvest } = await admin
    .from("harvests")
    .select("id, child_id")
    .eq("id", harvestId)
    .single();

  if (!harvest) return { error: "Harvest not found." };

  const { data: child } = await admin
    .from("children")
    .select("family_id")
    .eq("id", harvest.child_id)
    .single();

  if (!child || child.family_id !== parent.family_id) {
    return { error: "Not authorized." };
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-02-25.clover",
  });

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://storybound.co";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [
      {
        price: process.env.STRIPE_PRICE_FOUNDING_PHYSICAL!,
        quantity: 1,
      },
    ],
    client_reference_id: parent.family_id,
    customer_email: parent.email,
    metadata: {
      harvestId,
      familyId: parent.family_id,
    },
    success_url: `${APP_URL}/dashboard?subscribed=true`,
    cancel_url: `${APP_URL}/dashboard/preview/${harvestId}`,
  });

  if (!session.url) return { error: "Failed to create checkout session." };

  return { url: session.url };
}

/* ─── Memory photo upload ─────────────────────────────────────────────────── */

export async function addMemoryPhotos(
  childId: string,
  harvestId: string,
  formData: FormData
): Promise<{ success: true; photoCount: number } | { error: string }> {
  // Auth check
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Not authenticated. Please sign in." };
  }

  // Verify child ownership via RLS
  const { data: child } = await supabase
    .from("children")
    .select("id, family_id")
    .eq("id", childId)
    .single();

  if (!child) {
    return { error: "Child not found." };
  }

  const familyId = child.family_id;

  // Admin client for storage + harvest update
  const admin = getAdmin();

  // Fetch harvest — verify it belongs to this child and is in a valid status
  const { data: harvest } = await admin
    .from("harvests")
    .select("id, status, photo_paths, photo_captions, photo_count")
    .eq("id", harvestId)
    .eq("child_id", childId)
    .single();

  if (!harvest) {
    return { error: "Harvest not found." };
  }

  const validStatuses = ["pending", "submitted", "processing"];
  if (!validStatuses.includes(harvest.status)) {
    return { error: "Photos can no longer be added to this memory drop." };
  }

  // Ensure harvest-photos bucket exists (idempotent)
  await admin.storage.createBucket("harvest-photos", {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png"],
  });

  // Parse photos + captions from FormData
  const photos = formData.getAll("photos") as File[];
  const captions = formData.getAll("captions") as string[];

  if (photos.length === 0) {
    return { error: "No photos provided." };
  }

  // Validate captions
  for (const cap of captions) {
    if (cap.length > 200) {
      return { error: "Each photo caption must be 200 characters or less." };
    }
  }

  // Check max photos limit (5 total)
  const existingPaths: string[] = harvest.photo_paths ?? [];
  const existingCaptions: string[] = harvest.photo_captions ?? [];
  const existingCount = existingPaths.length;

  if (existingCount + photos.length > 5) {
    return {
      error: `Maximum 5 photos allowed. You already have ${existingCount}.`,
    };
  }

  // Upload each photo
  const newPaths: string[] = [];

  for (const photo of photos) {
    if (!photo.size) continue;

    const ext = photo.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `${familyId}/${childId}/${harvestId}/${fileName}`;

    const { error: uploadError } = await admin.storage
      .from("harvest-photos")
      .upload(storagePath, photo, {
        contentType: photo.type,
        upsert: false,
      });

    if (uploadError) {
      return { error: `Failed to upload ${photo.name}. Please try again.` };
    }

    newPaths.push(storagePath);
  }

  if (newPaths.length === 0) {
    return { error: "No valid photos to upload." };
  }

  // Append new paths + captions to existing
  const allPaths = [...existingPaths, ...newPaths];
  const allCaptions = [...existingCaptions, ...captions];

  // Update harvest
  const { error: updateError } = await admin
    .from("harvests")
    .update({
      photo_paths: allPaths,
      photo_captions: allCaptions,
      photo_count: allPaths.length,
    })
    .eq("id", harvestId);

  if (updateError) {
    return { error: "Failed to save photos. Please try again." };
  }

  logEvent({
    event_type: "harvest.photos_added",
    status: "success",
    harvest_id: harvestId,
    child_id: childId,
    message: `Added ${newPaths.length} photo(s)`,
    metadata: { new_count: newPaths.length, total_count: allPaths.length },
  });

  return { success: true, photoCount: allPaths.length };
}
