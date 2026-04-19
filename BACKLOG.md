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
