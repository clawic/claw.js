import type { BuiltinFamilyDefinition } from "../_types.ts";
import { CLOTHES } from "./clothes.ts";
import { OUTFITS } from "./outfits.ts";
import { OUTFIT_LOGS } from "./outfit_logs.ts";
import { LAUNDRY_LOGS } from "./laundry_logs.ts";

export const WARDROBE_FAMILY: BuiltinFamilyDefinition = {
  name: "wardrobe",
  displayName: "Wardrobe",
  description: "Clothes, outfits, outfit logs, laundry.",
  collections: [CLOTHES, OUTFITS, OUTFIT_LOGS, LAUNDRY_LOGS],
};

export { CLOTHES, OUTFITS, OUTFIT_LOGS, LAUNDRY_LOGS };
