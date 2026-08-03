"use client";

import { useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  approveBookPreview,
  flagBookIssue,
  chooseDigitalOnly,
  createPrintCheckout,
} from "../../actions";

interface PreviewClientProps {
  harvestId: string;
  childName: string;
  season: string;
  episodeStatus: string;
  printStatus: string;
  trackingNumber: string | null;
  pdfUrl: string | null;
  previewDeadline: string | null;
  subscriptionType: string;
}

const NAVY = "#1B2A4A";
const GOLD = "#C8963E";
const CREAM = "#FDF8F0";

export default function PreviewClient({
  harvestId,
  childName,
  season,
  episodeStatus,
  printStatus,
  trackingNumber,
  pdfUrl,
  previewDeadline,
  subscriptionType,
}: PreviewClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const printParam = searchParams.get("print");
  const [status, setStatus] = useState(episodeStatus);
  const [showFlagForm, setShowFlagForm] = useState(false);
  const [flagText, setFlagText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subType, setSubType] = useState(subscriptionType);
  const processingRef = useRef(false);

  // Print already underway — suppress every buy button, show status instead.
  const printUnderway = printStatus !== "pending";
  const printStatusLine =
    printStatus === "shipped"
      ? `On its way!${trackingNumber ? ` Tracking: ${trackingNumber}` : ""}`
      : "Headed to print!";

  // Post-checkout return banner (?print=success | ?print=cancelled)
  const printBanner =
    printParam === "success" ? (
      <p
        style={{
          margin: "0 auto 16px",
          maxWidth: 480,
          padding: "12px 16px",
          backgroundColor: "#D1FAE5",
          color: "#065F46",
          borderRadius: 12,
          fontSize: 14,
          textAlign: "center",
        }}
      >
        Payment received &mdash; your book is headed to print! We&rsquo;ll
        email you when it ships.
      </p>
    ) : printParam === "cancelled" ? (
      <p
        style={{
          margin: "0 auto 16px",
          maxWidth: 480,
          fontSize: 13,
          color: "#9CA3AF",
          textAlign: "center",
        }}
      >
        Checkout cancelled &mdash; your book is still here whenever
        you&rsquo;re ready.
      </p>
    ) : null;

  const capitalize = (s: string) =>
    s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

  const deadlineStr = previewDeadline
    ? new Date(previewDeadline).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
      })
    : null;

  /* ─── Handlers ────────────────────────────────────────────────────────────── */

  async function handleApprove() {
    if (processingRef.current) return;
    processingRef.current = true;
    setLoading(true);
    setError(null);
    const result = await approveBookPreview(harvestId);
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
      processingRef.current = false;
    } else {
      setStatus("parent_approved");
      setLoading(false);
      processingRef.current = false;
    }
  }

  async function handleFlag() {
    if (!flagText.trim()) {
      setError("Please describe what looks wrong.");
      return;
    }
    if (processingRef.current) return;
    processingRef.current = true;
    setLoading(true);
    setError(null);
    const result = await flagBookIssue(harvestId, flagText.trim());
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
      processingRef.current = false;
    } else {
      setStatus("parent_flagged");
      setLoading(false);
      processingRef.current = false;
    }
  }

  async function handleChooseDigital() {
    if (processingRef.current) return;
    processingRef.current = true;
    setLoading(true);
    setError(null);
    const result = await chooseDigitalOnly(harvestId);
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
      processingRef.current = false;
    } else {
      setSubType("digital_only");
      setStatus("parent_approved");
      setLoading(false);
      processingRef.current = false;
    }
  }

  async function handlePrintCheckout() {
    if (processingRef.current) return;
    processingRef.current = true;
    setLoading(true);
    setError(null);
    const result = await createPrintCheckout(harvestId);
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
      processingRef.current = false;
    } else {
      window.location.href = result.url;
    }
  }

  /* ─── Shared Components ───────────────────────────────────────────────────── */

  function Header() {
    return (
      <header
        style={{
          padding: "20px 24px",
          borderBottom: "1px solid #E8E4DF",
          backgroundColor: "#fff",
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: "Georgia, serif",
            fontSize: 20,
            fontWeight: 700,
            color: NAVY,
          }}
        >
          Storybound
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#6B7280" }}>
          Preview {childName}&rsquo;s {capitalize(season)} book
          {deadlineStr && <> &middot; Review by {deadlineStr}</>}
        </p>
      </header>
    );
  }

  function PdfViewer() {
    if (!pdfUrl) {
      return (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: CREAM,
          }}
        >
          <p style={{ fontSize: 16, color: "#6B7280" }}>
            The book preview is not available yet.
          </p>
        </div>
      );
    }
    return (
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <iframe
          src={pdfUrl}
          title={`${childName}'s book preview`}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        />
      </div>
    );
  }

  function FlagLink() {
    return (
      <div style={{ textAlign: "center", marginTop: 16 }}>
        {!showFlagForm ? (
          <button
            onClick={() => setShowFlagForm(true)}
            style={{
              background: "none",
              border: "none",
              color: "#9CA3AF",
              fontSize: 13,
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Something doesn&rsquo;t look right?
          </button>
        ) : (
          <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "left" }}>
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 14,
                fontWeight: 600,
                color: NAVY,
              }}
            >
              Tell us what you noticed
            </p>
            <textarea
              value={flagText}
              onChange={(e) => setFlagText(e.target.value.slice(0, 500))}
              placeholder="Describe what doesn't look right..."
              rows={3}
              style={{
                width: "100%",
                padding: "12px",
                fontSize: 14,
                border: "1px solid #D1D5DB",
                borderRadius: 8,
                resize: "vertical",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
            <p
              style={{
                margin: "4px 0 12px",
                fontSize: 12,
                color: "#9CA3AF",
                textAlign: "right",
              }}
            >
              {flagText.length}/500
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={handleFlag}
                disabled={loading || !flagText.trim()}
                style={{
                  padding: "10px 20px",
                  backgroundColor: NAVY,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  border: "none",
                  borderRadius: 9999,
                  cursor:
                    loading || !flagText.trim() ? "not-allowed" : "pointer",
                  opacity: loading || !flagText.trim() ? 0.6 : 1,
                }}
              >
                {loading ? "Submitting..." : "Submit feedback"}
              </button>
              <button
                onClick={() => {
                  setShowFlagForm(false);
                  setFlagText("");
                  setError(null);
                }}
                disabled={loading}
                style={{
                  padding: "10px 20px",
                  backgroundColor: "transparent",
                  color: "#6B7280",
                  fontSize: 14,
                  border: "1px solid #D1D5DB",
                  borderRadius: 9999,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─── State: Already approved ─────────────────────────────────────────────── */

  if (status === "parent_approved" && subType === "digital_only") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: CREAM,
        }}
      >
        <Header />
        <PdfViewer />
        {/* Upgrade banner */}
        <div
          style={{
            padding: "20px 24px",
            backgroundColor: "#fff",
            borderTop: "1px solid #E8E4DF",
            textAlign: "center",
          }}
        >
          {printBanner}
          {printUnderway ? (
            <p
              style={{
                margin: 0,
                fontSize: 15,
                fontWeight: 600,
                color: NAVY,
              }}
            >
              {printStatusLine}
            </p>
          ) : (
            <>
              <p style={{ margin: "0 0 8px", fontSize: 15, color: NAVY }}>
                Loving {childName}&rsquo;s book? Get a printed hardcover
                shipped to you.
              </p>
              <button
                onClick={handlePrintCheckout}
                disabled={loading}
                style={{
                  padding: "12px 28px",
                  backgroundColor: GOLD,
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 600,
                  border: "none",
                  borderRadius: 9999,
                  cursor: loading ? "wait" : "pointer",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "Starting checkout..." : "Print This Book — $35, shipped"}
              </button>
            </>
          )}
          {error && (
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#DC2626" }}>
              {error}
            </p>
          )}
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => router.push("/dashboard")}
              style={{
                background: "none",
                border: "none",
                color: "#9CA3AF",
                fontSize: 13,
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === "parent_approved") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: CREAM,
          padding: "40px 20px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            backgroundColor: "#D1FAE5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
            fontSize: 32,
          }}
        >
          &#10003;
        </div>
        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: 28,
            color: NAVY,
            margin: "0 0 12px",
          }}
        >
          {subType === "physical_digital"
            ? `${childName}\u2019s book is heading to print!`
            : `${childName}\u2019s book is ready!`}
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "#6B7280",
            lineHeight: 1.6,
            maxWidth: 420,
            margin: "0 0 32px",
          }}
        >
          {subType === "physical_digital"
            ? "Thank you for reviewing. We\u2019ll send you a shipping notification once it\u2019s on its way."
            : "Your digital book is ready to read anytime from your dashboard."}
        </p>
        {printBanner}
        {error && (
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "#DC2626" }}>
            {error}
          </p>
        )}
        {subType !== "physical_digital" &&
          (printUnderway ? (
            <p
              style={{
                margin: "0 0 16px",
                fontSize: 16,
                fontWeight: 600,
                color: NAVY,
              }}
            >
              {printStatusLine}
            </p>
          ) : (
            <button
              onClick={handlePrintCheckout}
              disabled={loading}
              style={{
                padding: "14px 32px",
                backgroundColor: GOLD,
                color: "#fff",
                fontSize: 16,
                fontWeight: 600,
                border: "none",
                borderRadius: 9999,
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.6 : 1,
                marginBottom: 12,
              }}
            >
              {loading ? "Starting checkout..." : "Print This Book \u2014 $35, shipped"}
            </button>
          ))}
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            padding: "14px 32px",
            backgroundColor: subType === "physical_digital" ? GOLD : "transparent",
            color: subType === "physical_digital" ? "#fff" : "#6B7280",
            fontSize: 16,
            fontWeight: 600,
            border: subType === "physical_digital" ? "none" : "1px solid #D1D5DB",
            borderRadius: 9999,
            cursor: "pointer",
          }}
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  // Flagged state
  if (status === "parent_flagged") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: CREAM,
          padding: "40px 20px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            backgroundColor: "#FEF3C7",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
            fontSize: 28,
          }}
        >
          &#9888;
        </div>
        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: 28,
            color: NAVY,
            margin: "0 0 12px",
          }}
        >
          We&rsquo;ve noted your feedback.
        </h1>
        <p
          style={{
            fontSize: 16,
            color: "#6B7280",
            lineHeight: 1.6,
            maxWidth: 420,
            margin: "0 0 32px",
          }}
        >
          Our team will review your note and make adjustments. We&rsquo;ll send
          you a new preview email once it&rsquo;s updated.
        </p>
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            padding: "14px 32px",
            backgroundColor: GOLD,
            color: "#fff",
            fontSize: 16,
            fontWeight: 600,
            border: "none",
            borderRadius: 9999,
            cursor: "pointer",
          }}
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  // No PDF available
  if (!pdfUrl) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: CREAM,
          padding: "40px 20px",
        }}
      >
        <p style={{ fontSize: 16, color: "#6B7280" }}>
          The book preview is not available yet. Please check back later.
        </p>
      </div>
    );
  }

  /* ─── Conversion UI — default book_ready experience for none AND
         digital_only families (physical_digital keeps the review UI) ──────── */

  if (status === "book_ready" && subType !== "physical_digital") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: CREAM,
        }}
      >
        <Header />
        <PdfViewer />

        {/* Conversion action bar */}
        <div
          style={{
            padding: "32px 24px",
            backgroundColor: "#fff",
            borderTop: "1px solid #E8E4DF",
          }}
        >
          <h2
            style={{
              margin: "0 0 24px",
              fontFamily: "Georgia, serif",
              fontSize: 22,
              fontWeight: 700,
              color: NAVY,
              textAlign: "center",
            }}
          >
            {capitalize(childName)}&rsquo;s {capitalize(season)} book is ready!
          </h2>

          {printBanner}

          {error && (
            <p
              style={{
                margin: "0 0 16px",
                fontSize: 14,
                color: "#DC2626",
                textAlign: "center",
              }}
            >
              {error}
            </p>
          )}

          {/* Two-path cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              maxWidth: 560,
              margin: "0 auto",
            }}
          >
            {/* Print card */}
            <div
              style={{
                border: `2px solid ${GOLD}`,
                borderRadius: 16,
                padding: 24,
                textAlign: "center",
              }}
            >
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 16,
                  fontWeight: 700,
                  color: NAVY,
                }}
              >
                Print This Book
              </p>
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: 13,
                  color: "#6B7280",
                  lineHeight: 1.8,
                }}
              >
                Printed hardcover, shipped to you &middot; $35
              </p>
              {printParam === "success" || printUnderway ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    fontWeight: 600,
                    color: NAVY,
                  }}
                >
                  {printUnderway ? printStatusLine : "Headed to print!"}
                </p>
              ) : (
                <button
                  onClick={handlePrintCheckout}
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    backgroundColor: GOLD,
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 600,
                    border: "none",
                    borderRadius: 9999,
                    cursor: loading ? "wait" : "pointer",
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {loading ? "Starting checkout..." : "Print This Book"}
                </button>
              )}
            </div>

            {/* Digital card */}
            <div
              style={{
                border: "2px solid #E5E7EB",
                borderRadius: 16,
                padding: 24,
                textAlign: "center",
              }}
            >
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 16,
                  fontWeight: 700,
                  color: NAVY,
                }}
              >
                Keep It Digital
              </p>
              <ul
                style={{
                  margin: "0 0 16px",
                  padding: 0,
                  listStyle: "none",
                  fontSize: 13,
                  color: "#6B7280",
                  lineHeight: 1.8,
                }}
              >
                {subType === "digital_only" ? (
                  <>
                    <li>Free, as always</li>
                    <li>New book each season</li>
                  </>
                ) : (
                  <>
                    <li>Digital access free forever</li>
                    <li>New book each season</li>
                    <li>Free</li>
                  </>
                )}
              </ul>
              <button
                onClick={handleChooseDigital}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  backgroundColor: "transparent",
                  color: NAVY,
                  fontSize: 15,
                  fontWeight: 600,
                  border: "2px solid #D1D5DB",
                  borderRadius: 9999,
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading
                  ? "Saving..."
                  : subType === "digital_only"
                    ? "Keep it digital"
                    : "Continue Free"}
              </button>
            </div>
          </div>

          <FlagLink />
        </div>
      </div>
    );
  }

  /* ─── Physical subscriber — approve/flag review UI (book_ready ONLY) ────── */

  if (status === "book_ready") {
    return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: CREAM,
      }}
    >
      <Header />
      <PdfViewer />

      {/* Action bar */}
      <div
        style={{
          padding: "24px",
          backgroundColor: "#fff",
          borderTop: "1px solid #E8E4DF",
        }}
      >
        {error && (
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 14,
              color: "#DC2626",
            }}
          >
            {error}
          </p>
        )}

        {!showFlagForm ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={handleApprove}
              disabled={loading}
              style={{
                padding: "14px 32px",
                backgroundColor: GOLD,
                color: "#fff",
                fontSize: 16,
                fontWeight: 600,
                border: "none",
                borderRadius: 9999,
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Saving..." : "Looks perfect — send to print"}
            </button>
            <button
              onClick={() => setShowFlagForm(true)}
              disabled={loading}
              style={{
                padding: "14px 24px",
                backgroundColor: "transparent",
                color: "#6B7280",
                fontSize: 14,
                fontWeight: 500,
                border: "1px solid #D1D5DB",
                borderRadius: 9999,
                cursor: "pointer",
              }}
            >
              Something looks wrong
            </button>
          </div>
        ) : (
          <div style={{ maxWidth: 560 }}>
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 14,
                fontWeight: 600,
                color: NAVY,
              }}
            >
              Tell us what you noticed
            </p>
            <textarea
              value={flagText}
              onChange={(e) => setFlagText(e.target.value.slice(0, 500))}
              placeholder="Describe what doesn't look right..."
              rows={3}
              style={{
                width: "100%",
                padding: "12px",
                fontSize: 14,
                border: "1px solid #D1D5DB",
                borderRadius: 8,
                resize: "vertical",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
            <p
              style={{
                margin: "4px 0 12px",
                fontSize: 12,
                color: "#9CA3AF",
                textAlign: "right",
              }}
            >
              {flagText.length}/500
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={handleFlag}
                disabled={loading || !flagText.trim()}
                style={{
                  padding: "12px 24px",
                  backgroundColor: NAVY,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  border: "none",
                  borderRadius: 9999,
                  cursor:
                    loading || !flagText.trim() ? "not-allowed" : "pointer",
                  opacity: loading || !flagText.trim() ? 0.6 : 1,
                }}
              >
                {loading ? "Submitting..." : "Submit feedback"}
              </button>
              <button
                onClick={() => {
                  setShowFlagForm(false);
                  setFlagText("");
                  setError(null);
                }}
                disabled={loading}
                style={{
                  padding: "12px 24px",
                  backgroundColor: "transparent",
                  color: "#6B7280",
                  fontSize: 14,
                  border: "1px solid #D1D5DB",
                  borderRadius: 9999,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    );
  }

  /* ─── Post-review states — book + one status line ────────────────────────── */

  if (["printing", "shipped", "delivered"].includes(status)) {
    const statusLine =
      status === "printing"
        ? `${childName}’s book is being printed!`
        : status === "shipped"
          ? `${childName}’s book is on its way!`
          : `${childName}’s book has been delivered!`;
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: CREAM,
        }}
      >
        <Header />
        {pdfUrl && <PdfViewer />}
        <div
          style={{
            padding: "20px 24px",
            backgroundColor: "#fff",
            borderTop: "1px solid #E8E4DF",
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: NAVY }}>
            {statusLine}
          </p>
        </div>
      </div>
    );
  }

  /* ─── Fallback: draft + any unknown/future status — never the review UI ──── */

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: CREAM,
        padding: 24,
        textAlign: "center",
      }}
    >
      <p
        style={{
          margin: "0 0 8px",
          fontSize: 20,
          fontWeight: 700,
          color: NAVY,
          fontFamily: "Georgia, serif",
        }}
      >
        {childName}’s book is still being made.
      </p>
      <p style={{ margin: 0, fontSize: 15, color: "#6B7280" }}>
        We’ll email you the moment it’s ready to preview.
      </p>
      <button
        onClick={() => router.push("/dashboard")}
        style={{
          marginTop: 20,
          background: "none",
          border: "none",
          color: "#9CA3AF",
          fontSize: 13,
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        Back to dashboard
      </button>
    </div>
  );
}

