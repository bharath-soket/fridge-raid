// Normalize API responses into one internal recipe model.
// Pure functions, no DOM, no fetch. Tested in tests/normalize.test.js.

/** Pantry staples ignored when scoring (matched or not). */
export const STAPLES = new Set([
  "salt",
  "pepper",
  "water",
  "oil",
  "vegetable oil",
  "olive oil",
  "sugar",
]);

const UNIT_WORDS = new Set([
  // volumes
  "cup", "cups", "tbsp", "tablespoon", "tablespoons", "tablespoonful",
  "tsp", "teaspoon", "teaspoons", "teaspoonful",
  "ml", "milliliter", "milliliters", "millilitre", "millilitres", "l", "liter",
  "liters", "litre", "litres",
  "oz", "ounce", "ounces", "lb", "lbs", "pound", "pounds",
  "g", "gram", "grams", "kg", "kilogram", "kilograms",
  "pinch", "pinches", "dash", "dashes", "splash", "handful", "handfuls",
  "clove", "cloves", "can", "cans", "tin", "tins", "packet", "packets",
  "pack", "packs", "bunch", "bunches", "stick", "sticks", "slice", "slices",
  "piece", "pieces", "sheet", "sheets", "cube", "cubes",
]);

const FRACTION_RE = /^(?:\d+[/]\d+|\d+(?:[.,]\d+)?)(?:\s*[-–—to]+\s*\d+(?:[.,]\d+)?)?$/;

/** Words that must never lose a trailing s when singularized. */
const KEEP_S = new Set([
  "bok choy", "soy sauce", "worcestershire sauce", "hot sauce", "soy",
]);

/** Irregular singularizations worth handling (word -> singular). */
const IRREGULAR = new Map([["leaves", "leaf"], ["loaves", "loaf"], ["geese", "goose"]]);

/** Singularize a single word with simple English rules. */
function singularWord(w) {
  if (KEEP_S.has(w)) return w;
  if (IRREGULAR.has(w)) return IRREGULAR.get(w);
  w = w.replace(/ies$/, "y").replace(/oes$/, "o").replace(/(ss|sh|ch|x|z)es$/, "$1");
  return w.replace(/s$/, "");
}

/**
 * Canonicalize an ingredient name for matching: lowercase, trim, collapse
 * spaces, strip leading quantities/units ("2 cups flour" -> "flour") and
 * simple plurals ("tomatoes" -> "tomato").
 */
export function normalizeIngredient(raw) {
  if (raw == null) return "";
  let s = String(raw).toLowerCase().trim();
  s = s.replace(/\s+/g, " ");
  // strip parenthetical qualifiers: "chicken (boneless)" -> "chicken"
  s = s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

  // strip leading quantity tokens: numbers, fractions, ranges, "a", "an"
  let words = s.split(" ");
  while (words.length > 1) {
    const w = words[0];
    if (
      FRACTION_RE.test(w) ||
      UNIT_WORDS.has(w) ||
      w === "a" ||
      w === "an" ||
      /^x+$/.test(w)
    ) {
      words.shift();
    } else if (
      words.length > 1 &&
      FRACTION_RE.test(words[0]) &&
      UNIT_WORDS.has(words[1])
    ) {
      words.shift();
      words.shift();
    } else {
      break;
    }
  }
  s = words.join(" ");

  // singularize the last word only ("fresh basil leaves" -> "fresh basil leaf")
  const parts = s.split(" ");
  if (parts.length) parts[parts.length - 1] = singularWord(parts[parts.length - 1]);
  s = parts.join(" ");

  // strip trailing qualifiers commonly attached after a comma
  s = s.split(",")[0].trim();
  return s;
}

function firstString(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

/** Map a TheMealDB meal object (lookup.php shape) to the internal model. */
export function fromMealDb(meal) {
  if (!meal || typeof meal !== "object") return null;
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const name = firstString(meal[`strIngredient${i}`]);
    if (!name) break; // stop at the first empty slot
    const measure = firstString(meal[`strMeasure${i}`]);
    ingredients.push({ name, measure });
  }
  const tags = firstString(meal.strTags);
  return {
    id: `mealdb:${meal.idMeal}`,
    source: "TheMealDB",
    name: firstString(meal.strMeal) ?? "(unnamed meal)",
    image: firstString(meal.strMealThumb),
    category: firstString(meal.strCategory),
    cuisine: firstString(meal.strArea, meal.strCountry),
    tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    ingredients,
    steps: firstString(meal.strInstructions)
      ? meal.strInstructions.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      : [],
    minutes: null, // TheMealDB has no time data
    difficulty: null,
    calories: null,
    servings: null,
    video: firstString(meal.strYoutube),
    sourceUrl: firstString(meal.strSource),
  };
}

/** Map a DummyJSON recipe object to the internal model. */
export function fromDummyJson(r) {
  if (!r || typeof r !== "object") return null;
  const instructions = Array.isArray(r.instructions)
    ? r.instructions.map((s) => String(s).trim()).filter(Boolean)
    : [];
  return {
    id: `dummy:${r.id}`,
    source: "DummyJSON",
    name: firstString(r.name) ?? "(unnamed recipe)",
    image: firstString(r.image),
    category: Array.isArray(r.mealType) && r.mealType.length ? r.mealType.join(", ") : null,
    cuisine: firstString(r.cuisine),
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    ingredients: (Array.isArray(r.ingredients) ? r.ingredients : [])
      .map((i) => ({ name: String(i), measure: null })),
    steps: instructions,
    minutes:
      Number.isFinite(r.prepTimeMinutes) && Number.isFinite(r.cookTimeMinutes)
        ? r.prepTimeMinutes + r.cookTimeMinutes
        : Number.isFinite(r.prepTimeMinutes) || Number.isFinite(r.cookTimeMinutes)
          ? (r.prepTimeMinutes || 0) + (r.cookTimeMinutes || 0)
          : null,
    difficulty: firstString(r.difficulty),
    calories: Number.isFinite(r.caloriesPerServing) ? r.caloriesPerServing : null,
    servings: Number.isFinite(r.servings) ? r.servings : null,
    video: null,
    sourceUrl: `https://dummyjson.com/recipes/${r.id}`,
  };
}

/** Build the normalized recipe from either source (by shape/id). */
export function normalizeRecipe(raw) {
  if (!raw) return null;
  if (raw.idMeal != null) return fromMealDb(raw);
  if (raw.id != null && (Array.isArray(raw.ingredients) || raw.name)) return fromDummyJson(raw);
  return null;
}
