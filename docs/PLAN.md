# Fridge Raid — build plan

Pantry-first recipe finder. Static site, vanilla JS ES modules, no backend,
no keys, no build step. Data: TheMealDB + DummyJSON recipes.

## Checklist

- [x] Fixtures copied from real API responses (`tests/fixtures/`)
- [x] `src/normalize.js` — map both sources to one recipe model
- [x] `src/match.js` — pantry matching, scoring, sorting (pure functions)
- [x] `tests/normalize.test.js`, `tests/match.test.js` — node:test on fixtures
- [x] `node --test tests/` green before any UI work
- [x] `src/api/mealdb.js` — search/filter/lookup/random/list + session cache
- [x] `src/api/dummyjson.js` — fetch-all-once (limit=0) + cache
- [x] `index.html` + `styles.css` — layout, chips input, grid, dialog
- [x] `src/ui.js` — DOM builders (createElement/textContent only), states
- [x] `src/main.js` — wiring: search flow, filters, favourites, shopping list
- [x] README.md — what it does, sources + limits, run instructions, demo script

## Feature order (ship 1–4 before 5–7)

1. Chips input (Enter adds, × removes) + "Find recipes"
2. Result grid: photo, name, "6/8" bar, missing items, cuisine, time/difficulty
   when known, source badge
3. Details dialog: ✓/✗ ingredients, numbered steps, video/source links; Esc +
   × close; focus trapped inside
4. Loading / empty / error states per source
5. Filters: cuisine, category/meal type, max time (only where time exists)
6. Surprise me (random.php)
7. Favourites + shopping list from missing ingredients (localStorage),
   copy-to-clipboard

## Verified endpoint shapes (2026-10-27)

- mealdb lookup 52772: 9 ingredients used of 20 slots; tags comma-separated;
  area Japanese / country Japan
- mealdb filter stubs now carry strArea(null)/strCountry("Belgium") alongside
  idMeal/strMeal/strMealThumb
- dummyjson /recipes?limit=0 -> all 50; instructions is an ARRAY; ingredients
  are plain strings ("Pizza dough")
