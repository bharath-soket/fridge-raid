import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { fromMealDb, fromDummyJson } from "../src/normalize.js";
import { matchRecipe, rankResults, ingredientMatches, mealDbCandidates, expandPantry } from "../src/match.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = (f) => JSON.parse(readFileSync(path.join(here, "fixtures", f), "utf8"));

test("ingredientMatches does whole-word containment both ways", () => {
  assert.ok(ingredientMatches("chicken", "chicken breast"));
  assert.ok(ingredientMatches("chicken breast", "chicken"));
  assert.ok(!ingredientMatches("breast", "chicken thigh")); // partial word only
  assert.ok(!ingredientMatches("chick", "chicken"));
  assert.ok(ingredientMatches("2 cups flour", "flour"));
});

test("matchRecipe scores against a pantry and ignores staples", () => {
  const r = fromMealDb(fixtures("mealdb-lookup-52772.json").meals[0]);
  // pantry: soy sauce + water(staple) + chicken covers soy sauce, water, chicken breasts
  const res = matchRecipe(r, ["soy sauce", "water", "chicken"]);
  // non-staple items: 9 ingredients minus water = 8
  assert.equal(res.missing.length + res.matched.length, 8);
  assert.ok(res.matched.some((m) => m.name === "soy sauce"));
  assert.ok(res.matched.some((m) => m.name === "chicken breasts"));
  assert.ok(res.missing.some((m) => m.name === "brown rice"));
  assert.equal(res.score, res.matched.length / 8);
});

test("matchRecipe with empty pantry misses everything", () => {
  const r = fromDummyJson(fixtures("dummyjson-recipe-1.json"));
  const res = matchRecipe(r, []);
  assert.equal(res.matched.length, 0);
  assert.equal(res.score, 0);
  assert.ok(res.missing.length > 0);
});

test("rankResults sorts by score then fewest missing", () => {
  const mk = (name, score, missing) => ({
    recipe: { name },
    matched: [],
    missing: new Array(missing).fill({ name: "x" }),
    score,
  });
  const sorted = rankResults([mk("b", 0.5, 4), mk("c", 1, 0), mk("a", 0.5, 2)]);
  assert.deepEqual(
    sorted.map((s) => s.recipe.name),
    ["c", "a", "b"],
  );
});

test("mealDbCandidates counts hits across per-ingredient stub lists", () => {
  const lists = [
    ["1", "2", "3"], // ingredient A
    ["2", "3"], // ingredient B
    ["3", "4"], // ingredient C
  ];
  assert.deepEqual(mealDbCandidates(lists), ["3", "2", "1", "4"]);
});

test("full flow: dummyjson all-50 ranked against a tomato+garlic pantry", () => {
  const all = fixtures("dummyjson-all.json").recipes.map(fromDummyJson);
  const ranked = rankResults(all.map((r) => matchRecipe(r, ["tomato", "garlic"])));
  assert.equal(ranked.length, 50);
  for (let i = 1; i < ranked.length; i++) {
    const prev = ranked[i - 1];
    const cur = ranked[i];
    assert.ok(
      prev.score > cur.score ||
        (prev.score === cur.score && prev.missing.length <= cur.missing.length),
      `ranking violated at ${i}: ${prev.score}/${prev.missing.length} vs ${cur.score}/${cur.missing.length}`,
    );
  }
  const top = ranked[0];
  assert.ok(top.score > 0, "expected at least one positive match");
});

test("expandPantry translates Hindi pantry words and keeps the rest", () => {
  assert.deepEqual(expandPantry(["rajma chawal"]), ["kidney beans", "rice"]);
  assert.deepEqual(expandPantry(["Aloo", "chicken breast"]), ["potato", "chicken breast"]);
  assert.deepEqual(expandPantry(["chawal", "rice"]), ["rice"]);
});
