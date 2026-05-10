import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DOCUMENTS: BuiltinCollectionDefinition = {
  name: "documents",
  displayName: "Documents",
  family: "collaboration",
  aliases: ["doc","docs","document","documents"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "title", type: "text", required: true },
    { name: "content", type: "text" },
    { name: "contentData", type: "json" },
    { name: "scopeKind", type: "select", required: true, options: ["workspace","team","project","initiative","portfolio_item"] },
    { name: "scopeId", type: "text" },
    { name: "parentDocumentId", type: "relation", relation: { collectionName: "documents" } },
    { name: "createdByActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "updatedByActorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "editorsCanUpdate", type: "boolean" },
    { name: "sortOrder", type: "number" },
    { name: "accessLevel", type: "select", options: ["PUBLIC","PRIVATE"] },
    { name: "deletedAt", type: "date" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "documents_company_idx", fields: ["companyId"] },
    { name: "documents_scope_idx", fields: ["scopeKind","scopeId"] },
    { name: "documents_parent_idx", fields: ["parentDocumentId"] },
  ],
};
