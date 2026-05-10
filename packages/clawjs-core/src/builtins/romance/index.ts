import type { BuiltinFamilyDefinition } from "../_types.ts";
import { DATING_MATCHES } from "./dating_matches.ts";
import { DATES_LOG } from "./dates_log.ts";
import { ROMANTIC_PARTNERS } from "./romantic_partners.ts";
import { ANNIVERSARY_DATES } from "./anniversary_dates.ts";
import { ROMANTIC_GIFTS } from "./romantic_gifts.ts";

export const ROMANCE_FAMILY: BuiltinFamilyDefinition = {
  name: "romance",
  displayName: "Romance & Dating",
  description: "Matches, dates, romantic partners, anniversaries.",
  collections: [DATING_MATCHES, DATES_LOG, ROMANTIC_PARTNERS, ANNIVERSARY_DATES, ROMANTIC_GIFTS],
};

export { DATING_MATCHES, DATES_LOG, ROMANTIC_PARTNERS, ANNIVERSARY_DATES, ROMANTIC_GIFTS };
