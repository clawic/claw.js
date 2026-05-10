import type { BuiltinCollectionDefinition } from "../_types.ts";

export const MAKEUP_CATALOG: BuiltinCollectionDefinition = {
  name: "makeup_catalog",
  displayName: "Makeup Catalog",
  family: "personal_care_aesthetics",
  aliases: ["makeup_item","makeup_catalog"],
  fields: [
    { name: "brand", type: "text", required: true },
    { name: "name", type: "text", required: true },
    { name: "kind", type: "select", options: ["foundation","concealer","powder","blush","bronzer","eyeshadow","eyeliner","mascara","lipstick","lipgloss","brow","setting_spray","primer","other"] },
    { name: "shade", type: "text" },
    { name: "openedAt", type: "date" },
    { name: "expiresAt", type: "date" },
    { name: "cost", type: "money" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "makeup_catalog_kind_idx", fields: ["kind"] },
  ],
};
