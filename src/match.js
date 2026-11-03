// Pantry matching: pure functions, no DOM, no fetch. Tested in tests/match.test.js.

import { STAPLES, normalizeIngredient } from "./normalize.js";

/** Common Hindi/Indian pantry words -> the English names the recipe sources use. */
export const ALIASES = new Map([
  ["rajma", "kidney beans"], ["chawal", "rice"], ["chaawal", "rice"], ["chawl", "rice"],
  ["aloo", "potato"], ["gobi", "cauliflower"], ["palak", "spinach"], ["matar", "peas"],
  ["chana", "chickpeas"], ["chole", "chickpeas"], ["dal", "lentils"], ["daal", "lentils"],
  ["pyaz", "onion"], ["pyaaz", "onion"], ["tamatar", "tomato"], ["adrak", "ginger"],
  ["lehsun", "garlic"], ["mirch", "chilli"], ["dhaniya", "coriander"], ["jeera", "cumin"],
  ["haldi", "turmeric"], ["dahi", "yogurt"], ["anda", "egg"], ["murgh", "chicken"],
  ["murg", "chicken"], ["gosht", "lamb"], ["machli", "fish"], ["baingan", "aubergine"],
  ["bhindi", "okra"], ["gajar", "carrot"], ["methi", "fenugreek"], ["atta", "flour"],
  ["maida", "flour"], ["ghee", "butter"], ["doodh", "milk"], ["nimbu", "lime"],
]);

/**
 * Turn pantry chips into search terms: "rajma chawal" -> ["kidney beans", "rice"].
 * A chip with no known alias word is kept as typed.
 */
export function expandPantry(pantry) {
  const out = [];
  for (const chip of pantry) {
    const words = String(chip).toLowerCase().trim().split(/\s+/).filter(Boolean);
    const whole = ALIASES.get(words.join(" "));
    if (whole) out.push(whole);
    else if (words.some((w) => ALIASES.has(w))) out.push(...words.map((w) => ALIASES.get(w) || w));
    else out.push(chip);
  }
  return [...new Set(out)];
}

/** True when the pantry item covers the recipe ingredient (whole-word containment either way). */
export function ingredientMatches(pantryName, recipeName) {
  const p = normalizeIngredient(pantryName);
  const r = normalizeIngredient(recipeName);
  if (!p || !r) return false;
  if (p === r) return true;
  // whole word containment: "chicken" matches "chicken breast", "breast" does not match "chicken breast"
  const pw = new Set(p.split(" "));
  const rw = new Set(r.split(" "));
  for (const w of pw) if (rw.has(w)) return true;
  return false;
}

/**
 * Score one recipe against the pantry.
 * Staples are ignored entirely (not counted in the denominator).
 * Returns { recipe, matched[], missing[], score } where
 * score = matched / non-staple ingredient count (0 when nothing to match).
 */
export function matchRecipe(recipe, pantry) {
  const items = (recipe.ingredients || []).filter(
    (i) => i && i.name && !STAPLES.has(normalizeIngredient(i.name)),
  );
  const matched = [];
  const missing = [];
  for (const item of items) {
    const hit = pantry.some((p) => ingredientMatches(p, item.name));
    (hit ? matched : missing).push(item);
  }
  const score = items.length ? matched.length / items.length : 0;
  return { recipe, matched, missing, score };
}

/** Sort results by score desc, then fewest missing asc, then name. */
export function rankResults(results) {
  return [...results].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
    return (a.recipe.name || "").localeCompare(b.recipe.name || "");
  });
}

/**
 * TheMealDB candidate selection: given per-ingredient stub id lists,
 * count how many user ingredients each meal appears under and return ids
 * ordered by that count.
 */
export function mealDbCandidates(stubLists) {
  const counts = new Map();
  for (const ids of stubLists) {
    for (const id of ids) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([id]) => id);
}
