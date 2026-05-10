import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SUPPORT_CUSTOM_ATTRIBUTES: BuiltinCollectionDefinition = {
  name: "support_custom_attributes",
  displayName: "Support Custom Attributes",
  family: "support",
  aliases: ["support_attribute","support_attributes","support_custom_attribute","support_custom_attributes"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "entityKind", type: "select", required: true, options: ["contact","conversation","ticket"] },
    { name: "name", type: "text", required: true },
    { name: "dataType", type: "select", required: true, options: ["text","number","boolean","date","select","multi_select"] },
    { name: "options", type: "json" },
    { name: "required", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "supp_attr_entity_idx", fields: ["entityKind"] },
  ],
};
