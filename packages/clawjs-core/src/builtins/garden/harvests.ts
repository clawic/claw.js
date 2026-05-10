import type { BuiltinCollectionDefinition } from "../_types.ts";

export const HARVESTS: BuiltinCollectionDefinition = {
  name: "harvests",
  displayName: "Harvests",
  family: "garden",
  aliases: ["harvest","harvests"],
  fields: [
    { name: "plantId", type: "relation", relation: { collectionName: "plants" } },
    { name: "plotId", type: "relation", relation: { collectionName: "garden_plots" } },
    { name: "harvestedAt", type: "date", required: true },
    { name: "quantity", type: "number" },
    { name: "unit", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "harvests_harvested_idx", fields: ["harvestedAt"] },
  ],
};
