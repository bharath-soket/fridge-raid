import json
import os
import urllib.request

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests", "fixtures")
os.makedirs(OUT, exist_ok=True)


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "fridge-raid-fixture/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def save(name, data):
    p = os.path.join(OUT, name)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"saved {name} ({os.path.getsize(p)} bytes)")


# TheMealDB: one full meal, one ingredient-filter stub list
meal = get("https://www.themealdb.com/api/json/v1/1/lookup.php?i=52772")
save("mealdb-lookup-52772.json", meal)
m = meal["meals"][0]
ings = [(m.get(f"strIngredient{i}"), m.get(f"strMeasure{i}")) for i in range(1, 21)]
print("  meal:", m["idMeal"], m["strMeal"], "| area:", m.get("strArea"), "| country:", m.get("strCountry"))
print("  ingredients:", [(i, q) for i, q in ings if i])
print("  tags:", m.get("strTags"))

stubs = get("https://www.themealdb.com/api/json/v1/1/filter.php?i=chicken_breast")
save("mealdb-filter-chicken-breast.json", stubs)
print("  filter stubs:", len(stubs.get("meals") or []), "first:", (stubs.get("meals") or [{}])[0])

# DummyJSON: all recipes (limit=0) + single recipe
allr = get("https://dummyjson.com/recipes?limit=0")
save("dummyjson-all.json", allr)
print("  dummyjson limit=0 -> total:", allr.get("total"), "got:", len(allr.get("recipes") or []))

one = get("https://dummyjson.com/recipes/1")
save("dummyjson-recipe-1.json", one)
r = one if "name" in one else one.get("recipes", [{}])[0] if one.get("recipes") else one
print("  recipe 1:", r.get("name"), "| prep:", r.get("prepTimeMinutes"), "cook:", r.get("cookTimeMinutes"),
      "| diff:", r.get("difficulty"), "| kcal:", r.get("caloriesPerServing"), "| mealType:", r.get("mealType"))
