// Headless smoke test: run the real search flow in Node (fetch is global in 18+).
import { fromMealDb, fromDummyJson } from "../src/normalize.js";
import { matchRecipe, rankResults, mealDbCandidates } from "../src/match.js";
import * as mealdb from "../src/api/mealdb.js";
import * as dummyjson from "../src/api/dummyjson.js";

const pantry = ["chicken", "garlic", "rice"];
console.log("pantry:", pantry.join(", "));

// DummyJSON leg
const all = await dummyjson.getAll();
console.log("dummyjson cached:", all.length);
const dummyRanked = rankResults(all.map(fromDummyJson).map((r) => matchRecipe(r, pantry)));
console.log("top dummy:", dummyRanked[0].recipe.name, `${dummyRanked[0].matched.length}/${dummyRanked[0].matched.length + dummyRanked[0].missing.length}`);

// TheMealDB leg: per-ingredient filter -> candidates -> lookups
const stubLists = await Promise.all(pantry.map(async (ing) => {
  try {
    return (await mealdb.filterByIngredient(ing)).map((m) => m.idMeal);
  } catch {
    return [];
  }
}));
console.log("stub counts:", stubLists.map((l) => l.length));
const candidates = mealDbCandidates(stubLists).slice(0, 24);
console.log("candidates:", candidates.length);

const meals = (await Promise.all(candidates.map((id) => mealdb.lookup(id).catch(() => null)))).filter(Boolean);
const mealRecipes = meals.map(fromMealDb).filter(Boolean);
console.log("looked up:", mealRecipes.length);

const ranked = rankResults([...mealRecipes, ...all.map(fromDummyJson)].map((r) => matchRecipe(r, pantry)));
console.log("\ntop 5 overall:");
for (const r of ranked.slice(0, 5)) {
  const tot = r.matched.length + r.missing.length;
  console.log(
    `  ${r.matched.length}/${tot}  ${r.recipe.name}  [${r.recipe.source}]` +
    (r.recipe.minutes != null ? ` ${r.recipe.minutes}min` : "") +
    `  missing: ${r.missing.map((m) => m.name).slice(0, 3).join(", ") || "nothing"}`,
  );
}
