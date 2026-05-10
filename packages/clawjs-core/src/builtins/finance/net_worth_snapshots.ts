import type { BuiltinCollectionDefinition } from "../_types.ts";

export const NET_WORTH_SNAPSHOTS: BuiltinCollectionDefinition = {
  name: "net_worth_snapshots",
  displayName: "Net Worth Snapshots",
  family: "finance",
  aliases: ["net_worth_snapshot","net_worth_snapshots"],
  fields: [
    { name: "takenAt", type: "date", required: true },
    { name: "assets", type: "money" },
    { name: "liabilities", type: "money" },
    { name: "net", type: "money" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "net_worth_snapshots_taken_idx", fields: ["takenAt"] },
  ],
};
