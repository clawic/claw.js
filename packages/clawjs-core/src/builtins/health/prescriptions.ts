import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PRESCRIPTIONS: BuiltinCollectionDefinition = {
  name: "prescriptions",
  displayName: "Prescriptions",
  family: "health",
  aliases: ["prescription","prescriptions"],
  fields: [
    { name: "doctorId", type: "relation", relation: { collectionName: "doctors" } },
    { name: "issuedAt", type: "date", required: true },
    { name: "expiresAt", type: "date" },
    { name: "medications", type: "json" },
    { name: "notes", type: "text" },
    { name: "document", type: "file" },
  ],
  indexes: [
    { name: "prescriptions_issued_idx", fields: ["issuedAt"] },
  ],
};
