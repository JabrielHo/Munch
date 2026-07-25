/**
 * The self-contained "recommendation brain".
 *
 * When someone types an option we classify it as either a specific PLACE
 * ("Tian Tian Chicken Rice") or a generic FOOD / craving ("chicken rice").
 * Generic foods get a fitting emoji + cuisine tag, and — if you've curated
 * local spots below — a suggested place that shows up as a "try: …" chip and
 * on the result screen.
 *
 * There is no external API here (by design: no keys, no cost, works anywhere).
 * To make suggestions real for YOUR city, just fill in the `spots` arrays.
 */

export type FoodKind = "place" | "food";

export interface Classification {
  kind: FoodKind;
  emoji: string;
  cuisine?: string;
  /** A suggested specific spot for a generic craving (from the `spots` lists). */
  suggestedSpot?: string;
}

interface FoodEntry {
  emoji: string;
  cuisine: string;
  /** Extra phrases that should map to this food. The map key counts too. */
  aliases?: string[];
  /** Your local go-to spots for this craving. Edit these for your city! */
  spots?: string[];
}

/**
 * Curated food dictionary. Keys are matched as whole phrases (case-insensitive).
 * Add your own — and drop real restaurants into `spots` to get "try: …" picks.
 */
const FOODS: Record<string, FoodEntry> = {
  // —— Hawker / SE-Asian ——
  "chicken rice": { emoji: "🍚", cuisine: "Hainanese", aliases: ["hainanese chicken rice"], spots: [] },
  "nasi lemak": { emoji: "🍚", cuisine: "Malay", spots: [] },
  "char kway teow": { emoji: "🍜", cuisine: "Hawker", aliases: ["ckt"], spots: [] },
  laksa: { emoji: "🍜", cuisine: "Peranakan", spots: [] },
  "bak kut teh": { emoji: "🍲", cuisine: "Hokkien", spots: [] },
  "hokkien mee": { emoji: "🍜", cuisine: "Hokkien", spots: [] },
  satay: { emoji: "🍢", cuisine: "Malay", spots: [] },
  "roti prata": { emoji: "🫓", cuisine: "Indian-Muslim", aliases: ["prata", "roti canai"], spots: [] },
  "nasi padang": { emoji: "🍛", cuisine: "Indonesian", spots: [] },
  pho: { emoji: "🍜", cuisine: "Vietnamese", spots: [] },
  "banh mi": { emoji: "🥖", cuisine: "Vietnamese", spots: [] },
  "pad thai": { emoji: "🍤", cuisine: "Thai", spots: [] },
  "tom yum": { emoji: "🍲", cuisine: "Thai", aliases: ["tom yam"], spots: [] },
  thai: { emoji: "🇹🇭", cuisine: "Thai", spots: [] },
  "dim sum": { emoji: "🥟", cuisine: "Cantonese", aliases: ["dimsum", "yum cha"], spots: [] },
  "wanton mee": { emoji: "🍜", cuisine: "Cantonese", aliases: ["wonton noodles", "wanton noodle"], spots: [] },
  "fish ball noodles": { emoji: "🍜", cuisine: "Hawker", aliases: ["fishball noodle"], spots: [] },
  "claypot rice": { emoji: "🍚", cuisine: "Cantonese", spots: [] },
  "zi char": { emoji: "🥘", cuisine: "Cantonese", aliases: ["cze char", "tze char"], spots: [] },

  // —— East Asian ——
  ramen: { emoji: "🍜", cuisine: "Japanese", aliases: ["tonkotsu", "shoyu ramen"], spots: [] },
  sushi: { emoji: "🍣", cuisine: "Japanese", aliases: ["sashimi", "omakase"], spots: [] },
  japanese: { emoji: "🍱", cuisine: "Japanese", aliases: ["jap food", "izakaya"], spots: [] },
  udon: { emoji: "🍜", cuisine: "Japanese", spots: [] },
  donburi: { emoji: "🍚", cuisine: "Japanese", aliases: ["don", "gyudon", "katsudon"], spots: [] },
  "korean bbq": { emoji: "🥩", cuisine: "Korean", aliases: ["kbbq", "korean barbecue"], spots: [] },
  korean: { emoji: "🇰🇷", cuisine: "Korean", aliases: ["korean food"], spots: [] },
  bibimbap: { emoji: "🍲", cuisine: "Korean", spots: [] },
  "fried chicken": { emoji: "🍗", cuisine: "Comfort", aliases: ["korean fried chicken", "kfc"], spots: [] },
  hotpot: { emoji: "🍲", cuisine: "Chinese", aliases: ["hot pot", "steamboat", "mala", "mala xiang guo"], spots: [] },
  dumplings: { emoji: "🥟", cuisine: "Chinese", aliases: ["dumpling", "xiao long bao", "xlb", "gyoza"], spots: [] },
  chinese: { emoji: "🥡", cuisine: "Chinese", aliases: ["chinese food"], spots: [] },

  // —— Western / global ——
  pizza: { emoji: "🍕", cuisine: "Italian", spots: [] },
  pasta: { emoji: "🍝", cuisine: "Italian", aliases: ["spaghetti", "carbonara"], spots: [] },
  italian: { emoji: "🇮🇹", cuisine: "Italian", spots: [] },
  burger: { emoji: "🍔", cuisine: "American", aliases: ["burgers", "cheeseburger"], spots: [] },
  steak: { emoji: "🥩", cuisine: "Grill", aliases: ["steakhouse"], spots: [] },
  bbq: { emoji: "🍖", cuisine: "Barbecue", aliases: ["barbecue", "barbeque"], spots: [] },
  tacos: { emoji: "🌮", cuisine: "Mexican", aliases: ["taco", "burrito", "mexican"], spots: [] },
  "fried rice": { emoji: "🍚", cuisine: "Comfort", spots: [] },
  noodles: { emoji: "🍜", cuisine: "Comfort", aliases: ["noodle"], spots: [] },
  salad: { emoji: "🥗", cuisine: "Healthy", aliases: ["healthy", "poke", "poke bowl"], spots: [] },
  sandwich: { emoji: "🥪", cuisine: "Cafe", aliases: ["subs", "sub", "wrap"], spots: [] },
  indian: { emoji: "🍛", cuisine: "Indian", aliases: ["curry", "biryani", "north indian"], spots: [] },
  "middle eastern": { emoji: "🥙", cuisine: "Middle Eastern", aliases: ["kebab", "shawarma", "falafel"], spots: [] },
  breakfast: { emoji: "🍳", cuisine: "Brunch", aliases: ["brunch", "all day breakfast"], spots: [] },
  cafe: { emoji: "☕", cuisine: "Cafe", aliases: ["coffee", "brunch cafe"], spots: [] },

  // —— Sweets / snacks / drinks ——
  "bubble tea": { emoji: "🧋", cuisine: "Drinks", aliases: ["boba", "bbt", "milk tea"], spots: [] },
  dessert: { emoji: "🍨", cuisine: "Sweets", aliases: ["desserts", "ice cream", "cake"], spots: [] },
  bingsu: { emoji: "🍧", cuisine: "Korean dessert", spots: [] },
};

/** Build a fast lookup from every key + alias to its entry. Null-prototype on
 *  purpose: the lookup key is user-typed option text, and on a plain object
 *  "constructor" (and friends) would resolve through Object.prototype to a
 *  truthy non-entry. */
const INDEX: Record<string, { key: string; entry: FoodEntry }> = (() => {
  const idx: Record<string, { key: string; entry: FoodEntry }> = Object.create(null);
  for (const [key, entry] of Object.entries(FOODS)) {
    idx[key] = { key, entry };
    for (const alias of entry.aliases ?? []) idx[alias] = { key, entry };
  }
  return idx;
})();

/** Words that strongly imply a named, specific establishment (→ PLACE). */
const PLACE_SIGNALS = [
  "restaurant",
  "cafe",
  "bistro",
  "diner",
  "eatery",
  "kitchen",
  "bar",
  "grill",
  "house",
  "bakery",
  "deli",
  "hawker",
  "stall",
  "court",
  "mall",
  "centre",
  "center",
  "road",
  "street",
  "ave",
  "lane",
  "place",
  "co.",
  "&",
  "@",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s'&@.-]/g, " ") // keep a few place-ish chars for signal detection
    .replace(/\s+/g, " ")
    .trim();
}

// Precompute the scan order (multi-word keys first) and their regexes ONCE —
// scanForFood runs on every addOption and INDEX never changes.
const KEY_PATTERNS = Object.keys(INDEX)
  .sort((a, b) => b.length - a.length)
  .map((key) => ({
    key,
    re: new RegExp(`(^|\\s)${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`),
  }));

/** Find the first food whose key/alias appears as a whole word-run in the text. */
function scanForFood(norm: string): { key: string; entry: FoodEntry; token: string } | null {
  if (INDEX[norm]) return { ...INDEX[norm], token: norm };
  // Try multi-word keys first (more specific), then single words.
  for (const { key, re } of KEY_PATTERNS) {
    if (re.test(norm)) return { ...INDEX[key], token: key };
  }
  return null;
}

/**
 * Classify a raw option string. Always returns an emoji so the row looks
 * intentional; only generic cravings get `kind: "food"` + a suggested spot.
 */
export function classify(text: string): Classification {
  const norm = normalize(text);
  const matched = scanForFood(norm);

  // Hard place signals: an establishment word ("Cafe", "Bar") or a digit.
  const hardPlace = PLACE_SIGNALS.some((s) => norm.includes(s)) || /\d/.test(norm);
  // Two+ Capitalised words usually read as a brand — BUT mobile keyboards
  // auto-capitalise everything, so a whole-phrase dictionary match (the entire
  // input is a known craving, e.g. "Bubble Tea") must win over capitalisation.
  const titleCased = (text.trim().match(/\b[A-Z][a-zA-Z'’]+/g) ?? []).length >= 2;
  const wholePhraseMatch = matched !== null && matched.token === norm;
  const proper = hardPlace || (titleCased && !wholePhraseMatch);

  if (matched && !proper) {
    const spot = matched.entry.spots?.[0];
    return {
      kind: "food",
      emoji: matched.entry.emoji,
      cuisine: matched.entry.cuisine,
      ...(spot ? { suggestedSpot: spot } : {}),
    };
  }

  // It's a specific place (or we can't tell) — still lend it a fitting emoji
  // if the name hints at a cuisine (e.g. "Pizza Hut" → 🍕).
  return {
    kind: "place",
    emoji: matched?.entry.emoji ?? "🍴",
    ...(matched?.entry.cuisine ? { cuisine: matched.entry.cuisine } : {}),
  };
}
