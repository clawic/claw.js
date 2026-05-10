import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COUPONS: BuiltinCollectionDefinition = {
  name: "coupons",
  displayName: "Coupons",
  family: "billing",
  aliases: ["coupon","coupons"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "code", type: "text", required: true },
    { name: "name", type: "text" },
    { name: "percentOff", type: "number" },
    { name: "amountOffCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "duration", type: "select", options: ["forever","once","repeating"] },
    { name: "durationInMonths", type: "number" },
    { name: "maxRedemptions", type: "number" },
    { name: "redeemedCount", type: "number" },
    { name: "validUntil", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "coupons_company_code_unique", fields: ["companyId","code"], unique: true },
  ],
};
