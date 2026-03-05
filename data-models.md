# Storybound — Data Models

---

## Core Entities

### Family
```
families {
  id                  uuid PRIMARY KEY
  created_at          timestamp
  stripe_customer_id  string UNIQUE
  subscription_status enum (trialing, active, past_due, canceled, paused)
  subscription_tier   enum (physical_digital, digital_only)
  subscription_price  decimal  // 109.00 or 39.00 (or 89.00 founding)
  is_founding_member  boolean
  billing_cycle_start date     // Anniversary date for annual renewal
  referral_code       string UNIQUE
  referred_by         uuid FK families
}
```

### Parent
```
parents {
  id              uuid PRIMARY KEY
  family_id       uuid FK families
  email           string UNIQUE
  first_name      string
  last_name       string
  phone           string
  timezone        string
  notification_preferences jsonb  // email/sms/push per event type
  created_at      timestamp
}
```

### Child
```
children {
  id                  uuid PRIMARY KEY
  family_id           uuid FK families
  name                string
  preferred_name      string  // nickname if different
  date_of_birth       date
  pronouns            enum (she_her, he_him, they_them, other)
  pronouns_other      string
  reading_level       enum (pre_reader, early_reader, independent, chapter_book)
  interests           text[]  // ["dinosaurs", "space", "drawing"]
  favorites           jsonb   // {color: "purple", food: "pasta", animal: "penguin"}
  avoidances          text[]  // ["spiders", "loud noises", "getting lost"] — HARD LIMITS
  family_notes        text    // free-form context: "single mom", "new baby sibling", etc.
  current_year        integer // which year of Storybound they're on
  active              boolean
  created_at          timestamp
}
```

### Story Bible
```
story_bibles {
  id              uuid PRIMARY KEY
  child_id        uuid FK children
  year            integer  // 1, 2, 3...
  season_title    string
  hero_profile    jsonb    // from story generation output
  world_profile   jsonb
  companion       jsonb
  season_arc      jsonb
  episode_outlines jsonb[] // array of 4 episode outlines
  created_at      timestamp
  approved_at     timestamp
  approved_by     string   // editor name
  status          enum (draft, approved, in_use)
}
```

### Harvest (Memory Drop)
```
harvests {
  id                  uuid PRIMARY KEY
  child_id            uuid FK children
  quarter             integer  // 1, 2, 3, 4
  year                integer
  season              enum (spring, summer, autumn, birthday)
  
  // Window
  window_opens_at     timestamp
  window_closes_at    timestamp
  submitted_at        timestamp
  
  // Submission content
  memory_1            text
  memory_2            text
  photo_count         integer
  photo_paths         text[]   // temp paths, deleted after processing
  current_interests   text[]   // updated interests this quarter
  notable_notes       text
  
  // Processing
  face_ref_generated  boolean
  face_ref_path       string   // generated reference, retained
  photos_deleted_at   timestamp // 72-hour window
  
  status              enum (pending, submitted, processing, complete, missed)
}
```

### Episode (Book)
```
episodes {
  id                  uuid PRIMARY KEY
  child_id            uuid FK children
  harvest_id          uuid FK harvests
  story_bible_id      uuid FK story_bibles
  quarter             integer
  year                integer
  episode_number      integer  // 1–4
  
  // Story content
  title               string
  dedication          string
  scenes              jsonb[]  // array of {number, text, illustration_prompt}
  final_page          string
  parent_note         text
  
  // Illustration
  illustration_status enum (pending, generating, review, approved, rejected)
  illustration_paths  text[]   // 9 total (8 scenes + cover)
  
  // Production
  print_file_path     string
  print_status        enum (pending, submitted, printing, shipped, delivered)
  tracking_number     string
  
  // Approval
  story_approved_at   timestamp
  story_approved_by   string
  print_approved_at   timestamp
  
  // Delivery
  target_delivery_date date
  shipped_at          timestamp
  delivered_at        timestamp
  
  created_at          timestamp
  status              enum (draft, story_review, illustration_review, approved, printing, shipped, delivered)
}
```

### Quarterly Delivery Calendar
```
delivery_calendar {
  id              uuid PRIMARY KEY
  quarter         integer  // 1, 2, 3 (Q4 is birthday-relative, not in this table)
  year            integer
  season          enum (spring, summer, autumn)
  
  harvest_opens   date     // When memory drop emails go out
  harvest_closes  date     // Submission deadline
  production_start date
  ship_by_date    date
  delivery_target date     // Target arrival window
  
  // Q4 is computed per-child based on birthday:
  // harvest_opens = birthday - 56 days (8 weeks)
  // harvest_closes = birthday - 35 days (5 weeks)
  // ship_by = birthday - 21 days (3 weeks)
  // delivery_target = birthday - 7 to 14 days
}
```

---

## Key Computed Fields

### Child's Q4 (Birthday) Window
```javascript
function getBirthdayHarvestWindow(dateOfBirth) {
  const nextBirthday = getNextBirthday(dateOfBirth);
  return {
    harvest_opens: subDays(nextBirthday, 56),   // 8 weeks before
    harvest_closes: subDays(nextBirthday, 35),   // 5 weeks before
    ship_by: subDays(nextBirthday, 21),          // 3 weeks before
    delivery_target_earliest: subDays(nextBirthday, 14),
    delivery_target_latest: subDays(nextBirthday, 7)
  };
}
```

### Subscription Anniversary
```javascript
// Annual billing renews on signup anniversary, not calendar year
// Q1/Q2/Q3 windows are fixed seasonal windows
// Q4 is birthday-relative and distributes load across all months
```

---

## Relationships

```
families
  └── parents (1:many)
  └── children (1:many)
      └── story_bibles (1:many — one per year)
      └── harvests (1:many — four per year)
          └── episodes (1:1 — one book per harvest)
```

---

## Privacy Notes

- `photo_paths` in harvests: temp storage only. Set `photos_deleted_at` within 72 hours of `face_ref_generated = true`
- `face_ref_path`: retained for duration of subscription (needed for illustration consistency)
- `family_notes` in children: sensitive free-text. Encrypt at rest. Never logged.
- `avoidances`: sensitive. Never exposed in any API response without authentication.
- All child data: COPPA compliant. Parental consent recorded in families table.
