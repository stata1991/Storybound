# Storybound — Technical Decisions

> Key architecture decisions with rationale. Update this as decisions evolve.

---

## Decision Log

### 1. Annual Billing, Quarterly Delivery
**Decision:** Charge $109/year upfront. Deliver 4 books across the year.
**Rationale:** Monthly billing for a quarterly product creates churn between deliveries. Annual billing improves cash flow, reduces cancellation surface, and aligns with how parents think about subscriptions (annual like Spotify Family, not monthly like Netflix).
**Trade-off:** Higher barrier to first purchase. Mitigated by founding member pricing and clear value communication.

---

### 2. Quarterly > Monthly > Annual Delivery
**Decision:** 4 books/year tied to seasonal memory clusters.
**Rationale:** Annual had photo curation friction and single failure point. Monthly was economically unviable and operationally overwhelming for a solo founder. Quarterly maps to how families actually live — spring, summer, fall, birthday.
**Trade-off:** Less frequent than monthly competitors, but each book is higher quality and more meaningful.

---

### 3. Session-Based Face Processing
**Decision:** Extract face embeddings, generate reference images, delete source photos within 72 hours.
**Rationale:** COPPA compliance, parent trust, and liability reduction. Parents are rightly concerned about storing children's photos. 72-hour deletion is a strong privacy signal.
**Implementation:** Replicate or custom Dreambooth session → generate 20 reference images → store only references → delete originals.
**Trade-off:** Can't re-use source photos if reference quality is poor. Mitigation: quality check before deletion, offer re-upload if needed.

---

### 4. Claude API for Story Generation
**Decision:** Use Claude (claude-sonnet) for all story generation.
**Rationale:** Best-in-class narrative quality, strong instruction following for structured outputs, reliable content safety, good at maintaining character voice across episodes.
**Implementation:** System prompt contains story bible + episode structure. User turn contains harvest data (child info, photos summary, quarterly memories). Output is structured story in JSON format.
**Trade-off:** Cost per generation. Mitigated by caching story bibles and batching.

---

### 5. Episodic Story Structure
**Decision:** Each quarterly book is a self-contained episode with beginning/middle/end, but threads into a larger seasonal arc.
**Rationale:** Parents may join mid-year. Each book must stand alone for new subscribers. But existing subscribers need narrative continuity to justify staying.
**Implementation:** Episode template has: (a) standalone adventure, (b) continuity callback slot, (c) setup hook for next episode.
**Trade-off:** More complex story generation than one-shot books. Requires story bible maintenance across quarters.

---

### 6. No-Code / Low-Code for Phase 0–1
**Decision:** Use Framer/Webflow for landing page, ConvertKit for email, Typeform for intake. No custom code until Phase 2.
**Rationale:** Fastest path to validation. Custom code is a premature optimization before proving demand.
**Transition trigger:** Move to Next.js + Supabase when manual operations exceed 8 hours/week or when 50 paying families confirmed.

---

### 7. Print Partner: API-First
**Decision:** Use Mixam or Peecho API for print fulfillment (not manual print shops).
**Rationale:** Quarterly delivery at scale requires automation. Manual print coordination doesn't scale past 100 families.
**Phase 0–1:** Manual print (local printer or Blurb/Lulu for proofs). Phase 3+: API integration.

---

### 8. GPT-4o (ChatGPT) for Illustration Generation
**Decision:** Use GPT-4o for all illustration generation. Phase 0–1 via manual ChatGPT conversation, Phase 2+ via GPT-4o API or Astria for automation.
**Rationale:** $200/month ChatGPT subscription already active. Same conversation maintains character consistency via context window — no `--cref` or face reference tooling needed. Quality and consistency validated in Phase 0 testing.
**Trade-off:** Manual process in Phase 0–1 doesn't scale. Mitigated by API migration in Phase 2+.
**Supersedes:** Midjourney (manual) and Replicate SDXL — neither needed.

---

### 9. Distributed Operational Load
**Decision:** Q1–Q3 have fixed seasonal windows. Q4 is birthday-relative.
**Rationale:** If all families had the same delivery window, operational load would spike quarterly. Birthday-relative Q4 spreads ~8% of families into each month, creating steady workload.
**Result:** No operational "season" where everything happens at once. Predictable monthly volume.

---

## Stack Summary

| Layer | Phase 0–1 | Phase 2+ |
|-------|-----------|---------|
| Landing page | Framer | Next.js 14 |
| Email | ConvertKit | Loops |
| Auth | N/A | Supabase Auth |
| Database | Airtable | Supabase Postgres |
| File storage | Google Drive | Supabase Storage |
| Payments | Stripe (manual) | Stripe Subscriptions API |
| Story generation | Claude API (manual trigger) | Claude API (automated) |
| Illustration | GPT-4o via ChatGPT (manual) | GPT-4o API or Astria |
| Print | Blurb/Lulu | Mixam API |
| Hosting | Vercel | Vercel |
| Analytics | Posthog | Posthog |

---

## Open Decisions

| Decision | Options | Deadline |
|----------|---------|----------|
| Illustration consistency tool | **Resolved: GPT-4o (ChatGPT conversation for Phase 0-1, API for Phase 2+)** | Decided |
| Physical book format | Hardcover vs softcover vs layflat | Before Phase 0 proof |
| Story world count at launch | 1 world vs 3 worlds vs dynamic | Before Phase 1 landing page |
| Founding Chest manufacturer | Need RFQ at 500/1000/5000 units | Phase 3 planning |
