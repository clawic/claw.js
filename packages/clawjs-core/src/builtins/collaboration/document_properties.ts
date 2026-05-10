import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DOCUMENT_PROPERTIES: BuiltinCollectionDefinition = {
  name: "document_properties",
  displayName: "Document Properties",
  family: "collaboration",
  aliases: ["doc_property","doc_properties","document_property","document_properties"],
  fields: [
    { name: "documentId", type: "relation", required: true, relation: { collectionName: "documents" } },
    { name: "propertyDefinitionId", type: "relation", required: true, relation: { collectionName: "custom_fields" } },
    { name: "value", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "doc_props_doc_idx", fields: ["documentId"] },
    { name: "doc_props_prop_idx", fields: ["propertyDefinitionId"] },
  ],
};
