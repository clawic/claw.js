import type { BuiltinCollectionDefinition } from "../_types.ts";

export const APPLIANCES: BuiltinCollectionDefinition = {
  name: "appliances",
  displayName: "Appliances",
  family: "possessions",
  aliases: ["appliance","appliances"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "brand", type: "text" },
    { name: "model", type: "text" },
    { name: "serialNumber", type: "text" },
    { name: "room", type: "text" },
    { name: "purchasedAt", type: "date" },
    { name: "warrantyExpiresAt", type: "date" },
    { name: "purchasePriceCents", type: "number" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "appliances_name_idx", fields: ["name"] },
    { name: "appliances_room_idx", fields: ["room"] },
  ],
};
