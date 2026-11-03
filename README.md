# Fridge Raid 🧊

Type what's in your fridge; get recipes ranked by how much of each you can
already make. Static page — no backend, no API keys, no build step.

Data: [TheMealDB](https://www.themealdb.com/) (hundreds of meals) +
[DummyJSON recipes](https://dummyjson.com/docs/recipes) (50 recipes, but the
only source with time, difficulty and calories).

## Run it

ES modules don't load over `file://`, so serve the folder:

```bash
python -m http.server 8000
```

Open <http://localhost:8000>.

## Tests

```bash
node --test tests/normalize.test.js tests/match.test.js
```

Fixtures under `tests/fixtures/` are copies of real API responses, so the
normalizers are tested against actual shapes, not guesses. Refresh them with
`python scripts/fetch_fixtures.py`.

`node tests/smoke.mjs` runs the full search flow against the live APIs
(needs network).

## What it does

- **Pantry chips** — type ingredients, Enter adds, × removes, Backspace edits.
- **Ranked results** — every card shows a `matched/total` bar (staples like
  salt, pepper, water and oil are ignored), the missing items, cuisine, time
  and difficulty where known, and a source badge.
- **Details dialog** — ✓/✗ per ingredient, numbered steps, video/source links,
  Esc or × to close.
- **Filters** — cuisine, category, max time (time applies only to recipes that
  have one), favourites-only toggle.
- **Surprise me** — random recipe; prefers high-scoring matches when a search
  is active.
- **Favourites + shopping list** — persisted in localStorage (app works fine
  without it); one click adds a recipe's missing items to a copyable list.

## How matching works

1. Ingredient names are normalized: lowercase, quantities/units stripped
   ("2 cups flour" → "flour"), simple plurals singularized ("tomatoes" →
   "tomato").
2. A pantry item matches a recipe ingredient when either name contains the
   other as whole words ("chicken" matches "chicken breast"; "chick" doesn't).
3. Score = matched / non-staple ingredients. Sort by score, then fewest
   missing.
4. TheMealDB is searched by calling `filter.php?i=` once per pantry ingredient
   (the free key takes one ingredient per call and returns stubs only),
   counting which meals appear under the most ingredients, then fetching full
   details for the top 24 candidates. DummyJSON's 50 recipes are fetched once
   (`limit=0`) and matched entirely client-side.
5. Every response is cached in memory for the session.

## Data source limits (why the app is shaped this way)

| | TheMealDB | DummyJSON |
|---|---|---|
| Recipes | hundreds | 50 |
| Ingredients | strIngredient1..20 columns | plain strings |
| Time / difficulty / calories | ✗ | ✓ |
| Ingredient filter | one per call, stubs only | n/a (client-side) |
| Quirks | `{"meals":null}` on no match; some areas return 0 meals; `\r\n` instructions | instructions are an array |

If one source is down, the other still renders, with a notice.

## 60-second demo script

1. **(10s)** Open the page. Type `chicken`, Enter. Type `garlic`, Enter.
   Type `rice`, Enter. Three chips.
2. **(10s)** Hit **Find recipes**. Point at the ranking: match bars, missing
   items, TheMealDB + DummyJSON badges side by side.
3. **(15s)** Click the top card. Walk the dialog: ✓/✗ ingredients, numbered
   steps, the time/difficulty/calories badges on the DummyJSON one. Press Esc.
4. **(10s)** Reopen it, hit **Add missing items to shopping list**. Scroll
   down: the shopping list panel with per-recipe annotations. Click **Copy
   list**.
5. **(10s)** Filter by cuisine (e.g. Japanese). Star two recipes, tick
   **Favourites only**. Refresh the page — everything persisted.
6. **(5s)** Clear fridge, hit **Surprise me** — random recipe from TheMealDB.

## Files

```
index.html            layout, dialog, semantic structure
styles.css            light/dark themes via prefers-color-scheme
src/main.js           wiring: state, search flow, filters, favourites, shopping
src/ui.js             DOM builders — createElement/textContent only, safe URLs
src/api/mealdb.js     TheMealDB client (encodeURIComponent + session cache)
src/api/dummyjson.js  DummyJSON client (fetch-all-once cache)
src/normalize.js      both sources -> one recipe model (pure, tested)
src/match.js          scoring/sorting/candidate logic (pure, tested)
tests/                node:test suites + real-API fixtures
scripts/              fetch_fixtures.py — refresh tests/fixtures from live APIs
docs/PLAN.md          build plan and verified endpoint shapes
AGENTS.md             spec / instructions for coding agents
```

## License

MIT — see [LICENSE](LICENSE).
