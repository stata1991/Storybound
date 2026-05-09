"use client";

import { useState } from "react";
import Image from "next/image";

/* ─── Hero ─────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="bg-cream px-6 py-24 md:py-32 lg:py-40">
      <div className="mx-auto max-w-3xl text-center">
        <Image
          src="/icon.png"
          alt="Storybound"
          width={160}
          height={160}
          className="rounded-3xl shadow-warm mx-auto mb-6"
        />
        <p className="mt-6 mb-4 font-sans text-sm font-medium uppercase tracking-widest text-gold">
          Personalized storybooks where your child is the hero.
        </p>
        <h1 className="font-serif text-4xl font-bold leading-tight text-navy md:text-5xl lg:text-6xl">
          Most personalized storybooks change the name.{" "}
          <span className="text-gold">We change the story.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl font-sans text-lg leading-relaxed text-navy/70 md:text-xl">
          Storybound creates illustrated chapter books where your child is the
          actual hero &mdash; built from who they actually are right now. Digital
          is always free.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="/auth"
            className="w-full rounded-full bg-gold px-8 py-4 text-center font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg sm:w-auto"
          >
            Start free &rarr;
          </a>
          <span className="font-sans text-sm text-navy/40">
            Print add-on &mdash; coming soon
          </span>
        </div>
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
      "Four times a year, tell us what happened. Upload a few photos, describe their biggest milestone, and tell us which character they\u2019re obsessed with right now. Takes 5 minutes.",
  },
  {
    number: "02",
    title: "We write the chapter",
    description:
      "Our story engine builds a personalized illustrated adventure \u2014 your child as the hero, their milestone woven into the plot, their favorite character as their loyal companion.",
  },
  {
    number: "03",
    title: "A new chapter every season",
    description:
      "Read your child\u2019s new chapter online within 24 hours of submitting. Four illustrated books a year, one per season \u2014 each one a new chapter in their story.",
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

/* ─── More Magic Coming ───────────────────────────────────────────────────── */

function MoreMagic() {
  return (
    <section className="bg-cream-warm px-6 py-16 md:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-serif text-2xl font-bold text-navy md:text-3xl">
          More magic coming
        </h2>
        <p className="mt-4 font-sans text-base leading-relaxed text-navy/60">
          We&rsquo;re building the next chapter &mdash; bedtime audio, animated
          story videos, and more on the way.
        </p>
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
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center font-serif text-3xl font-bold text-navy md:text-4xl">
          Simple pricing
        </h2>

        {/* Digital Free — dominant card */}
        <div className="mx-auto mt-16 max-w-md">
          <div className="relative overflow-hidden rounded-2xl border-2 border-gold bg-white p-8 shadow-warm-lg md:p-10">
            <div className="absolute right-0 top-0 rounded-bl-lg bg-gold px-4 py-1.5 font-sans text-xs font-bold uppercase tracking-wider text-white">
              Most popular
            </div>
            <p className="font-sans text-sm font-medium uppercase tracking-widest text-gold">
              Digital &mdash; Free
            </p>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="font-serif text-5xl font-bold text-navy">
                Free
              </span>
              <span className="font-sans text-base text-navy/50">forever</span>
            </div>
            <p className="mt-2 font-sans text-sm text-navy/60">
              No credit card required.
            </p>
            <a
              href="/auth"
              className="mt-8 block rounded-full bg-gold py-3.5 text-center font-sans text-base font-semibold text-white shadow-warm transition-all hover:bg-gold-light hover:shadow-warm-lg"
            >
              Start free &rarr;
            </a>
            <ul className="mt-8 space-y-3">
              {[
                "Unlimited illustrated digital books",
                "Your child as the hero of every story",
                "4 seasonal chapters per year",
                "Read on any device",
                "First book ready in ~24 hours",
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
        </div>

        {/* Coming Soon tiers */}
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {/* Print Add-on */}
          <div className="relative overflow-hidden rounded-2xl border border-navy/10 bg-white p-6">
            <div className="absolute right-0 top-0 rounded-bl-lg bg-navy/10 px-3 py-1 font-sans text-xs font-medium uppercase tracking-wider text-navy/40">
              Coming Soon
            </div>
            <p className="font-sans text-xs font-medium uppercase tracking-widest text-navy/40">
              Print Add-on
            </p>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="font-serif text-3xl font-bold text-navy/50">
                $89
              </span>
              <span className="font-sans text-sm text-navy/40">/year</span>
            </div>
            <p className="mt-2 font-sans text-sm text-navy/50">
              Beautifully printed and shipped to your door.
            </p>
            <span className="mt-6 block rounded-full border border-navy/10 py-3 text-center font-sans text-sm text-navy/30 cursor-default">
              Coming soon
            </span>
            <ul className="mt-6 space-y-2">
              {[
                "Everything in Digital, plus:",
                "4 hardcover books shipped per year",
                "Print quality matched to keepsake standards",
                "Cancel anytime",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 font-sans text-xs text-navy/50"
                >
                  <CheckIcon className="text-navy/25" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Gift a Story Year */}
          <div className="relative overflow-hidden rounded-2xl border border-navy/10 bg-white p-6">
            <div className="absolute right-0 top-0 rounded-bl-lg bg-navy/10 px-3 py-1 font-sans text-xs font-medium uppercase tracking-wider text-navy/40">
              Coming Soon
            </div>
            <p className="font-sans text-xs font-medium uppercase tracking-widest text-navy/40">
              Gift a Story Year
            </p>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="font-serif text-3xl font-bold text-navy/50">
                $89
              </span>
              <span className="font-sans text-sm text-navy/40">one-time</span>
            </div>
            <p className="mt-2 font-sans text-sm text-navy/50">
              Give a full year of stories.
            </p>
            <span className="mt-6 block rounded-full border border-navy/10 py-3 text-center font-sans text-sm text-navy/30 cursor-default">
              Coming soon
            </span>
            <ul className="mt-6 space-y-2">
              {[
                "Same as Print Add-on, gifted",
                "Recipient claims with their own link",
                "Perfect for grandparents",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 font-sans text-xs text-navy/50"
                >
                  <CheckIcon className="text-navy/25" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Single Book */}
          <div className="relative overflow-hidden rounded-2xl border border-navy/10 bg-white p-6">
            <div className="absolute right-0 top-0 rounded-bl-lg bg-navy/10 px-3 py-1 font-sans text-xs font-medium uppercase tracking-wider text-navy/40">
              Coming Soon
            </div>
            <p className="font-sans text-xs font-medium uppercase tracking-widest text-navy/40">
              Single Book
            </p>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="font-serif text-3xl font-bold text-navy/50">
                $29
              </span>
              <span className="font-sans text-sm text-navy/40">one-time</span>
            </div>
            <p className="mt-2 font-sans text-sm text-navy/50">
              No subscription required.
            </p>
            <span className="mt-6 block rounded-full border border-navy/10 py-3 text-center font-sans text-sm text-navy/30 cursor-default">
              Coming soon
            </span>
            <ul className="mt-6 space-y-2">
              {[
                "One standalone illustrated book",
                "Child is the hero",
                "Love it? Continue free with digital",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 font-sans text-xs text-navy/50"
                >
                  <CheckIcon className="text-navy/25" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Your Photos Stay Yours ──────────────────────────────────────────────── */

function Privacy() {
  return (
    <section className="bg-cream px-6 py-24 md:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-serif text-3xl font-bold text-navy md:text-4xl">
          Your photos stay yours
        </h2>
        <p className="mx-auto mt-8 max-w-xl font-sans text-base leading-relaxed text-navy/70">
          All AI training runs on private servers. No third-party AI services
          ever see your child&rsquo;s photos. Photos are used only to train a
          custom model of your kid&rsquo;s face, then permanently deleted. Never
          shared. Never sold. Never used to train anything else.
        </p>
      </div>
    </section>
  );
}

/* ─── FAQ ───────────────────────────────────────────────────────────────────── */

const FAQS = [
  {
    q: "What if we miss a memory drop?",
    a: "We continue the story using what we know about your child. You approve before we publish.",
  },
  {
    q: "What ages is this for?",
    a: "Ages 1\u20138.",
  },
  {
    q: "What happens to our photos?",
    a: "Your photos are processed entirely on our private servers and permanently deleted within 2 hours of your child\u2019s illustration reference being created. They are never shared with any third party \u2014 not with illustration tools, AI services, or print partners. Ever.",
  },
  {
    q: "When does the first book arrive?",
    a: "Digital books are ready in ~24 hours. Physical print is coming soon.",
  },
  {
    q: "How does the gift subscription work?",
    a: "Gift subscriptions are coming soon along with print. We\u2019ll let you know when ready.",
  },
  {
    q: "Is it really free? What\u2019s the catch?",
    a: "No catch. Digital storybooks are unlimited and always free \u2014 you can sign up, submit memories, and read your child\u2019s books without paying anything. Paid options are for physical printed books, which are coming soon.",
  },
  {
    q: "When will print be available?",
    a: "We\u2019re finalizing our print partner now. We\u2019ll notify subscribers as soon as it\u2019s ready. In the meantime, all books are fully available digitally.",
  },
  {
    q: "What\u2019s coming next?",
    a: "Bedtime audio, animated story videos, and a print option are all in the works. We\u2019ll share more soon.",
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
    <section className="bg-cream-warm px-6 py-24 md:py-32">
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
    <footer className="bg-cream px-6 py-16 md:py-20">
      <div className="mx-auto max-w-xl text-center">
        <p className="font-serif text-lg italic text-navy/50">
          Your child&rsquo;s story, growing with them.
        </p>
        <p className="mt-4 font-sans text-xs text-navy/30">
          &copy; {new Date().getFullYear()} Storybound. All rights reserved.
        </p>
        <a
          href="mailto:storybound@gmail.com"
          className="mt-2 inline-block font-sans text-xs text-navy/30 underline decoration-navy/15 underline-offset-2 transition-colors hover:text-gold"
        >
          storybound@gmail.com
        </a>
      </div>
    </footer>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export default function Home() {
  return (
    <main>
      <nav className="bg-cream px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="font-serif text-lg font-bold text-navy">
            Storybound
          </span>
          <a
            href="/auth"
            className="font-sans text-sm font-medium text-navy/60 transition-colors hover:text-gold"
          >
            Sign in
          </a>
        </div>
      </nav>
      <Hero />
      <HowItWorks />
      <WhyDifferent />
      <MoreMagic />
      <Pricing />
      <Privacy />
      <Faq />
      <Footer />
    </main>
  );
}
