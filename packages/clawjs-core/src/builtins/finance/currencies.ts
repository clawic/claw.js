import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CURRENCIES: BuiltinCollectionDefinition = {
  name: "currencies",
  displayName: "Currencies (catalog)",
  family: "finance",
  aliases: ["currency","currencies"],
  fields: [
    { name: "code", type: "text", required: true },
    { name: "name", type: "text", required: true },
    { name: "symbol", type: "text" },
    { name: "decimalPlaces", type: "number" },
  ],
  indexes: [
    { name: "currencies_code_idx", fields: ["code"] },
  ],
};
