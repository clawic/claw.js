import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FLASHCARD_DECKS: BuiltinCollectionDefinition = {
  name: "flashcard_decks",
  displayName: "Flashcard Decks",
  family: "learning",
  aliases: ["flashcard_deck","flashcard_decks","deck"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "subject", type: "text" },
    { name: "cardCount", type: "number" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "flashcard_decks_active_idx", fields: ["active"] },
  ],
};
