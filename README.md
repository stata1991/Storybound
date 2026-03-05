# Storybound — Knowledge Base

> *Your co-founder in a folder.*

Storybound is a quarterly personalized children's storybook subscription. Four illustrated chapter books per year. The child is the actual hero. The birthday is always Q4.

---

## Quick Start

### Set Up Claude Project
1. Create project: `Storybound — Active Development`
2. Add to knowledge: `context/project-overview.md`, `context/constraints.md`, `MASTER_PLAN.md`, current phase checklist
3. Start every session with the phase you're in

### Know Your Phase

| Phase | Goal | Key Metric |
|-------|------|-----------|
| **Phase 0** | Prove the product works | 3 print-quality test books |
| Phase 1 | Prove parents will pay | 50 founding families |
| Phase 2 | Prove parents stay | >80% would renew, NPS >50 |
| Phase 3 | Prove quarterly retention | <30% annual churn |
| Phase 4 | Scale | 1,000 families |

---

## File Map

```
storybound-kb/
├── MASTER_PLAN.md              Pricing, phases, cycle, economics
├── README.md                   This file
│
├── context/
│   ├── project-overview.md     What we're building + who for
│   ├── constraints.md          Hard limits (privacy, pricing, content)
│   └── technical-decisions.md  Architecture choices + rationale
│
├── brand/
│   └── voice-tone.md           Copy principles, taglines, examples
│
├── prompts/
│   ├── story-generation.md     Claude API prompts for story bible + episodes
│   └── illustration-prompts.md Templates for scene illustrations
│
├── editorial/
│   └── sensitive-content-taxonomy.md  What's prohibited, what needs review
│
├── specs/
│   ├── data-models.md          Database schema for all entities
│   └── api-endpoints.md        REST API design
│
├── phases/
│   ├── phase0-checklist.md     Proof of product
│   └── phase1-checklist.md     Concept validation
│
└── tools/
    └── claude-code-setup.md    Code patterns, env vars, workflow
```

---

## The Core Model (30 Seconds)

- **What:** Quarterly illustrated storybooks, child is the hero
- **How:** Parents submit 2-3 photos + 2 questions 4x/year (memory drops)
- **When:** Spring / Summer / Autumn / Birthday (Q4 always = birthday)
- **Price:** $109/year physical+digital, $89 founding member
- **Why it works:** Continuity — Year 3 Mia references Year 1's dragon. No competitor can offer that.

---

## Key Constraints (Don't Skip These)

1. **Annual billing, quarterly delivery** — not monthly billing
2. **Q4 is always the birthday book** — non-negotiable
3. **72-hour photo deletion** — COPPA, privacy, trust
4. **Parent avoidances are hard limits** — stored permanently, never overridden
5. **$89 minimum price** — below this, unit economics fail

---

## What Changed from Previous Version

This knowledge base is the **Storybound** rebuild. Previous version was "The Infinite Story" with an annual delivery model. Key changes:

| Old (The Infinite Story) | New (Storybound) |
|--------------------------|-----------------|
| Annual delivery | Quarterly delivery (4 books/year) |
| One photo submission/year | Quarterly memory drops |
| Annual story arc | Episodic seasonal arc |
| Birthday-anchored annual | Birthday always = Q4 of quarterly cycle |
| $79/year | $109/year ($89 founding) |
| Single operational peak | Distributed seasonal load |
