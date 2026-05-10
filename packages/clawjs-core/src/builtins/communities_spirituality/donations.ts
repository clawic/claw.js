import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DONATIONS: BuiltinCollectionDefinition = {
  name: "donations",
  displayName: "Donations",
  family: "communities_spirituality",
  aliases: ["donation","donations"],
  fields: [
    { name: "recipient", type: "text", required: true },
    { name: "donatedAt", type: "date", required: true },
    { name: "amountCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "kind", type: "select", options: ["money","goods","time","blood","other"] },
    { name: "notes", type: "text" },
    { name: "receipt", type: "file" },
  ],
  indexes: [
    { name: "donations_donated_idx", fields: ["donatedAt"] },
  ],
};
