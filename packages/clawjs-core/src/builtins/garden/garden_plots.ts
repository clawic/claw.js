import type { BuiltinCollectionDefinition } from "../_types.ts";

export const GARDEN_PLOTS: BuiltinCollectionDefinition = {
  name: "garden_plots",
  displayName: "Garden Plots",
  family: "garden",
  aliases: ["garden_plot","garden_plots"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "areaSqm", type: "number" },
    { name: "location", type: "text" },
    { name: "description", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "garden_plots_name_idx", fields: ["name"] },
  ],
};
