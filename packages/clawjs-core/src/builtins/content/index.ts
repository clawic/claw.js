import type { BuiltinFamilyDefinition } from "../_types.ts";
import { CONTENT_APPROVALS } from "./content_approvals.ts";
import { CONTENT_BRANDS } from "./content_brands.ts";
import { CONTENT_CAMPAIGNS } from "./content_campaigns.ts";
import { CONTENT_DESTINATIONS } from "./content_destinations.ts";
import { CONTENT_ENTRIES } from "./content_entries.ts";
import { CONTENT_PUBLICATIONS } from "./content_publications.ts";
import { CONTENT_REVISIONS } from "./content_revisions.ts";
import { CONTENT_VARIANTS } from "./content_variants.ts";

export const CONTENT_FAMILY: BuiltinFamilyDefinition = {
  name: "content",
  displayName: "Content / CMS",
  description: "CMS brands, destinations, campaigns, entries, revisions, variants, approvals, publications, evidence, and gaps.",
  collections: [
    CONTENT_BRANDS,
    CONTENT_DESTINATIONS,
    CONTENT_CAMPAIGNS,
    CONTENT_ENTRIES,
    CONTENT_REVISIONS,
    CONTENT_VARIANTS,
    CONTENT_APPROVALS,
    CONTENT_PUBLICATIONS,
  ],
};
