import type { BuiltinCollectionDefinition } from "../_types.ts";

export const REVIEWS_RECEIVED: BuiltinCollectionDefinition = {
  name: "reviews_received",
  displayName: "Reviews Received",
  family: "marketplace_services_rentals",
  aliases: ["review_received","reviews_received"],
  fields: [
    { name: "serviceListingId", type: "relation", relation: { collectionName: "service_listings" } },
    { name: "rentalListingId", type: "relation", relation: { collectionName: "rental_listings" } },
    { name: "reviewedAt", type: "date", required: true },
    { name: "reviewerName", type: "text" },
    { name: "rating", type: "number" },
    { name: "body", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "reviews_received_reviewed_idx", fields: ["reviewedAt"] },
  ],
};
