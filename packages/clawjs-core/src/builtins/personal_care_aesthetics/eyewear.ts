import type { BuiltinCollectionDefinition } from "../_types.ts";

export const EYEWEAR: BuiltinCollectionDefinition = {
  name: "eyewear",
  displayName: "Eyewear",
  family: "personal_care_aesthetics",
  aliases: ["eyewear_item","eyewear"],
  fields: [
    { name: "kind", type: "select", options: ["prescription_glasses","sunglasses","reading_glasses","contact_lenses","blue_light","sport","other"] },
    { name: "brand", type: "text" },
    { name: "prescription", type: "json" },
    { name: "purchasedAt", type: "date" },
    { name: "cost", type: "money" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "eyewear_kind_idx", fields: ["kind"] },
  ],
};
