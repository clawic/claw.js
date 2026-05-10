import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CONTRACEPTIVE_USE: BuiltinCollectionDefinition = {
  name: "contraceptive_use",
  displayName: "Contraceptive Use",
  family: "reproductive_intimate",
  aliases: ["contraceptive","contraceptive_use"],
  fields: [
    { name: "kind", type: "select", options: ["pill","iud","implant","ring","patch","condom","diaphragm","sterilization","withdrawal","fertility_awareness","other"] },
    { name: "startedAt", type: "date", required: true },
    { name: "endedAt", type: "date" },
    { name: "effectivenessSelfReported", type: "rating", enumScale: 5 },
    { name: "sideEffects", type: "json" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "contraceptive_use_kind_idx", fields: ["kind"] },
  ],
};
