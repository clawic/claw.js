import type { BuiltinCollectionDefinition } from "../_types.ts";

export const REAL_ESTATE_OWNED: BuiltinCollectionDefinition = {
  name: "real_estate_owned",
  displayName: "Real Estate Owned",
  family: "finance",
  aliases: ["real_estate_owned_item","real_estate_owned"],
  fields: [
    { name: "kind", type: "select", options: ["primary_residence","secondary_home","rental","investment","commercial","land","other"] },
    { name: "address", type: "address" },
    { name: "purchasePrice", type: "money" },
    { name: "currentValue", type: "money" },
    { name: "mortgageRemaining", type: "money" },
    { name: "rentedOut", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "real_estate_owned_kind_idx", fields: ["kind"] },
  ],
};
