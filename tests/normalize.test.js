import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { fromMealDb, fromDummyJson, normalizeIngredient, STAPLES } from "../src/normalize.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = (f) => JSON.parse(readFileSync(path.join(here, "fixtures", f), "utf8"));

test("normalizeIngredient strips quantities, units and plurals", () => {
  assert.equal(normalizeIngredient("2 cups flour"), "flour");
  assert.equal(normalizeIngredient("1/2 teaspoon ground ginger"), "ground ginger");
  assert.equal(normalizeIngredient("Tomatoes "), "tomato");
  assert.equal(normalizeIngredient("Fresh Basil Leaves"), "fresh basil leaf");
  assert.equal(normalizeIngredient("3/4 cup soy sauce"), "soy sauce");
  assert.equal(normalizeIngredient("chicken breasts"), "chicken breast");
  assert.equal(normalizeIngredient("1 (12 oz.) stir-fry vegetables"), "stir-fry vegetable");
  assert.equal(normalizeIngredient(""), "");
  assert.equal(normalizeIngredient(null), "");
});

test("fromMealDb maps the real lookup fixture", () => {
  const data = fixtures("mealdb-lookup-52772.json");
  const r = fromMealDb(data.meals[0]);
  assert.equal(r.id, "mealdb:52772");
  assert.equal(r.source, "TheMealDB");
  assert.equal(r.name, "Teriyaki Chicken Casserole");
  assert.equal(r.cuisine, "Japanese");
  assert.deepEqual(r.tags, ["Meat", "Casserole"]);
  assert.equal(r.ingredients.length, 9);
  assert.deepEqual(r.ingredients[0], { name: "soy sauce", measure: "3/4 cup" });
  // steps split on \r\n
  assert.ok(Array.isArray(r.steps) && r.steps.length > 1);
  assert.equal(r.minutes, null);
  assert.equal(r.difficulty, null);
  assert.ok(r.video && r.video.startsWith("https://"));
});

test("fromMealDb falls back to strCountry when strArea is null", () => {
  const data = fixtures("mealdb-lookup-52772.json");
  const meal = { ...data.meals[0], strArea: null, strCountry: "Japan" };
  assert.equal(fromMealDb(meal).cuisine, "Japan");
});

test("fromDummyJson maps the real recipe fixture", () => {
  const one = fixtures("dummyjson-recipe-1.json");
  const r = fromDummyJson(one);
  assert.equal(r.id, "dummy:1");
  assert.equal(r.source, "DummyJSON");
  assert.equal(r.name, "Classic Margherita Pizza");
  assert.equal(r.minutes, 35); // prep 20 + cook 15
  assert.equal(r.difficulty, "Easy");
  assert.equal(r.calories, 300);
  assert.equal(r.servings, 4);
  assert.ok(Array.isArray(r.steps) && r.steps.length > 0);
  assert.ok(r.ingredients.every((i) => typeof i.name === "string" && i.measure === null));
});

test("fromDummyJson handles all-50 fixture shapes", () => {
  const all = fixtures("dummyjson-all.json");
  assert.equal(all.recipes.length, 50);
  const mapped = all.recipes.map(fromDummyJson);
  assert.ok(mapped.every(Boolean));
  assert.ok(mapped.every((r) => r.id.startsWith("dummy:")));
  const withTime = mapped.filter((r) => r.minutes != null);
  assert.ok(withTime.length >= 40, `expected most recipes to have time, got ${withTime.length}`);
});

test("staples list contains the expected basics", () => {
  for (const s of ["salt", "pepper", "water", "olive oil", "sugar"]) {
    assert.ok(STAPLES.has(s), `${s} should be a staple`);
  }
});
