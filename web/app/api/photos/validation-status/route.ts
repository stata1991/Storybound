import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkPhotoValidationGate, type ValidationContext } from "@/lib/photo-validator";

export async function GET(req: NextRequest) {
  const harvestId = req.nextUrl.searchParams.get("harvestId");
  if (!harvestId) {
    return NextResponse.json({ error: "Missing harvestId" }, { status: 400 });
  }

  const context = req.nextUrl.searchParams.get("context") as ValidationContext | null;
  if (context !== "character_only" && context !== "combined") {
    return NextResponse.json({ error: "Invalid or missing context" }, { status: 400 });
  }

  // Auth — RLS-scoped client ensures only family-owned harvests are visible
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ownership check via RLS — non-owning user gets null
  const { data: harvest } = await supabase
    .from("harvests")
    .select("id")
    .eq("id", harvestId)
    .single();

  if (!harvest) {
    return NextResponse.json({ error: "Harvest not found" }, { status: 404 });
  }

  // Gate check uses service-role internally
  const gate = await checkPhotoValidationGate(harvestId, context);

  if (gate.allowed) {
    return NextResponse.json({
      status: "passed",
      hardPassCount: gate.hardPassCount,
      effectivePhotoCount: gate.effectivePhotoCount,
    });
  }

  // Distinguish "not yet validated" from actual failure
  if (gate.reason.startsWith("Photos haven't been validated yet")) {
    return NextResponse.json({ status: "pending" });
  }

  return NextResponse.json({
    status: "failed",
    reason: gate.reason,
    errors: gate.errors,
    failedPaths: gate.failedPaths,
  });
}
