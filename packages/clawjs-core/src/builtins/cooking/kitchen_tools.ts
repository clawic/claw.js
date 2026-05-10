import type { BuiltinCollectionDefinition } from "../_types.ts";

export const KITCHEN_TOOLS: BuiltinCollectionDefinition = {
  name: "kitchen_tools",
  displayName: "Kitchen Tools",
  family: "cooking",
  aliases: ["kitchen_tool","kitchen_tools"],
  fields: [
    { name: "name", type: "text", required: true },
    { name: "brand", type: "text" },
    { name: "category", type: "select", options: ["knife","pan","pot","appliance","utensil","bakeware","gadget","other"] },
    { name: "purchasedAt", type: "date" },
    { name: "cost", type: "money" },
    { name: "image", type: "file" },
    { name: "notes", type: "text" },
  ],
  indexes: [
    { name: "kitchen_tools_category_idx", fields: ["category"] },
  ],
};
