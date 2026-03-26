import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  // Auth check — only logged-in admin can poll
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const harvestId = req.nextUrl.searchParams.get("harvestId");
  if (!harvestId) {
    return NextResponse.json(
      { error: "Missing harvestId" },
      { status: 400 }
    );
  }

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: harvest } = await admin
    .from("harvests")
    .select("status")
    .eq("id", harvestId)
    .single();

  if (!harvest) {
    return NextResponse.json({ error: "Harvest not found" }, { status: 404 });
  }

  return NextResponse.json({ status: harvest.status });
}
