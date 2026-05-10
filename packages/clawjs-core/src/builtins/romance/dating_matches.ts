import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DATING_MATCHES: BuiltinCollectionDefinition = {
  name: "dating_matches",
  displayName: "Dating Matches",
  family: "romance",
  aliases: ["dating_match","dating_matches","match"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "platform", type: "text" },
    { name: "matchedAt", type: "date" },
    { name: "status", type: "select", options: ["new","chatting","met","ghosted","blocked","ongoing","ended"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "dating_matches_status_idx", fields: ["status"] },
  ],
};
