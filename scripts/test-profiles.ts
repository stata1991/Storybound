// Test child profiles from phase0-checklist.md
// Matches the children schema from data-models.md

export interface ChildProfile {
  name: string;
  preferred_name?: string;
  date_of_birth: string; // ISO date
  pronouns: "she_her" | "he_him" | "they_them";
  reading_level: "pre_reader" | "early_reader" | "independent" | "chapter_book";
  interests: string[];
  favorites: Record<string, string>;
  avoidances: string[];
  family_notes: string;
}

export interface HarvestData {
  season: "spring" | "summer" | "autumn" | "birthday";
  episode_number: number;
  memory_1: string;
  memory_2: string;
  photo_descriptions: string[];
  current_interests: string[];
  notable_notes: string;
}

export const TEST_CHILD_1: ChildProfile = {
  name: "Aria",
  date_of_birth: "2021-04-15",
  pronouns: "she_her",
  reading_level: "early_reader",
  interests: ["dinosaurs", "painting", "her cat Whiskers"],
  favorites: { color: "purple", food: "mac and cheese", animal: "cat" },
  avoidances: ["spiders", "loud thunder"],
  family_notes: "Lives with mom and dad. Has a cat named Whiskers. Starting kindergarten this fall. Very imaginative — talks to her stuffed animals like they're real.",
};

export const TEST_CHILD_2: ChildProfile = {
  name: "Leo",
  date_of_birth: "2019-08-22",
  pronouns: "he_him",
  reading_level: "early_reader",
  interests: ["space", "building things", "swimming"],
  favorites: { color: "blue", food: "pizza", animal: "dolphin" },
  avoidances: ["getting lost", "scary monsters"],
  family_notes: "Lives with mom and stepdad. Has a baby sister. Loves asking 'why' questions about everything. Recently visited a science museum and hasn't stopped talking about rockets.",
};

export const TEST_CHILD_3: ChildProfile = {
  name: "Maya",
  date_of_birth: "2017-11-03",
  pronouns: "she_her",
  reading_level: "chapter_book",
  interests: ["reading", "cooking", "horses"],
  favorites: { color: "teal", food: "homemade pasta", animal: "horse" },
  avoidances: [],
  family_notes: "Lives with grandparents. Quiet but deeply thoughtful. Writes her own short stories. Helps grandma cook every weekend. Has been riding horses for two years.",
};

export const HARVEST_CHILD_1: HarvestData = {
  season: "summer",
  episode_number: 2,
  memory_1: "Aria found a 'dinosaur bone' in the backyard (it was a stick) and spent three days cataloging it with labels and drawings.",
  memory_2: "She painted a giant mural of her cat Whiskers flying through space on the garage wall. Mom helped.",
  photo_descriptions: [
    "Aria crouched in the garden holding a curved stick, examining it with a magnifying glass",
    "A colorful painting on paper showing a purple cat with wings flying past stars",
  ],
  current_interests: ["dinosaurs", "painting", "her cat Whiskers", "magnifying glasses"],
  notable_notes: "She just lost her first tooth and is very proud of it.",
};

export const HARVEST_CHILD_2: HarvestData = {
  season: "spring",
  episode_number: 1,
  memory_1: "Leo built a cardboard spaceship in the living room and 'flew' to Mars with his baby sister as co-pilot.",
  memory_2: "At the community pool, he learned to swim underwater for the first time and said he felt like a dolphin.",
  photo_descriptions: [
    "Leo sitting inside a large cardboard box decorated with aluminum foil and drawn-on buttons",
    "Leo underwater in a pool, goggles on, grinning with a thumbs up",
  ],
  current_interests: ["space", "building things", "swimming", "Mars"],
  notable_notes: "Started asking about what astronauts eat. Very into freeze-dried ice cream.",
};

export const HARVEST_CHILD_3: HarvestData = {
  season: "birthday",
  episode_number: 4,
  memory_1: "Maya wrote a short story about a horse who could cook and read it aloud to her whole class.",
  memory_2: "She and grandma made fresh pasta from scratch for the first time — Maya rolled every single noodle herself.",
  photo_descriptions: [
    "Maya standing at the front of a classroom holding handwritten pages, smiling",
    "Maya in a flour-dusted apron pressing a pasta roller with her grandmother beside her",
  ],
  current_interests: ["reading", "cooking", "horses", "writing stories"],
  notable_notes: "Turning 9 in November. She asked for a 'book birthday party' where everyone brings their favorite book instead of a gift.",
};

export const ALL_PROFILES = [
  { child: TEST_CHILD_1, harvest: HARVEST_CHILD_1 },
  { child: TEST_CHILD_2, harvest: HARVEST_CHILD_2 },
  { child: TEST_CHILD_3, harvest: HARVEST_CHILD_3 },
];
