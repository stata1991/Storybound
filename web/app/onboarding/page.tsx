"use client";

import { useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { saveChildProfile, submitOnboardingMemoryDrop } from "./actions";
import StepPhotos from "./StepPhotos";
import MemoryPhotoUpload from "@/app/components/MemoryPhotoUpload";
import type { MemoryPhotoUploadRef } from "@/app/components/MemoryPhotoUpload";

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

interface MemoryDropState {
  milestone: string;
  currentInterests: string;
  notes: string;
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

const INITIAL_MEMORY_DROP: MemoryDropState = {
  milestone: "",
  currentInterests: "",
  notes: "",
};

const PRONOUNS = [
  { value: "boy", label: "Boy" },
  { value: "girl", label: "Girl" },
];

const READING_LEVELS = [
  { value: "pre_reader", label: "Pre-reader (3\u20134)" },
  { value: "early_reader", label: "Early reader (4\u20136)" },
  { value: "independent", label: "Independent (6\u20138)" },
  { value: "chapter_book", label: "Chapter book (8\u201310)" },
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
  if (!dob) return true;
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
            Please enter a valid birthday for a child aged 2\u201312.
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

function StepMemoryDrop({
  childName,
  memoryDrop,
  onChange,
  childId,
  harvestId,
  photoRef,
}: {
  childName: string;
  memoryDrop: MemoryDropState;
  onChange: (updates: Partial<MemoryDropState>) => void;
  childId: string | null;
  harvestId: string | null;
  photoRef: React.Ref<MemoryPhotoUploadRef>;
}) {
  const name = childName
    ? childName.charAt(0).toUpperCase() + childName.slice(1)
    : "your child";

  return (
    <div className="space-y-6">
      <p className="font-sans text-sm leading-relaxed text-navy/50">
        Share a few things about {name}&rsquo;s world right now. These details
        bring their first story to life.
      </p>

      <div>
        <label className="mb-2 block font-sans text-sm font-medium text-navy">
          Biggest milestone lately
        </label>
        <textarea
          value={memoryDrop.milestone}
          onChange={(e) => onChange({ milestone: e.target.value })}
          placeholder="Lost their first tooth, learned to ride a bike, started kindergarten..."
          rows={3}
          className="w-full rounded-2xl border border-navy/15 bg-white px-6 py-4 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm resize-none"
        />
      </div>

      <div>
        <label className="mb-2 block font-sans text-sm font-medium text-navy">
          What are they obsessed with right now?
        </label>
        <textarea
          value={memoryDrop.currentInterests}
          onChange={(e) => onChange({ currentInterests: e.target.value })}
          placeholder="dinosaurs, building forts, a specific song they play on repeat..."
          rows={3}
          className="w-full rounded-2xl border border-navy/15 bg-white px-6 py-4 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm resize-none"
        />
      </div>

      <div>
        <label className="mb-2 block font-sans text-sm font-medium text-navy">
          Anything else we should know?{" "}
          <span className="font-normal text-navy/40">(optional)</span>
        </label>
        <textarea
          value={memoryDrop.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="New sibling on the way, just moved to a new house, loves bedtime stories about..."
          rows={2}
          className="w-full rounded-2xl border border-navy/15 bg-white px-6 py-4 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm resize-none"
        />
      </div>

      {/* Photo upload (optional) */}
      {childId && harvestId && (
        <>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-navy/10" />
            <span className="font-sans text-xs font-medium text-navy/40">
              Add photos from this season (optional)
            </span>
            <div className="h-px flex-1 bg-navy/10" />
          </div>
          <p className="font-sans text-xs text-navy/40">
            These help us illustrate your child&rsquo;s world.
          </p>
          <MemoryPhotoUpload
            ref={photoRef}
            childId={childId}
            harvestId={harvestId}
            onComplete={() => {}}
          />
          <p className="text-center font-sans text-xs text-navy/30">
            Skip for now — you can add photos later from your dashboard.
          </p>
        </>
      )}
    </div>
  );
}

function StepConfirmation({ childName }: { childName: string }) {
  const name = childName
    ? childName.charAt(0).toUpperCase() + childName.slice(1)
    : "Your child";

  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gold/10">
        <svg
          className="h-8 w-8 text-gold"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>

      <h3 className="font-serif text-xl font-semibold text-navy">
        {name}&rsquo;s story is being created!
      </h3>

      <p className="font-sans text-sm leading-relaxed text-navy/60">
        Our team is crafting a one-of-a-kind book using everything you&rsquo;ve
        shared. We&rsquo;ll email you when it&rsquo;s ready to preview.
      </p>

      <div className="rounded-2xl border border-gold/20 bg-gold/5 p-6">
        <p className="font-sans text-sm font-medium text-gold">
          What happens next?
        </p>
        <ul className="mt-3 space-y-2 text-left font-sans text-sm text-navy/60">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-gold">1.</span>
            We write and illustrate {name}&rsquo;s story
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-gold">2.</span>
            You get an email to preview the book
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-gold">3.</span>
            Choose to keep it digital (free) or get it printed
          </li>
        </ul>
      </div>
    </div>
  );
}

/* ─── Main Wizard ──────────────────────────────────────────────────────────── */

function OnboardingWizard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isAdditional = searchParams.get("additional") === "true";

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [memoryDrop, setMemoryDrop] = useState<MemoryDropState>(INITIAL_MEMORY_DROP);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [childId, setChildId] = useState<string | null>(null);
  const [harvestId, setHarvestId] = useState<string | null>(null);
  const savingRef = useRef(false);
  const photoRef = useRef<MemoryPhotoUploadRef>(null);

  const onChange = (updates: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  };

  const onMemoryDropChange = (updates: Partial<MemoryDropState>) => {
    setMemoryDrop((prev) => ({ ...prev, ...updates }));
  };

  // Step layout differs based on additional child flow
  // Normal:     About → World → Address → Photos → Memory Drop → Done
  // Additional: About → World → Photos → Memory Drop → Done
  const steps = isAdditional
    ? ["About", "Their world", "Photos", "Memory drop", "Done!"]
    : ["About", "Their world", "Address", "Photos", "Memory drop", "Done!"];
  const totalSteps = steps.length;

  // The step BEFORE photos where we save the profile
  const saveStep = isAdditional ? 2 : 3;
  const photosStep = isAdditional ? 3 : 4;
  const memoryDropStep = isAdditional ? 4 : 5;
  const confirmationStep = isAdditional ? 5 : 6;

  function getStepContent() {
    if (step === confirmationStep) {
      return <StepConfirmation childName={form.name} />;
    }

    if (step === memoryDropStep) {
      return (
        <StepMemoryDrop
          childName={form.name}
          memoryDrop={memoryDrop}
          onChange={onMemoryDropChange}
          childId={childId}
          harvestId={harvestId}
          photoRef={photoRef}
        />
      );
    }

    if (step === photosStep && childId) {
      return (
        <StepPhotos
          childName={form.name}
          childId={childId}
          onComplete={() => setStep(memoryDropStep)}
        />
      );
    }

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
    if (step === confirmationStep) return "You\u2019re all set!";
    if (step === memoryDropStep) {
      const name = form.name
        ? form.name.charAt(0).toUpperCase() + form.name.slice(1)
        : "your child";
      return `${name}\u2019s first memory drop`;
    }
    if (step === photosStep) {
      const name = form.name
        ? form.name.charAt(0).toUpperCase() + form.name.slice(1)
        : "your child";
      return `Bring ${name} to life`;
    }

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
    if (step === memoryDropStep) {
      return Boolean(memoryDrop.milestone && memoryDrop.currentInterests);
    }

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
        // Address step — "Next" requires full address, "Skip" bypasses this
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

  async function handleSaveAndAdvance(skipAddress: boolean) {
    if (savingRef.current) return;
    savingRef.current = true;
    setError(null);
    setLoading(true);

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
    if (result && "childId" in result) {
      setChildId(result.childId as string);
      if ("harvestId" in result && result.harvestId) {
        setHarvestId(result.harvestId as string);
      }
    }
    setLoading(false);
    savingRef.current = false;
    setStep(photosStep);
  }

  const handleNext = async () => {
    // Save profile at the step before photos
    if (step === saveStep && !childId) {
      const skipAddress = isAdditional; // additional children don't fill address
      await handleSaveAndAdvance(skipAddress);
      return;
    }

    // Submit memory drop
    if (step === memoryDropStep && childId) {
      if (savingRef.current) return;
      savingRef.current = true;
      setError(null);
      setLoading(true);

      // Upload any unsaved photos first
      if (photoRef.current?.hasUnsavedPhotos()) {
        const photoResult = await photoRef.current.upload();
        if (!photoResult.success) {
          // Stay on step — component shows its own error
          setLoading(false);
          savingRef.current = false;
          return;
        }
      }

      const result = await submitOnboardingMemoryDrop(childId, memoryDrop);
      if (result && "error" in result) {
        setError(result.error as string);
        setLoading(false);
        savingRef.current = false;
        return;
      }
      setLoading(false);
      savingRef.current = false;
      setStep(confirmationStep);
      return;
    }

    // Confirmation step → go to dashboard
    if (step === confirmationStep) {
      router.push("/dashboard");
      return;
    }

    if (step < totalSteps) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  // Don't show nav buttons on photos step (StepPhotos has its own) or confirmation
  const showNav = step !== photosStep && step !== confirmationStep;

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
        {showNav && (
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
              ) : step === memoryDropStep ? (
                "Submit"
              ) : (
                "Next"
              )}
            </button>
          </div>
        )}

        {/* Confirmation step — go to dashboard */}
        {step === confirmationStep && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded-full bg-gold px-8 py-3.5 font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg"
            >
              Go to your dashboard
            </button>
          </div>
        )}
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
