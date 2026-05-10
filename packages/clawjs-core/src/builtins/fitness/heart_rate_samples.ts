import type { BuiltinCollectionDefinition } from "../_types.ts";

export const HEART_RATE_SAMPLES: BuiltinCollectionDefinition = {
  name: "heart_rate_samples",
  displayName: "Heart Rate Samples",
  family: "fitness",
  aliases: ["heart_rate_sample","heart_rate_samples"],
  fields: [
    { name: "sampledAt", type: "date", required: true },
    { name: "bpm", type: "number", required: true },
    { name: "source", type: "select", options: ["watch","chest_strap","manual","other"] },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "heart_rate_samples_sampled_idx", fields: ["sampledAt"] },
  ],
};
