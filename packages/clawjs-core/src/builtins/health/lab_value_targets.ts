import type { BuiltinCollectionDefinition } from "../_types.ts";

export const LAB_VALUE_TARGETS: BuiltinCollectionDefinition = {
  name: "lab_value_targets",
  displayName: "Lab Value Targets",
  family: "health",
  aliases: ["lab_value_target","lab_value_targets"],
  fields: [
    { name: "testName", type: "text", required: true },
    { name: "targetMin", type: "number" },
    { name: "targetMax", type: "number" },
    { name: "unit", type: "text" },
    { name: "setByDoctorId", type: "relation", relation: { collectionName: "doctors" } },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "lab_value_targets_test_idx", fields: ["testName"] },
  ],
};
