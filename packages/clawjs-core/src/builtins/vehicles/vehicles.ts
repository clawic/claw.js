import type { BuiltinCollectionDefinition } from "../_types.ts";

export const VEHICLES: BuiltinCollectionDefinition = {
  name: "vehicles",
  displayName: "Vehicles",
  family: "vehicles",
  aliases: ["vehicle","vehicles"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "make", type: "text" },
    { name: "model", type: "text" },
    { name: "year", type: "number" },
    { name: "plate", type: "text" },
    { name: "vin", type: "text" },
    { name: "fuelType", type: "select", options: ["gasoline","diesel","hybrid","electric","lpg","other"] },
    { name: "odometerKm", type: "number" },
    { name: "image", type: "file" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "vehicles_plate_idx", fields: ["plate"] },
    { name: "vehicles_active_idx", fields: ["active"] },
  ],
};
