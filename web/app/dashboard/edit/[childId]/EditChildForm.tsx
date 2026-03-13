"use client";

import { useState } from "react";
import { updateChild } from "./actions";
import type { EditableChild } from "./actions";

/* ─── Constants ────────────────────────────────────────────────────────────── */

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

function isDobValid(dob: string): boolean {
  if (!dob) return true;
  const birth = new Date(dob + "T00:00:00");
  const today = new Date();
  if (birth > today) return false;
  const age = calculateAge(dob);
  return age >= 2 && age <= 12;
}

/* ─── Component ────────────────────────────────────────────────────────────── */

export default function EditChildForm({ child }: { child: EditableChild }) {
  const [name, setName] = useState(child.name);
  const [dateOfBirth, setDateOfBirth] = useState(child.date_of_birth);
  const [pronouns, setPronouns] = useState(child.pronouns);
  const [readingLevel, setReadingLevel] = useState(child.reading_level);
  const [interests, setInterests] = useState(
    (child.interests ?? []).join(", ")
  );
  const [avoidances, setAvoidances] = useState(
    (child.avoidances ?? []).join(", ")
  );
  const [defaultArchetype, setDefaultArchetype] = useState(
    child.default_archetype ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const dobTouched = dateOfBirth !== child.date_of_birth;
  const dobValid = isDobValid(dateOfBirth);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!dateOfBirth) {
      setError("Date of birth is required.");
      return;
    }
    if (!isDobValid(dateOfBirth)) {
      setError("Please enter a valid birthday for a child aged 2–12.");
      return;
    }

    setLoading(true);

    const result = await updateChild(child.id, {
      name: name.trim(),
      dateOfBirth,
      pronouns,
      readingLevel,
      interests,
      avoidances,
      defaultArchetype,
    });

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <>
      {/* Page header */}
      <div className="py-6">
        <h1 className="font-serif text-2xl font-bold text-navy md:text-3xl">
          Edit {child.name}&rsquo;s profile
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="font-sans text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* About */}
        <div className="rounded-2xl bg-white p-6 shadow-warm md:p-8">
          <h2 className="mb-6 font-serif text-lg font-semibold text-navy">
            About
          </h2>

          <div className="space-y-5">
            {/* Name */}
            <div>
              <label className="mb-2 block font-sans text-sm font-medium text-navy">
                Child&rsquo;s name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm"
              />
            </div>

            {/* Date of birth */}
            <div>
              <label className="mb-2 block font-sans text-sm font-medium text-navy">
                Date of birth
              </label>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
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

            {/* Gender */}
            <div>
              <label className="mb-2 block font-sans text-sm font-medium text-navy">
                Gender
              </label>
              <div className="flex flex-wrap gap-2">
                {PRONOUNS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPronouns(p.value)}
                    className={`rounded-full px-5 py-2.5 font-sans text-sm font-medium transition-all ${
                      pronouns === p.value
                        ? "bg-gold text-white shadow-warm"
                        : "border border-navy/15 bg-white text-navy/60 hover:border-gold/40 hover:text-gold"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reading level */}
            <div>
              <label className="mb-2 block font-sans text-sm font-medium text-navy">
                Reading level
              </label>
              <select
                value={readingLevel}
                onChange={(e) => setReadingLevel(e.target.value)}
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
        </div>

        {/* Their world */}
        <div className="rounded-2xl bg-white p-6 shadow-warm md:p-8">
          <h2 className="mb-6 font-serif text-lg font-semibold text-navy">
            Their world
          </h2>

          <div className="space-y-5">
            {/* Interests */}
            <div>
              <label className="mb-2 block font-sans text-sm font-medium text-navy">
                What are they into right now?
              </label>
              <textarea
                value={interests}
                onChange={(e) => setInterests(e.target.value.slice(0, 300))}
                placeholder="dinosaurs, painting, her cat Whiskers..."
                rows={3}
                className="w-full rounded-2xl border border-navy/15 bg-white px-6 py-4 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm resize-none"
              />
              <div className="mt-1.5 flex items-center justify-between">
                <p className="font-sans text-xs text-navy/40">
                  Comma-separated. Updates carry into the next story.
                </p>
                <span
                  className={`font-sans text-xs ${
                    interests.length > 250 ? "text-gold" : "text-navy/30"
                  }`}
                >
                  {interests.length}/300
                </span>
              </div>
            </div>

            {/* Avoidances */}
            <div>
              <label className="mb-2 block font-sans text-sm font-medium text-navy">
                Things to avoid in stories
              </label>
              <textarea
                value={avoidances}
                onChange={(e) => setAvoidances(e.target.value.slice(0, 300))}
                placeholder="spiders, loud thunder, getting lost..."
                rows={3}
                className="w-full rounded-2xl border border-navy/15 bg-white px-6 py-4 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm resize-none"
              />
              <div className="mt-1.5 flex items-center justify-between">
                <p className="font-sans text-xs text-navy/40">
                  These are hard limits. They will never appear in any story.
                </p>
                <span
                  className={`font-sans text-xs ${
                    avoidances.length > 250 ? "text-gold" : "text-navy/30"
                  }`}
                >
                  {avoidances.length}/300
                </span>
              </div>
            </div>

            {/* Character archetype */}
            <div>
              <label className="mb-2 block font-sans text-sm font-medium text-navy">
                Favourite character right now
                <span className="ml-1 font-normal text-navy/40">(optional)</span>
              </label>
              <input
                type="text"
                value={defaultArchetype}
                onChange={(e) => setDefaultArchetype(e.target.value)}
                placeholder="Elsa, Superman, a friendly dragon..."
                className="w-full rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm"
              />
              <p className="mt-1.5 font-sans text-xs text-navy/40">
                We&rsquo;ll reimagine them as an original companion — no
                trademarked characters used.
              </p>
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-gold py-3.5 text-center font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Saving...
            </span>
          ) : (
            "Save changes"
          )}
        </button>
      </form>
    </>
  );
}
