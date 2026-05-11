// Load test entry point. Gated by LOADTEST_ENABLED + X-LoadTest-Secret. Remove or hard-disable after Phase 2.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function gate(request: NextRequest): boolean {
  if (process.env.LOADTEST_ENABLED !== "true") return false;
  const secret = request.headers.get("x-loadtest-secret");
  return secret === process.env.LOADTEST_SECRET;
}

export async function POST(request: NextRequest) {
  if (!gate(request)) {
    return new NextResponse(null, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { step, data } = body;

  if (typeof step !== "number" || !data) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const draftData = {
    step,
    isAdditional: false,
    form: data,
    memoryDrop: { milestone: "", notes: "" },
  };

  const { error } = await admin.from("onboarding_drafts").upsert(
    {
      user_id: user.id,
      child_id: null,
      data: draftData,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return NextResponse.json({ error: "Draft save failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
