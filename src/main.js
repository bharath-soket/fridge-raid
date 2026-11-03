// Fridge Raid — app wiring. Everything starts here.

import { fromMealDb, fromDummyJson } from "./normalize.js";
import { matchRecipe, rankResults, mealDbCandidates, expandPantry } from "./match.js";
import * as mealdb from "./api/mealdb.js";
import * as dummyjson from "./api/dummyjson.js";
import { el, chipEl, cardEl, fillDialog } from "./ui.js";

/* ---------------- localStorage (always wrapped) ---------------- */

const LS = {
  pantry: "fridgeRaid.pantry",
  favourites: "fridgeRaid.favourites",
  shopping: "fridgeRaid.shopping",
};

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode etc. — app still works */
  }
}

/* ---------------- state ---------------- */

let pantry = lsGet(LS.pantry, []);
let favourites = new Set(lsGet(LS.favourites, []));
/** shopping: ingredient name -> Set of recipe names needing it */
let shopping = new Map(lsGet(LS.shopping, []).map(([n, rs]) => [n, new Set(rs)]));

/** All ranked results from the last search (for filtering in place). */
let currentResults = [];
/** Normalized recipes by id (dialog needs full data). */
const recipeIndex = new Map();

/* ---------------- dom refs ---------------- */

const $ = (id) => document.getElementById(id);
const chipsUl = $("chips");
const pantryInput = $("pantry-input");
const findButton = $("find-button");
const surpriseButton = $("surprise-button");
const clearPantryButton = $("clear-pantry");
const statusArea = $("status-area");
const filtersBar = $("filters");
const filterCuisine = $("filter-cuisine");
const filterCategory = $("filter-category");
const filterTime = $("filter-time");
const filterFavourites = $("filter-favourites");
const filterDesi = $("filter-desi");
const resultsTitle = $("results-heading");
const resultsGrid = $("results-grid");
const dialog = $("recipe-dialog");
const dialogBody = $("dialog-body");
const dialogClose = $("dialog-close");
const shoppingPanel = $("shopping-panel");
const shoppingListEl = $("shopping-list");
const copyShoppingButton = $("copy-shopping");
const clearShoppingButton = $("clear-shopping");

/* ---------------- pantry chips ---------------- */

function renderChips() {
  chipsUl.replaceChildren(...pantry.map((name) => chipEl(name, removeChip)));
  lsSet(LS.pantry, pantry);
}

function addChip(nameRaw) {
  // "chicken, rice" -> two chips
  for (const part of String(nameRaw || "").split(",")) {
    const name = part.trim();
    if (name && !pantry.some((p) => p.toLowerCase() === name.toLowerCase())) pantry.push(name);
  }
  pantryInput.value = "";
  renderChips();
}

function removeChip(name) {
  pantry = pantry.filter((p) => p !== name);
  renderChips();
}

pantryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addChip(pantryInput.value);
  } else if (e.key === "," ) {
    e.preventDefault();
    addChip(pantryInput.value);
  } else if (e.key === "Backspace" && pantryInput.value === "" && pantry.length) {
    pantry.pop();
    renderChips();
  }
});

findButton.addEventListener("click", () => findRecipes());
clearPantryButton.addEventListener("click", () => {
  pantry = [];
  renderChips();
  currentResults = [];
  resultsGrid.replaceChildren();
  resultsTitle.textContent = "";
  filtersBar.hidden = true;
});

/* ---------------- notices (class always reset) ---------------- */

function notice(text, kind = "info") {
  const n = el("div", { class: `notice ${kind}`, role: "note" }, text);
  statusArea.append(n);
  return n;
}

function clearNotices() {
  statusArea.replaceChildren();
}

/* ---------------- search flow ---------------- */

async function withConcurrencyLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * TheMealDB: filter per user ingredient, count hits per meal,
 * lookup the top 24 candidates, normalize.
 * Returns { recipes, error }.
 */
async function searchMealDb(terms) {
  // one filter call per pantry ingredient; failures per-ingredient are tolerated
  const stubLists = await withConcurrencyLimit(terms, 6, async (ing) => {
    try {
      return (await mealdb.filterByIngredient(ing)).map((m) => m.idMeal);
    } catch {
      return [];
    }
  });

  const candidateIds = mealDbCandidates(stubLists).slice(0, 24);
  const meals = await withConcurrencyLimit(candidateIds, 6, async (id) => {
    try {
      return await mealdb.lookup(id);
    } catch {
      return null;
    }
  });

  const recipes = meals.filter(Boolean).map(fromMealDb).filter(Boolean);
  return { recipes, ok: candidateIds.length > 0 };
}

/** TheMealDB areas treated as Indian / South Asian ("India" is how TheMealDB names it). */
const DESI_AREAS = ["India", "Pakistani", "Bangladeshi", "Nepalese", "Sri Lankan"];
const DESI_CUISINES = new Set(["india", "indian", "pakistani", "bangladeshi", "nepalese", "sri lankan"]);
const isDesi = (recipe) => DESI_CUISINES.has(String(recipe.cuisine || "").toLowerCase());

/**
 * Every Indian / South Asian TheMealDB meal (about 25), fetched once and matched
 * locally, so they rank even when the per-ingredient filter misses them.
 */
async function searchDesi() {
  const stubLists = await withConcurrencyLimit(DESI_AREAS, 6, async (area) => {
    try {
      return (await mealdb.filterByArea(area)).map((m) => m.idMeal);
    } catch {
      return [];
    }
  });
  const ids = [...new Set(stubLists.flat())];
  const meals = await withConcurrencyLimit(ids, 6, async (id) => {
    try {
      return await mealdb.lookup(id);
    } catch {
      return null;
    }
  });
  return meals.filter(Boolean).map(fromMealDb).filter(Boolean);
}

/** DummyJSON: all 50 cached, matched locally. */
async function searchDummy() {
  const all = await dummyjson.getAll();
  return all.map(fromDummyJson).filter(Boolean);
}

async function findRecipes() {
  // text still in the box counts too, so "type + click Find" works without Enter
  addChip(pantryInput.value);

  if (!pantry.length) {
    clearNotices();
    notice("Add a few ingredients first — what's in your fridge?", "loading");
    pantryInput.focus();
    return;
  }

  findButton.disabled = true;
  clearNotices();
  resultsGrid.replaceChildren();
  resultsTitle.textContent = "Searching…";
  const loading = notice("Checking both sources…", "loading");

  const terms = expandPantry(pantry);
  const [mealDbRes, dummyRes, desiRes] = await Promise.allSettled([
    searchMealDb(terms),
    searchDummy(),
    searchDesi(),
  ]);

  const byId = new Map();
  const warnings = [];

  if (mealDbRes.status === "fulfilled" || desiRes.status === "fulfilled") {
    for (const res of [mealDbRes, desiRes]) {
      if (res.status !== "fulfilled") continue;
      for (const r of res.value.recipes ?? res.value) byId.set(r.id, r);
    }
  } else {
    warnings.push("TheMealDB is unreachable right now.");
  }
  const results = [...byId.values()];
  for (const r of results) if (r.cuisine === "India") r.cuisine = "Indian";

  if (dummyRes.status === "fulfilled") {
    results.push(...dummyRes.value);
  } else {
    warnings.push("DummyJSON is unreachable right now.");
  }

  loading.remove();

  // only recipes that use at least one thing from the fridge
  const ranked = rankResults(results.map((r) => matchRecipe(r, terms))).filter((r) => r.matched.length > 0);

  if (!ranked.length) {
    resultsTitle.textContent = "";
    if (warnings.length) {
      notice(warnings.join(" "), "error");
    }
    notice("No recipes matched your fridge. Try different or fewer ingredients.", "info");
    findButton.disabled = false;
    return;
  }

  for (const r of results) recipeIndex.set(r.id, r);
  currentResults = ranked;

  buildFilterOptions();
  applyFilters();
  updateShoppingPanel();

  const typed = pantry.map((p) => p.toLowerCase()).join(", ");
  if (terms.join(", ") !== typed) notice(`Searched for: ${terms.join(", ")}`, "info");
  if (warnings.length) notice(warnings.join(" ") + " Showing the other source.", "error");

  findButton.disabled = false;
}

/* ---------------- filters ---------------- */

function buildFilterOptions() {
  const cuisines = new Set();
  const categories = new Set();
  for (const { recipe } of currentResults) {
    if (recipe.cuisine) cuisines.add(recipe.cuisine);
    if (recipe.category) categories.add(recipe.category);
  }
  const fill = (select, values, label) => {
    const cur = select.value;
    select.replaceChildren(
      el("option", { value: "" }, `All ${label}`),
      ...[...values].sort().map((v) => el("option", { value: v }, v)),
    );
    if ([...select.options].some((o) => o.value === cur)) select.value = cur;
  };
  fill(filterCuisine, cuisines, "cuisines");
  fill(filterCategory, categories, "categories");
  filtersBar.hidden = false;
}

function applyFilters() {
  const cuisine = filterCuisine.value;
  const category = filterCategory.value;
  const maxTime = Number(filterTime.value) || null;
  const favOnly = filterFavourites.checked;
  const desiOnly = filterDesi.checked;

  const visible = currentResults.filter(({ recipe }) => {
    if (desiOnly && !isDesi(recipe)) return false;
    if (cuisine && recipe.cuisine !== cuisine) return false;
    if (category && recipe.category !== category) return false;
    // time filter applies only to recipes that have a time
    if (maxTime != null && recipe.minutes != null && recipe.minutes > maxTime) return false;
    if (favOnly && !favourites.has(recipe.id)) return false;
    return true;
  });

  resultsTitle.textContent =
    `${visible.length} recipe${visible.length === 1 ? "" : "s"} for ${pantry.length} ingredient${pantry.length === 1 ? "" : "s"}`;

  resultsGrid.replaceChildren(
    ...visible.map((res) =>
      cardEl(res, {
        isFavourite: favourites.has(res.recipe.id),
        onOpen: openDialog,
        onToggleFavourite: toggleFavourite,
      }),
    ),
  );
}

for (const sel of [filterCuisine, filterCategory, filterTime]) {
  sel.addEventListener("change", applyFilters);
}
filterFavourites.addEventListener("change", applyFilters);
filterDesi.addEventListener("change", applyFilters);

/* ---------------- dialog ---------------- */

function openDialog(result) {
  fillDialog(dialog, dialogBody, result, {
    isFavourite: favourites.has(result.recipe.id),
    onToggleFavourite: (id) => {
      toggleFavourite(id);
      // refresh the star inside the dialog
      const btn = dialogBody.querySelector(".fav-button");
      if (btn) {
        const on = favourites.has(id);
        btn.textContent = on ? "★" : "☆";
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      }
    },
    onAddMissing: addMissingToShopping,
  });
}

dialogClose.addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => dialogBody.replaceChildren());

/* ---------------- favourites ---------------- */

function toggleFavourite(id) {
  if (favourites.has(id)) favourites.delete(id);
  else favourites.add(id);
  lsSet(LS.favourites, [...favourites]);
  applyFilters();
}

/* ---------------- shopping list ---------------- */

function addMissingToShopping(result) {
  for (const m of result.missing) {
    if (!shopping.has(m.name)) shopping.set(m.name, new Set());
    shopping.get(m.name).add(result.recipe.name);
  }
  saveShopping();
  updateShoppingPanel();
}

function saveShopping() {
  lsSet(LS.shopping, [...shopping.entries()].map(([n, rs]) => [n, [...rs]]));
}

function updateShoppingPanel() {
  if (!shopping.size) {
    shoppingPanel.hidden = true;
    return;
  }
  shoppingPanel.hidden = false;
  shoppingListEl.replaceChildren(
    ...[...shopping.keys()].sort().map((name) => {
      const recipes = shopping.get(name);
      return el(
        "li",
        null,
        el("span", null, name),
        el("span", { class: "for-recipes" }, [...recipes].join(", ")),
      );
    }),
  );
}

copyShoppingButton.addEventListener("click", async () => {
  const text = [...shopping.keys()].sort().map((n) => `- ${n}`).join("\n");
  try {
    await navigator.clipboard.writeText(`Fridge Raid shopping list\n\n${text}`);
    copyShoppingButton.textContent = "Copied!";
    setTimeout(() => (copyShoppingButton.textContent = "Copy list"), 1500);
  } catch {
    notice("Clipboard blocked — select the list and copy manually.", "error");
  }
});

clearShoppingButton.addEventListener("click", () => {
  shopping = new Map();
  saveShopping();
  updateShoppingPanel();
});

/* ---------------- surprise me ---------------- */

surpriseButton.addEventListener("click", async () => {
  clearNotices();
  const loading = notice("Rolling the dice…", "loading");
  try {
    // prefer a random pick among good matches when we have results
    if (currentResults.length) {
      const good = currentResults.filter((r) => r.score >= 0.5);
      const pool = good.length ? good : currentResults;
      openDialog(pool[Math.floor(Math.random() * pool.length)]);
    } else {
      const meal = await mealdb.random();
      if (!meal) throw new Error("no meal");
      const recipe = fromMealDb(meal);
      recipeIndex.set(recipe.id, recipe);
      openDialog(matchRecipe(recipe, expandPantry(pantry)));
    }
  } catch {
    notice("Couldn't fetch a random recipe. Try again.", "error");
  } finally {
    loading.remove();
  }
});

/* ---------------- init ---------------- */

renderChips();
updateShoppingPanel();
pantryInput.focus();
