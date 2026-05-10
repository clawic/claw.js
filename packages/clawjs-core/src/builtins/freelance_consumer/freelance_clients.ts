import type { BuiltinCollectionDefinition } from "../_types.ts";

export const FREELANCE_CLIENTS: BuiltinCollectionDefinition = {
  name: "freelance_clients",
  displayName: "Freelance Clients",
  family: "freelance_consumer",
  aliases: ["freelance_client","freelance_clients"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "contactName", type: "text" },
    { name: "contactEmail", type: "email" },
    { name: "phone", type: "text" },
    { name: "address", type: "text" },
    { name: "currency", type: "text" },
    { name: "defaultHourlyRateCents", type: "number" },
    { name: "active", type: "boolean" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "freelance_clients_active_idx", fields: ["active"] },
  ],
};
