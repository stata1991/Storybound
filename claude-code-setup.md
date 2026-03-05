# Storybound — Claude Code Setup & Workflow

---

## Overview

This guide explains how to use Claude effectively for Storybound development — when to use Claude Projects (strategy/writing), when to use Claude Code (building), and how to set up context efficiently.

---

## When to Use Claude Projects vs Claude Code

| Task | Tool |
|------|------|
| Strategy and planning | Claude Project |
| Writing copy and content | Claude Project |
| Refining prompts | Claude Project |
| PRD and documentation | Claude Project |
| Building landing page | Claude Code |
| Building parent portal | Claude Code |
| API integrations | Claude Code |
| Story generation scripts | Claude Code |
| Print file automation | Claude Code |
| Debugging | Claude Code |

**Rule of thumb:** If you're thinking, write in Project. If you're building, use Code.

---

## Claude Project Setup

### Project Name
`Storybound — Active Development`

### Files to Add to Project Knowledge (always)
1. `context/project-overview.md`
2. `context/constraints.md`
3. `MASTER_PLAN.md`
4. Current phase checklist

### Effective Prompting in Project

**Weak:**
> "Help me with the landing page copy"

**Strong:**
> "I'm in Phase 1 (concept validation). I need to write the hero section headline for the Storybound landing page. Target: parents of 4-8 year olds. Goal: email signup + founding member purchase. Key differentiator to lead with: we do quarterly books, not one-time. Give me 5 headline options in the voice of brand/voice-tone.md."

Always include:
- Which phase you're in
- The specific output you need
- Which constraint file is relevant
- What you've already tried

---

## Claude Code Session Setup

### Opening context block (paste at start of every session)
```
I'm building Storybound — a quarterly personalized children's storybook subscription.

Key context:
- Quarterly delivery (not annual, not monthly)
- Annual billing: $109/year
- Q4 = birthday book for each child
- Stack: Next.js 14, Supabase, Stripe, Claude API, Vercel
- Current phase: [PHASE 0/1/2/3]

Files available in knowledge base:
- context/project-overview.md (what we're building)
- context/constraints.md (hard limits)
- specs/data-models.md (database schema)
- specs/api-endpoints.md (API design)

Task: [SPECIFIC TASK]
```

---

## Code Patterns

### Story Generation (Claude API)
```javascript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

async function generateStoryBible(childProfile) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: STORY_BIBLE_SYSTEM_PROMPT,  // from prompts/story-generation.md
    messages: [{
      role: 'user',
      content: `Generate a Story Bible for this child:
      
      ${JSON.stringify(childProfile, null, 2)}
      
      Output JSON only.`
    }]
  });
  
  const text = response.content[0].text;
  return JSON.parse(text);
}

async function generateEpisode(storyBible, harvestData, episodeNumber) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8192,
    system: EPISODE_GENERATION_SYSTEM_PROMPT,  // from prompts/story-generation.md
    messages: [{
      role: 'user',
      content: `Generate Episode ${episodeNumber}.
      
      Story Bible: ${JSON.stringify(storyBible)}
      
      Harvest Data: ${JSON.stringify(harvestData)}
      
      Output JSON only.`
    }]
  });
  
  const text = response.content[0].text;
  return JSON.parse(text);
}
```

### Quarterly Window Calculator
```javascript
import { addDays, subDays, setYear, setMonth, setDate } from 'date-fns';

// Fixed seasonal windows (Q1-Q3)
const SEASONAL_WINDOWS = {
  1: { // Spring
    harvest_opens: { month: 1, day: 15 },   // Jan 15
    harvest_closes: { month: 2, day: 10 },  // Feb 10
    delivery_target: { month: 2, day: 28 }  // End of Feb
  },
  2: { // Summer
    harvest_opens: { month: 4, day: 15 },   // Apr 15
    harvest_closes: { month: 5, day: 10 },  // May 10
    delivery_target: { month: 5, day: 31 }  // End of May
  },
  3: { // Autumn
    harvest_opens: { month: 7, day: 15 },   // Jul 15
    harvest_closes: { month: 8, day: 10 },  // Aug 10
    delivery_target: { month: 8, day: 31 }  // End of Aug
  }
};

// Q4 birthday window (birthday-relative)
function getBirthdayWindow(dateOfBirth) {
  const now = new Date();
  let birthday = new Date(dateOfBirth);
  birthday.setFullYear(now.getFullYear());
  
  // If birthday has passed this year, use next year
  if (birthday < now) {
    birthday.setFullYear(now.getFullYear() + 1);
  }
  
  return {
    harvest_opens: subDays(birthday, 56),    // 8 weeks before
    harvest_closes: subDays(birthday, 35),   // 5 weeks before
    ship_by: subDays(birthday, 21),          // 3 weeks before
    delivery_earliest: subDays(birthday, 14),
    delivery_latest: subDays(birthday, 7)
  };
}
```

### Stripe Subscription Setup
```javascript
// Annual subscription with quarterly delivery
// Billing: once per year
// Delivery: 4x per year

const subscription = await stripe.subscriptions.create({
  customer: customerId,
  items: [{ price: PRICE_ID_PHYSICAL_ANNUAL }],  // $109/year
  metadata: {
    tier: 'physical_digital',
    is_founding_member: 'true',
    founding_price: '8900'  // cents
  }
});
```

---

## Key Commands

```bash
# Development
npm run dev           # Start Next.js dev server
npm run build         # Production build
npm run type-check    # TypeScript validation

# Database
npx supabase db push  # Apply migrations
npx supabase gen types typescript --local > types/supabase.ts

# Story generation test
node scripts/test-story-gen.js --child profiles/test-child-1.json

# Print file generation
node scripts/generate-print-pdf.js --episode ep_id
```

---

## Environment Variables

```env
# Anthropic
ANTHROPIC_API_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Replicate (illustrations)
REPLICATE_API_TOKEN=

# Print Partner
MIXAM_API_KEY=

# App
NEXT_PUBLIC_APP_URL=
```
