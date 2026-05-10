import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FLASHCARD_REVIEWS: BuiltinCollectionDefinition = {
  name: "flashcard_reviews",
  displayName: "Flashcard Reviews",
  family: "learning",
  aliases: ["flashcard_review","flashcard_reviews"],
  fields: [
    { name: "flashcardId", type: "relation", required: true, relation: { collectionName: "flashcards" } },
    { name: "reviewedAt", type: "date", required: true },
    { name: "rating", type: "select", options: ["again","hard","good","easy"] },
    { name: "intervalDays", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "flashcard_reviews_card_idx", fields: ["flashcardId"] },
  ],
};
