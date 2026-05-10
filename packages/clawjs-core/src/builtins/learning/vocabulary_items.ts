import type { BuiltinCollectionDefinition } from "../_types.ts";

export const VOCABULARY_ITEMS: BuiltinCollectionDefinition = {
  name: "vocabulary_items",
  displayName: "Vocabulary Items",
  family: "learning",
  aliases: ["vocabulary_item","vocabulary_items","vocab"],
  fields: [
    { name: "term", type: "text", required: true },
    { name: "translation", type: "text" },
    { name: "languageId", type: "relation", relation: { collectionName: "languages_learning" } },
    { name: "partOfSpeech", type: "text" },
    { name: "example", type: "text" },
    { name: "tags", type: "json" },
    { name: "masteryLevel", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "vocabulary_items_term_idx", fields: ["term"] },
    { name: "vocabulary_items_language_idx", fields: ["languageId"] },
  ],
};
