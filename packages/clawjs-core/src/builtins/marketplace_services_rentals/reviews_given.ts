import type { BuiltinCollectionDefinition } from "../_types.ts";

export const REVIEWS_GIVEN: BuiltinCollectionDefinition = {
  name: "reviews_given",
  displayName: "Reviews Given",
  family: "marketplace_services_rentals",
  aliases: ["review_given","reviews_given"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "reviewedAt", type: "date", required: true },
    { name: "target", type: "text" },
    { name: "rating", type: "number" },
    { name: "body", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "reviews_given_reviewed_idx", fields: ["reviewedAt"] },
  ],
};
