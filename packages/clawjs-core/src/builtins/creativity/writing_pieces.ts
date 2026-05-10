import type { BuiltinCollectionDefinition } from "../_types.ts";

export const WRITING_PIECES: BuiltinCollectionDefinition = {
  name: "writing_pieces",
  displayName: "Writing Pieces",
  family: "creativity",
  aliases: ["writing_piece","writing_pieces"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "kind", type: "select", options: ["essay","story","poem","manuscript","article","screenplay","blog_post","other"] },
    { name: "status", type: "select", options: ["draft","revising","published","archived"] },
    { name: "wordCount", type: "number" },
    { name: "body", type: "text" },
    { name: "tags", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "writing_pieces_status_idx", fields: ["status"] },
  ],
};
