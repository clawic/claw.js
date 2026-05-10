import type { BuiltinCollectionDefinition } from "../_types.ts";

export const OVULATION_TESTS: BuiltinCollectionDefinition = {
  name: "ovulation_tests",
  displayName: "Ovulation Tests",
  family: "reproductive_intimate",
  aliases: ["ovulation_test","ovulation_tests"],
  fields: [
    { name: "takenAt", type: "date", required: true },
    { name: "result", type: "select", options: ["negative","positive","peak","high","low","invalid"] },
    { name: "brand", type: "text" },
  ],
  indexes: [
    { name: "ovulation_tests_taken_idx", fields: ["takenAt"] },
  ],
};
