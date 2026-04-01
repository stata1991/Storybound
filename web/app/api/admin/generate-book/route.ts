export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { generateBook } from "@/app/admin/actions";

export async function POST(req: NextRequest) {
  // Auth check — only admin can trigger book generation
  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email?.toLowerCase() !== process.env.ADMIN_EMAIL?.toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { harvestId } = body as { harvestId: string };

  if (!harvestId) {
    return NextResponse.json({ error: "Missing harvestId" }, { status: 400 });
  }

  const result = await generateBook(harvestId);
  return NextResponse.json(result);
}
