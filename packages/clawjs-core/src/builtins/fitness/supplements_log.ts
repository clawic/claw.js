import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SUPPLEMENTS_LOG: BuiltinCollectionDefinition = {
  name: "supplements_log",
  displayName: "Supplements Log",
  family: "fitness",
  aliases: ["supplement_log","supplements_log"],
  fields: [
    { name: "supplementName", type: "text", required: true },
    { name: "takenAt", type: "date", required: true },
    { name: "dose", type: "text" },
    { name: "brand", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "supplements_log_supplement_idx", fields: ["supplementName"] },
  ],
};
