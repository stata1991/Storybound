"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

const NAVY = "#1B2A4A";
const GOLD = "#C8963E";
const CREAM = "#FDF8F0";

function MagicLinkForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const prefillEmail = searchParams.get("email") || "";

  const [email, setEmail] = useState(prefillEmail);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const origin = window.location.origin;

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    });

    if (otpError) {
      setError(otpError.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: CREAM,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 20px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              padding: 40,
              boxShadow: "0 4px 24px rgba(27,42,74,0.08)",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                backgroundColor: "rgba(200,150,62,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px",
                fontSize: 28,
              }}
            >
              &#9993;
            </div>
            <h1
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 24,
                fontWeight: 700,
                color: NAVY,
                margin: "0 0 12px",
              }}
            >
              Check your email
            </h1>
            <p
              style={{
                fontSize: 15,
                color: "#6B7280",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              We sent a sign-in link to <strong>{email}</strong>. Click it to
              access your book preview.
            </p>
          </div>
          <Link
            href="/"
            style={{
              display: "inline-block",
              marginTop: 32,
              fontSize: 14,
              color: "#9CA3AF",
              textDecoration: "underline",
            }}
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: CREAM,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <p
            style={{
              fontFamily: "Georgia, serif",
              fontSize: 22,
              fontWeight: 700,
              color: NAVY,
              margin: 0,
            }}
          >
            Storybound
          </p>
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: 26,
              fontWeight: 700,
              color: NAVY,
              margin: "24px 0 8px",
              lineHeight: 1.3,
            }}
          >
            Sign in with a link
          </h1>
          <p
            style={{
              fontSize: 15,
              color: "#6B7280",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            No password needed. We&rsquo;ll email you a one-click sign-in link.
          </p>
        </div>

        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: 16,
            padding: 32,
            boxShadow: "0 4px 24px rgba(27,42,74,0.08)",
          }}
        >
          {error && (
            <div
              style={{
                backgroundColor: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: 8,
                padding: "12px 16px",
                marginBottom: 20,
              }}
            >
              <p style={{ fontSize: 14, color: "#B91C1C", margin: 0 }}>
                {error}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              style={{
                width: "100%",
                padding: "14px 20px",
                borderRadius: 9999,
                border: "1px solid rgba(27,42,74,0.15)",
                fontSize: 16,
                color: NAVY,
                outline: "none",
                boxSizing: "border-box",
                marginBottom: 16,
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "14px 20px",
                borderRadius: 9999,
                backgroundColor: GOLD,
                color: "#fff",
                fontSize: 16,
                fontWeight: 600,
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Sending..." : "Send sign-in link"}
            </button>
          </form>

          <div
            style={{
              marginTop: 20,
              textAlign: "center",
              fontSize: 14,
              color: "#6B7280",
            }}
          >
            <Link
              href="/auth"
              style={{ color: GOLD, textDecoration: "underline" }}
            >
              Sign in with password instead
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MagicLinkPage() {
  return (
    <Suspense>
      <MagicLinkForm />
    </Suspense>
  );
}
