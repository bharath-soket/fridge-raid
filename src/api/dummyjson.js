// DummyJSON recipes client. 50 recipes total; fetch all once and cache.

const BASE = "https://dummyjson.com/recipes";

let allCache = null;

/** All 50 recipes as raw DummyJSON objects (limit=0 -> everything). */
export async function getAll() {
  if (allCache) return allCache;
  const res = await fetch(`${BASE}?limit=0`);
  if (!res.ok) throw new Error(`DummyJSON failed: HTTP ${res.status}`);
  const data = await res.json();
  allCache = data.recipes ?? [];
  return allCache;
}

/** One recipe by id. Uses the cached list when possible. */
export async function getById(id) {
  const all = await getAll().catch(() => null);
  if (all) {
    const hit = all.find((r) => String(r.id) === String(id));
    if (hit) return hit;
  }
  const res = await fetch(`${BASE}/${encodeURIComponent(String(id))}`);
  if (!res.ok) throw new Error(`DummyJSON recipe ${id} failed: HTTP ${res.status}`);
  return res.json();
}
