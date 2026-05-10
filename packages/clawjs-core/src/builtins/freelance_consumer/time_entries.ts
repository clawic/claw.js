import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TIME_ENTRIES: BuiltinCollectionDefinition = {
  name: "time_entries",
  displayName: "Time Entries",
  family: "freelance_consumer",
  aliases: ["time_entry","time_entries"],
  fields: [
    { name: "clientId", type: "relation", relation: { collectionName: "freelance_clients" } },
    { name: "title", type: "text", required: true },
    { name: "startedAt", type: "date", required: true },
    { name: "endedAt", type: "date" },
    { name: "durationMinutes", type: "number" },
    { name: "billableMinutes", type: "number" },
    { name: "hourlyRateCents", type: "number" },
    { name: "invoiced", type: "boolean" },
    { name: "invoiceId", type: "relation", relation: { collectionName: "freelance_invoices" } },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "time_entries_client_idx", fields: ["clientId"] },
    { name: "time_entries_started_idx", fields: ["startedAt"] },
  ],
};
