import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  isAdditionalChild,
  loadDraft,
} from "../../actions";
import ProgressIndicator from "../../_shared/ProgressIndicator";
import { STEPS_NORMAL, STEPS_ADDITIONAL } from "../../_shared/steps";
import MemoryDropForm from "./MemoryDropForm";

export default async function MemoryDropPage({
  params,
}: {
  params: { childId: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Verify child belongs to user's family
  const { data: parent } = await admin
    .from("parents")
    .select("family_id")
    .eq("id", user.id)
    .single();

  if (!parent) redirect("/dashboard");

  const { data: child } = await admin
    .from("children")
    .select("id, name, family_id, character_photos_deleted_at")
    .eq("id", params.childId)
    .eq("family_id", parent.family_id)
    .single();

  if (!child) redirect("/dashboard");

  // Guard: if child has no character photos yet, send them back to photos step.
  // character_photos_deleted_at being set means photos existed and were cleaned
  // up post-training, so that counts as "has photos".
  const { data: photos } = await admin.storage
    .from("character-photos")
    .list(child.id, { limit: 1 });

  const hasPhotos =
    (photos &&
      photos.filter((f) => f.name !== ".emptyFolderPlaceholder").length > 0) ||
    child.character_photos_deleted_at !== null;

  if (!hasPhotos) {
    redirect(`/onboarding/character-photos/${child.id}`);
  }

  // Find pending harvest for this child
  const { data: harvest } = await admin
    .from("harvests")
    .select("id, status")
    .eq("child_id", child.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!harvest) redirect("/dashboard");

  // Load draft to hydrate milestone/notes if user refreshed
  const draft = await loadDraft();
  const draftMemoryDrop = draft?.data?.memoryDrop ?? { milestone: "", notes: "" };

  const additional = await isAdditionalChild();
  const labels = additional ? STEPS_ADDITIONAL : STEPS_NORMAL;
  // Memory drop is the last step: 5 of 5 (normal) or 4 of 4 (additional)
  const currentStep = labels.length;

  const displayName =
    child.name.charAt(0).toUpperCase() + child.name.slice(1);

  return (
    <div className="mx-auto max-w-lg px-6 pb-16 pt-8">
      <ProgressIndicator currentStep={currentStep} labels={labels} />

      <div className="mt-8 rounded-2xl bg-white p-8 shadow-warm md:p-10">
        <h2 className="mb-6 font-serif text-2xl font-bold text-navy">
          {displayName}&rsquo;s first memory drop
        </h2>
        <MemoryDropForm
          childId={child.id}
          childName={child.name}
          harvestId={harvest.id}
          initialMilestone={draftMemoryDrop.milestone}
          initialNotes={draftMemoryDrop.notes}
        />
      </div>
    </div>
  );
}
