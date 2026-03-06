"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { saveChildProfile } from "./actions";

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface FormState {
  // Step 1
  name: string;
  dateOfBirth: string;
  pronouns: string;
  readingLevel: string;
  // Step 2
  interests: string;
  avoidances: string;
  defaultArchetype: string;
  // Step 3
  parentFirstName: string;
  shippingName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

const INITIAL_STATE: FormState = {
  name: "",
  dateOfBirth: "",
  pronouns: "boy",
  readingLevel: "early_reader",
  interests: "",
  avoidances: "",
  defaultArchetype: "",
  parentFirstName: "",
  shippingName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  zip: "",
  country: "US",
};

const PRONOUNS = [
  { value: "boy", label: "Boy" },
  { value: "girl", label: "Girl" },
];

const READING_LEVELS = [
  { value: "pre_reader", label: "Pre-reader (3–4)" },
  { value: "early_reader", label: "Early reader (4–6)" },
  { value: "independent", label: "Independent (6–8)" },
  { value: "chapter_book", label: "Chapter book (8–10)" },
];

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function getFirstMemoryDropDate(dob: string): string {
  const today = new Date();
  const birth = new Date(dob);

  // Calculate next birthday
  const nextBirthday = new Date(
    today.getFullYear(),
    birth.getMonth(),
    birth.getDate()
  );
  if (nextBirthday <= today) {
    nextBirthday.setFullYear(nextBirthday.getFullYear() + 1);
  }

  // If birthday is within 8 weeks, Q4 window opens now
  const eightWeeksMs = 8 * 7 * 24 * 60 * 60 * 1000;
  if (nextBirthday.getTime() - today.getTime() <= eightWeeksMs) {
    return "Now — your birthday book window is open!";
  }

  // Otherwise, next Q1 window opens Jan 15
  const nextYear =
    today.getMonth() === 0 && today.getDate() < 15
      ? today.getFullYear()
      : today.getFullYear() + 1;
  return `January 15, ${nextYear}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/* ─── Progress Indicator ───────────────────────────────────────────────────── */

function ProgressIndicator({
  step,
  totalSteps,
  labels,
}: {
  step: number;
  totalSteps: number;
  labels: string[];
}) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 py-4">
      {labels.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === step;
        const isComplete = stepNum < step;

        return (
          <div key={label} className="flex items-center gap-2">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full font-sans text-sm font-semibold transition-colors ${
                  isActive
                    ? "bg-gold text-white"
                    : isComplete
                      ? "bg-gold/20 text-gold"
                      : "bg-navy/5 text-navy/30"
                }`}
              >
                {isComplete ? (
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              <span
                className={`mt-1 hidden font-sans text-xs sm:block ${
                  isActive
                    ? "font-medium text-gold"
                    : isComplete
                      ? "text-gold/60"
                      : "text-navy/30"
                }`}
              >
                {label}
              </span>
            </div>
            {stepNum < totalSteps && (
              <div
                className={`h-px w-8 sm:w-12 ${
                  isComplete ? "bg-gold/30" : "bg-navy/10"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── DOB Validation ───────────────────────────────────────────────────────── */

function isDobValid(dob: string): boolean {
  if (!dob) return true; // empty is not invalid, just incomplete
  const birth = new Date(dob + "T00:00:00");
  const today = new Date();
  if (birth > today) return false;
  const age = calculateAge(dob);
  return age >= 2 && age <= 12;
}

/* ─── Step Components ──────────────────────────────────────────────────────── */

function StepAbout({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (updates: Partial<FormState>) => void;
}) {
  const dobTouched = form.dateOfBirth !== "";
  const dobValid = isDobValid(form.dateOfBirth);
  return (
    <div className="space-y-6">
      <div>
        <label className="mb-2 block font-sans text-sm font-medium text-navy">
          Child&rsquo;s name
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Aria"
          required
          className="w-full rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm"
        />
      </div>

      <div>
        <label className="mb-2 block font-sans text-sm font-medium text-navy">
          Date of birth
        </label>
        <input
          type="date"
          value={form.dateOfBirth}
          onChange={(e) => onChange({ dateOfBirth: e.target.value })}
          max={new Date().toISOString().split("T")[0]}
          required
          className={`w-full rounded-full border bg-white px-6 py-3.5 font-sans text-base text-navy outline-none transition-shadow focus:shadow-warm ${
            dobTouched && !dobValid
              ? "border-red-300 focus:border-red-400"
              : "border-navy/15 focus:border-gold"
          }`}
        />
        {dobTouched && !dobValid && (
          <p className="mt-1.5 font-sans text-xs text-red-500">
            Please enter a valid birthday for a child aged 2–12.
          </p>
        )}
      </div>

      <div>
        <label className="mb-2 block font-sans text-sm font-medium text-navy">
          Pronouns
        </label>
        <div className="flex flex-wrap gap-2">
          {PRONOUNS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange({ pronouns: p.value })}
              className={`rounded-full px-5 py-2.5 font-sans text-sm font-medium transition-all ${
                form.pronouns === p.value
                  ? "bg-gold text-white shadow-warm"
                  : "border border-navy/15 bg-white text-navy/60 hover:border-gold/40 hover:text-gold"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block font-sans text-sm font-medium text-navy">
          Reading level
        </label>
        <select
          value={form.readingLevel}
          onChange={(e) => onChange({ readingLevel: e.target.value })}
          className="w-full rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy outline-none transition-shadow focus:border-gold focus:shadow-warm appearance-none"
        >
          {READING_LEVELS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function StepWorld({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (updates: Partial<FormState>) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <label className="mb-2 block font-sans text-sm font-medium text-navy">
          What are they into right now?
        </label>
        <textarea
          value={form.interests}
          onChange={(e) => onChange({ interests: e.target.value })}
          placeholder="dinosaurs, painting, her cat Whiskers..."
          rows={3}
          className="w-full rounded-2xl border border-navy/15 bg-white px-6 py-4 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm resize-none"
        />
      </div>

      <div>
        <label className="mb-2 block font-sans text-sm font-medium text-navy">
          Things to avoid in stories
        </label>
        <textarea
          value={form.avoidances}
          onChange={(e) => onChange({ avoidances: e.target.value })}
          placeholder="spiders, loud thunder, getting lost..."
          rows={3}
          className="w-full rounded-2xl border border-navy/15 bg-white px-6 py-4 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm resize-none"
        />
        <p className="mt-1.5 font-sans text-xs text-navy/40">
          These are hard limits. They will never appear in any story.
        </p>
      </div>

      <div>
        <label className="mb-2 block font-sans text-sm font-medium text-navy">
          Favourite character right now
        </label>
        <input
          type="text"
          value={form.defaultArchetype}
          onChange={(e) => onChange({ defaultArchetype: e.target.value })}
          placeholder="Elsa, Superman, a friendly dragon — anything they love"
          className="w-full rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm"
        />
        <p className="mt-1.5 font-sans text-xs text-navy/40">
          We&rsquo;ll reimagine them as an original companion in your
          child&rsquo;s story.
        </p>
      </div>
    </div>
  );
}

function StepAddress({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (updates: Partial<FormState>) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block font-sans text-sm font-medium text-navy">
          Your first name
        </label>
        <input
          type="text"
          value={form.parentFirstName}
          onChange={(e) => onChange({ parentFirstName: e.target.value })}
          placeholder="Sarah"
          required
          className="w-full rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm"
        />
        <p className="mt-1.5 font-sans text-xs text-navy/40">
          So we know what to call you.
        </p>
      </div>

      <div>
        <label className="mb-2 block font-sans text-sm font-medium text-navy">
          Full name (recipient)
        </label>
        <input
          type="text"
          value={form.shippingName}
          onChange={(e) => onChange({ shippingName: e.target.value })}
          placeholder="Jordan Tester"
          required
          className="w-full rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm"
        />
      </div>

      <div>
        <label className="mb-2 block font-sans text-sm font-medium text-navy">
          Address line 1
        </label>
        <input
          type="text"
          value={form.addressLine1}
          onChange={(e) => onChange({ addressLine1: e.target.value })}
          placeholder="123 Storybook Lane"
          required
          className="w-full rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm"
        />
      </div>

      <div>
        <label className="mb-2 block font-sans text-sm font-medium text-navy">
          Address line 2{" "}
          <span className="font-normal text-navy/40">(optional)</span>
        </label>
        <input
          type="text"
          value={form.addressLine2}
          onChange={(e) => onChange({ addressLine2: e.target.value })}
          placeholder="Apt 4B"
          className="w-full rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="mb-2 block font-sans text-sm font-medium text-navy">
            City
          </label>
          <input
            type="text"
            value={form.city}
            onChange={(e) => onChange({ city: e.target.value })}
            required
            className="w-full rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy outline-none transition-shadow focus:border-gold focus:shadow-warm"
          />
        </div>
        <div>
          <label className="mb-2 block font-sans text-sm font-medium text-navy">
            State
          </label>
          <input
            type="text"
            value={form.state}
            onChange={(e) => onChange({ state: e.target.value })}
            placeholder="CA"
            required
            className="w-full rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy outline-none transition-shadow focus:border-gold focus:shadow-warm"
          />
        </div>
        <div>
          <label className="mb-2 block font-sans text-sm font-medium text-navy">
            Zip
          </label>
          <input
            type="text"
            value={form.zip}
            onChange={(e) => onChange({ zip: e.target.value })}
            placeholder="90210"
            required
            className="w-full rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy outline-none transition-shadow focus:border-gold focus:shadow-warm"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block font-sans text-sm font-medium text-navy">
          Country
        </label>
        <input
          type="text"
          value={form.country}
          onChange={(e) => onChange({ country: e.target.value })}
          className="w-full rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy outline-none transition-shadow focus:border-gold focus:shadow-warm"
        />
      </div>

      <p className="font-sans text-xs text-navy/40">
        We ship within the US. International? Choose digital-only on the
        previous step.
      </p>
    </div>
  );
}

function StepConfirm({
  form,
  isAdditional,
}: {
  form: FormState;
  isAdditional: boolean;
}) {
  const age = form.dateOfBirth ? calculateAge(form.dateOfBirth) : null;
  const memoryDropDate = form.dateOfBirth
    ? getFirstMemoryDropDate(form.dateOfBirth)
    : "—";

  const pronounLabel =
    PRONOUNS.find((p) => p.value === form.pronouns)?.label ?? "—";
  const readingLabel =
    READING_LEVELS.find((r) => r.value === form.readingLevel)?.label ?? "—";

  return (
    <div className="space-y-6">
      {/* Child summary */}
      <div className="rounded-2xl border border-navy/10 bg-cream-warm p-6">
        <h3 className="font-serif text-xl font-semibold text-navy">
          {form.name.charAt(0).toUpperCase() + form.name.slice(1)}
          {age !== null && (
            <span className="text-navy/50">, age {age}</span>
          )}
        </h3>
        <div className="mt-4 space-y-2 font-sans text-sm text-navy/70">
          <p>
            <span className="font-medium text-navy/50">Birthday:</span>{" "}
            {form.dateOfBirth ? formatDate(form.dateOfBirth) : "—"}
          </p>
          <p>
            <span className="font-medium text-navy/50">Pronouns:</span>{" "}
            {pronounLabel}
          </p>
          <p>
            <span className="font-medium text-navy/50">Reading level:</span>{" "}
            {readingLabel}
          </p>
          {form.interests && (
            <p>
              <span className="font-medium text-navy/50">Interests:</span>{" "}
              {form.interests.split(",").map((s) => s.trim()).filter(Boolean).join(", ")}
            </p>
          )}
          {form.avoidances && (
            <p>
              <span className="font-medium text-navy/50">Avoidances:</span>{" "}
              {form.avoidances.split(",").map((s) => s.trim()).filter(Boolean).join(", ")}
            </p>
          )}
          {form.defaultArchetype && (
            <p>
              <span className="font-medium text-navy/50">Companion:</span>{" "}
              {form.defaultArchetype}
            </p>
          )}
        </div>
      </div>

      {/* Address summary */}
      {!isAdditional && form.addressLine1 && (
        <div className="rounded-2xl border border-navy/10 bg-cream-warm p-6">
          <h3 className="font-serif text-lg font-semibold text-navy">
            Delivery address
          </h3>
          <div className="mt-3 font-sans text-sm leading-relaxed text-navy/70">
            <p>{form.shippingName}</p>
            <p>{form.addressLine1}</p>
            {form.addressLine2 && <p>{form.addressLine2}</p>}
            <p>
              {form.city}, {form.state} {form.zip}
            </p>
            <p>{form.country}</p>
          </div>
        </div>
      )}

      {/* First memory drop */}
      <div className="rounded-2xl border border-gold/20 bg-gold/5 p-6">
        <p className="font-sans text-sm font-medium text-gold">
          First memory drop
        </p>
        <p className="mt-1 font-serif text-lg font-semibold text-navy">
          {memoryDropDate}
        </p>
        <p className="mt-3 font-sans text-sm leading-relaxed text-navy/60">
          We&rsquo;ll send you an email when it&rsquo;s time to share{" "}
          {form.name || "your child"}&rsquo;s first memory.
        </p>
      </div>
    </div>
  );
}

/* ─── Main Wizard ──────────────────────────────────────────────────────────── */

function OnboardingWizard() {
  const searchParams = useSearchParams();
  const isPaid = searchParams.get("paid") === "true";
  const isAdditional = searchParams.get("additional") === "true";
  const subscriptionType = searchParams.get("type") || "founding";

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onChange = (updates: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  };

  // If additional child, steps are: About → World → Confirm (skip address)
  const steps = isAdditional
    ? ["About", "Their world", "Confirm"]
    : ["About", "Their world", "Address", "Confirm"];
  const totalSteps = steps.length;
  const isLastStep = step === totalSteps;

  // Map logical step to content
  function getStepContent() {
    if (isAdditional) {
      switch (step) {
        case 1:
          return <StepAbout form={form} onChange={onChange} />;
        case 2:
          return <StepWorld form={form} onChange={onChange} />;
        case 3:
          return <StepConfirm form={form} isAdditional={isAdditional} />;
      }
    } else {
      switch (step) {
        case 1:
          return <StepAbout form={form} onChange={onChange} />;
        case 2:
          return <StepWorld form={form} onChange={onChange} />;
        case 3:
          return <StepAddress form={form} onChange={onChange} />;
        case 4:
          return <StepConfirm form={form} isAdditional={isAdditional} />;
      }
    }
  }

  function getStepTitle(): string {
    if (isAdditional) {
      switch (step) {
        case 1:
          return "About your child";
        case 2:
          return "Their world";
        case 3:
          return "Your story begins";
        default:
          return "";
      }
    }
    switch (step) {
      case 1:
        return "About your child";
      case 2:
        return "Their world";
      case 3:
        return "Where to send it";
      case 4:
        return "Your story begins";
      default:
        return "";
    }
  }

  // Validation per step
  function canProceed(): boolean {
    if (isAdditional) {
      switch (step) {
        case 1:
          return Boolean(form.name && form.dateOfBirth && isDobValid(form.dateOfBirth));
        case 2:
          return true;
        default:
          return true;
      }
    }
    switch (step) {
      case 1:
        return Boolean(form.name && form.dateOfBirth && isDobValid(form.dateOfBirth));
      case 2:
        return true;
      case 3:
        return Boolean(
          form.parentFirstName &&
            form.shippingName &&
            form.addressLine1 &&
            form.city &&
            form.state &&
            form.zip
        );
      default:
        return true;
    }
  }

  const handleNext = () => {
    if (step < totalSteps) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    const result = await saveChildProfile({
      ...form,
      subscriptionType,
    });
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // On success, saveChildProfile redirects to /dashboard
  };

  return (
    <div className="mx-auto max-w-lg px-6 pb-16">
      {/* Paid banner */}
      {isPaid && step === 1 && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="font-sans text-sm text-green-700">
            Payment confirmed — let&rsquo;s set up your child&rsquo;s story.
          </p>
        </div>
      )}

      {/* Additional child banner */}
      {isAdditional && step === 1 && (
        <div className="mb-6 rounded-lg border border-gold/20 bg-gold/5 px-4 py-3">
          <p className="font-sans text-sm text-gold">
            Adding another child to your account.
          </p>
        </div>
      )}

      {/* Progress */}
      <ProgressIndicator step={step} totalSteps={totalSteps} labels={steps} />

      {/* Step card */}
      <div className="mt-8 rounded-2xl bg-white p-8 shadow-warm md:p-10">
        <h2 className="mb-6 font-serif text-2xl font-bold text-navy">
          {getStepTitle()}
        </h2>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="font-sans text-sm text-red-700">{error}</p>
          </div>
        )}

        {getStepContent()}

        {/* Navigation buttons */}
        <div className="mt-8 flex items-center gap-4">
          {step > 1 && (
            <button
              type="button"
              onClick={handleBack}
              className="rounded-full border border-navy/15 px-6 py-3 font-sans text-sm font-medium text-navy/60 transition-all hover:border-gold/40 hover:text-gold"
            >
              Back
            </button>
          )}
          <div className="flex-1" />
          {isLastStep ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="rounded-full bg-gold px-8 py-3.5 font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Setting up your story...
                </span>
              ) : (
                "Begin our story \u2192"
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canProceed()}
              className="rounded-full bg-gold px-8 py-3.5 font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingWizard />
    </Suspense>
  );
}
