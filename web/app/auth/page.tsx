"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from "./actions";

function AuthForm() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hasError = searchParams.get("error") === "true";
  const checkEmail = searchParams.get("check-email") === "true";

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    const result = await signInWithGoogle();
    if (result.url) {
      window.location.href = result.url;
    } else {
      setError(result.error || "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const action = mode === "signin" ? signInWithEmail : signUpWithEmail;
    const result = await action(formData);
    // Only reaches here if there was an error (success redirects)
    if (result?.error) {
      setError(result.error);
    }
    setLoading(false);
  };

  if (checkEmail) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <div className="rounded-2xl bg-white p-10 shadow-warm">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gold/10">
              <svg className="h-8 w-8 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <h1 className="font-serif text-2xl font-bold text-navy">
              Check your email
            </h1>
            <p className="mt-3 font-sans text-base text-navy/60">
              We sent you a confirmation link. Click it to finish creating your account.
            </p>
          </div>
          <Link
            href="/"
            className="mt-8 inline-block font-sans text-sm text-navy/40 underline decoration-navy/20 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block font-serif text-2xl font-bold text-navy">
            Storybound
          </Link>
          <h1 className="mt-6 font-serif text-3xl font-bold text-navy">
            Your child&rsquo;s story starts here.
          </h1>
          <p className="mt-2 font-sans text-base text-navy/60">
            Sign in to manage your Storybound subscription.
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-warm md:p-10">
          {/* Error banner */}
          {(error || hasError) && (
            <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <p className="font-sans text-sm text-red-700">
                {error || "Something went wrong. Please try again."}
              </p>
            </div>
          )}

          {/* Google button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base font-medium text-navy shadow-sm transition-all hover:shadow-warm hover:border-gold/40 focus:outline-none focus:ring-2 focus:ring-gold/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-navy/10" />
            <span className="font-sans text-xs text-navy/40">or continue with email</span>
            <div className="h-px flex-1 bg-navy/10" />
          </div>

          {/* Email form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="email"
                name="email"
                placeholder="Email address"
                required
                className="w-full rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm"
              />
            </div>
            <div>
              <input
                type="password"
                name="password"
                placeholder="Password"
                required
                minLength={6}
                className="w-full rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-gold py-3.5 text-center font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? "..."
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>

          {/* Toggle */}
          <p className="mt-6 text-center font-sans text-sm text-navy/50">
            {mode === "signin" ? (
              <>
                Don&rsquo;t have an account?{" "}
                <button
                  onClick={() => { setMode("signup"); setError(null); }}
                  className="font-medium text-gold underline decoration-gold/30 underline-offset-2 hover:decoration-gold"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => { setMode("signin"); setError(null); }}
                  className="font-medium text-gold underline decoration-gold/30 underline-offset-2 hover:decoration-gold"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>

        {/* Back to home */}
        <div className="mt-8 text-center">
          <Link
            href="/"
            className="font-sans text-sm text-navy/40 underline decoration-navy/20 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
