// DOM builders. No innerHTML with API data — createElement/textContent only.
// Safe URL helper: only http(s) links are ever attached.

/** Allow only http(s) URLs; anything else becomes null. */
export function safeUrl(raw) {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw, location.href);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    /* fall through */
  }
  return null;
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "text") node.textContent = v;
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

/** A pantry chip with its × remove button. */
export function chipEl(name, onRemove) {
  const btn = el("button", { type: "button", "aria-label": `Remove ${name}`, text: "×" });
  btn.addEventListener("click", () => onRemove(name));
  return el("li", { class: "chip" }, name, btn);
}

/** One result card. */
export function cardEl(result, { isFavourite, onOpen, onToggleFavourite }) {
  const { recipe, matched, missing, score } = result;
  const total = matched.length + missing.length;

  const fav = el(
    "button",
    {
      type: "button",
      class: "fav-button",
      "aria-label": isFavourite ? `Unfavourite ${recipe.name}` : `Favourite ${recipe.name}`,
      "aria-pressed": isFavourite ? "true" : "false",
      text: isFavourite ? "★" : "☆",
    },
  );
  fav.addEventListener("click", (e) => {
    e.stopPropagation();
    onToggleFavourite(recipe.id);
  });

  const media = safeUrl(recipe.image)
    ? el("img", { src: recipe.image, alt: recipe.name, loading: "lazy" })
    : el("div", { class: "card-img-fallback", "aria-hidden": "true" }, "🍽");

  const badges = [
    recipe.cuisine && el("span", { class: "badge" }, recipe.cuisine),
    recipe.minutes != null && el("span", { class: "badge time" }, `${recipe.minutes} min`),
    recipe.difficulty && el("span", { class: "badge difficulty" }, recipe.difficulty),
    el("span", { class: "badge source" }, recipe.source),
  ].filter(Boolean);

  const missingText =
    missing.length === 0
      ? "You have everything!"
      : el("span", null, "Missing: ", el("strong", null, missing.slice(0, 4).map((m) => m.name).join(", ") + (missing.length > 4 ? ` +${missing.length - 4}` : "")));

  const card = el(
    "article",
    { class: "card", tabindex: "0", role: "button", "aria-label": `Open ${recipe.name}` },
    el(
      "div",
      { class: "card-body" },
      fav,
      el("h3", null, recipe.name),
      el(
        "div",
        { class: "score-row" },
        el("span", null, `${matched.length}/${total}`),
        el("span", { class: "score-bar", role: "img", "aria-label": `${Math.round(score * 100)}% match` },
          el("span", { class: "score-fill", style: `width:${Math.round(score * 100)}%` })),
      ),
      el("p", { class: "missing" }, missingText),
      el("div", { class: "badges" }, badges),
    ),
    media,
  );
  card.addEventListener("click", () => onOpen(result));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(result);
    }
  });
  return card;
}

/** Fill the details dialog body. */
export function fillDialog(dialog, body, result, { isFavourite, onToggleFavourite, onAddMissing }) {
  const { recipe, matched, missing } = result;
  const matchedNames = new Set(matched.map((m) => m.name));

  body.replaceChildren();

  const fav = el("button", {
    type: "button",
    class: "fav-button",
    "aria-pressed": isFavourite ? "true" : "false",
    "aria-label": isFavourite ? `Unfavourite ${recipe.name}` : `Favourite ${recipe.name}`,
    text: isFavourite ? "★" : "☆",
  });
  fav.addEventListener("click", () => onToggleFavourite(recipe.id));

  body.append(
    el("h2", { id: "dialog-title" }, recipe.name),
    fav,
  );

  if (safeUrl(recipe.image)) {
    body.append(el("img", { src: recipe.image, alt: recipe.name }));
  }

  const meta = [
    recipe.cuisine && el("span", { class: "badge" }, recipe.cuisine),
    recipe.category && el("span", { class: "badge" }, recipe.category),
    recipe.minutes != null && el("span", { class: "badge time" }, `${recipe.minutes} min`),
    recipe.difficulty && el("span", { class: "badge difficulty" }, recipe.difficulty),
    recipe.calories != null && el("span", { class: "badge" }, `${recipe.calories} kcal/serving`),
    recipe.servings != null && el("span", { class: "badge" }, `serves ${recipe.servings}`),
  ].filter(Boolean);
  if (meta.length) body.append(el("div", { class: "badges" }, meta));

  body.append(el("h3", null, "Ingredients"));
  const list = el("ul", { class: "ing-list" });
  for (const ing of recipe.ingredients) {
    const ok = matchedNames.has(ing.name);
    list.append(
      el("li", null,
        el("span", { class: `mark ${ok ? "yes" : "no"}`, "aria-hidden": "true" }, ok ? "✓" : "✗"),
        el("span", null, ing.name),
        ing.measure && el("span", { class: "measure" }, `(${ing.measure})`),
      ),
    );
  }
  body.append(list);

  if (recipe.steps?.length) {
    body.append(el("h3", null, "Steps"));
    body.append(el("ol", { class: "steps" }, recipe.steps.map((s) => el("li", null, s))));
  }

  const links = [];
  if (safeUrl(recipe.video)) links.push(el("a", { href: recipe.video, target: "_blank", rel: "noopener noreferrer" }, "▶ Watch video"));
  if (safeUrl(recipe.sourceUrl)) links.push(el("a", { href: recipe.sourceUrl, target: "_blank", rel: "noopener noreferrer" }, "View source"));
  body.append(el("div", { class: "link-row" }, links));

  if (onAddMissing && missing.length) {
    const btn = el("button", { type: "button", class: "primary add-missing" },
      `Add ${missing.length} missing item${missing.length === 1 ? "" : "s"} to shopping list`);
    btn.addEventListener("click", () => {
      onAddMissing(result);
      btn.disabled = true;
      btn.textContent = "Added ✓";
    });
    body.append(btn);
  }

  dialog.showModal();
}
