import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CHILDREN_PROFILES: BuiltinCollectionDefinition = {
  name: "children_profiles",
  displayName: "Children Profiles",
  family: "family_care",
  aliases: ["children_profile","children_profiles","kid"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "birthDate", type: "date", required: true },
    { name: "nickname", type: "text" },
    { name: "school", type: "text" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "children_profiles_name_idx", fields: ["name"] },
  ],
};
