import { redirect } from "next/navigation";
import { detectOnboardingResume } from "./actions";
import OnboardingWizard from "./OnboardingWizard";

/* ─── Server Component ─────────────────────────────────────────────────────── */

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ additional?: string }>;
}) {
  const params = await searchParams;
  const isAdditional = params.additional === "true";

  // If adding another child, skip resume detection — always start fresh
  if (!isAdditional) {
    const resume = await detectOnboardingResume();

    if (resume.redirect === "character-photos") {
      redirect(`/onboarding/character-photos/${resume.childId}`);
    }

    if (resume.redirect === "memory-drop") {
      redirect(`/onboarding/memory-drop/${resume.childId}`);
    }

    if (resume.redirect === "draft") {
      return (
        <OnboardingWizard
          isAdditional={false}
          initialDraft={resume.data}
          initialChildId={resume.childId}
        />
      );
    }
  }

  return <OnboardingWizard isAdditional={isAdditional} />;
}
