# Storybound — Sensitive Content Taxonomy

---

## Purpose

This document defines what content is always prohibited, what requires editorial review, and what edge cases require human judgment. Every generated story passes through this taxonomy before approval.

---

## Always Prohibited (Auto-Reject)

Any story or illustration containing the following is automatically rejected and regenerated:

**Violence & Harm**
- Physical fighting, hitting, or injury of any kind
- Weapons of any type
- Blood or bodily harm references
- Characters in danger of physical harm

**Fear Triggers (Default)**
- Darkness presented as threatening
- Monsters intended to frighten (friendly monsters are fine)
- Scary faces or imagery
- Isolation — child alone in threatening environment
- Separation from parents as threat or punishment
- Death or dying of any character (including animals)
- Natural disasters presented threateningly

**Adult Content**
- Any sexual or romantic content
- Adult relationships beyond parental/family
- Alcohol, drugs, or adult substances
- Adult conflicts (divorce, financial stress, illness)

**Inappropriate for Children**
- Real-world violence or conflict
- News events or political content
- Commercial brands or products
- Real celebrities or public figures

---

## Parent-Specified Avoidances (Hard Override)

Each child profile includes a list of parent-specified avoidances. These are hard limits that override all defaults.

**Examples of common parent avoidances:**
- Specific animals (spiders, snakes, dogs)
- Specific fears (loud noises, water, getting lost)
- Family-specific sensitivities (recent loss, new sibling anxiety)
- Cultural/religious considerations
- Medical references (allergies, medical procedures)

**Implementation:**
```
// In story generation prompt:
HARD AVOIDANCE LIST for {{child_name}} — never include under any circumstances:
{{avoidances_list}}

// Before approval, run explicit check:
Does any scene mention or imply: {{avoidances_list}}?
If yes → regenerate that scene.
```

---

## Requires Editorial Review (Human Approval)

Stories with the following elements need a human editor to approve before printing:

**Ambiguous Fear Content**
- Antagonist characters who create tension (even friendly ones)
- Storms or weather as plot devices
- Getting lost (even temporarily)
- Failing at something challenging

**Family Structure Sensitivity**
- Any reference to family members should match the family notes in profile
- Missing parent situations require care
- Blended family or guardianship situations
- Multiple sets of grandparents or caregivers

**Cultural / Religious Content**
- Stories that happen to intersect with religious holidays
- Cultural references that could be misrepresenting
- Names or settings drawn from specific cultural traditions

**Child's Real-World Context**
- If parent notes mention a difficult life event (illness, loss, moving)
- If the story might unintentionally echo a real trauma

---

## Edge Case Handling

### Child has recently lost a pet
Do not include animal companions dying or disappearing. If the story bible already has an animal companion, ensure it remains present and safe throughout all episodes that year.

### Child is in hospital or seriously ill
Parent may note this. If so: avoid any medical settings, illness references, or stories about being weak/vulnerable. Emphasize capability, strength, and adventure.

### Custody / non-traditional family
Story bible should reflect actual family structure. "Mom and Dad" should not appear if child has two moms or a single parent. The parent intake form asks about family structure for this reason.

### Child with disability or difference
If parent notes a physical or cognitive difference, the story should naturally include the child as capable and heroic — not in spite of their difference, but as themselves. Do not make the disability a plot point unless the parent explicitly requests it.

### Child going through a transition (new school, new sibling, moving)
Stories can reflect this positively (new adventure, growing up) but should not dramatize the anxiety. If parent flags transition, the editorial note should acknowledge it without amplifying fear.

---

## Content Review Checklist

Before every story is approved for print:

**Automated checks:**
- [ ] No words from prohibited list appear
- [ ] No items from parent avoidance list appear
- [ ] Positive resolution confirmed
- [ ] Age-appropriate language (Flesch-Kincaid check)

**Human editorial checks:**
- [ ] Story feels genuinely personal to this child (not templated)
- [ ] Child's interests appear naturally, not awkwardly inserted
- [ ] Family structure accurately reflected
- [ ] No unintended fear triggers given this child's profile
- [ ] Episode 4 callbacks are emotionally appropriate (not sad or tense)
- [ ] Overall tone is warm, empowering, and joyful
