import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getChildForCharacterPhotos } from "../../actions";
import StepPhotos from "../../StepPhotos";

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

  const displayName =
    child.name.charAt(0).toUpperCase() + child.name.slice(1);

  return (
    <div className="mx-auto max-w-lg px-6 pb-16 pt-8">
      <div className="rounded-2xl bg-white p-8 shadow-warm md:p-10">
        <h2 className="mb-6 font-serif text-2xl font-bold text-navy">
          Bring {displayName} to life
        </h2>
        <StepPhotos childName={child.name} childId={child.id} />
      </div>
    </div>
  );
}
