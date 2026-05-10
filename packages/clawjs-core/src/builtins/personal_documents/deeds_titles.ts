import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DEEDS_TITLES: BuiltinCollectionDefinition = {
  name: "deeds_titles",
  displayName: "Deeds & Titles",
  family: "personal_documents",
  aliases: ["deed_title","deeds_titles","deed"],
  fields: [
    { name: "title", type: "text", required: true },
    { name: "kind", type: "select", options: ["property","vehicle","intellectual","other"] },
    { name: "identifier", type: "text" },
    { name: "recordedAt", type: "date" },
    { name: "document", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "deeds_titles_kind_idx", fields: ["kind"] },
  ],
};
