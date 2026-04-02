"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  approveBookPreview,
  flagBookIssue,
  chooseDigitalOnly,
  saveShippingAddress,
  createPhysicalCheckoutSession,
} from "../../actions";

interface PreviewClientProps {
  harvestId: string;
  childName: string;
  season: string;
  episodeStatus: string;
  pdfUrl: string | null;
  flagMessage: string | null;
  previewDeadline: string | null;
  subscriptionType: string;
  hasShippingAddress: boolean;
  parentEmail: string;
}

const NAVY = "#1B2A4A";
const GOLD = "#C8963E";
const CREAM = "#FDF8F0";

export default function PreviewClient({
  harvestId,
  childName,
  season,
  episodeStatus,
  pdfUrl,
  _flagMessage,
  previewDeadline,
  subscriptionType,
  hasShippingAddress,
  _parentEmail,
}: PreviewClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState(episodeStatus);
  const [showFlagForm, setShowFlagForm] = useState(false);
  const [flagText, setFlagText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subType, setSubType] = useState(subscriptionType);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressData, setAddressData] = useState({
    shippingName: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
  });
  const processingRef = useRef(false);

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
    setLoading(true);
    setError(null);
    const result = await approveBookPreview(harvestId);
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
    } else {
      setStatus("parent_approved");
      setLoading(false);
    }
  }

  async function handleFlag() {
    if (!flagText.trim()) {
      setError("Please describe what looks wrong.");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await flagBookIssue(harvestId, flagText.trim());
    if ("error" in result) {
      setError(result.error);
      setLoading(false);
    } else {
      setStatus("parent_flagged");
      setLoading(false);
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

  async function handleSubscribePrint() {
    if (processingRef.current) return;
    processingRef.current = true;

    if (!hasShippingAddress && !showAddressForm) {
      setShowAddressForm(true);
      processingRef.current = false;
      return;
    }

    setLoading(true);
    setError(null);

    // Save address first if form was shown
    if (showAddressForm) {
      if (
        !addressData.shippingName ||
        !addressData.addressLine1 ||
        !addressData.city ||
        !addressData.state ||
        !addressData.zip
      ) {
        setError("Please fill in all required address fields.");
        setLoading(false);
        processingRef.current = false;
        return;
      }
      const addrResult = await saveShippingAddress(addressData);
      if ("error" in addrResult) {
        setError(addrResult.error);
        setLoading(false);
        processingRef.current = false;
        return;
      }
    }

    // Create checkout session and redirect
    const result = await createPhysicalCheckoutSession(harvestId);
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
          <p style={{ margin: "0 0 8px", fontSize: 15, color: NAVY }}>
            Loving {childName}&rsquo;s book? Get it printed + 3 more this year.
          </p>
          <button
            onClick={handleSubscribePrint}
            disabled={loading}
            style={{
              padding: "12px 28px",
              backgroundColor: "transparent",
              color: GOLD,
              fontSize: 15,
              fontWeight: 600,
              border: `2px solid ${GOLD}`,
              borderRadius: 9999,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Loading..." : "Upgrade to Print"}
          </button>
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

  /* ─── Conversion UI (subscription_type === 'none', status === 'book_ready') ─ */

  if (subType === "none" && status === "book_ready") {
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
                <li>Physical + digital access</li>
                <li>4 books per year</li>
                <li>$89/year</li>
              </ul>
              <button
                onClick={handleSubscribePrint}
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
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? "Loading..." : "Subscribe & Print"}
              </button>
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
                <li>Digital access free forever</li>
                <li>New book each season</li>
                <li>Free</li>
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
                {loading ? "Saving..." : "Continue Free"}
              </button>
            </div>
          </div>

          {/* Inline address form (shown when no address on file) */}
          {showAddressForm && (
            <div
              style={{
                maxWidth: 480,
                margin: "24px auto 0",
                padding: 24,
                border: "1px solid #E5E7EB",
                borderRadius: 16,
              }}
            >
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: 15,
                  fontWeight: 600,
                  color: NAVY,
                }}
              >
                Shipping address
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <input
                  type="text"
                  placeholder="Full name (recipient)"
                  value={addressData.shippingName}
                  onChange={(e) =>
                    setAddressData((d) => ({ ...d, shippingName: e.target.value }))
                  }
                  style={inputStyle}
                />
                <input
                  type="text"
                  placeholder="Address line 1"
                  value={addressData.addressLine1}
                  onChange={(e) =>
                    setAddressData((d) => ({ ...d, addressLine1: e.target.value }))
                  }
                  style={inputStyle}
                />
                <input
                  type="text"
                  placeholder="Address line 2 (optional)"
                  value={addressData.addressLine2}
                  onChange={(e) =>
                    setAddressData((d) => ({ ...d, addressLine2: e.target.value }))
                  }
                  style={inputStyle}
                />
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
                  <input
                    type="text"
                    placeholder="City"
                    value={addressData.city}
                    onChange={(e) =>
                      setAddressData((d) => ({ ...d, city: e.target.value }))
                    }
                    style={inputStyle}
                  />
                  <input
                    type="text"
                    placeholder="State"
                    value={addressData.state}
                    onChange={(e) =>
                      setAddressData((d) => ({ ...d, state: e.target.value }))
                    }
                    style={inputStyle}
                  />
                  <input
                    type="text"
                    placeholder="Zip"
                    value={addressData.zip}
                    onChange={(e) =>
                      setAddressData((d) => ({ ...d, zip: e.target.value }))
                    }
                    style={inputStyle}
                  />
                </div>
                <button
                  onClick={handleSubscribePrint}
                  disabled={loading}
                  style={{
                    marginTop: 4,
                    padding: "12px 24px",
                    backgroundColor: GOLD,
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 600,
                    border: "none",
                    borderRadius: 9999,
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {loading ? "Processing..." : "Continue to payment"}
                </button>
              </div>
            </div>
          )}

          <FlagLink />
        </div>
      </div>
    );
  }

  /* ─── Physical subscriber — existing approve/flag UI ─────────────────────── */

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
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Submitting..." : "Looks great \u2014 send to print!"}
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  fontSize: 14,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  fontFamily: "inherit",
  boxSizing: "border-box",
};
