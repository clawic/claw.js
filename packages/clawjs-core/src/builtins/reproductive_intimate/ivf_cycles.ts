import type { BuiltinCollectionDefinition } from "../_types.ts";

export const IVF_CYCLES: BuiltinCollectionDefinition = {
  name: "ivf_cycles",
  displayName: "IVF Cycles",
  family: "reproductive_intimate",
  aliases: ["ivf_cycle","ivf_cycles"],
  fields: [
    { name: "startedAt", type: "date", required: true },
    { name: "endedAt", type: "date" },
    { name: "protocol", type: "text" },
    { name: "eggsRetrieved", type: "number" },
    { name: "fertilized", type: "number" },
    { name: "transferred", type: "number" },
    { name: "frozen", type: "number" },
    { name: "outcome", type: "select", options: ["pregnant","no_pregnancy","cycle_cancelled","loss","ongoing"] },
    { name: "cost", type: "money" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "ivf_cycles_started_idx", fields: ["startedAt"] },
  ],
};
