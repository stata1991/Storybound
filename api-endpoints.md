# Storybound — API Endpoints

---

## Base URL
`https://api.storybound.co/v1`

---

## Authentication
All endpoints require Bearer token (Supabase JWT) unless marked `[PUBLIC]`.

---

## Families & Subscriptions

### GET /families/me
Returns current family's subscription state.
```json
Response 200:
{
  "id": "fam_...",
  "subscription_status": "active",
  "subscription_tier": "physical_digital",
  "is_founding_member": true,
  "billing_cycle_start": "2026-03-01",
  "next_renewal": "2027-03-01",
  "children": ["child_id_1"]
}
```

### POST /families
Create a new family account. Called after Stripe checkout success.
```json
Request:
{
  "email": "parent@example.com",
  "stripe_customer_id": "cus_...",
  "subscription_tier": "physical_digital",
  "is_founding_member": true
}
Response 201:
{
  "id": "fam_...",
  "referral_code": "MIASMOM"
}
```

---

## Children

### POST /children
Add a child to the family.
```json
Request:
{
  "name": "Mia",
  "date_of_birth": "2019-03-15",
  "pronouns": "she_her",
  "reading_level": "early_reader",
  "interests": ["dinosaurs", "drawing", "space"],
  "favorites": { "color": "purple", "animal": "penguin" },
  "avoidances": ["spiders", "loud thunder"],
  "family_notes": "Single mom household. Loves her cat Oscar."
}
Response 201:
{
  "id": "child_...",
  "name": "Mia",
  "current_year": 1,
  "next_birthday": "2026-03-15",
  "q4_harvest_opens": "2026-01-18",
  "q4_harvest_closes": "2026-02-08"
}
```

### GET /children/:id
Get child profile including upcoming harvest windows.
```json
Response 200:
{
  "id": "child_...",
  "name": "Mia",
  "age": 7,
  "current_year": 1,
  "upcoming_harvests": [
    {
      "quarter": 1,
      "season": "spring",
      "window_opens": "2026-01-15",
      "window_closes": "2026-02-10",
      "status": "pending"
    },
    {
      "quarter": 4,
      "season": "birthday",
      "window_opens": "2026-01-18",
      "window_closes": "2026-02-08",
      "target_delivery": "2026-03-01 to 2026-03-08",
      "birthday": "2026-03-15"
    }
  ]
}
```

---

## Harvests (Memory Drops)

### GET /children/:id/harvests/:quarter
Get harvest status for a specific quarter.
```json
Response 200:
{
  "id": "harvest_...",
  "quarter": 1,
  "season": "spring",
  "status": "pending",
  "window_opens": "2026-01-15",
  "window_closes": "2026-02-10",
  "days_remaining": 18
}
```

### POST /children/:id/harvests/:quarter
Submit memory drop. Multipart form (photos + JSON).
```json
Request (JSON part):
{
  "memory_1": "We visited grandma and Mia helped plant her first garden",
  "memory_2": "She learned to ride her bike without training wheels",
  "current_interests": ["dinosaurs", "gardening", "bikes"],
  "notable_notes": "She's been asking lots of questions about where food comes from"
}
// + up to 3 image files (JPG/PNG, max 10MB each)

Response 201:
{
  "id": "harvest_...",
  "status": "submitted",
  "submitted_at": "2026-01-28T14:22:00Z",
  "face_processing_eta": "2026-01-29T14:22:00Z",
  "photos_deletion_at": "2026-01-31T14:22:00Z"
}
```

---

## Episodes (Books)

### GET /children/:id/episodes
List all episodes for a child.
```json
Response 200:
{
  "episodes": [
    {
      "id": "ep_...",
      "quarter": 1,
      "year": 1,
      "title": "The Hidden Valley",
      "season": "spring",
      "status": "delivered",
      "delivered_at": "2026-03-05"
    }
  ]
}
```

### GET /children/:id/episodes/:id
Get episode detail including digital access.
```json
Response 200:
{
  "id": "ep_...",
  "title": "The Hidden Valley",
  "status": "delivered",
  "digital_url": "https://read.storybound.co/ep/...",
  "print_status": "delivered",
  "tracking_number": "1Z...",
  "delivered_at": "2026-03-05",
  "parent_note": "This story celebrated Mia's curiosity and her love of gardening..."
}
```

### POST /children/:id/episodes/:id/approve `[INTERNAL]`
Approve episode for printing. Internal editorial use only.
```json
Request: {}
Response 200:
{
  "status": "approved",
  "approved_at": "2026-02-14T...",
  "target_birthday": "2026-03-15",
  "estimated_delivery": "2026-03-08"
}
```

---

## Story Bibles `[INTERNAL]`

### POST /children/:id/story-bibles
Generate story bible for a new year. Internal editorial trigger.

### GET /children/:id/story-bibles/:year
Retrieve story bible for a specific year.

---

## Webhooks

### Stripe
`POST /webhooks/stripe`
Handles: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`

### Print Partner
`POST /webhooks/print`
Handles: `order.confirmed`, `order.shipped`, `order.delivered`

---

## Error Format
```json
{
  "error": {
    "code": "HARVEST_WINDOW_CLOSED",
    "message": "The memory drop window for Q1 closed on February 10. Your child's story will be created using their existing profile.",
    "details": {}
  }
}
```

---

## API Versioning
Current version: `v1`
Deprecation policy: previous versions supported 12 months after deprecation announcement.
