// TheMealDB client. Base + encodeURIComponent everywhere; in-memory session cache.

const BASE = "https://www.themealdb.com/api/json/v1/1";

/** Session cache: url -> json. Cleared never (short demo sessions). */
const cache = new Map();

async function api(path, params) {
  const qs = Object.entries(params)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v).trim().replace(/\s+/g, "_"))}`)
    .join("&");
  const url = qs ? `${BASE}/${path}?${qs}` : `${BASE}/${path}`;
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TheMealDB ${path} failed: HTTP ${res.status}`);
  const data = await res.json();
  cache.set(url, data);
  return data;
}

/** Meals whose name contains `name` (full objects). [] when null. */
export async function searchByName(name) {
  const d = await api("search.php", { s: name });
  return d.meals ?? [];
}

/** Full meal by id. Null when not found. */
export async function lookup(id) {
  const d = await api("lookup.php", { i: id });
  return d.meals?.[0] ?? null;
}

/**
 * Meal stubs ({idMeal, strMeal, strMealThumb}) containing one ingredient.
 * Ingredient spaces become underscores server-side; we encode them here.
 */
export async function filterByIngredient(ingredient) {
  const d = await api("filter.php", { i: ingredient });
  return d.meals ?? [];
}

/** Meal stubs for one cuisine/area, e.g. "India". [] when null. */
export async function filterByArea(area) {
  const d = await api("filter.php", { a: area });
  return d.meals ?? [];
}

/** One random full meal. */
export async function random() {
  // never cache random
  const res = await fetch(`${BASE}/random.php`);
  if (!res.ok) throw new Error(`TheMealDB random failed: HTTP ${res.status}`);
  const d = await res.json();
  return d.meals?.[0] ?? null;
}

/** Lists: categories, areas, ingredients. */
export async function listCategories() {
  const d = await api("list.php", { c: "list" });
  return d.meals ?? [];
}
