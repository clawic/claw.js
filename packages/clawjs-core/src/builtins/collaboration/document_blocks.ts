import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DOCUMENT_BLOCKS: BuiltinCollectionDefinition = {
  name: "document_blocks",
  displayName: "Document Blocks",
  family: "collaboration",
  aliases: ["block","blocks","document_block","document_blocks"],
  fields: [
    { name: "documentId", type: "relation", required: true, relation: { collectionName: "documents" } },
    { name: "parentBlockId", type: "relation", relation: { collectionName: "document_blocks" } },
    { name: "type", type: "select", required: true, options: ["paragraph","heading_1","heading_2","heading_3","bullet_list","numbered_list","todo","quote","code","image","video","file","table","embed","child_doc","callout","divider","toggle","equation","synced_block"] },
    { name: "content", type: "json" },
    { name: "position", type: "number", required: true },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "doc_blocks_document_idx", fields: ["documentId","position"] },
    { name: "doc_blocks_parent_idx", fields: ["parentBlockId"] },
  ],
};
