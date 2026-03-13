import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/resend";
import {
  memoryDropOpen,
  memoryDropReminder,
  memoryDropFinal,
} from "@/lib/email/templates";

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface HarvestWithContext {
  id: string;
  season: string;
  window_opens_at: string;
  window_closes_at: string;
  child_id: string;
  children: { name: string; family_id: string } | null;
}

interface ParentRow {
  family_id: string;
  email: string;
}

interface LogEntry {
  harvest_id: string;
  email_type: string;
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function todayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/* ─── GET handler (called daily by cron) ───────────────────────────────────── */

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdmin();
  const today = todayDate();
  const sevenDaysAgo = dateOffset(-7);
  const threeDaysFromNow = dateOffset(3);

  const sent: { harvestId: string; type: string; to: string }[] = [];
  const errors: { harvestId: string; type: string; error: string }[] = [];

  // ── Collect harvests for each notification type ────────────────────────────

  // (a) Window opens today
  const { data: openHarvests } = await admin
    .from("harvests")
    .select("id, season, window_opens_at, window_closes_at, child_id, children(name, family_id)")
    .eq("status", "pending")
    .gte("window_opens_at", `${today}T00:00:00`)
    .lt("window_opens_at", `${today}T23:59:59`);

  // (b) Window opened 7 days ago, still pending
  const { data: reminderHarvests } = await admin
    .from("harvests")
    .select("id, season, window_opens_at, window_closes_at, child_id, children(name, family_id)")
    .eq("status", "pending")
    .gte("window_opens_at", `${sevenDaysAgo}T00:00:00`)
    .lt("window_opens_at", `${sevenDaysAgo}T23:59:59`);

  // (c) Window closes in 3 days, still pending
  const { data: finalHarvests } = await admin
    .from("harvests")
    .select("id, season, window_opens_at, window_closes_at, child_id, children(name, family_id)")
    .eq("status", "pending")
    .gte("window_closes_at", `${threeDaysFromNow}T00:00:00`)
    .lt("window_closes_at", `${threeDaysFromNow}T23:59:59`);

  // ── Build send queue ──────────────────────────────────────────────────────

  type QueueItem = {
    harvest: HarvestWithContext;
    emailType: string;
    templateFn: (params: {
      childName: string;
      season: string;
      childId: string;
      windowCloses: string;
    }) => { subject: string; html: string };
  };

  const queue: QueueItem[] = [];

  for (const h of (openHarvests ?? []) as unknown as HarvestWithContext[]) {
    queue.push({ harvest: h, emailType: "memory_drop_open", templateFn: memoryDropOpen });
  }
  for (const h of (reminderHarvests ?? []) as unknown as HarvestWithContext[]) {
    queue.push({ harvest: h, emailType: "memory_drop_reminder", templateFn: memoryDropReminder });
  }
  for (const h of (finalHarvests ?? []) as unknown as HarvestWithContext[]) {
    queue.push({ harvest: h, emailType: "memory_drop_final", templateFn: memoryDropFinal });
  }

  if (queue.length === 0) {
    return NextResponse.json({ sent: [], errors: [], message: "No notifications to send." });
  }

  // ── Check for already-sent (dedup) ────────────────────────────────────────

  const harvestIds = queue.map((q) => q.harvest.id);
  const { data: existingLogs } = await admin
    .from("notifications_log")
    .select("harvest_id, email_type")
    .in("harvest_id", harvestIds);

  const alreadySent = new Set(
    ((existingLogs ?? []) as unknown as LogEntry[]).map(
      (l) => `${l.harvest_id}:${l.email_type}`
    )
  );

  // Filter out duplicates
  const toSend = queue.filter(
    (q) => !alreadySent.has(`${q.harvest.id}:${q.emailType}`)
  );

  if (toSend.length === 0) {
    return NextResponse.json({ sent: [], errors: [], message: "All notifications already sent." });
  }

  // ── Resolve parent emails ─────────────────────────────────────────────────

  const familyIds = Array.from(
    new Set(
      toSend
        .map((q) => q.harvest.children?.family_id)
        .filter(Boolean) as string[]
    )
  );

  const { data: parents } = await admin
    .from("parents")
    .select("family_id, email")
    .in("family_id", familyIds);

  const emailByFamily: Record<string, string> = {};
  ((parents ?? []) as unknown as ParentRow[]).forEach((p) => {
    emailByFamily[p.family_id] = p.email;
  });

  // ── Send emails ───────────────────────────────────────────────────────────

  for (const item of toSend) {
    const h = item.harvest;
    const parentEmail = emailByFamily[h.children?.family_id ?? ""];

    if (!parentEmail || !h.children) {
      errors.push({
        harvestId: h.id,
        type: item.emailType,
        error: "No parent email found.",
      });
      continue;
    }

    const template = item.templateFn({
      childName: h.children.name,
      season: h.season,
      childId: h.child_id,
      windowCloses: h.window_closes_at,
    });

    const result = await sendEmail({
      to: parentEmail,
      subject: template.subject,
      html: template.html,
    });

    if (result.success) {
      // Log to prevent duplicates
      await admin.from("notifications_log").insert({
        harvest_id: h.id,
        email_type: item.emailType,
        recipient_email: parentEmail,
      });

      sent.push({ harvestId: h.id, type: item.emailType, to: parentEmail });
    } else {
      errors.push({
        harvestId: h.id,
        type: item.emailType,
        error: result.error,
      });
    }
  }

  return NextResponse.json({ sent, errors });
}
