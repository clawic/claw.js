import type { BuiltinCollectionDefinition } from "../_types.ts";

export const PRODUCT_VARIANTS: BuiltinCollectionDefinition = {
  name: "product_variants",
  displayName: "Product Variants",
  family: "commerce",
  aliases: ["variant","variants","product_variant","product_variants"],
  fields: [
    { name: "productCatalogId", type: "relation", required: true, relation: { collectionName: "products_catalog" } },
    { name: "name", type: "text" },
    { name: "sku", type: "text" },
    { name: "priceCents", type: "number" },
    { name: "currency", type: "text" },
    { name: "inventoryQuantity", type: "number" },
    { name: "weight", type: "number" },
    { name: "weightUnit", type: "select", options: ["g","kg","oz","lb"] },
    { name: "barcode", type: "text" },
    { name: "imageUrl", type: "text" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "variants_product_idx", fields: ["productCatalogId"] },
    { name: "variants_sku_idx", fields: ["sku"] },
  ],
};
