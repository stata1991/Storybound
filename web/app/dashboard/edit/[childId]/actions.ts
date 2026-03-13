"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface EditableChild {
  id: string;
  name: string;
  date_of_birth: string;
  pronouns: string;
  reading_level: string;
  interests: string[];
  avoidances: string[];
  default_archetype: string | null;
}

export interface UpdateChildData {
  name: string;
  dateOfBirth: string;
  pronouns: string;
  readingLevel: string;
  interests: string;
  avoidances: string;
  defaultArchetype: string;
}

/* ─── Queries ──────────────────────────────────────────────────────────────── */

export async function getChild(
  childId: string
): Promise<EditableChild | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("children")
    .select(
      "id, name, date_of_birth, pronouns, reading_level, interests, avoidances, default_archetype"
    )
    .eq("id", childId)
    .eq("active", true)
    .is("deleted_at", null)
    .single();

  return data;
}

/* ─── Mutations ────────────────────────────────────────────────────────────── */

function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function updateChild(
  childId: string,
  data: UpdateChildData
): Promise<{ error: string } | undefined> {
  const supabase = await createClient();

  // Verify auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated. Please sign in." };
  }

  // Verify child belongs to user (RLS scoped)
  const { data: child } = await supabase
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("active", true)
    .is("deleted_at", null)
    .single();

  if (!child) {
    return { error: "Child not found." };
  }

  const { error: updateError } = await supabase
    .from("children")
    .update({
      name: data.name,
      date_of_birth: data.dateOfBirth,
      pronouns: data.pronouns,
      reading_level: data.readingLevel,
      interests: parseCommaSeparated(data.interests),
      avoidances: parseCommaSeparated(data.avoidances),
      default_archetype: data.defaultArchetype || null,
    })
    .eq("id", childId);

  if (updateError) {
    return { error: "Failed to save changes. Please try again." };
  }

  redirect("/dashboard?updated=true");
}
