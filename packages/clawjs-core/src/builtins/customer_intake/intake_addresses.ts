import type { BuiltinCollectionDefinition } from "../_types.ts";

export const INTAKE_ADDRESSES: BuiltinCollectionDefinition = {
  name: "intake_addresses",
  displayName: "Intake Addresses",
  family: "customer_intake",
  aliases: ["intake","intakes","intake_address","intake_addresses"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "teamId", type: "relation", relation: { collectionName: "teams" } },
    { name: "type", type: "select", required: true, options: ["email","slack_channel","web_form","discord_channel","telegram_bot"] },
    { name: "identifier", type: "text", required: true },
    { name: "templateId", type: "relation", relation: { collectionName: "templates" } },
    { name: "enabled", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "intake_company_idx", fields: ["companyId"] },
    { name: "intake_type_id_unique", fields: ["type","identifier"], unique: true },
  ],
};
