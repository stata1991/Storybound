import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getChild } from "./actions";
import EditChildForm from "./EditChildForm";

export default async function EditChildPage({
  params,
}: {
  params: { childId: string };
}) {
  // Auth guard
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const child = await getChild(params.childId);

  if (!child) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
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
          &larr; Back to dashboard
        </Link>
      </header>

      <main className="mx-auto max-w-lg px-6 pb-16">
        <EditChildForm child={child} />
      </main>
    </div>
  );
}
