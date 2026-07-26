/**
 * Sorts whatever someone types into a specific PLACE ("Tian Tian Chicken Rice")
 * or a generic CRAVING ("chicken rice"), and gives it a fitting emoji.
 *
 * There is no external API here by design — no keys, no cost, works anywhere.
 * To make the suggestions real for your city, fill in the `spots` arrays below.
 */

export type FoodKind = "place" | "food";

export interface Classification {
  kind: FoodKind;
  emoji: string;
  cuisine?: string;
  suggestedSpot?: string;
}

interface FoodEntry {
  emoji: string;
  cuisine: string;
  /** Extra phrases that map to this food; the dictionary key counts too. */
  aliases?: string[];
  /** Your local go-to spots for this craving. Edit these for your city! */
  spots?: string[];
}

/**
 * Keys are matched as whole phrases, case-insensitively. Add your own — and
 * drop real restaurants into `spots` to get "try: …" picks.
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

function buildPhraseIndex(): Record<string, FoodEntry> {
  // Null prototype on purpose: the lookup key is user-typed option text, and on
  // a plain object "constructor" (and friends) would resolve through
  // Object.prototype to a truthy non-entry.
  const index: Record<string, FoodEntry> = Object.create(null);
  for (const [key, entry] of Object.entries(FOODS)) {
    index[key] = entry;
    for (const alias of entry.aliases ?? []) index[alias] = entry;
  }
  return index;
}

const ENTRY_BY_PHRASE = buildPhraseIndex();

/** Words that strongly imply a named, specific establishment. */
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

function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s'&@.-]/g, " ") // keep a few place-ish chars for signal detection
    .replace(/\s+/g, " ")
    .trim();
}

// Built once, longest phrase first, because classify runs on every added option
// and the dictionary never changes. Multi-word keys win over single words.
const PHRASE_PATTERNS = Object.keys(ENTRY_BY_PHRASE)
  .sort((a, b) => b.length - a.length)
  .map((phrase) => ({
    phrase,
    pattern: new RegExp(`(^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`),
  }));

function findFoodPhrase(normalized: string): { entry: FoodEntry; matchedPhrase: string } | null {
  const exact = ENTRY_BY_PHRASE[normalized];
  if (exact) return { entry: exact, matchedPhrase: normalized };
  for (const { phrase, pattern } of PHRASE_PATTERNS) {
    if (pattern.test(normalized)) return { entry: ENTRY_BY_PHRASE[phrase], matchedPhrase: phrase };
  }
  return null;
}

/** Always returns an emoji, so every row looks intentional even when we have no
 *  idea what the text is. */
export function classify(text: string): Classification {
  const normalized = normalizeForMatching(text);
  const match = findFoodPhrase(normalized);

  const hasPlaceSignal =
    PLACE_SIGNALS.some((signal) => normalized.includes(signal)) || /\d/.test(normalized);
  // Two or more Capitalised words usually read as a brand name — but mobile
  // keyboards auto-capitalise everything, so an input that is entirely a known
  // craving ("Bubble Tea") has to beat the capitalisation signal.
  const looksLikeBrandName = (text.trim().match(/\b[A-Z][a-zA-Z'’]+/g) ?? []).length >= 2;
  const matchedWholeInput = match !== null && match.matchedPhrase === normalized;
  const isSpecificPlace = hasPlaceSignal || (looksLikeBrandName && !matchedWholeInput);

  if (match && !isSpecificPlace) {
    const suggestedSpot = match.entry.spots?.[0];
    return {
      kind: "food",
      emoji: match.entry.emoji,
      cuisine: match.entry.cuisine,
      ...(suggestedSpot ? { suggestedSpot } : {}),
    };
  }

  // A named place, or something we can't place at all — still lend it a fitting
  // emoji when the name hints at a cuisine, e.g. "Pizza Hut" → 🍕.
  return {
    kind: "place",
    emoji: match?.entry.emoji ?? "🍴",
    ...(match?.entry.cuisine ? { cuisine: match.entry.cuisine } : {}),
  };
}
