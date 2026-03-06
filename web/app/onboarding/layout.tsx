import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Header bar */}
      <header className="flex items-center justify-between px-6 py-5">
        <Link
          href="/dashboard"
          className="font-serif text-xl font-bold text-navy"
        >
          Storybound
        </Link>
        <Link
          href="/dashboard"
          className="font-sans text-sm text-navy/40 underline decoration-navy/20 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold"
        >
          Save and exit
        </Link>
      </header>

      {/* Content */}
      {children}
    </div>
  );
}
