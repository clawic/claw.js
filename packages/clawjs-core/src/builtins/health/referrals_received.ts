import type { BuiltinCollectionDefinition } from "../_types.ts";

export const REFERRALS_RECEIVED: BuiltinCollectionDefinition = {
  name: "referrals_received",
  displayName: "Referrals Received",
  family: "health",
  aliases: ["referral_received","referrals_received"],
  fields: [
    { name: "fromDoctorId", type: "relation", relation: { collectionName: "doctors" } },
    { name: "toDoctorId", type: "relation", relation: { collectionName: "doctors" } },
    { name: "reason", type: "text" },
    { name: "issuedAt", type: "date", required: true },
    { name: "completedAt", type: "date" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "referrals_received_issued_idx", fields: ["issuedAt"] },
  ],
};
