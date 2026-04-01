/**
 * Sanitize user-provided text before interpolation into AI prompts.
 * Strips newlines, backticks, and truncates to a safe max length.
 */
export function sanitizeForPrompt(input: string, maxLength = 500): string {
  return input
    .replace(/[\n\r\t]/g, " ")
    .replace(/`/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitize each item in a string array for prompt interpolation.
 */
export function sanitizeArrayForPrompt(
  items: string[],
  maxItemLength = 100
): string[] {
  return items.map((item) => sanitizeForPrompt(item, maxItemLength));
}
