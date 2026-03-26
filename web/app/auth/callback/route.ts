import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { claimGift } from "@/app/gift/claim/actions";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/auth?error=true`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/auth?error=true`);
  }

  // Check for gift claim cookie
  const cookieStore = await cookies();
  const giftToken = cookieStore.get("sb-gift-token")?.value;

  if (giftToken) {
    cookieStore.delete("sb-gift-token");

    const result = await claimGift(
      giftToken,
      data.user.id,
      data.user.email ?? ""
    );

    if (result.success) {
      return NextResponse.redirect(
        `${origin}/onboarding?type=gift&gift=claimed`
      );
    }

    // Claim failed (expired, already claimed) — fall through to normal flow
  }

  // Service role client bypasses RLS for new user check
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: parent } = await admin
    .from("parents")
    .select("id")
    .eq("id", data.user.id)
    .single();

  // Support custom redirect (e.g. from magic link → preview page)
  const next = searchParams.get("next");

  if (parent) {
    const destination = next && next.startsWith("/") ? next : "/dashboard";
    return NextResponse.redirect(`${origin}${destination}`);
  }

  return NextResponse.redirect(`${origin}/onboarding`);
}
