import type { BuiltinCollectionDefinition } from "../_types.ts";

export const REFERRALS: BuiltinCollectionDefinition = {
  name: "referrals",
  displayName: "Referrals",
  family: "marketing",
  aliases: ["referral","referrals"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "referrerActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "referrerSubscriberId", type: "relation", relation: { collectionName: "newsletter_subscribers" } },
    { name: "referralCode", type: "text", required: true },
    { name: "reward", type: "json" },
    { name: "clicks", type: "number" },
    { name: "conversions", type: "number" },
    { name: "rewardClaimedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "referrals_code_unique", fields: ["referralCode"], unique: true },
    { name: "referrals_referrer_idx", fields: ["referrerActorId"] },
  ],
};
