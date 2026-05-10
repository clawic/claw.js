import type { BuiltinCollectionDefinition } from "../_types.ts";

export const RUNNING_ROUTES: BuiltinCollectionDefinition = {
  name: "running_routes",
  displayName: "Running Routes",
  family: "fitness",
  aliases: ["running_route","running_routes"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "distanceKm", type: "number" },
    { name: "elevationGainMeters", type: "number" },
    { name: "startLocation", type: "text" },
    { name: "geometry", type: "json" },
    { name: "favorited", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "running_routes_name_idx", fields: ["name"] },
  ],
};
