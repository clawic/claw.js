import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FISHING_CATCHES: BuiltinCollectionDefinition = {
  name: "fishing_catches",
  displayName: "Fishing Catches",
  family: "luxury_and_collecting",
  aliases: ["fishing_catch","fishing_catches"],
  fields: [
    { name: "species", type: "text", required: true },
    { name: "lengthCm", type: "number" },
    { name: "weightKg", type: "number" },
    { name: "location", type: "text" },
    { name: "locationGeo", type: "geo_point" },
    { name: "bait", type: "text" },
    { name: "technique", type: "text" },
    { name: "released", type: "boolean" },
    { name: "image", type: "file" },
    { name: "caughtAt", type: "date", required: true },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "fishing_catches_species_idx", fields: ["species"] },
    { name: "fishing_catches_caught_idx", fields: ["caughtAt"] },
  ],
};
