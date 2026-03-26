"use client";

import { useState } from "react";
import { signInWithEmailAndRedirect } from "@/app/auth/actions";
import Link from "next/link";

interface PreviewSignInProps {
  harvestId: string;
  childName: string;
  season: string;
}

const NAVY = "#1B2A4A";
const GOLD = "#C8963E";
const CREAM = "#FDF8F0";

export default function PreviewSignIn({
  harvestId,
  childName,
  season,
}: PreviewSignInProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const capitalize = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set("redirectTo", `/dashboard/preview/${harvestId}`);

    const result = await signInWithEmailAndRedirect(formData);
    if (result?.error) {
      setError(result.error);
    }
    setLoading(false);
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
        {/* Header */}
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
              fontSize: 28,
              fontWeight: 700,
              color: NAVY,
              margin: "24px 0 8px",
              lineHeight: 1.3,
            }}
          >
            {childName}&rsquo;s {capitalize(season)} book is ready to preview.
          </h1>
          <p
            style={{
              fontSize: 16,
              color: "#6B7280",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Sign in to see your book before it goes to print.
          </p>
        </div>

        {/* Sign-in card */}
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: 16,
            padding: "32px",
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
            <div style={{ marginBottom: 12 }}>
              <input
                type="email"
                name="email"
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
                }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <input
                type="password"
                name="password"
                placeholder="Password"
                required
                minLength={6}
                style={{
                  width: "100%",
                  padding: "14px 20px",
                  borderRadius: 9999,
                  border: "1px solid rgba(27,42,74,0.15)",
                  fontSize: 16,
                  color: NAVY,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
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
              {loading ? "Signing in..." : "Sign in to preview"}
            </button>
          </form>

          {/* Magic link + forgot password */}
          <div
            style={{
              marginTop: 20,
              textAlign: "center",
              fontSize: 14,
              color: "#6B7280",
              lineHeight: 1.8,
            }}
          >
            <Link
              href={`/auth/magic-link?redirect=/dashboard/preview/${harvestId}`}
              style={{ color: GOLD, textDecoration: "underline" }}
            >
              Forgot your password? Get a sign-in link
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
