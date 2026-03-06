"use client";

import { useState } from "react";

const STRIPE_FOUNDING_LINK = "{STRIPE_FOUNDING_LINK}";
const STRIPE_GIFT_LINK = "{STRIPE_GIFT_LINK}";
const STRIPE_ONETIME_LINK = "{STRIPE_ONETIME_LINK}";
const STRIPE_FOUNDING_DIGITAL_LINK = "{STRIPE_FOUNDING_DIGITAL_LINK}";
const STRIPE_GIFT_DIGITAL_LINK = "{STRIPE_GIFT_DIGITAL_LINK}";
const STRIPE_ONETIME_DIGITAL_LINK = "{STRIPE_ONETIME_DIGITAL_LINK}";

/* ─── Hero ─────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="bg-cream px-6 py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-4 font-sans text-sm font-medium uppercase tracking-widest text-gold">
          A quarterly storybook subscription
        </p>
        <h1 className="font-serif text-4xl font-bold leading-tight text-navy md:text-5xl lg:text-6xl">
          Most personalized storybooks change the name.{" "}
          <span className="text-gold">We change the story.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl font-sans text-lg leading-relaxed text-navy/70 md:text-xl">
          Storybound delivers 4 quarterly illustrated chapter books where your
          child is the actual hero — built from who they actually are right now.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href={STRIPE_FOUNDING_LINK}
            className="w-full rounded-full bg-gold px-8 py-4 text-center font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg sm:w-auto"
          >
            Join as a Founding Member — $89/year
          </a>
          <a
            href={STRIPE_GIFT_LINK}
            className="w-full rounded-full border-2 border-gold px-8 py-4 text-center font-sans text-base font-semibold text-gold transition-all hover:bg-gold hover:text-white sm:w-auto"
          >
            Give as a Gift — $89
          </a>
        </div>
        <a
          href={STRIPE_ONETIME_LINK}
          className="mt-4 inline-block font-sans text-sm text-navy/50 underline decoration-navy/20 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold"
        >
          Just want one book? Try a single story — $29
        </a>
      </div>
    </section>
  );
}

/* ─── How It Works ─────────────────────────────────────────────────────────── */

const STEPS = [
  {
    number: "01",
    title: "Share their world",
    description:
      "Four times a year, tell us what happened. Upload 2\u20133 photos, describe their biggest milestone, and tell us which character they\u2019re obsessed with right now. Takes 5 minutes.",
  },
  {
    number: "02",
    title: "We write the chapter",
    description:
      "Our story engine builds a personalized illustrated adventure \u2014 your child as the hero, their milestone woven into the plot, their favorite character as their loyal companion.",
  },
  {
    number: "03",
    title: "It arrives on their birthday",
    description:
      "Every year, the most special book lands at their door 1\u20132 weeks before their birthday. Timed to the day.",
  },
];

function HowItWorks() {
  return (
    <section className="bg-cream-warm px-6 py-24 md:py-32">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center font-serif text-3xl font-bold text-navy md:text-4xl">
          How it works
        </h2>
        <div className="mt-16 grid gap-12 md:grid-cols-3 md:gap-8">
          {STEPS.map((step) => (
            <div key={step.number} className="text-center md:text-left">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 font-serif text-lg font-bold text-gold">
                {step.number}
              </div>
              <h3 className="font-serif text-xl font-semibold text-navy">
                {step.title}
              </h3>
              <p className="mt-3 font-sans text-base leading-relaxed text-navy/70">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Why It's Different ───────────────────────────────────────────────────── */

const DIFFERENTIATORS = [
  {
    text: "Their milestone is the plot. Not decoration.",
    detail:
      "Lost their first tooth? That becomes the adventure. Learned to ride a bike? That\u2019s the quest. Real moments, real story.",
  },
  {
    text: "Their favorite character shows up \u2014 reimagined as their adventure companion.",
    detail:
      "Tell us they love dinosaurs or a certain ice princess. We\u2019ll create an original companion inspired by that obsession, right by their side.",
  },
  {
    text: "Year 3 references Year 1. The story grows with them.",
    detail:
      "Each book remembers every adventure before it. The birthday book in Year 3 calls back to their very first chapter. That\u2019s continuity you can\u2019t buy as a one-time gift.",
  },
];

function WhyDifferent() {
  return (
    <section className="bg-cream px-6 py-24 md:py-32">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center font-serif text-3xl font-bold text-navy md:text-4xl">
          Why it&rsquo;s different
        </h2>
        <div className="mt-16 space-y-8">
          {DIFFERENTIATORS.map((item, i) => (
            <div
              key={i}
              className="rounded-2xl bg-white p-8 shadow-warm md:p-10"
            >
              <p className="font-serif text-xl font-semibold leading-snug text-navy md:text-2xl">
                &ldquo;{item.text}&rdquo;
              </p>
              <p className="mt-4 font-sans text-base leading-relaxed text-navy/60">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing ──────────────────────────────────────────────────────────────── */

function CheckIcon({ className }: { className: string }) {
  return (
    <svg
      className={`mt-0.5 h-4 w-4 flex-shrink-0 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function Pricing() {
  return (
    <section className="bg-cream-warm px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-serif text-3xl font-bold text-navy md:text-4xl">
          Simple pricing
        </h2>
        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          {/* Founding Member column */}
          <div className="flex flex-col gap-4">
            <div className="relative overflow-hidden rounded-2xl border-2 border-gold bg-white p-8 shadow-warm-lg md:p-10">
              <div className="absolute right-0 top-0 rounded-bl-lg bg-gold px-4 py-1.5 font-sans text-xs font-bold uppercase tracking-wider text-white">
                Limited
              </div>
              <p className="font-sans text-sm font-medium uppercase tracking-widest text-gold">
                Founding Member
              </p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-serif text-5xl font-bold text-navy">
                  $89
                </span>
                <span className="font-sans text-base text-navy/50">/year</span>
              </div>
              <p className="mt-2 font-sans text-sm text-navy/60">
                Price locks in forever. Never increases.
              </p>
              <a
                href={STRIPE_FOUNDING_LINK}
                className="mt-8 block rounded-full bg-gold py-3.5 text-center font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg"
              >
                Join as Founding Member
              </a>
              <ul className="mt-8 space-y-3">
                {[
                  "4 quarterly illustrated books",
                  "Child is the hero every chapter",
                  "Story continues year after year",
                  "Birthday book delivery",
                  "Price locked in forever",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 font-sans text-sm text-navy/70"
                  >
                    <CheckIcon className="text-gold" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* Founding digital companion */}
            <div className="rounded-xl border border-dashed border-gold/40 bg-white/80 px-5 py-4 md:px-6 md:py-5">
              <p className="font-sans text-xs font-medium uppercase tracking-widest text-gold">
                Digital only
              </p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-serif text-2xl font-bold text-navy">
                  $39
                </span>
                <span className="font-sans text-sm text-navy/50">/year</span>
              </div>
              <p className="mt-2 font-sans text-sm leading-relaxed text-navy/60">
                Same 4 quarterly stories, delivered as beautiful digital books.
                No shipping anywhere in the world.
              </p>
              <a
                href={STRIPE_FOUNDING_DIGITAL_LINK}
                className="mt-4 block rounded-full border border-gold/40 py-2.5 text-center font-sans text-sm font-semibold text-gold transition-all hover:border-gold hover:bg-gold hover:text-white"
              >
                Join digitally
              </a>
            </div>
          </div>

          {/* Gift a Story Year column */}
          <div className="flex flex-col gap-4">
            <div className="relative overflow-hidden rounded-2xl border-2 border-forest bg-white p-8 shadow-warm md:p-10">
              <div className="absolute right-0 top-0 rounded-bl-lg bg-forest px-4 py-1.5 font-sans text-xs font-bold uppercase tracking-wider text-white">
                Gift
              </div>
              <p className="font-sans text-sm font-medium uppercase tracking-widest text-forest">
                Gift a Story Year
              </p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-serif text-5xl font-bold text-navy">
                  $89
                </span>
              </div>
              <p className="mt-2 font-sans text-sm text-navy/60">
                Give a full year of stories.
              </p>
              <a
                href={STRIPE_GIFT_LINK}
                className="mt-8 block rounded-full bg-forest py-3.5 text-center font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-forest/90 hover:shadow-warm-lg"
              >
                Give as a Gift
              </a>
              <ul className="mt-8 space-y-3">
                {[
                  "Everything in founding member",
                  "Recipient claims with their own link",
                  "Perfect for grandparents + family gifts",
                  "No account needed to purchase",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 font-sans text-sm text-navy/70"
                  >
                    <CheckIcon className="text-forest" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* Gift digital companion */}
            <div className="rounded-xl border border-dashed border-forest/40 bg-white/80 px-5 py-4 md:px-6 md:py-5">
              <p className="font-sans text-xs font-medium uppercase tracking-widest text-gold">
                Digital only
              </p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-serif text-2xl font-bold text-navy">
                  $39
                </span>
              </div>
              <p className="mt-2 font-sans text-sm leading-relaxed text-navy/60">
                Perfect for international families or anyone who prefers
                digital. Same stories, no shipping.
              </p>
              <a
                href={STRIPE_GIFT_DIGITAL_LINK}
                className="mt-4 block rounded-full border border-forest/40 py-2.5 text-center font-sans text-sm font-semibold text-forest transition-all hover:border-forest hover:bg-forest hover:text-white"
              >
                Give digitally
              </a>
            </div>
          </div>

          {/* Single Book column */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-navy/10 bg-white p-8 shadow-warm md:p-10">
              <p className="font-sans text-sm font-medium uppercase tracking-widest text-navy/40">
                Single Book
              </p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-serif text-5xl font-bold text-navy">
                  $29
                </span>
                <span className="font-sans text-base text-navy/50">one-time</span>
              </div>
              <p className="mt-2 font-sans text-sm text-navy/60">
                No subscription required.
              </p>
              <a
                href={STRIPE_ONETIME_LINK}
                className="mt-8 block rounded-full border-2 border-navy/15 py-3.5 text-center font-sans text-base font-semibold text-navy transition-all hover:border-gold hover:text-gold"
              >
                Try a Single Book
              </a>
              <ul className="mt-8 space-y-3">
                {[
                  "One standalone illustrated adventure",
                  "Child is the hero",
                  "No subscription required",
                  "Love it? Continue the story later",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 font-sans text-sm text-navy/70"
                  >
                    <CheckIcon className="text-navy/30" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* Single digital companion */}
            <div className="rounded-xl border border-dashed border-navy/15 bg-white/80 px-5 py-4 md:px-6 md:py-5">
              <p className="font-sans text-xs font-medium uppercase tracking-widest text-gold">
                Digital only
              </p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-serif text-2xl font-bold text-navy">
                  $15
                </span>
                <span className="font-sans text-sm text-navy/50">one-time</span>
              </div>
              <p className="mt-2 font-sans text-sm leading-relaxed text-navy/60">
                One story, delivered instantly as a digital book.
              </p>
              <a
                href={STRIPE_ONETIME_DIGITAL_LINK}
                className="mt-4 block rounded-full border border-navy/15 py-2.5 text-center font-sans text-sm font-semibold text-navy transition-all hover:border-gold hover:text-gold"
              >
                Try digitally
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ ───────────────────────────────────────────────────────────────────── */

const FAQS = [
  {
    q: "What if we miss a memory drop?",
    a: "We continue the story using what we know about your child. You approve before we print.",
  },
  {
    q: "What ages is this for?",
    a: "3\u201310 years old.",
  },
  {
    q: "What happens to our photos?",
    a: "Your photos are processed entirely on our private servers and permanently deleted within 2 hours of your child\u2019s illustration reference being created. They are never shared with any third party \u2014 not with illustration tools, AI services, or print partners. Ever.",
  },
  {
    q: "Can I cancel?",
    a: "Yes. Annual subscription, cancel any time before renewal.",
  },
  {
    q: "When does the first book arrive?",
    a: "Within 10 weeks of subscribing.",
  },
  {
    q: "Do you ship internationally?",
    a: "We currently ship physical books within the US. International families can subscribe to our digital-only plans \u2014 same stories, delivered digitally, available worldwide. Questions? Email storybound@gmail.com",
  },
  {
    q: "How does the gift subscription work?",
    a: "You purchase the gift, then receive a claim link to forward to the recipient. They set up their child\u2019s profile and the story begins \u2014 you don\u2019t need to know their child\u2019s details.",
  },
  {
    q: "What\u2019s the difference between a single book and a subscription?",
    a: "A single book is a standalone adventure \u2014 complete in itself. A subscription continues the story each quarter, with each new book referencing what came before. Your single book can become Chapter 1 if you subscribe later.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-navy/10">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-6 text-left"
      >
        <span className="font-serif text-lg font-semibold text-navy pr-4">
          {q}
        </span>
        <svg
          className={`h-5 w-5 flex-shrink-0 text-gold transition-transform duration-200 ${
            open ? "rotate-45" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4v16m8-8H4"
          />
        </svg>
      </button>
      {open && (
        <p className="pb-6 font-sans text-base leading-relaxed text-navy/70">
          {a}
        </p>
      )}
    </div>
  );
}

function Faq() {
  return (
    <section className="bg-cream px-6 py-24 md:py-32">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center font-serif text-3xl font-bold text-navy md:text-4xl">
          Questions
        </h2>
        <div className="mt-12">
          {FAQS.map((faq) => (
            <FaqItem key={faq.q} {...faq} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ───────────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="bg-cream-warm px-6 py-24 md:py-32">
      <div className="mx-auto max-w-xl text-center">
        <h2 className="font-serif text-3xl font-bold text-navy md:text-4xl">
          Not ready to subscribe yet?
        </h2>
        <p className="mt-4 font-sans text-base text-navy/60">
          Join the waitlist. We&rsquo;ll let you know when we launch.
        </p>
        <form
          onSubmit={(e) => e.preventDefault()}
          className="mt-8 flex flex-col gap-3 sm:flex-row"
        >
          <input
            type="email"
            placeholder="you@example.com"
            className="flex-1 rounded-full border border-navy/15 bg-white px-6 py-3.5 font-sans text-base text-navy placeholder:text-navy/30 outline-none transition-shadow focus:border-gold focus:shadow-warm"
          />
          <button
            type="submit"
            className="rounded-full bg-navy px-8 py-3.5 font-sans text-base font-semibold text-cream shadow-warm transition-all hover:bg-navy/90"
          >
            Join the waitlist
          </button>
        </form>
        <div className="mt-16 border-t border-navy/10 pt-8">
          <p className="font-serif text-lg italic text-navy/50">
            Your child&rsquo;s story, growing with them.
          </p>
          <p className="mt-4 font-sans text-xs text-navy/30">
            &copy; {new Date().getFullYear()} Storybound. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export default function Home() {
  return (
    <main>
      <Hero />
      <HowItWorks />
      <WhyDifferent />
      <Pricing />
      <Faq />
      <Footer />
    </main>
  );
}
