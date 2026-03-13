import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getAdminStats,
  getAllHarvests,
  getAllFamilies,
} from "./actions";
import HarvestRow from "./components/HarvestRow";

export default async function AdminPage() {
  // Auth + admin guard
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  if (user.email?.toLowerCase() !== process.env.ADMIN_EMAIL?.toLowerCase()) {
    redirect("/dashboard");
  }

  const [stats, harvests, families] = await Promise.all([
    getAdminStats(),
    getAllHarvests(),
    getAllFamilies(),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">
            Storybound Admin
          </h1>
          <Link
            href="/dashboard"
            className="text-sm text-gray-400 underline underline-offset-2 hover:text-gray-600"
          >
            &larr; Back to dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16 pt-8">
        {/* ── Section A: Stats ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total families" value={stats.totalFamilies} />
          <StatCard label="Active subs" value={stats.activeSubscriptions} />
          <StatCard
            label="Harvests submitted"
            value={stats.harvestsSubmitted}
            highlight={stats.harvestsSubmitted > 0}
          />
          <StatCard label="In production" value={stats.booksInProduction} />
          <StatCard label="Shipped" value={stats.booksShipped} />
          <StatCard
            label="Gifts pending"
            value={stats.giftClaimsPending}
            highlight={stats.giftClaimsPending > 0}
          />
        </div>

        {/* ── Section B: Harvests queue ───────────────────────────────────── */}
        <section className="mt-10">
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            Harvests queue
            {stats.harvestsSubmitted > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {stats.harvestsSubmitted} needs attention
              </span>
            )}
          </h2>

          {harvests.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-8 text-center">
              <p className="text-sm text-gray-400">No harvests yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full min-w-[700px] text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Child
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Family email
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Season
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Submitted
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">
                      Photos
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {harvests.map((harvest) => (
                    <HarvestRow key={harvest.id} harvest={harvest} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Section C: Families ─────────────────────────────────────────── */}
        <section className="mt-10">
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            Families
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({families.length})
            </span>
          </h2>

          {families.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white px-6 py-8 text-center">
              <p className="text-sm text-gray-400">No families yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full min-w-[650px] text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Parent
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Email
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500">
                      Children
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Type
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Joined
                    </th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {families.map((family) => (
                    <FamilyRowDisplay key={family.id} family={family} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

/* ─── Stat Card ────────────────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-4 ${
        highlight
          ? "border-amber-200 bg-amber-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <p
        className={`text-2xl font-bold ${
          highlight ? "text-amber-700" : "text-gray-900"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-gray-500">{label}</p>
    </div>
  );
}

/* ─── Family Row (static, server-rendered) ─────────────────────────────────── */

const SUB_STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  trialing: "bg-blue-100 text-blue-700",
  past_due: "bg-red-100 text-red-700",
  canceled: "bg-gray-100 text-gray-500",
  paused: "bg-gray-100 text-gray-500",
};

function FamilyRowDisplay({
  family,
}: {
  family: {
    id: string;
    parentName: string;
    parentEmail: string;
    childCount: number;
    subscriptionType: string;
    subscriptionStatus: string;
    createdAt: string;
  };
}) {
  const joinedDate = new Date(family.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <tr className="border-t border-gray-100">
      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
        {family.parentName}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
        {family.parentEmail}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-gray-500">
        {family.childCount}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 capitalize">
        {family.subscriptionType.replace("_", " ")}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
        {joinedDate}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
            SUB_STATUS_STYLES[family.subscriptionStatus] ??
            "bg-gray-100 text-gray-500"
          }`}
        >
          {family.subscriptionStatus.replace("_", " ")}
        </span>
      </td>
    </tr>
  );
}
