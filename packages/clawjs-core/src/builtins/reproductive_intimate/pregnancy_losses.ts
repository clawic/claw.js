import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PREGNANCY_LOSSES: BuiltinCollectionDefinition = {
  name: "pregnancy_losses",
  displayName: "Pregnancy Losses",
  family: "reproductive_intimate",
  aliases: ["pregnancy_loss","pregnancy_losses"],
  fields: [
    { name: "occurredAt", type: "date", required: true },
    { name: "week", type: "number" },
    { name: "kind", type: "select", options: ["miscarriage","stillbirth","ectopic","chemical","molar"] },
    { name: "notesBody", type: "markdown" },
    { name: "image", type: "file" },
  ],
  indexes: [
    { name: "pregnancy_losses_occurred_idx", fields: ["occurredAt"] },
  ],
};
