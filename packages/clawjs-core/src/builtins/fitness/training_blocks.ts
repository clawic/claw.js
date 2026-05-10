import type { BuiltinCollectionDefinition } from "../_types.ts";

export const TRAINING_BLOCKS: BuiltinCollectionDefinition = {
  name: "training_blocks",
  displayName: "Training Blocks",
  family: "fitness",
  aliases: ["training_block","training_blocks"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "startedAt", type: "date", required: true },
    { name: "endedAt", type: "date" },
    { name: "goal", type: "text" },
    { name: "weeksCount", type: "number" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "training_blocks_started_idx", fields: ["startedAt"] },
  ],
  rules: [
    {"kind":"compare_dates","left":"startedAt","op":"<=","right":"endedAt"},
  ],
};
