# Storybound: A Technical Deep-Dive

## 1. What Is This Thing, Really?

- **Storybound turns your child into the hero of a real, printed storybook.** Parents submit photos and milestones each quarter; AI writes a personalized story, generates illustrations with the child's actual face, and ships a physical book to your door.
- **Every book is a continuation of the same story arc.** A child gets 4 books per year (one per season), each building on the last --- same hero, same world, same companion --- so by December they have a coherent narrative that grew alongside them.
- **The child's photos are deleted after use.** We train a lightweight face model, generate the illustrations, then permanently destroy the source images. Nothing reversible to the original photos survives.

---

## 2. The Architecture

```
                          +------------------+
                          |   Parent (Web)   |
                          |  Next.js 14 SSR  |
                          +--------+---------+
                                   |
                          Supabase Auth (Google OAuth / Email)
                                   |
                    +--------------+--------------+
                    |                             |
           +-------v--------+          +---------v---------+
           |  Dashboard /    |          |  Stripe Checkout  |
           |  Memory Drop    |          |  (Webhooks)       |
           +-------+--------+          +---------+---------+
                   |                              |
                   |  Server Actions              |  POST /api/webhooks/stripe
                   |                              |
           +-------v------------------------------v--------+
           |            Supabase PostgreSQL                 |
           |  (RLS: families see only their own data)       |
           |  Tables: families, parents, children,          |
           |          harvests, episodes, story_bibles,     |
           |          gift_claims, audit_log                |
           |  Storage: character-photos, harvest-photos,    |
           |           illustrations, books                 |
           +-------+------------------+--------------------+
                   |                  |
        +----------v-------+  +------v-----------+
        |  Claude Sonnet   |  |  Modal.com (GPU) |
        |  Story Gen       |  |  SDXL + LoRA     |
        |  (2-pass system) |  |  Real-ESRGAN     |
        +------------------+  +------+-----------+
                                     |
                              +------v-----------+
                              |  Puppeteer       |
                              |  HTML -> PDF     |
                              |  8.5" x 8.5"    |
                              +------------------+
```

**Three tiers, loosely coupled:**

1. **Web tier** --- Next.js 14 with server actions. Parents interact here. Admin dashboard lives here too, guarded by email check, not a role system. Middleware handles auth redirects; Supabase SSR manages session cookies.

2. **Data tier** --- Supabase PostgreSQL with aggressive RLS. Every table has row-level security policies keyed to `auth_family_id()`. A parent literally cannot query another family's children, even with a raw SQL injection. Storage buckets (private) hold photos, illustrations, and PDFs.

3. **AI tier** --- Two external services. Claude Sonnet writes the stories (two-pass: story bible, then episode). Modal.com runs GPU workloads (DreamBooth LoRA training on SDXL, image generation, Real-ESRGAN upscaling). These communicate over HTTP with bearer token auth. The web tier orchestrates everything.

---

## 3. The Codebase: A Map of the Territory

```
Storybound/
+-- web/                          # Next.js 14 app (the whole product)
|   +-- app/
|   |   +-- admin/                # Admin dashboard + all pipeline actions
|   |   |   +-- actions.ts        # THE file. Story gen, illustration trigger, book gen,
|   |   |   |                     # print flow, stats --- 1600+ lines of server actions
|   |   |   +-- components/       # HarvestRow (client component with print modal)
|   |   |   +-- harvest/[id]/     # Per-harvest detail page + generate story button
|   |   +-- auth/                 # Login/signup + OAuth callback
|   |   +-- dashboard/            # Parent-facing: child cards, memory drop form
|   |   +-- gift/                 # Gift claim flow (token validation + redemption)
|   |   +-- onboarding/           # 5-step wizard: child profile, address, photos
|   |   +-- api/
|   |   |   +-- webhooks/stripe/  # Stripe event handler (checkout, payment_failed, canceled)
|   |   |   +-- cron/             # Memory drop reminder emails (external cron trigger)
|   +-- lib/
|   |   +-- supabase/             # Client + server Supabase wrappers
|   |   +-- book/
|   |   |   +-- template.ts       # HTML book template (age-adaptive layouts, embedded fonts)
|   |   |   +-- generator.ts      # Download illustrations -> HTML -> Puppeteer -> PDF
|   |   |   +-- cover-prompt.ts   # Personalized cover prompt from story bible hero
|   |   |   +-- fonts/            # Nunito woff2 (embedded as base64, zero network deps)
|   |   +-- email/                # Resend wrapper + branded HTML templates
|   |   +-- audit.ts              # Fire-and-forget event logging
|   +-- middleware.ts             # Auth guard: public routes bypass, else redirect
|   +-- types/supabase.ts        # Auto-generated DB types (source of truth for TS)
+-- modal/
|   +-- illustration_pipeline.py  # SDXL + LoRA + Real-ESRGAN on A10G GPU
+-- supabase/
|   +-- migrations/               # 11 SQL migration files (schema + RLS policies)
+-- docs/                         # You are here
+-- data-models.md                # Entity relationship spec (the contract)
+-- constraints.md                # Non-negotiable product rules
```

The center of gravity is `web/app/admin/actions.ts`. If Storybound has a "god file," this is it --- story generation, illustration orchestration, book creation, print flow, stats queries, and quality checks all live here. It's too big, and splitting it is on the roadmap.

---

## 4. The Tech Stack: Why These Choices?

| Technology | What It Does | Why This Over Alternatives |
|---|---|---|
| **Next.js 14** | Full-stack framework | Server actions eliminate the API-route boilerplate for authenticated operations. RSC means the admin dashboard renders server-side with zero client JS for the stats/tables. |
| **Supabase** | Database + Auth + Storage | Postgres with RLS solves multi-tenancy at the DB level. Auth handles Google OAuth out of the box. Storage gives us signed URLs for private files. One vendor for three concerns. |
| **Claude Sonnet** | Story text generation | Best at following complex structured output (JSON with nested scenes). GPT-4 was tested; it hallucinated character traits more often and ignored word count constraints. |
| **Modal.com** | GPU serverless | No GPU server to manage. A10G spins up in ~10s, runs LoRA training + inference, and shuts down. We pay per-second, not per-month. A dedicated GPU box would cost $300+/mo idle. |
| **SDXL + LoRA** | Illustration generation | DreamBooth LoRA (rank 4, 150 steps) learns a child's face from 3-10 photos in ~5 minutes. Full fine-tuning would take hours and cost 10x more. The `sks child` token is enough for consistent faces. |
| **Real-ESRGAN** | Cover upscaling | 1024x1024 SDXL output isn't enough for print covers. 2x upscale to ~2048x2048 costs ~3 seconds and the quality improvement is immediately visible. |
| **Puppeteer** | HTML to PDF | We tried `react-pdf` and `@react-pdf/renderer` first. Both choked on base64 images >1MB. Puppeteer handles 8 full-bleed illustrations (each ~2MB base64) without breaking a sweat. |
| **Stripe** | Payments | It's Stripe. Webhook-driven subscription management, hosted checkout, and we never touch card numbers. |
| **Resend** | Transactional email | Simple API, good deliverability, no template builder overhead. We write HTML directly. |

---

## 5. Key Feature Deep-Dive #1: The Story Generation Pipeline

This is the most technically interesting part of Storybound. We don't just call an LLM and dump the output into a book. It's a **two-pass system with quality gates** --- think of it as a writer's room, not a magic wand.

### Pass 1: The Story Bible

When a child first enters the system, we generate a **Story Bible** --- a year-long character and world definition that stays constant across all 4 quarterly books.

```typescript
// web/app/admin/actions.ts

function buildStoryBiblePrompt(child: ChildStoryDbRow, age: number) {
  return {
    system: `You are a children's book author creating a year-long
story universe for a ${age}-year-old named ${child.name}.
Every field you output --- especially physical descriptions,
personality traits, and supporting characters --- will be injected
verbatim into every future episode prompt. Be specific and detailed.`,
    user: `Create a Story Bible as JSON with these keys:
      hero, world, companion, supporting_characters, season_arc, episodes[4]

      Child profile:
      - Name: ${child.name}
      - Interests: ${child.interests.join(", ")}
      - Avoidances: ${child.avoidances?.join(", ") ?? "none"}
      - Reading level: ${child.reading_level}`
  };
}
```

The Bible gets saved to the `story_bibles` table and reused for Q1 through Q4. This is what keeps the hero's hair color, the companion's name, and the world's rules consistent across an entire year.

### Pass 2: Episode Generation (With Age-Aware Style Injection)

Each quarterly book is generated against the Bible, but with **age-specific writing rules** injected into the system prompt:

```typescript
const STORY_STYLE: Record<string, StoryStyle> = {
  "3-4": {
    wordsPerScene: 30,
    sentenceLength: "very short --- max 8 words per sentence",
    vocabulary: "only simple everyday words a toddler knows",
    tone: "warm, playful, lots of repetition",
    tension: "none --- everything feels safe",
    emotionalArc: "child feels safe and loved throughout",
  },
  "9-10": {
    wordsPerScene: 130,
    sentenceLength: "varied --- short for impact, long for atmosphere",
    vocabulary: "early chapter book level --- metaphors, complex sentences",
    tone: "child faces real challenge and grows",
    tension: "genuine stakes",
    emotionalArc: "genuine stakes -> self-doubt -> growth -> transformative resolution",
  }
};

const SCENE_COUNT: Record<string, number> = {
  "3-4": 6,   // 180 words total
  "5-6": 8,   // 440 words total
  "7-8": 10,  // 900 words total
  "9-10": 12  // 1560 words total
};
```

### The Quality Gate

After Claude returns the episode JSON, we run automated checks before saving:

```typescript
function runStoryQualityChecks(episode, child, age): string[] {
  const warnings: string[] = [];
  const style = getStoryStyle(age);

  // Scene count: did Claude follow instructions?
  if (actualSceneCount < SCENE_COUNT[band]) {
    warnings.push("REVIEW REQUIRED: Expected 10 scenes, got 8");
  }

  // Per-scene word count with 20% tolerance
  for (const scene of scenes) {
    const words = scene.text.trim().split(/\s+/);
    if (words.length > style.wordsPerScene * 1.2) {
      scene.text = words.slice(0, style.wordsPerScene).join(" ") + "\u2026";
      warnings.push(`Scene ${scene.number} auto-trimmed: ${words.length} -> ${style.wordsPerScene}`);
    }
  }

  // Prohibited words (spider, thunder, scary, monster, blood...)
  const found = PROHIBITED_WORDS.filter(w => fullText.includes(w));
  if (found.length > 0) warnings.push(`Prohibited words: ${found.join(", ")}`);

  // Child-specific avoidances
  const avoidances = child.avoidances.filter(a => fullText.includes(a));
  if (avoidances.length > 0) warnings.push(`Avoidances found: ${avoidances.join(", ")}`);

  return warnings; // Surfaced to admin, not blocking
}
```

The key insight: we don't reject and regenerate. We **warn the admin and auto-trim**. Regeneration is expensive ($0.03-0.10 per Claude call) and often produces the same issues. Better to fix in post.

---

## 6. Key Feature Deep-Dive #2: The Privacy-First Illustration Pipeline

This one taught us the most. The core constraint from `constraints.md`:

> *Nothing reversible to the original photo is ever retained after the face reference is saved.*

That's a COPPA-grade requirement. Here's how we enforce it:

### The 6-Step Deletion Chain

```
1. Photos uploaded     -> Supabase Storage (private bucket)
2. Pipeline triggered  -> Photos downloaded to Modal GPU memory
3. LoRA training done  -> Photos deleted from Modal memory (gc.collect())
4. Illustrations done  -> Photos deleted from Supabase Storage
5. Book PDF generated  -> LoRA weights deleted from Modal Volume
6. Result: only the illustrations and PDF remain. No source photos. No model weights.
```

### The LoRA Training (150 Steps, ~5 Minutes)

```python
# modal/illustration_pipeline.py

# Decode photos to PIL in memory --- never touch disk
pil_images = []
for b64_str in photos_b64:
    img = Image.open(io.BytesIO(base64.b64decode(b64_str))).convert("RGB")
    img = img.crop(center_square).resize((512, 512), Image.LANCZOS)
    pil_images.append(img)

# Apply LoRA to UNet only (rank 4 --- tiny adapter)
lora_config = LoraConfig(
    r=4, lora_alpha=4,
    target_modules=["to_q", "to_k", "to_v", "to_out.0"],
)
unet = get_peft_model(unet, lora_config)

# Encode images with VAE, then DELETE source photos immediately
latents_list = [vae.encode(transform(img)).latent_dist.sample() for img in pil_images]

del pil_images       # Privacy constraint step 3
photos_b64.clear()   # Clear the input too
gc.collect()         # Force memory cleanup

# 150 training steps with AdamW
for step in range(150):
    latent = latents_list[step % num_images]
    noise = torch.randn_like(latent)
    noisy = scheduler.add_noise(latent, noise, timesteps)
    pred = unet(noisy, timesteps, encoder_hidden_states=prompt_embeds).sample
    loss = F.mse_loss(pred, noise)
    loss.backward()
    optimizer.step()
```

The beauty of LoRA rank-4 is that the adapter weights are ~2MB. They encode "what `sks child` looks like" but you can't reconstruct the original photos from them. It's a one-way transform.

### Cover vs. Scene Generation

Covers get special treatment --- higher resolution, more inference steps, and a dedicated prompt:

```python
# Cover: 1024x1024, guidance 8.5, 40 steps, negative prompt, then 2x upscale
cover_image = pipe(
    prompt=styled_cover,
    negative_prompt=COVER_NEGATIVE_PROMPT,
    width=1024, height=1024,
    num_inference_steps=40,
    guidance_scale=8.5,
).images[0]

del pipe; gc.collect(); torch.cuda.empty_cache()  # Free VRAM before upscale
cover_image = upscale_with_realesrgan(cover_image)  # ~2048x2048

# Scenes: 768x768, guidance 7.5, 30 steps (standard quality)
pipe = reload_pipeline()  # Reload SDXL + LoRA
for prompt in scene_prompts:
    image = pipe(prompt=prompt, width=768, height=768,
                 num_inference_steps=30, guidance_scale=7.5).images[0]
```

We delete the SDXL pipeline before loading Real-ESRGAN to avoid OOM on the A10G (24GB). It means reloading the pipeline for scenes, which adds ~20 seconds, but it's the difference between "works" and "CUDA out of memory."

---

## 7. Lessons Learned: What Would I Do Differently?

**1. The God File Problem**

*The problem:* `admin/actions.ts` is 1600+ lines. Story generation, illustration orchestration, book creation, print flow, admin queries --- all in one file.

*The fix (planned):* Split into `lib/story/generate.ts`, `lib/illustration/pipeline.ts`, `lib/book/generate.ts`. Each with its own types and error handling.

*The lesson:* "use server" files grow fast because every new admin feature needs a server action. Set a 300-line limit per file and split early.

**2. JSON Parsing from Claude**

*The problem:* Claude sometimes wraps JSON in markdown fences (` ```json ... ``` `), adds trailing commas, or returns partial JSON on timeout.

*The fix:*
```typescript
const cleaned = text
  .replace(/^```json?\s*/, "")
  .replace(/\s*```$/, "")
  .replace(/,\s*([}\]])/g, "$1")  // trailing commas
  .trim();
```
Plus a single retry on parse failure.

*The lesson:* Never trust LLM output format. Always have a cleanup layer and a retry. Two attempts with cleanup catches 99% of cases.

**3. Puppeteer Memory on Vercel**

*The problem:* Puppeteer loads 8+ base64-encoded PNGs (each ~2MB) into a headless Chrome tab. On Vercel's default 1024MB function memory, this OOMs silently.

*The fix:* Vercel Pro with 3008MB function memory and 600s timeout. No code change --- just infrastructure config.

*The lesson:* PDF generation with embedded images is a memory hog. Know your runtime limits before you build the feature, not after.

**4. Character Photos Are a One-Shot Deal**

*The problem:* We delete character photos after LoRA training (privacy requirement). If the illustrations look bad, we can't retrain.

*The fix:* We now check `child.character_photos_deleted_at` before allowing pipeline retrigger. If photos are gone, the admin sees a clear error instead of a silent failure.

*The lesson:* Irreversible operations need guard rails and clear messaging. "Photos already deleted" is better than a cryptic 404 from Supabase Storage.

---

## 8. Design Patterns in Practice

### Strategy Pattern: Age-Adaptive Book Layouts

The book template uses a strategy pattern to render scenes differently based on age:

```typescript
// template.ts

const AGE_PROFILES: AgeProfile[] = [
  { label: "3-4", layout: "overlay",    fontSize: 24, chapterLabel: false },
  { label: "5-6", layout: "overlay",    fontSize: 20, chapterLabel: false },
  { label: "7-8", layout: "sideBySide", fontSize: 16, chapterLabel: true },
  { label: "9-10", layout: "sideBySide", fontSize: 14, chapterLabel: true },
];

function scenePage(scene, profile: AgeProfile): string {
  return profile.layout === "overlay"
    ? sceneOverlay(scene, profile)     // Full-bleed image, text over gradient
    : sceneSideBySide(scene, profile); // 50/50 split, chapter headers
}
```

A 3-year-old gets big text overlaid on a full-page illustration. A 9-year-old gets a chapter-book layout with the image on the left and text on the right. Same data, different presentation.

### Factory Pattern: Prompt Construction

The prompt builder constructs different system prompts based on the child's age band and episode number:

```typescript
function buildEpisodePrompt(child, storyBible, harvest, age) {
  const style = getStoryStyle(age);
  const sceneCount = SCENE_COUNT[getAgeBand(age)];
  const characterBlock = buildCharacterBlock(storyBible);

  const system = `You are writing Episode ${harvest.quarter} of a 4-part
story series for a ${age}-year-old.

Writing style rules --- follow these exactly:
- Each scene must be ${style.wordsPerScene} words or fewer
- Sentence length: ${style.sentenceLength}
- Vocabulary level: ${style.vocabulary}
- Tone: ${style.tone}
- Tension level: ${style.tension}

Emotional arc: ${style.emotionalArc}
The story must follow this arc. Do not skip the middle.

${characterBlock}

Output exactly ${sceneCount} scenes as JSON.`;

  return { system, user: buildUserPrompt(child, harvest) };
}
```

Each age band, each quarter, each child produces a unique prompt. The factory assembles the pieces; Claude does the writing.

### Fire-and-Forget: Audit Logging

```typescript
// lib/audit.ts
export function logEvent(params: LogEventParams): void {
  // No await. No try/catch that rethrows.
  getAuditClient()
    .from("audit_log")
    .insert({ event_type: params.event_type, status: params.status, ... })
    .then(({ error }) => {
      if (error) console.error("audit_log failed:", error.message);
    })
    .catch(console.error);
}
```

This is intentionally not awaited. If the audit table is down, we don't want to block the user's action. We log the failure to stdout (which Vercel captures) and move on.

---

## 9. The Decisions That Mattered

### "Server Actions" > "API Routes" for Admin Operations

Every admin operation (generate story, trigger illustrations, mark shipped) is a server action, not an API route. This means:
- Type safety end-to-end (the client component calls a typed function, not `fetch`)
- No CORS, no route file, no request parsing boilerplate
- Auth is handled by `verifyAdmin()` at the top of each action

The only API routes are for external callers: Stripe webhooks and cron jobs.

### "Warn and Auto-Trim" > "Reject and Regenerate"

When Claude returns a scene with 45 words instead of the 30-word limit, we trim it and warn the admin. We don't throw it away and call Claude again.

Why? Regeneration costs money and time, and the second attempt often has the same issue. Trimming a few extra words preserves the narrative while keeping the page layout intact. The admin can always manually edit before printing.

### "Embedded Fonts" > "Google Fonts CDN"

The book HTML template embeds Nunito as a base64 woff2 data URI instead of linking to Google Fonts:

```typescript
const nunitoBase64 = readFileSync(
  join(process.cwd(), "web/lib/book/fonts/Nunito-Latin.woff2")
).toString("base64");
```

Puppeteer runs headless with `waitUntil: "networkidle0"`. If Google Fonts is slow (or blocked), the PDF renders with fallback fonts and looks terrible. Embedding the font is 39KB of overhead but guarantees visual consistency every time.

---

## 10. Potential Pitfalls and How to Avoid Them

### Pitfall 1: Missing RLS on New Tables

```sql
-- BAD: Table with no RLS (any authenticated user can read everything)
create table gift_claims (
  id uuid primary key,
  family_id uuid references families(id),
  claim_token text
);

-- GOOD: RLS enabled + scoped policy
create table gift_claims (
  id uuid primary key,
  family_id uuid references families(id),
  claim_token text
);
alter table gift_claims enable row level security;

create policy "Families see own gift claims"
  on gift_claims for select to authenticated
  using (family_id = auth_family_id());
```

Every new table needs RLS. No exceptions.

### Pitfall 2: Awaiting Audit Logs

```typescript
// BAD: If audit table is down, the whole action fails
await logEvent({ event_type: "story.generate", status: "started" });
const result = await generateStory(harvestId);

// GOOD: Fire-and-forget, never blocks the main flow
logEvent({ event_type: "story.generate", status: "started" });
const result = await generateStory(harvestId);
```

### Pitfall 3: Double-Click on Server Actions

```tsx
// BAD: useState for in-flight tracking (re-render race condition)
const [loading, setLoading] = useState(false);
const handleClick = async () => {
  setLoading(true);          // setState is async!
  await markShipped(id);     // Can fire twice before re-render
  setLoading(false);
};

// GOOD: useRef for synchronous check
const inFlight = useRef(false);
const handleClick = async () => {
  if (inFlight.current) return;  // Synchronous, no race
  inFlight.current = true;
  await markShipped(id);
  inFlight.current = false;
};
```

### Pitfall 4: Trusting LLM JSON Output

```typescript
// BAD: Parse directly
const episode = JSON.parse(claude_response);

// GOOD: Clean up known artifacts, retry on failure
const cleaned = response
  .replace(/^```json?\s*/, "")     // Strip markdown fences
  .replace(/\s*```$/, "")
  .replace(/,\s*([}\]])/g, "$1")   // Trailing commas
  .trim();

try {
  return JSON.parse(cleaned);
} catch (e) {
  if (attempt < 2) return callClaude(system, user, attempt + 1);
  throw new Error(`Invalid JSON after 2 attempts`);
}
```

---

## 11. What's Next: The Roadmap

1. **Gelato API integration** --- Replace the manual "copy PDF link to Gelato dashboard" workflow with a direct API call. The counter in the admin dashboard tracks progress toward this (at 50 orders, it's time).
2. **Split `actions.ts`** --- Extract story generation, illustration pipeline, and book generation into separate modules under `lib/`.
3. **Illustration quality scoring** --- Run a CLIP similarity check between the prompt and generated image. Auto-flag low-scoring illustrations for admin review.
4. **Parent preview flow** --- Let parents see a digital preview of the book before it ships. Approve or request one free regeneration per quarter.
5. **Multi-child story crossovers** --- If a family has two children, Episode 4 (birthday book) could feature both kids in the same adventure.
6. **Automated Q4 birthday scheduling** --- Q4 harvest windows are birthday-relative (opens 8 weeks before, ships 3 weeks before). Currently manual; needs a cron job that opens windows based on each child's DOB.

---

## 12. Final Thoughts

Storybound started as a simple idea --- "what if your kid was in a storybook?" --- and turned into a pipeline engineering problem. The hardest parts weren't the AI; they were the **constraints around the AI**. Making Claude respect word limits for a 3-year-old. Deleting photos at exactly the right moment in the pipeline. Making sure a book about your kid doesn't accidentally include the word "scary."

The stack is pragmatic: Next.js because server actions are great for admin tools, Supabase because RLS solves multi-tenancy for free, Modal because paying per-GPU-second beats maintaining a server. Every choice was "what's the simplest thing that works for the constraint we have?"

The code isn't perfect. `actions.ts` is too big. The illustration pipeline reloads the model twice because of memory limits. The quality checks are warn-only instead of blocking. But it ships books. Real, printed, personalized books that arrive at your door with your kid's face on the cover.

*That's the job.*

---

*Last updated: March 18, 2026*
