# Storybound — Project Overview

> Feed this file to Claude at the start of any session.

---

## What We're Building

**Storybound** is a quarterly children's storybook subscription. Parents subscribe annually ($109/year). Every quarter, they submit 2-3 photos and answer 2 questions. We generate a personalized illustrated chapter book where their child is the hero — delivered to their door.

Four books per year. One growing saga. The birthday is always Q4.

---

## The Problem We Solve

Existing personalized storybooks:
- Swap a name into a generic template
- Use illustrations that look nothing like the child
- Are purchased once, read twice, forgotten
- Have no ongoing narrative — no reason to come back

**Parents want a product that grows with their child.** They don't want a one-time gift. They want a tradition.

---

## Who We Serve

**Primary customer:** Parents of children aged 3–10
**Sweet spot:** Ages 4–8, first-time parents, value memorable experiences over things
**Secondary:** Grandparents buying as gifts

**Parent profile:**
- Values quality over quantity
- Already buys premium children's books
- Shares family moments on social media
- Stretched for time — wants "done for me" personalization
- Willing to pay $109/year if the product genuinely delights their child

---

## How It Works (Parent Journey)

1. **Subscribe** — pays $109/year, receives welcome kit
2. **Memory Drop (x4/year)** — 6–8 weeks before each delivery, receives a prompt to upload 2-3 photos + answer 2 questions
3. **Book arrives** — 4–6 weeks after memory drop, personalized book delivered
4. **Q4 = Birthday book** — the most special delivery, timed 1-2 weeks before child's birthday
5. **Year 2** — new season begins, story continues

---

## The Subscription Cycle

```
Annual billing → 4 quarterly deliveries → Birthday is always Q4

Q1: Spring Chapter  (March delivery)
Q2: Summer Chapter  (June delivery)
Q3: Autumn Chapter  (September delivery)
Q4: Birthday Chapter (2 weeks before birthday — unique to each family)
```

---

## Business Model

- **Revenue:** $109/year per family (physical + digital)
- **COGS target:** ~$40 (4 books + shipping)
- **Gross margin target:** 63%
- **Year 1 churn assumption:** 35%
- **LTV (3-year subscriber):** ~$240

---

## Current Stage

Solo founder, pre-launch. In validation phase planning.

**Immediate goal:** Validate demand before building — 50 paying founding families within 10 weeks.

**Not yet built:**
- Web app / parent portal
- Automated AI pipeline
- Print integration

**Currently building:**
- Manual pipeline to prove the product works
- Landing page for waitlist / founding member signups
- Story + illustration system

---

## Tech Stack (Planned Phase 3+)

- **Frontend:** Next.js 14 (App Router)
- **Database:** Supabase (Postgres + Auth + Storage)
- **Payments:** Stripe (annual subscriptions)
- **AI Story Gen:** Claude API (claude-sonnet)
- **AI Illustration:** Replicate (SDXL + face consistency)
- **Print:** Mixam API or Peecho API
- **Hosting:** Vercel
- **Email:** ConvertKit / Loops

---

## What Makes This Defensible

1. **Continuity narrative** — each book references past books; competitors can't replicate 3 years of a child's story
2. **Quarterly cadence** — 4 touchpoints/year means 4 chances to delight, not 1
3. **Photo-accurate illustration** — child actually looks like the hero
4. **Founder's Chest** — physical keepsake box that needs to be filled (psychological retention)
5. **Birthday anchor** — Q4 birthday book creates an annual emotional peak
