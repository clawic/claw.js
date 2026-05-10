import type { BuiltinCollectionDefinition } from "../_types.ts";

export const BODY_MODIFICATIONS: BuiltinCollectionDefinition = {
  name: "body_modifications",
  displayName: "Body Modifications",
  family: "identity_body_religious_fine",
  aliases: ["body_modification","body_modifications"],
  fields: [
    { name: "kind", type: "select", options: ["tattoo","piercing","scarification","branding","implant","stretching","other"] },
    { name: "bodyPart", type: "text" },
    { name: "designDescription", type: "markdown" },
    { name: "artist", type: "text" },
    { name: "studio", type: "text" },
    { name: "doneAt", type: "date", required: true },
    { name: "healingStatus", type: "select", options: ["fresh","healing","healed","reopened"] },
    { name: "price", type: "money" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "body_modifications_kind_idx", fields: ["kind"] },
  ],
};
