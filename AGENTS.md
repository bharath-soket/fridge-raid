# Fridge Raid

Build **Fridge Raid**: a recipe finder where you type what's in your fridge and
it ranks recipes by how much of each you can already make. It is a rewrite of a
small reference app (vanilla HTML/CSS/JS on TheMealDB), fixing its bugs and
adding pantry-first search.

## Constraints (hard)

- **Static page**: plain HTML, CSS and JavaScript. No backend, no API keys, no
  build step, no frameworks, no npm. Must be easy to demo.
- Three files minimum: `index.html`, `style.css`, `main.js`. More JS modules
  are fine if loaded via `<script type="module">`.
- Works when served from a plain static server on localhost
  (`python -m http.server`). Do not rely on `file://` (CORS sends `Origin: null`).
- All API calls client-side with `fetch`. All failures must degrade gracefully
  (message area, never a blank screen).

## Bugs from the reference app that MUST be fixed

1. **Unsafe rendering** — the reference interpolates API strings straight into
   `innerHTML` (XSS). Build all dynamic DOM with `document.createElement` +
   `textContent`, or an `escapeHtml` helper applied to every API-derived string.
   Never template raw API data into HTML.
2. **No URL encoding** — the reference builds `search.php?s=${query}` with raw
   input. Every query parameter must go through `encodeURIComponent`.
3. **Message styling never resets** — `showMessage()` adds `error`/`loading`
   classes but nothing removes them. Reset the class list on every state change.
4. **Unclosed `<div>`** in the YouTube link block of the reference modal.
5. **Close button shows "+"** (rotated). Use a real × character
   (`&times;` / `\u00d7`).
6. **Search is by name only** — the core new feature (pantry matching) replaces
   this limitation.

## Data sources (all free, keyless, tested live, CORS-open)

### TheMealDB — `https://www.themealdb.com/api/json/v1/1`

Breadth source: hundreds of meals with ingredients + measures, instructions,
photos, YouTube links. 14 categories, 195 cuisines, 992 ingredients.

| Endpoint | Use |
|---|---|
| `search.php?s=<term>` | search by name |
| `search.php?f=<letter>` | list meals by first letter |
| `filter.php?i=<ingredient>` | meals containing ONE ingredient (stubs only) |
| `lookup.php?i=<id>` | full meal details by id |
| `random.php` | random meal |
| `list.php?c=list` / `a=list` / `i=list` | categories / cuisines / ingredients |

Quirks (verified):
- `filter.php?i=` takes **one ingredient per call** and returns **only**
  `idMeal`, `strMeal`, `strMealThumb`. Multi-ingredient queries return null.
- Some areas return 0 meals despite appearing in `list.php?a=list`
  (e.g. `filter.php?a=Indian` → 0). Don't rely on area filtering; filter
  cuisines client-side from looked-up details.
- Ingredient lists come as `strIngredient1..20` / `strMeasure1..20` columns;
  stop at the first empty ingredient.

### DummyJSON recipes — `https://dummyjson.com/recipes`

Metadata source: only 50 recipes, but the only source with prep/cook time,
difficulty, calories, rating, servings, meal type and tags.

- `GET /recipes?limit=100` returns **all 50 in one request** — load once at
  startup, cache in memory, filter client-side. (Default limit is 30.)
- Also available: `/recipes/search?q=`, `/recipes/tags` (87 tags),
  `/recipes/meal-type/<type>`.
- Ingredients are plain strings ("Pizza dough") — normalize case and trim
  before matching.

### Open Food Facts — `https://world.openfoodfacts.org`

Optional pantry helper: barcode lookup for grocery items.

- `api/v2/product/<barcode>.json` — product name, brand, `_keywords`,
  ingredient text. Useful for mapping a scanned item to a recipe ingredient.
- Text search: `cgi/search.pl?search_terms=<q>&json=1`.

## Core feature: pantry matching

The user types (or scans via OFF) what they have. Ranking algorithm:

1. Normalize pantry items and recipe ingredients (lowercase, trim, singularize
   simple plurals, strip qualifiers like "fresh"/"chopped").
2. **TheMealDB**: call `filter.php?i=` once per pantry ingredient, intersect
   the returned id sets client-side, then `lookup.php?i=` for each surviving
   meal to get its full ingredient list.
3. **DummyJSON**: match against the cached 50 recipes client-side.
4. Score every candidate recipe: `match = owned ingredients / total
   ingredients` (e.g. "6/8"). Rank by match ratio, then by fewest missing.
5. Each card shows:
   - match score ("6/8 ingredients");
   - what you're missing;
   - time and difficulty **where the recipe has them** (DummyJSON only —
   hide those badges for TheMealDB meals, don't show fake values).

Cap concurrent lookups (e.g. 6 in flight) and cache every response in memory
keyed by URL so repeated searches don't refetch.

## Other features

- **Filters**: cuisine and category (client-side, from fetched details).
- **"Surprise me"**: random pick weighted toward high match scores.
- **Favourites**: star recipes, persist in `localStorage`, view as a tab or
   filter. Persist the pantry list in `localStorage` too.
- **Shopping list**: one click collects all missing ingredients from starred/
   selected recipes into a copyable list (dedupe, combine measures where easy).
- Keep the reference's good bones: responsive card grid, detail modal with
  ingredients, instructions, YouTube/source links — rebuilt safely (see bug 1).

## Quality bar

- No console errors; handle offline/API-down with a friendly message.
- Escape every API string rendered to the DOM, without exception.
- No global namespace pollution beyond one app object (or ES modules).
- Keyboard accessible: modal closes on Escape; focus the search box on load.
