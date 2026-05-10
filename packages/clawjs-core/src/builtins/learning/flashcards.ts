import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FLASHCARDS: BuiltinCollectionDefinition = {
  name: "flashcards",
  displayName: "Flashcards",
  family: "learning",
  aliases: ["flashcard","flashcards"],
  fields: [
    { name: "deckId", type: "relation", required: true, relation: { collectionName: "flashcard_decks" } },
    { name: "front", type: "text", required: true },
    { name: "back", type: "text", required: true },
    { name: "tags", type: "json" },
    { name: "difficulty", type: "number" },
    { name: "nextReviewAt", type: "date" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "flashcards_deck_idx", fields: ["deckId"] },
    { name: "flashcards_next_review_idx", fields: ["nextReviewAt"] },
  ],
};
