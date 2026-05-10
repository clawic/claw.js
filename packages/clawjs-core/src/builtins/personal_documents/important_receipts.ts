import type { BuiltinCollectionDefinition } from "../_types.ts";

export const IMPORTANT_RECEIPTS: BuiltinCollectionDefinition = {
  name: "important_receipts",
  displayName: "Important Receipts",
  family: "personal_documents",
  aliases: ["important_receipt","important_receipts","receipt"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "vendor", type: "text" },
    { name: "issuedAt", type: "date" },
    { name: "amountCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "file", type: "file" },
    { name: "tags", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "important_receipts_issued_idx", fields: ["issuedAt"] },
  ],
};
