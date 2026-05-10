import type { BuiltinCollectionDefinition } from "../_types.ts";

export const STI_TESTS: BuiltinCollectionDefinition = {
  name: "sti_tests",
  displayName: "STI Tests",
  family: "reproductive_intimate",
  aliases: ["sti_test","sti_tests"],
  fields: [
    { name: "takenAt", type: "date", required: true },
    { name: "panel", type: "json" },
    { name: "results", type: "json" },
    { name: "lab", type: "text" },
    { name: "cost", type: "money" },
    { name: "document", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "sti_tests_taken_idx", fields: ["takenAt"] },
  ],
};
