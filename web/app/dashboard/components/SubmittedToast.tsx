"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardToast({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      router.replace("/dashboard");
    }, 4000);
    return () => clearTimeout(timer);
  }, [router]);

  if (!visible) return null;

  return (
    <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
      <p className="font-sans text-sm text-green-700">{message}</p>
    </div>
  );
}
