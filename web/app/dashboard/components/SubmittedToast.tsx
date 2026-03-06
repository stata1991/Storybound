"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SubmittedToast({ childName }: { childName: string }) {
  const [visible, setVisible] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      router.replace("/dashboard");
    }, 5000);
    return () => clearTimeout(timer);
  }, [router]);

  if (!visible) return null;

  const name =
    childName.charAt(0).toUpperCase() + childName.slice(1).toLowerCase();

  return (
    <div className="mx-auto max-w-4xl px-6">
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <p className="font-sans text-sm text-green-700">
          {name}&rsquo;s memory has been submitted. We&rsquo;ll get to work on
          their story. &#10003;
        </p>
      </div>
    </div>
  );
}
