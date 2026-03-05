# Storybound — Illustration Prompts

---

## Style System

### Core Style by Age Group

**Ages 3–5 (Early Reader)**
```
Soft watercolor illustration, children's picture book style. 
Rounded shapes, gentle brushwork, warm and inviting palette. 
No sharp edges or hard shadows. Inspired by Oliver Jeffers and Jon Klassen.
```

**Ages 6–8 (Chapter Book)**
```
Detailed watercolor and ink illustration, adventure children's book style.
Expressive line work, rich color, slightly more detailed environments.
Inspired by Quentin Blake and Chris Riddell. Playful but not babyish.
```

**Ages 9–10 (Upper Middle Grade)**
```
Painterly illustration with detailed environments, upper middle grade style.
Richer, more nuanced palette. Characters have realistic proportions.
Cinematic composition. Inspired by Studio Ghibli background art.
```

---

## Scene Type Templates

### Opening Scene (Child at home/start of adventure)
```
[AGE STYLE]. [CHILD_DESCRIPTION] standing at the threshold of [WORLD_ENTRY_POINT].
Expression: [wonder/excitement/curiosity]. [COMPANION_NAME] beside them.
Setting: [SPECIFIC WORLD DETAIL]. Time of day: [LIGHTING_DESCRIPTION].
[FACE REF: storybound_ref_{{child_id}}_q{{quarter}}.png]
Aspect ratio: 4:3. High quality children's book illustration.
```

### Action/Adventure Scene
```
[AGE STYLE]. [CHILD_DESCRIPTION] [SPECIFIC ACTION — running/climbing/solving/creating].
Dynamic composition with sense of movement. [COMPANION] reacting.
Setting: [SPECIFIC ENVIRONMENT]. [LIGHTING — dramatic golden/misty/bright].
[FACE REF: storybound_ref_{{child_id}}_q{{quarter}}.png]
Aspect ratio: 4:3. High quality children's book illustration.
```

### Emotional Moment Scene (discovery, pride, friendship)
```
[AGE STYLE]. [CHILD_DESCRIPTION] [EMOTIONAL_POSE — kneeling/reaching/smiling wide].
Close-medium shot. Expression conveys [EMOTION — joy/wonder/pride/determination].
[COMPANION] sharing the moment.
Setting: [INTIMATE ENVIRONMENT DETAIL]. [WARM/SOFT LIGHTING].
[FACE REF: storybound_ref_{{child_id}}_q{{quarter}}.png]
Aspect ratio: 4:3. High quality children's book illustration.
```

### Resolution/Celebration Scene (end of episode)
```
[AGE STYLE]. [CHILD_DESCRIPTION] in triumphant or peaceful pose.
Wide shot showing full environment. [COMPANION] and any supporting characters nearby.
Setting: [WORLD AT ITS MOST BEAUTIFUL]. [GOLDEN/SUNSET/CELEBRATORY LIGHTING].
Sense of completion and warmth. No tension, only joy.
[FACE REF: storybound_ref_{{child_id}}_q{{quarter}}.png]
Aspect ratio: 4:3. High quality children's book illustration.
```

### Birthday Episode Special Scene (Q4 only)
```
[AGE STYLE]. [CHILD_DESCRIPTION] at center of a joyful celebration scene.
World characters and companion gathered around, celebrating the hero.
Birthday elements woven into world aesthetic (not literal birthday party unless requested).
[SPECIFIC BIRTHDAY DETAIL FROM STORY].
Setting: [WORLD'S MOST CELEBRATORY LOCATION]. Warm, glowing light everywhere.
[FACE REF: storybound_ref_{{child_id}}_q{{quarter}}.png]
Aspect ratio: 4:3. High quality children's book illustration.
```

---

## Child Description Builder

Build the `[CHILD_DESCRIPTION]` field from the child's profile:

```
[AGE]-year-old [GENDER_NEUTRAL/BOY/GIRL] with [HAIR_DESCRIPTION] and [EYE_COLOR] eyes.
Wearing [OUTFIT — should reflect interests e.g. dinosaur-print overalls, space-theme backpack].
[HEIGHT — small/average/tall for age] build. [ANY DISTINCTIVE FEATURE — glasses, freckles, curly hair].
```

**Examples:**
- "5-year-old girl with wild curly red hair, green eyes, wearing paint-splattered overalls and tiny boots"
- "7-year-old boy with short black hair and dark brown eyes, wearing a dinosaur t-shirt and cargo shorts, backpack with planet patches"
- "9-year-old with braids and round glasses, wearing a hoodie with constellation print"

---

## Companion Description

Each story has one recurring companion. Always describe them consistently:

```
[COMPANION_NAME]: [TYPE — small dragon/cloud creature/talking fox/etc].
[SIZE — fits in palm/waist-height/small enough to ride on shoulder].
[COLOR AND TEXTURE — sky blue with silver spots/warm amber with glowing eyes].
[PERSONALITY VISUAL CUE — always slightly mischievous expression/wide curious eyes].
```

---

## Face Reference Integration

Every illustration with the child must include:
```
[FACE REF: storybound_ref_{{child_id}}_q{{quarter}}.png]
```

This tag is processed by the illustration pipeline to apply the child's face reference model. The reference image is generated from the quarterly photo submission and used consistently across all 8 scenes in that episode.

**Important:** The face reference changes each quarter as the child grows. Q2 reference differs from Q1. Always use the current quarter's reference.

---

## Cover Illustration

Each book has a full-cover illustration. Use this template:

```
[AGE STYLE]. Full book cover illustration for a children's chapter book.
Hero: [CHILD_DESCRIPTION] in a dynamic hero pose.
Companion: [COMPANION_DESCRIPTION] beside them.
Setting: [MOST ICONIC LOCATION FROM THIS EPISODE].
Title treatment space: clear area at top 20% for title text overlay.
Mood: [EPISODE MOOD — adventurous/mysterious/warm/triumphant].
[FACE REF: storybound_ref_{{child_id}}_q{{quarter}}.png]
Aspect ratio: 3:4 (portrait). Cover quality, hero composition.
```

---

## Quality Checks for Illustrations

Before approving any illustration:
- [ ] Child's appearance matches profile description
- [ ] Face reference tag included
- [ ] Companion appears and matches established description
- [ ] No inappropriate content (violence, scary elements, adult themes)
- [ ] Nothing from parent's avoidance list appears
- [ ] Lighting and mood match the scene emotional beat
- [ ] Aspect ratio correct (4:3 interior, 3:4 cover)
- [ ] Text/title area clear on cover illustration
