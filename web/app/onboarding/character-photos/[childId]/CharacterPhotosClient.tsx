"use client";

import { useRouter } from "next/navigation";
import StepPhotos from "../../StepPhotos";

export default function CharacterPhotosClient({
  childName,
  childId,
}: {
  childName: string;
  childId: string;
}) {
  const router = useRouter();

  return (
    <StepPhotos
      childName={childName}
      childId={childId}
      onComplete={() => {
        router.push(`/onboarding/memory-drop/${childId}`);
      }}
    />
  );
}
