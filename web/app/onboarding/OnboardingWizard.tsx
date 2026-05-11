"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { saveChildProfile, saveDraft } from "./actions";
import type { OnboardingDraftData } from "./actions";
import ProgressIndicator, {
  STEPS_NORMAL,
  STEPS_ADDITIONAL,
} from "./_shared/ProgressIndicator";

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
  // Step 3 (address — optional)
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
  { value: "pre_reader", label: "Pre-reader (1\u20134)" },
  { value: "early_reader", label: "Early reader (4\u20136)" },
  { value: "independent", label: "Independent (6\u20138)" },
];

/* ─── Fields that trigger immediate save vs debounced save ─────────────────── */

const IMMEDIATE_SAVE_FIELDS = new Set(["pronouns", "readingLevel", "dateOfBirth"]);

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

function isDobValid(dob: string): boolean {
  if (!dob) return true;
  const birth = new Date(dob + "T00:00:00");
  const today = new Date();
  if (birth > today) return false;
  const age = calculateAge(dob);
  return age >= 1 && age <= 8;
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
            Please enter a valid birthday for a child aged 1–8.
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
          placeholder="Elsa, Superman, a friendly dragon \u2014 anything they love"
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
  onSkip,
}: {
  form: FormState;
  onChange: (updates: Partial<FormState>) => void;
  onSkip: () => void;
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
        We currently ship within the US.
      </p>

      <button
        type="button"
        onClick={onSkip}
        className="mt-2 w-full rounded-full border border-navy/10 py-3 font-sans text-sm text-navy/50 transition-all hover:border-gold/30 hover:text-gold"
      >
        Skip for now
      </button>
    </div>
  );
}

/* ─── Draft save helper ────────────────────────────────────────────────────── */

function buildDraftData(
  step: number,
  isAdditional: boolean,
  form: FormState
): OnboardingDraftData {
  return {
    step,
    isAdditional,
    form,
    memoryDrop: { milestone: "", notes: "" },
  };
}

/* ─── Props ────────────────────────────────────────────────────────────────── */

interface OnboardingWizardProps {
  isAdditional: boolean;
  initialDraft?: OnboardingDraftData;
  initialChildId?: string | null;
}

/* ─── Main Wizard ──────────────────────────────────────────────────────────── */

export default function OnboardingWizard({
  isAdditional,
  initialDraft,
  initialChildId,
}: OnboardingWizardProps) {
  const router = useRouter();

  // Full-journey labels for the progress indicator (shared across all routes)
  const progressLabels = isAdditional ? STEPS_ADDITIONAL : STEPS_NORMAL;

  // The wizard handles steps 1–3 (normal) or 1–2 (additional).
  // Photos and memory drop are separate routes.
  const saveStep = isAdditional ? 2 : 3;

  // Defensive clamp: if draft has step >= saveStep+1 (i.e. beyond the wizard),
  // ignore it and start at the highest valid wizard step.
  const clampedInitialStep = initialDraft
    ? Math.min(initialDraft.step, saveStep)
    : 1;

  const [step, setStep] = useState(clampedInitialStep);
  const [form, setForm] = useState<FormState>(initialDraft?.form ?? INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [childId, setChildId] = useState<string | null>(initialChildId ?? null);
  const savingRef = useRef(false);

  // ── Hydration guard: don't save on initial mount ──────────────────────────
  const hasHydrated = useRef(false);
  useEffect(() => {
    hasHydrated.current = true;
  }, []);

  // ── Debounced draft save for text fields ──────────────────────────────────
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSave = useCallback(
    (currentStep: number, currentForm: FormState) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        const data = buildDraftData(currentStep, isAdditional, currentForm);
        saveDraft(data, childId).catch((err) =>
          console.error("[draft] debounced save failed:", err)
        );
      }, 500);
    },
    [isAdditional, childId]
  );

  // ── Immediate draft save for discrete fields ──────────────────────────────
  const immediateSave = useCallback(
    (currentStep: number, currentForm: FormState) => {
      const data = buildDraftData(currentStep, isAdditional, currentForm);
      saveDraft(data, childId).catch((err) =>
        console.error("[draft] immediate save failed:", err)
      );
    },
    [isAdditional, childId]
  );

  // ── onChange that routes to debounced or immediate save ────────────────────
  const onChange = (updates: Partial<FormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...updates };

      if (hasHydrated.current) {
        // Check if any updated field is an immediate-save field
        const isImmediate = Object.keys(updates).some((k) =>
          IMMEDIATE_SAVE_FIELDS.has(k)
        );
        if (isImmediate) {
          immediateSave(step, next);
        } else {
          debouncedSave(step, next);
        }
      }

      return next;
    });
  };

  // ── Cleanup debounce timer on unmount ─────────────────────────────────────
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // ── Step content ──────────────────────────────────────────────────────────
  function getStepContent() {
    if (isAdditional) {
      switch (step) {
        case 1:
          return <StepAbout form={form} onChange={onChange} />;
        case 2:
          return <StepWorld form={form} onChange={onChange} />;
      }
    } else {
      switch (step) {
        case 1:
          return <StepAbout form={form} onChange={onChange} />;
        case 2:
          return <StepWorld form={form} onChange={onChange} />;
        case 3:
          return (
            <StepAddress
              form={form}
              onChange={onChange}
              onSkip={() => handleSaveAndAdvance(true)}
            />
          );
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
        return "Where should we ship?";
      default:
        return "";
    }
  }

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

  // ── Save profile + redirect to character photos ───────────────────────────
  async function handleSaveAndAdvance(skipAddress: boolean) {
    if (savingRef.current) return;
    savingRef.current = true;
    setError(null);
    setLoading(true);

    // Flush any pending debounced save
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const profileData = skipAddress
      ? { ...form, addressLine1: "", shippingName: "", city: "", state: "", zip: "" }
      : form;

    const result = await saveChildProfile(profileData);
    if (result && "error" in result) {
      setError(result.error as string);
      setLoading(false);
      savingRef.current = false;
      return;
    }

    let newChildId: string | null = null;
    if (result && "childId" in result) {
      newChildId = result.childId as string;
      setChildId(newChildId);
    }

    setLoading(false);
    savingRef.current = false;

    // Redirect to character photos route
    if (newChildId) {
      router.push(`/onboarding/character-photos/${newChildId}`);
    }
  }

  // ── Step navigation ───────────────────────────────────────────────────────
  const handleNext = async () => {
    // At the last wizard step, save profile and redirect
    if (step === saveStep && !childId) {
      const skipAddress = isAdditional;
      await handleSaveAndAdvance(skipAddress);
      return;
    }

    // For intermediate steps, save immediately with new step number, then advance
    const nextStep = step + 1;
    if (nextStep <= saveStep) {
      // Flush debounce and save immediately with the NEW step number
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      const data = buildDraftData(nextStep, isAdditional, form);
      saveDraft(data, childId).catch((err) =>
        console.error("[draft] step-advance save failed:", err)
      );
      setStep(nextStep);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      const prevStep = step - 1;
      // Save immediately with the new step number
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      const data = buildDraftData(prevStep, isAdditional, form);
      saveDraft(data, childId).catch((err) =>
        console.error("[draft] step-back save failed:", err)
      );
      setStep(prevStep);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-6 pb-16">
      {/* Additional child banner */}
      {isAdditional && step === 1 && (
        <div className="mb-6 rounded-lg border border-gold/20 bg-gold/5 px-4 py-3">
          <p className="font-sans text-sm text-gold">
            Adding another child to your account.
          </p>
        </div>
      )}

      {/* Progress */}
      <ProgressIndicator currentStep={step} labels={progressLabels} />

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
          <button
            type="button"
            onClick={handleNext}
            disabled={!canProceed() || loading}
            className="rounded-full bg-gold px-8 py-3.5 font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </span>
            ) : (
              "Next"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
