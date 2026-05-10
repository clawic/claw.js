import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BOOKING_SLOTS: BuiltinCollectionDefinition = {
  name: "booking_slots",
  displayName: "Booking Slots",
  family: "calendar",
  aliases: ["booking","bookings","booking_slot","booking_slots","slot","slots"],
  fields: [
    { name: "meetingTypeId", type: "relation", required: true, relation: { collectionName: "booking_meeting_types" } },
    { name: "bookedByContactId", type: "relation", relation: { collectionName: "contacts" } },
    { name: "bookedByEmail", type: "email" },
    { name: "bookedByName", type: "text" },
    { name: "startTime", type: "date" },
    { name: "endTime", type: "date" },
    { name: "status", type: "select", options: ["confirmed","cancelled","no_show","completed","rescheduled"] },
    { name: "meetingUrl", type: "text" },
    { name: "notes", type: "text" },
    { name: "paid", type: "boolean" },
    { name: "paymentIntentId", type: "relation", relation: { collectionName: "payment_intents" } },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "slots_type_start_idx", fields: ["meetingTypeId","startTime"] },
    { name: "slots_status_idx", fields: ["status"] },
  ],
};
