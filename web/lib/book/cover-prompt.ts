/* ─── Cover Prompt Builder ─────────────────────────────────────────────────── */

/**
 * Build a personalised cover illustration prompt using the child's
 * appearance from the story bible hero profile.
 *
 * The `sks child` token maps to the LoRA-trained face identity so SDXL
 * generates the child's likeness.
 */
export function buildCoverPrompt(
  appearance: string,
  personality: string,
  storyTheme: string
): string {
  return [
    `portrait illustration of sks child, ${appearance},`,
    `centered composition, character facing viewer with warm smile,`,
    `full body or three-quarter shot,`,
    `soft bokeh background with subtle hints of ${storyTheme},`,
    `clear open space in bottom third for title text,`,
    `hero framing, warm golden hour lighting,`,
    `watercolor children's book illustration, Ghibli-warm,`,
    `soft lighting, detailed background, age-appropriate`,
  ].join(" ");
}
