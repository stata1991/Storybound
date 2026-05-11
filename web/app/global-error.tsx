"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FFF8F0",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: "#1B2A4A",
          padding: "24px",
        }}
      >
        <div
          style={{
            maxWidth: 400,
            width: "100%",
            backgroundColor: "#FFFFFF",
            borderRadius: 16,
            padding: 40,
            textAlign: "center",
            boxShadow: "0 4px 24px rgba(200, 151, 62, 0.15)",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 700,
              color: "#1B2A4A",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              marginTop: 12,
              fontSize: 16,
              lineHeight: 1.5,
              color: "rgba(27, 42, 74, 0.6)",
            }}
          >
            We&apos;re sorry — the page couldn&apos;t load. Please try
            refreshing, or reach out if this keeps happening.
          </p>

          <button
            onClick={reset}
            style={{
              marginTop: 32,
              display: "inline-block",
              backgroundColor: "#C8973E",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 9999,
              padding: "14px 32px",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 24px rgba(200, 151, 62, 0.15)",
            }}
          >
            Try again
          </button>

          <a
            href="mailto:hello@thestoryboundapp.com"
            style={{
              display: "block",
              marginTop: 16,
              fontSize: 14,
              color: "rgba(27, 42, 74, 0.4)",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            Email us for help
          </a>
        </div>
      </body>
    </html>
  );
}
