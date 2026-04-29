# Storybound Backlog

## Gouache Style Not Rendering — Images Look Photorealistic

**Priority:** Low
**Files:** `modal/flux_pipeline.py`

### Problem
Generated illustrations appear photorealistic instead of gouache/painterly despite STYLE_SUFFIX containing "gouache painting style, 2D illustrated, painterly". The LoRA trained on real photos at `lora_scale=0.85` overpowers the style tokens.

### Root Causes
1. **Training prompt is `"a photo of sks child"`** — LoRA learned photorealistic representation
2. **`lora_scale=0.85` is high** — photorealistic bias from training dominates style prompt
3. **STYLE_SUFFIX is last in T5 prompt** — weakest positional attention weight
4. **CLIP prompt says `"children's photo book"`** — "photo" reinforces photorealism
5. **Cover prompt says `"portrait"` unqualified** — leans toward photographic portrait

### Safe Fixes (no likeness risk)
- Move STYLE_SUFFIX before `sks child` in T5 prompt — style tokens get stronger positional weight
- Change CLIP `children's photo book` → `children's illustrated book, gouache`
- Change cover `portrait` → `illustrated portrait`

### Risky Fix (test carefully)
- Lower `lora_scale` from 0.85 → 0.80 or 0.75 — gives style prompt room but may reduce likeness
- Recommend: deploy safe fixes first, evaluate, then try lora_scale reduction as a second step with side-by-side likeness comparison

---

## End-to-End Book Generation Takes ~1 Hour — Needs Significant Reduction

**Priority:** High
**Files:** `modal/flux_pipeline.py`, `web/app/admin/actions.ts`, `web/lib/book/generator.ts`

### Problem
Full pipeline from "Generate Story" to finished book PDF takes approximately 1 hour. This is too slow for a good user/admin experience. Must reduce time significantly without sacrificing quality of illustrations, story, or book layout.

### Current Pipeline Bottlenecks (estimated)
1. **LoRA training** (~15-20 min) — 2000 steps on L40S GPU
2. **Illustration generation** (~25-35 min) — 8-12 scenes × 5 candidates × 35 inference steps + cover + retry rounds
3. **Story generation** (~2-3 min) — Claude API calls for story bible + episode
4. **Book PDF rendering** (~1-2 min) — HTML generation + Modal PDF endpoint
5. **Image downloads/uploads** (~2-3 min) — sequential Supabase signed URL downloads

### Investigation Areas
- **Training**: Can steps be reduced (2000 → 1000-1500) without quality loss? Profile loss curve to find plateau
- **Illustration generation**: Biggest time sink
  - Reduce candidates from 5 → 3 (reranking still works, 40% fewer generations)
  - Reduce inference steps from 35 → 25-28 (FLUX.1-dev may converge earlier)
  - Parallelize scene generation (currently sequential, could batch if VRAM allows)
  - Skip retry round if best_score > 0.3 (most retries are unnecessary)
- **Image I/O**: Download illustrations in parallel instead of sequential loop in `generator.ts`
- **Pipeline orchestration**: Can LoRA training + story generation run in parallel? (story doesn't need LoRA)

### Constraints
- No reduction in illustration quality or child likeness
- No reduction in story quality or age-appropriateness
- No reduction in book layout quality
- Must maintain the evaluation/reranking quality checks
