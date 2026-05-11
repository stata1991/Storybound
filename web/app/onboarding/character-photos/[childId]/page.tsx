import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getChildForCharacterPhotos,
  isAdditionalChild,
} from "../../actions";
import ProgressIndicator, {
  STEPS_NORMAL,
  STEPS_ADDITIONAL,
} from "../../_shared/ProgressIndicator";
import CharacterPhotosClient from "./CharacterPhotosClient";

export default async function CharacterPhotosPage({
  params,
}: {
  params: { childId: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth");

  const child = await getChildForCharacterPhotos(params.childId);
  if (!child) redirect("/dashboard");

  const additional = await isAdditionalChild(child.id);
  const labels = additional ? STEPS_ADDITIONAL : STEPS_NORMAL;
  // Photos is step 4 of 5 (normal) or step 3 of 4 (additional)
  const currentStep = additional ? 3 : 4;

  const displayName =
    child.name.charAt(0).toUpperCase() + child.name.slice(1);

  return (
    <div className="mx-auto max-w-lg px-6 pb-16 pt-8">
      <ProgressIndicator currentStep={currentStep} labels={labels} />

      <div className="mt-8 rounded-2xl bg-white p-8 shadow-warm md:p-10">
        <h2 className="mb-6 font-serif text-2xl font-bold text-navy">
          Bring {displayName} to life
        </h2>
        <CharacterPhotosClient
          childName={child.name}
          childId={child.id}
        />
      </div>
    </div>
  );
}
