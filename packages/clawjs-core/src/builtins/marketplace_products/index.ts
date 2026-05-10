import type { BuiltinFamilyDefinition } from "../_types.ts";
import { PRODUCT_LISTINGS } from "./product_listings.ts";
import { PRODUCT_LISTING_MESSAGES } from "./product_listing_messages.ts";
import { PRODUCT_OFFERS } from "./product_offers.ts";

export const MARKETPLACE_PRODUCTS_FAMILY: BuiltinFamilyDefinition = {
  name: "marketplace_products",
  displayName: "Marketplace · P2P Products",
  description: "Generic P2P product listings, messages, offers.",
  collections: [PRODUCT_LISTINGS, PRODUCT_LISTING_MESSAGES, PRODUCT_OFFERS],
};

export { PRODUCT_LISTINGS, PRODUCT_LISTING_MESSAGES, PRODUCT_OFFERS };
