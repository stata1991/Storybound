# Storybound — Phase 1 Checklist
## Concept Validation (Weeks 5–10)

**Goal:** Prove parents will pay before you build the full product.

**Success criteria:** 50 founding families at $89/year within 6 weeks of launch.

---

## Pre-Launch (Week 5)

### Landing Page
Build on Framer or Webflow. No custom code.

**Hero section:**
- [ ] Headline: "Most personalized storybooks change the name. We change the story."
- [ ] Sub-headline: "Storybound delivers 4 quarterly illustrated chapter books where your child is the actual hero — built from their photos and memories. $109/year."
- [ ] Primary CTA: "Join as a Founding Member — $89/year"
- [ ] Secondary CTA: "Give as a Gift — $89"
- [ ] Tertiary CTA: "Try a single book — $29"
- [ ] Social proof placeholder (will add testimonials after Phase 2)

**How it works section (3 steps):**
- [ ] Step 1: "Submit a memory drop" — 4x/year, 5 min, 2-3 photos + 2 questions
- [ ] Step 2: "We write the chapter" — personalized story + illustrations
- [ ] Step 3: "It arrives before their birthday" — Q4 is always the birthday book

**Why it's different section:**
- [ ] Continuity: "Year 3 Mia references the dragon she defeated in Year 1"
- [ ] Real likeness: "Your child actually looks like the hero"
- [ ] Four chapters: "Not one book. A growing saga."

**Pricing section (3 products):**
- [ ] Founding subscription: $89/year (limited spots, price locks forever)
- [ ] One-time book: $29 (single standalone book, no continuity)
- [ ] Gift subscription: $89/year (buyer pays, recipient claims via link)
- [ ] Standard: $109/year (shown as "after founding closes", not active yet)
- [ ] What's included per subscription: 4 quarterly books, digital access, birthday book

**FAQ section:**
- [ ] "What if we miss a memory drop?" — we continue the story with what we know
- [ ] "What ages is this for?" — 3–10 years old
- [ ] "What happens to our photos?" — deleted within 2 hours of processing, never shared with third parties
- [ ] "Can I cancel?" — yes, annual subscription, cancel before renewal
- [ ] "When does the first book arrive?" — within 10 weeks of subscribing

**Footer:**
- [ ] Email capture (waitlist only, for people not ready to buy)
- [ ] Privacy policy link
- [ ] Contact email

### Checkout Flow
- [ ] Set up Stripe product: $89 founding member annual subscription
- [ ] Set up Stripe product: $109 standard annual subscription
- [ ] Set up Stripe product: $29 one-time book (one-time payment)
- [ ] Set up Stripe product: $89 gift subscription (one-time payment, generates claim link)
- [ ] Post-checkout (subscription): redirect to onboarding form (Typeform)
- [ ] Post-checkout (one-time): redirect to simplified profile form (name, age, interests, one photo)
- [ ] Post-checkout (gift): redirect to confirmation page with shareable claim link, no child profile collected from buyer
- [ ] Typeform collects:
  - Child's name and preferred name (nickname)
  - Child's birthday (date — used for Q4 birthday book timing)
  - Pronouns (she/her, he/him, they/them, other)
  - Interests (multi-select + free text)
  - Favorite things (color, food, animal)
  - Avoidances / fears (free text — these become hard limits)
  - Milestone description (free text — "lost first tooth, learned to swim")
  - Character archetype (free text — "What character does your child love? e.g. a princess, a dinosaur, a superhero. We'll create an original companion inspired by it.")
  - Family notes (free text — family structure, anything we should know)
  - Reading level (pre-reader / early reader / independent / chapter book)
  - Delivery address

### Email Sequences (ConvertKit)

**Post-purchase sequence:**
- [ ] Email 1 (immediate): Welcome + what happens next + timeline
- [ ] Email 2 (day 3): "Meet your child's world" — tease the story universe
- [ ] Email 3 (day 7): Memory drop instructions + what makes a great photo
- [ ] Email 4 (week 3): Memory drop reminder if not yet submitted

**Waitlist sequence:**
- [ ] Email 1 (immediate): "You're on the list" + founding member offer
- [ ] Email 2 (day 5): Share one of the Phase 0 sample book pages
- [ ] Email 3 (day 10): Last chance founding member rate

---

## Launch (Week 6)

### Channels

**Organic (free):**
- [ ] Post in 3-5 parenting Facebook groups (authentic, not spammy)
- [ ] Post in relevant Reddit communities (r/Parenting, r/Mommit, r/daddit)
- [ ] Personal network outreach — 50 individual messages to parents you know
- [ ] LinkedIn post (founder story angle)

**Paid (small test budget):**
- [ ] Meta ads: 3 creative variations, $20/day budget
  - Ad 1: Book quality focus ("Look at this illustration of a real child")
  - Ad 2: Continuity focus ("Year 3 Mia remembered the dragon")
  - Ad 3: Birthday hook ("The birthday gift they'll ask for every year")
- [ ] Targeting: Parents 28-42, interests in children's books, parenting, education

**Content:**
- [ ] Create 3 sample spread images from Phase 0 books (child faces blurred/replaced)
- [ ] Create 1 short video: book arrival unboxing concept (can be mockup)

---

## Weeks 6–10 — Track & Optimize

### Key Metrics (Check Weekly)

| Metric | Target | Minimum Go |
|--------|--------|-----------|
| Landing page visitors | 2,000+ | 1,000+ |
| Waitlist signups | 200+ | 100+ |
| Conversion (visitors → purchase) | >3% | >2% |
| Founding families | 50 | 25 |
| Cost per acquisition (paid) | <$30 | <$50 |

### Weekly Actions
- [ ] Review conversion rate — if <1%, test new headline
- [ ] Review ad performance — pause underperformers, double winning creative
- [ ] Respond to every inquiry personally (no auto-replies in Phase 1)
- [ ] Collect objections — what's stopping people? Document every "no"

---

## Go/No-Go Decision (End of Week 10)

**GO to Phase 2 if:**
- 50 paying founding families confirmed
- At least 3 organic referrals (someone told someone)
- CPA under $50 on paid channels
- No major product objection that invalidates the model

**PIVOT signals (not no-go, but rethink):**
- Price is the primary objection → test $79/year
- Quarterly feels too infrequent → survey interest in 6 books/year
- Parents want to gift, not subscribe → add gift option

**STOP signals:**
- Under 15 paying families after full 6-week push
- Core model misunderstood despite clear messaging
- COGS confirmed too high for target margin

---

## Phase 1 Outputs
- [ ] 50 paying founding families (or clear pivot signal)
- [ ] Validated pricing ($89 or $109)
- [ ] Top 3 objections documented with responses
- [ ] Best-performing ad creative identified
- [ ] Onboarding form data for first 50 children collected
- [ ] Go/No-Go decision recorded with evidence
