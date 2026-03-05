import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import "dotenv/config";
import {
  ChildProfile,
  HarvestData,
  TEST_CHILD_1,
  HARVEST_CHILD_1,
  ALL_PROFILES,
} from "./test-profiles";

// ─── Config ──────────────────────────────────────────────────────────────────

const MODEL = "claude-sonnet-4-20250514";
const OUTPUT_DIR = join(__dirname, "..", "output");

const client = new Anthropic();

// ─── Prompt builders ─────────────────────────────────────────────────────────

function pronounLabel(p: string): string {
  return p.replace(/_/g, "/");
}

function childAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function buildStoryBiblePrompt(child: ChildProfile): {
  system: string;
  user: string;
} {
  const age = childAge(child.date_of_birth);
  return {
    system: `You are a children's book author specializing in episodic adventure series for ages 3-10.
Your job is to create a Story Bible for a child's personalized quarterly storybook subscription.
The bible establishes: the child's hero identity, their world, recurring companions, the seasonal arc, and each episode's emotional theme.

Rules:
- The child IS the hero. Not a character inspired by them. Them.
- The world is fictional. No real locations, schools, or identifiable details.
- Four episodes per year form one Season. Each episode is self-contained but threads the arc.
- Episode 4 is ALWAYS the Birthday Episode — the emotional climax of the season.
- Avoid: ${child.avoidances.length > 0 ? child.avoidances.join(", ") : "nothing specifically noted"}.
- Include: the child's actual interests, age-appropriate challenges, humor, wonder.
- Tone: warm, adventurous, imaginative. Think Studio Ghibli, not Disney action.

Output format: JSON only. No preamble, no markdown fences.`,
    user: `Generate a Story Bible for this child:

Child profile:
- Name: ${child.name}
- Age: ${age}
- Pronouns: ${pronounLabel(child.pronouns)}
- Interests: ${child.interests.join(", ")}
- Favorite things: ${Object.entries(child.favorites).map(([k, v]) => `${k}: ${v}`).join(", ")}
- Fears to avoid: ${child.avoidances.length > 0 ? child.avoidances.join(", ") : "none specified"}
- Reading level: ${child.reading_level.replace(/_/g, " ")}
- Family context: ${child.family_notes}

Output this exact JSON structure:
{
  "hero": {
    "name": "...",
    "age": ...,
    "pronouns": "...",
    "personality": "...",
    "special_ability": "...",
    "greatest_strength": "..."
  },
  "world": {
    "name": "...",
    "description": "...",
    "tone": "...",
    "key_locations": ["...", "...", "..."]
  },
  "companion": {
    "name": "...",
    "type": "...",
    "personality": "...",
    "special_role": "..."
  },
  "season_arc": {
    "title": "...",
    "overarching_theme": "...",
    "what_the_hero_learns_this_year": "..."
  },
  "episodes": [
    {
      "number": 1,
      "season": "spring",
      "title": "...",
      "emotional_theme": "...",
      "challenge": "...",
      "resolution": "...",
      "setup_for_next": "..."
    },
    {
      "number": 2,
      "season": "summer",
      "title": "...",
      "emotional_theme": "...",
      "challenge": "...",
      "resolution": "...",
      "setup_for_next": "..."
    },
    {
      "number": 3,
      "season": "autumn",
      "title": "...",
      "emotional_theme": "...",
      "challenge": "...",
      "resolution": "...",
      "setup_for_next": "..."
    },
    {
      "number": 4,
      "season": "birthday",
      "title": "...",
      "emotional_theme": "...",
      "challenge": "...",
      "resolution": "...",
      "callback_to": ["ep1_moment", "ep2_moment", "ep3_moment"],
      "birthday_celebration_element": "..."
    }
  ]
}`,
  };
}

function buildEpisodePrompt(
  child: ChildProfile,
  storyBible: any,
  harvest: HarvestData
): { system: string; user: string } {
  const isEp4 = harvest.episode_number === 4;
  const ep4Section = isEp4
    ? `
Previous episode callbacks:
- Episode 1 moment to reference: ${storyBible.episodes?.[0]?.resolution ?? "N/A"}
- Episode 2 moment to reference: ${storyBible.episodes?.[1]?.resolution ?? "N/A"}
- Episode 3 moment to reference: ${storyBible.episodes?.[2]?.resolution ?? "N/A"}`
    : "";

  return {
    system: `You are a children's book author. You are writing one episode of a quarterly personalized storybook series.
The child is the hero. The story must feel genuinely personal, not templated.

Episode rules:
- 1,200–1,800 words of story content (32-page book format)
- This is a hard minimum. If your episode is under 1,200 words, expand scene descriptions, add sensory detail, and deepen the emotional beats until you reach it. Count your words before finishing.
- Split into 8 scenes of roughly equal length
- Each scene gets one illustration prompt (separate field)
- Language matches the child's reading level: ${child.reading_level.replace(/_/g, " ")}
- Episode is self-contained (new reader can follow it)
- Episode threads the seasonal arc (existing reader feels continuity)
${isEp4 ? "- Episode 4 must reference specific moments from Episodes 1, 2, and 3" : ""}

Content safety:
- No violence, blood, death, or injury
- No scary darkness or isolation
- No separation from parents as a threat
- Respect all parent-specified avoidances: ${child.avoidances.length > 0 ? child.avoidances.join(", ") : "none specified"}
- Positive resolution required. Challenge is emotional, not dangerous.

Output format: JSON only. No preamble, no markdown fences.`,
    user: `Generate Episode ${harvest.episode_number} for ${child.name}.

Story Bible:
${JSON.stringify(storyBible, null, 2)}

This quarter's harvest data:
- Season: ${harvest.season}
- Key memory 1: ${harvest.memory_1}
- Key memory 2: ${harvest.memory_2}
- Photo descriptions: ${harvest.photo_descriptions.join("; ")}
- Current interests (updated): ${harvest.current_interests.join(", ")}
- Anything new or notable: ${harvest.notable_notes}
${ep4Section}

Output this exact JSON structure:
{
  "title": "...",
  "dedication": "A short, warm dedication line (1 sentence)",
  "scenes": [
    {
      "number": 1,
      "text": "...",
      "illustration_prompt": "..."
    }
  ],
  "final_page": "A short closing line (1-2 sentences) that hints at next episode",
  "parent_note": "A brief warm note for the parent about what this story celebrated (2-3 sentences, not printed in book)"
}

Remember: exactly 8 scenes. Each illustration_prompt must end with [FACE REF: use reference image storybound_ref_CHILD_ID_q${harvest.episode_number}.png]`,
  };
}

// ─── Quality checks ──────────────────────────────────────────────────────────

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

const PROHIBITED_WORDS = [
  "spider",
  "spiders",
  "thunder",
  "dark",
  "scary",
  "monster",
  "monsters",
  "hurt",
  "blood",
  "die",
  "dead",
];

function checkStoryBible(bible: any, child: ChildProfile): CheckResult[] {
  const results: CheckResult[] = [];

  // 1. Hero name matches child name
  const heroName = bible?.hero?.name?.toLowerCase() ?? "";
  const childName = child.name.toLowerCase();
  results.push({
    name: "Hero name matches child name",
    passed: heroName.includes(childName),
    detail: heroName.includes(childName)
      ? `Hero name: "${bible.hero.name}"`
      : `Expected "${child.name}", got "${bible?.hero?.name ?? "missing"}"`,
  });

  // 2. Interests appear in world or companion design
  const bibleText = JSON.stringify(bible.world ?? {}).toLowerCase() +
    JSON.stringify(bible.companion ?? {}).toLowerCase();
  const foundInterests = child.interests.filter((i) =>
    bibleText.includes(i.toLowerCase().split(" ")[0])
  );
  results.push({
    name: "Interests reflected in world/companion",
    passed: foundInterests.length > 0,
    detail:
      foundInterests.length > 0
        ? `Found: ${foundInterests.join(", ")}`
        : `None of [${child.interests.join(", ")}] found in world/companion`,
  });

  // 3. Nothing from avoidances list in episode outlines
  if (child.avoidances.length > 0) {
    const episodeText = JSON.stringify(bible.episodes ?? []).toLowerCase();
    const foundAvoidances = child.avoidances.filter((a) =>
      episodeText.includes(a.toLowerCase())
    );
    results.push({
      name: "No avoidances in episode outlines",
      passed: foundAvoidances.length === 0,
      detail:
        foundAvoidances.length === 0
          ? "Clean — no avoidances found"
          : `FOUND AVOIDANCES: ${foundAvoidances.join(", ")}`,
    });
  } else {
    results.push({
      name: "No avoidances in episode outlines",
      passed: true,
      detail: "No avoidances specified — skipped",
    });
  }

  // 4. Episode 4 has birthday_celebration_element
  const ep4 = bible.episodes?.find((e: any) => e.number === 4);
  const hasBirthday = !!ep4?.birthday_celebration_element;
  results.push({
    name: "Episode 4 has birthday_celebration_element",
    passed: hasBirthday,
    detail: hasBirthday
      ? `"${ep4.birthday_celebration_element}"`
      : "Missing birthday_celebration_element on Episode 4",
  });

  return results;
}

function checkEpisode(episode: any, child: ChildProfile): CheckResult[] {
  const results: CheckResult[] = [];

  // 1. All 8 scenes present
  const sceneCount = episode?.scenes?.length ?? 0;
  results.push({
    name: "All 8 scenes present",
    passed: sceneCount === 8,
    detail: sceneCount === 8 ? "8 scenes found" : `Found ${sceneCount} scenes`,
  });

  // 2. illustration_prompt includes [FACE REF] on every scene
  const scenes = episode?.scenes ?? [];
  const missingFaceRef = scenes.filter(
    (s: any) => !s.illustration_prompt?.includes("[FACE REF")
  );
  results.push({
    name: "[FACE REF] tag in every illustration_prompt",
    passed: missingFaceRef.length === 0,
    detail:
      missingFaceRef.length === 0
        ? "All scenes have [FACE REF] tag"
        : `Missing on scenes: ${missingFaceRef.map((s: any) => s.number).join(", ")}`,
  });

  // 3. No prohibited words
  const fullText = JSON.stringify(episode?.scenes ?? []).toLowerCase();
  const foundProhibited = PROHIBITED_WORDS.filter((w) => {
    // Match whole words only using regex
    const regex = new RegExp(`\\b${w}\\b`, "i");
    return regex.test(fullText);
  });
  // Filter out false positives from avoidances being echoed in prompts vs. in story text
  const storyText = scenes.map((s: any) => s.text ?? "").join(" ").toLowerCase();
  const prohibitedInStory = PROHIBITED_WORDS.filter((w) => {
    const regex = new RegExp(`\\b${w}\\b`, "i");
    return regex.test(storyText);
  });
  results.push({
    name: "No prohibited words in story text",
    passed: prohibitedInStory.length === 0,
    detail:
      prohibitedInStory.length === 0
        ? "Clean — no prohibited words"
        : `FOUND: ${prohibitedInStory.join(", ")}`,
  });

  // 4. final_page present
  results.push({
    name: "final_page present",
    passed: !!episode?.final_page,
    detail: episode?.final_page
      ? `"${episode.final_page.slice(0, 80)}..."`
      : "Missing final_page",
  });

  // 5. parent_note present
  results.push({
    name: "parent_note present",
    passed: !!episode?.parent_note,
    detail: episode?.parent_note
      ? `"${episode.parent_note.slice(0, 80)}..."`
      : "Missing parent_note",
  });

  return results;
}

function printResults(label: string, results: CheckResult[]) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"═".repeat(60)}`);
  for (const r of results) {
    const icon = r.passed ? "PASS" : "FAIL";
    const color = r.passed ? "\x1b[32m" : "\x1b[31m";
    console.log(`  ${color}[${icon}]\x1b[0m ${r.name}`);
    console.log(`         ${r.detail}`);
  }
  const passed = results.filter((r) => r.passed).length;
  console.log(`\n  Result: ${passed}/${results.length} checks passed`);
}

// ─── API calls ───────────────────────────────────────────────────────────────

async function callClaude(
  system: string,
  user: string,
  label: string
): Promise<any> {
  console.log(`\n  Calling Claude API for ${label}...`);
  const startTime = Date.now();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: user }],
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  Done in ${elapsed}s (${response.usage.input_tokens} in / ${response.usage.output_tokens} out)`);

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Try to parse JSON — handle possible markdown fences
  const cleaned = text.replace(/^```json?\s*/, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    console.error("  Failed to parse JSON. Raw output saved.");
    return { _raw: text, _parse_error: true };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function runPipeline(child: ChildProfile, harvest: HarvestData) {
  console.log(`\n${"#".repeat(60)}`);
  console.log(`  STORYBOUND PIPELINE: ${child.name}`);
  console.log(`  Season: ${harvest.season} | Episode: ${harvest.episode_number}`);
  console.log(`${"#".repeat(60)}`);

  // Ensure output dir exists
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const prefix = `${child.name.toLowerCase()}_${harvest.season}_${timestamp}`;

  // ── Pass 1: Story Bible ──
  console.log("\n── Pass 1: Story Bible Generation ──");
  const biblePrompt = buildStoryBiblePrompt(child);
  const storyBible = await callClaude(
    biblePrompt.system,
    biblePrompt.user,
    "Story Bible"
  );

  const biblePath = join(OUTPUT_DIR, `${prefix}_bible.json`);
  writeFileSync(biblePath, JSON.stringify(storyBible, null, 2));
  console.log(`  Saved: ${biblePath}`);

  if (storyBible._parse_error) {
    console.error("\n  Story Bible generation failed to return valid JSON.");
    console.error("  Check the _raw field in the output file.");
    return;
  }

  const bibleResults = checkStoryBible(storyBible, child);
  printResults("STORY BIBLE QUALITY CHECK", bibleResults);

  // ── Pass 2: Episode Generation ──
  console.log("\n── Pass 2: Episode Generation ──");
  const episodePrompt = buildEpisodePrompt(child, storyBible, harvest);
  const episode = await callClaude(
    episodePrompt.system,
    episodePrompt.user,
    "Episode"
  );

  const episodePath = join(OUTPUT_DIR, `${prefix}_episode.json`);
  writeFileSync(episodePath, JSON.stringify(episode, null, 2));
  console.log(`  Saved: ${episodePath}`);

  if (episode._parse_error) {
    console.error("\n  Episode generation failed to return valid JSON.");
    console.error("  Check the _raw field in the output file.");
    return;
  }

  const episodeResults = checkEpisode(episode, child);
  printResults("EPISODE QUALITY CHECK", episodeResults);

  // ── Summary ──
  const allResults = [...bibleResults, ...episodeResults];
  const totalPassed = allResults.filter((r) => r.passed).length;
  const totalChecks = allResults.length;
  console.log(`\n${"─".repeat(60)}`);
  console.log(
    `  PIPELINE COMPLETE: ${child.name} — ${totalPassed}/${totalChecks} checks passed`
  );
  if (totalPassed === totalChecks) {
    console.log("  All quality checks passed.");
  } else {
    console.log(
      "  Some checks failed. Review output files and refine prompts."
    );
  }
  console.log(`${"─".repeat(60)}`);

  // Word count for episode
  if (episode.scenes) {
    const wordCount = episode.scenes
      .map((s: any) => s.text ?? "")
      .join(" ")
      .split(/\s+/).length;
    console.log(`  Story word count: ${wordCount} (target: 1200-1800)`);
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const profileArg = process.argv[2] ?? "1";
  const profileIndex = parseInt(profileArg, 10) - 1;

  if (profileIndex < 0 || profileIndex >= ALL_PROFILES.length) {
    console.error(
      `Usage: npm run generate -- [1|2|3]\n  1 = Aria (summer, ep2)\n  2 = Leo (spring, ep1)\n  3 = Maya (birthday, ep4)`
    );
    process.exit(1);
  }

  const { child, harvest } = ALL_PROFILES[profileIndex];
  console.log(`\nSelected profile: ${child.name}`);

  await runPipeline(child, harvest);
}

main().catch((err) => {
  console.error("\nFatal error:", err.message ?? err);
  process.exit(1);
});
