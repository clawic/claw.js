import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SCHOOL_EVENTS: BuiltinCollectionDefinition = {
  name: "school_events",
  displayName: "School Events",
  family: "family_care",
  aliases: ["school_event","school_events"],
  fields: [
    { name: "childId", type: "relation", relation: { collectionName: "children_profiles" } },
    { name: "title", type: "text", required: true },
    { name: "eventDate", type: "date", required: true },
    { name: "location", type: "text" },
    { name: "kind", type: "select", options: ["meeting","performance","competition","trip","ceremony","other"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "school_events_date_idx", fields: ["eventDate"] },
  ],
};
