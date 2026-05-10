import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BOOKING_MEETING_TYPES: BuiltinCollectionDefinition = {
  name: "booking_meeting_types",
  displayName: "Booking Meeting Types",
  family: "calendar",
  aliases: ["meeting_type","meeting_types","booking_meeting_type","booking_meeting_types"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "actorId", type: "relation", relation: { collectionName: "actors" } },
    { name: "name", type: "text", required: true },
    { name: "slug", type: "text", required: true },
    { name: "durationMinutes", type: "number" },
    { name: "description", type: "text" },
    { name: "bufferBeforeMinutes", type: "number" },
    { name: "bufferAfterMinutes", type: "number" },
    { name: "location", type: "select", options: ["zoom","google_meet","microsoft_teams","phone","in_person","custom"] },
    { name: "priceCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "active", type: "boolean" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "meet_types_company_slug_unique", fields: ["companyId","slug"], unique: true },
  ],
};
