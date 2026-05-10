import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WINE_CELLAR_BOTTLES: BuiltinCollectionDefinition = {
  name: "wine_cellar_bottles",
  displayName: "Wine Cellar Bottles",
  family: "luxury_and_collecting",
  aliases: ["wine_cellar_bottle","wine_cellar_bottles"],
  fields: [
    { name: "winery", type: "text", required: true },
    { name: "vintage", type: "number" },
    { name: "varietal", type: "text" },
    { name: "region", type: "text" },
    { name: "country", type: "text" },
    { name: "bottleSize", type: "text" },
    { name: "drinkWindowStart", type: "date" },
    { name: "drinkWindowEnd", type: "date" },
    { name: "locationInCellar", type: "text" },
    { name: "cost", type: "money" },
    { name: "currentValue", type: "money" },
    { name: "rating", type: "rating", enumScale: 5 },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "wine_cellar_bottles_winery_idx", fields: ["winery"] },
    { name: "wine_cellar_bottles_vintage_idx", fields: ["vintage"] },
  ],
  rules: [
    {"kind":"compare_dates","left":"drinkWindowStart","op":"<=","right":"drinkWindowEnd"},
  ],
};
