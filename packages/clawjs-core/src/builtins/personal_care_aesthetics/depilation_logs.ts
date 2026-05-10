import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DEPILATION_LOGS: BuiltinCollectionDefinition = {
  name: "depilation_logs",
  displayName: "Depilation Logs",
  family: "personal_care_aesthetics",
  aliases: ["depilation_log","depilation_logs"],
  fields: [
    { name: "method", type: "select", options: ["shave","wax","laser","epilator","threading","sugaring","cream","other"] },
    { name: "bodyPart", type: "text" },
    { name: "performedAt", type: "date", required: true },
    { name: "cost", type: "money" },
    { name: "technician", type: "text" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "depilation_logs_performed_idx", fields: ["performedAt"] },
  ],
};
