"use client";

import Link from "next/link";
import type { HarvestRow as HarvestRowData } from "../actions";

/* ─── Status badge ─────────────────────────────────────────────────────────── */

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  submitted: "bg-amber-100 text-amber-700",
  processing: "bg-blue-100 text-blue-700",
  complete: "bg-green-100 text-green-700",
  missed: "bg-red-100 text-red-700",
  book_ready: "bg-purple-100 text-purple-700",
  parent_approved: "bg-green-100 text-green-700",
  digital_approved: "bg-cyan-100 text-cyan-700",
  upgrade_to_print: "bg-amber-100 text-amber-700",
  parent_flagged: "bg-orange-100 text-orange-700",
  printing: "bg-teal-100 text-teal-700",
  shipped: "bg-emerald-100 text-emerald-700",
};

function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
        STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"
      }`}
    >
      {label ?? status}
    </span>
  );
}

/* ─── Sub-status label ────────────────────────────────────────────────────── */

function SubStatus({ harvest }: { harvest: HarvestRowData }) {
  const { episodeStatus, illustrationStatus, subscriptionType, parentFlagMessage } = harvest;

  if (episodeStatus === "shipped") {
    return <StatusBadge status="shipped" />;
  }
  if (episodeStatus === "printing") {
    return <StatusBadge status="printing" />;
  }
  if (episodeStatus === "parent_flagged") {
    return (
      <>
        <StatusBadge status="parent_flagged" />
        {parentFlagMessage && (
          <p className="mt-1 max-w-xs text-xs italic text-orange-600">
            &ldquo;{parentFlagMessage}&rdquo;
          </p>
        )}
      </>
    );
  }
  if (episodeStatus === "parent_approved") {
    if (subscriptionType === "digital_only") {
      return <StatusBadge status="digital_approved" label="Digital approved" />;
    }
    if (subscriptionType === "physical_digital") {
      return <StatusBadge status="parent_approved" label="Ready to print" />;
    }
    return <StatusBadge status="parent_approved" label="Parent approved" />;
  }
  if (episodeStatus === "book_ready") {
    return <StatusBadge status="book_ready" label="Book ready" />;
  }
  if (illustrationStatus === "review") {
    return (
      <span className="text-xs text-green-600">Illustrations ready</span>
    );
  }
  return null;
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function HarvestRow({ harvest }: { harvest: HarvestRowData }) {
  const formattedDate = harvest.submittedAt
    ? new Date(harvest.submittedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "\u2014";

  return (
    <tr className="border-t border-gray-100">
      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
        {harvest.childName}
        {harvest.childAge != null && (
          <span className="ml-1 text-xs text-gray-400">
            ({harvest.childAge})
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
        {harvest.parentEmail}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 capitalize">
        {harvest.season}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
        {formattedDate}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-gray-500">
        {harvest.photoCount}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <div className="flex flex-col gap-1">
          <StatusBadge status={harvest.status} />
          <SubStatus harvest={harvest} />
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        <Link
          href={`/admin/harvest/${harvest.id}`}
          className="text-xs font-medium text-blue-600 underline underline-offset-2 hover:text-blue-800"
        >
          View &rarr;
        </Link>
      </td>
    </tr>
  );
}
