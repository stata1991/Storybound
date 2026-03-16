"use server";

import { createClient } from "@/lib/supabase/server";

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
      "id, child_id, quarter, year, season, window_opens_at, window_closes_at, submitted_at, status"
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
