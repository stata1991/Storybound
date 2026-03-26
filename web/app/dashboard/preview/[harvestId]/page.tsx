import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import PreviewClient from "./PreviewClient";
import PreviewSignIn from "./PreviewSignIn";

interface Props {
  params: { harvestId: string };
}

export default async function PreviewPage({ params }: Props) {
  const { harvestId } = params;

  // Use service role to fetch child name (public metadata for the sign-in prompt)
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: harvestMeta } = await admin
    .from("harvests")
    .select("id, season, child_id, children(name)")
    .eq("id", harvestId)
    .single();

  if (!harvestMeta) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FDF8F0",
          padding: "40px 20px",
        }}
      >
        <p style={{ fontSize: 16, color: "#6B7280" }}>
          This preview link is no longer valid.
        </p>
      </div>
    );
  }

  const harvest = harvestMeta as unknown as {
    id: string;
    season: string;
    child_id: string;
    children: { name: string };
  };

  const childName = harvest.children.name;

  // Check if user is authenticated
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not authenticated — show contextual sign-in
  if (!user) {
    return (
      <PreviewSignIn
        harvestId={harvestId}
        childName={childName}
        season={harvest.season}
      />
    );
  }

  // Fetch parent + family info for subscription-aware rendering
  const { data: parentRecord } = await supabase
    .from("parents")
    .select("family_id, email")
    .eq("id", user.id)
    .single();

  let subscriptionType = "none";
  let hasShippingAddress = false;
  const parentEmail = parentRecord?.email ?? "";

  if (parentRecord?.family_id) {
    const { data: familyRecord } = await admin
      .from("families")
      .select("subscription_type, address_line1")
      .eq("id", parentRecord.family_id)
      .single();
    subscriptionType = (familyRecord?.subscription_type as string) ?? "none";
    hasShippingAddress = Boolean(familyRecord?.address_line1);
  }

  // Authenticated — fetch episode via RLS-scoped client
  const { data: episodeRaw } = await supabase
    .from("episodes")
    .select("id, status, print_file_path, parent_flag_message, preview_deadline")
    .eq("harvest_id", harvestId)
    .single();

  // RLS blocks if not the parent's child — show not found
  if (!episodeRaw) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FDF8F0",
          padding: "40px 20px",
          textAlign: "center",
        }}
      >
        <div>
          <p style={{ fontSize: 16, color: "#6B7280", marginBottom: 16 }}>
            We couldn&rsquo;t find a book preview for your account.
          </p>
          <p style={{ fontSize: 14, color: "#9CA3AF" }}>
            Make sure you&rsquo;re signed in with the same email you used to
            create your Storybound account.
          </p>
        </div>
      </div>
    );
  }

  const episode = episodeRaw as unknown as {
    id: string;
    status: string;
    print_file_path: string | null;
    parent_flag_message: string | null;
    preview_deadline: string | null;
  };

  // Generate signed URL for PDF (1-hour expiry)
  let pdfUrl: string | null = null;
  if (episode.print_file_path) {
    const { data: urlData } = await supabase.storage
      .from("books")
      .createSignedUrl(episode.print_file_path, 3600);
    pdfUrl = urlData?.signedUrl ?? null;
  }

  return (
    <PreviewClient
      harvestId={harvestId}
      childName={childName}
      season={harvest.season}
      episodeStatus={episode.status}
      pdfUrl={pdfUrl}
      flagMessage={episode.parent_flag_message}
      previewDeadline={episode.preview_deadline}
      subscriptionType={subscriptionType}
      hasShippingAddress={hasShippingAddress}
      parentEmail={parentEmail}
    />
  );
}
