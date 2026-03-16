const STRIPE_FOUNDING_LINK =
  process.env.NEXT_PUBLIC_STRIPE_FOUNDING_PHYSICAL_LINK ?? "#";
const STRIPE_GIFT_LINK =
  process.env.NEXT_PUBLIC_STRIPE_GIFT_PHYSICAL_LINK ?? "#";
const STRIPE_ONETIME_LINK =
  process.env.NEXT_PUBLIC_STRIPE_ONETIME_PHYSICAL_LINK ?? "#";
const STRIPE_FOUNDING_DIGITAL_LINK =
  process.env.NEXT_PUBLIC_STRIPE_FOUNDING_DIGITAL_LINK ?? "#";
const STRIPE_GIFT_DIGITAL_LINK =
  process.env.NEXT_PUBLIC_STRIPE_GIFT_DIGITAL_LINK ?? "#";
const STRIPE_ONETIME_DIGITAL_LINK =
  process.env.NEXT_PUBLIC_STRIPE_ONETIME_DIGITAL_LINK ?? "#";

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

const PLANS = [
  {
    name: "Founding Member",
    price: "$89",
    unit: "/year",
    badge: "Limited",
    href: STRIPE_FOUNDING_LINK,
    digitalHref: STRIPE_FOUNDING_DIGITAL_LINK,
    digitalLabel: "Digital only — $39/year",
    accent: "gold",
    features: [
      "4 quarterly illustrated books",
      "Child is the hero every chapter",
      "Story continues year after year",
      "Birthday book delivery",
      "Price locked in forever",
    ],
  },
  {
    name: "Gift a Story Year",
    price: "$89",
    unit: null,
    badge: "Gift",
    href: STRIPE_GIFT_LINK,
    digitalHref: STRIPE_GIFT_DIGITAL_LINK,
    digitalLabel: "Digital only — $39",
    accent: "forest",
    features: [
      "Everything in founding member",
      "Recipient claims with their own link",
      "Perfect for grandparents + family gifts",
      "No account needed to purchase",
    ],
  },
  {
    name: "Single Book",
    price: "$29",
    unit: "one-time",
    badge: null,
    href: STRIPE_ONETIME_LINK,
    digitalHref: STRIPE_ONETIME_DIGITAL_LINK,
    digitalLabel: "Digital only — $15",
    accent: "muted",
    features: [
      "One standalone illustrated adventure",
      "Child is the hero",
      "No subscription required",
      "Love it? Continue the story later",
    ],
  },
] as const;

const ACCENT_STYLES = {
  gold: {
    border: "border-gold",
    badge: "bg-gold",
    label: "text-gold",
    check: "text-gold",
    btn: "bg-gold text-white shadow-warm hover:bg-gold-light hover:shadow-warm-lg",
  },
  forest: {
    border: "border-forest",
    badge: "bg-forest",
    label: "text-forest",
    check: "text-forest",
    btn: "bg-forest text-white shadow-warm hover:bg-forest/90 hover:shadow-warm-lg",
  },
  muted: {
    border: "border-navy/10",
    badge: "",
    label: "text-navy/40",
    check: "text-navy/30",
    btn: "border-2 border-navy/15 text-navy hover:border-gold hover:text-gold",
  },
} as const;

export default function PaymentWall() {
  return (
    <div className="mx-auto max-w-5xl px-6 pb-16">
      <div className="py-8 text-center md:py-12">
        <h1 className="font-serif text-3xl font-bold text-navy md:text-4xl">
          One last step to start your story.
        </h1>
        <p className="mt-3 font-sans text-base text-navy/50 md:text-lg">
          Choose a plan to unlock your dashboard.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const s = ACCENT_STYLES[plan.accent];
          return (
            <div
              key={plan.name}
              className={`relative overflow-hidden rounded-2xl border-2 ${s.border} bg-white p-8 shadow-warm md:p-10`}
            >
              {plan.badge && (
                <div
                  className={`absolute right-0 top-0 rounded-bl-lg ${s.badge} px-4 py-1.5 font-sans text-xs font-bold uppercase tracking-wider text-white`}
                >
                  {plan.badge}
                </div>
              )}
              <p
                className={`font-sans text-sm font-medium uppercase tracking-widest ${s.label}`}
              >
                {plan.name}
              </p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-serif text-5xl font-bold text-navy">
                  {plan.price}
                </span>
                {plan.unit && (
                  <span className="font-sans text-base text-navy/50">
                    {plan.unit}
                  </span>
                )}
              </div>
              <a
                href={plan.href}
                className={`mt-8 block rounded-full py-3.5 text-center font-sans text-base font-semibold transition-all ${s.btn}`}
              >
                {plan.name === "Gift a Story Year"
                  ? "Give as a Gift"
                  : plan.name === "Single Book"
                    ? "Try a Single Book"
                    : "Join as Founding Member"}
              </a>
              <a
                href={plan.digitalHref}
                className="mt-3 block text-center font-sans text-xs text-navy/40 underline decoration-navy/20 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold"
              >
                {plan.digitalLabel} &rarr;
              </a>
              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 font-sans text-sm text-navy/70"
                  >
                    <CheckIcon className={s.check} />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
