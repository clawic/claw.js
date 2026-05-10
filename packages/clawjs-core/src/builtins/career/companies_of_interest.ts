import type { BuiltinCollectionDefinition } from "../_types.ts";

export const COMPANIES_OF_INTEREST: BuiltinCollectionDefinition = {
  name: "companies_of_interest",
  displayName: "Companies of Interest",
  family: "career",
  aliases: ["company_of_interest","companies_of_interest"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "industry", type: "text" },
    { name: "size", type: "text" },
    { name: "city", type: "text" },
    { name: "website", type: "url" },
    { name: "rating", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "companies_of_interest_name_idx", fields: ["name"] },
  ],
};
