import type {
  BuiltinCollectionDefinition,
  BuiltinFamilyDefinition,
} from "./_types.ts";

import { COOKING_FAMILY } from "./cooking/index.ts";
import { IDENTITY_FAMILY } from "./identity/index.ts";
import { WORK_FAMILY } from "./work/index.ts";
import { COLLABORATION_FAMILY } from "./collaboration/index.ts";
import { CUSTOMER_INTAKE_FAMILY } from "./customer_intake/index.ts";
import { FLOW_FAMILY } from "./flow/index.ts";
import { AUDIT_FAMILY } from "./audit/index.ts";
import { INTEGRATIONS_FAMILY } from "./integrations/index.ts";
import { BILLING_FAMILY } from "./billing/index.ts";
import { CRM_FAMILY } from "./crm/index.ts";
import { SUPPORT_FAMILY } from "./support/index.ts";
import { ANALYTICS_FAMILY } from "./analytics/index.ts";
import { OBSERVABILITY_FAMILY } from "./observability/index.ts";
import { INFRA_FAMILY } from "./infra/index.ts";
import { MARKETING_FAMILY } from "./marketing/index.ts";
import { AGENTS_FAMILY } from "./agents/index.ts";
import { HR_FAMILY } from "./hr/index.ts";
import { CALENDAR_FAMILY } from "./calendar/index.ts";
import { COMMERCE_FAMILY } from "./commerce/index.ts";
import { FITNESS_FAMILY } from "./fitness/index.ts";
import { HEALTH_FAMILY } from "./health/index.ts";
import { HABITS_JOURNALING_FAMILY } from "./habits_journaling/index.ts";
import { FINANCE_FAMILY } from "./finance/index.ts";
import { POSSESSIONS_FAMILY } from "./possessions/index.ts";
import { WARDROBE_FAMILY } from "./wardrobe/index.ts";
import { VEHICLES_FAMILY } from "./vehicles/index.ts";
import { HOBBIES_FAMILY } from "./hobbies/index.ts";
import { READING_MEDIA_FAMILY } from "./reading_media/index.ts";
import { LEARNING_FAMILY } from "./learning/index.ts";
import { BOOKMARKS_MISC_FAMILY } from "./bookmarks_misc/index.ts";
import { EDUCATION_SCHOOL_FAMILY } from "./education_school/index.ts";
import { CAREER_FAMILY } from "./career/index.ts";
import { TRAVEL_FAMILY } from "./travel/index.ts";
import { RELATIONSHIPS_FAMILY } from "./relationships/index.ts";
import { FAMILY_CARE_FAMILY } from "./family_care/index.ts";
import { ROMANCE_FAMILY } from "./romance/index.ts";
import { PETS_FAMILY } from "./pets/index.ts";
import { GARDEN_FAMILY } from "./garden/index.ts";
import { EVENTS_MEMORIES_FAMILY } from "./events_memories/index.ts";
import { PERSONAL_DOCUMENTS_FAMILY } from "./personal_documents/index.ts";
import { MARKETPLACE_REAL_ESTATE_FAMILY } from "./marketplace_real_estate/index.ts";
import { MARKETPLACE_VEHICLES_FAMILY } from "./marketplace_vehicles/index.ts";
import { MARKETPLACE_PRODUCTS_FAMILY } from "./marketplace_products/index.ts";
import { MARKETPLACE_SERVICES_RENTALS_FAMILY } from "./marketplace_services_rentals/index.ts";
import { CREATIVITY_FAMILY } from "./creativity/index.ts";
import { COMMUNITIES_SPIRITUALITY_FAMILY } from "./communities_spirituality/index.ts";
import { FREELANCE_CONSUMER_FAMILY } from "./freelance_consumer/index.ts";
import { LUXURY_AND_COLLECTING_FAMILY } from "./luxury_and_collecting/index.ts";
import { PREGNANCY_EARLY_CHILDHOOD_FAMILY } from "./pregnancy_early_childhood/index.ts";
import { MENTAL_HEALTH_RECOVERY_FAMILY } from "./mental_health_recovery/index.ts";
import { SOCIAL_CULTURE_FAMILY } from "./social_culture/index.ts";
import { IDENTITY_BODY_RELIGIOUS_FINE_FAMILY } from "./identity_body_religious_fine/index.ts";
import { REPRODUCTIVE_INTIMATE_FAMILY } from "./reproductive_intimate/index.ts";
import { PERSONAL_CARE_AESTHETICS_FAMILY } from "./personal_care_aesthetics/index.ts";

export const BUILTIN_FAMILIES: BuiltinFamilyDefinition[] = [
  COOKING_FAMILY,
  IDENTITY_FAMILY,
  WORK_FAMILY,
  COLLABORATION_FAMILY,
  CUSTOMER_INTAKE_FAMILY,
  FLOW_FAMILY,
  AUDIT_FAMILY,
  INTEGRATIONS_FAMILY,
  BILLING_FAMILY,
  CRM_FAMILY,
  SUPPORT_FAMILY,
  ANALYTICS_FAMILY,
  OBSERVABILITY_FAMILY,
  INFRA_FAMILY,
  MARKETING_FAMILY,
  AGENTS_FAMILY,
  HR_FAMILY,
  CALENDAR_FAMILY,
  COMMERCE_FAMILY,
  FITNESS_FAMILY,
  HEALTH_FAMILY,
  HABITS_JOURNALING_FAMILY,
  FINANCE_FAMILY,
  POSSESSIONS_FAMILY,
  WARDROBE_FAMILY,
  VEHICLES_FAMILY,
  HOBBIES_FAMILY,
  READING_MEDIA_FAMILY,
  LEARNING_FAMILY,
  BOOKMARKS_MISC_FAMILY,
  EDUCATION_SCHOOL_FAMILY,
  CAREER_FAMILY,
  TRAVEL_FAMILY,
  RELATIONSHIPS_FAMILY,
  FAMILY_CARE_FAMILY,
  ROMANCE_FAMILY,
  PETS_FAMILY,
  GARDEN_FAMILY,
  EVENTS_MEMORIES_FAMILY,
  PERSONAL_DOCUMENTS_FAMILY,
  MARKETPLACE_REAL_ESTATE_FAMILY,
  MARKETPLACE_VEHICLES_FAMILY,
  MARKETPLACE_PRODUCTS_FAMILY,
  MARKETPLACE_SERVICES_RENTALS_FAMILY,
  CREATIVITY_FAMILY,
  COMMUNITIES_SPIRITUALITY_FAMILY,
  FREELANCE_CONSUMER_FAMILY,
  LUXURY_AND_COLLECTING_FAMILY,
  PREGNANCY_EARLY_CHILDHOOD_FAMILY,
  MENTAL_HEALTH_RECOVERY_FAMILY,
  SOCIAL_CULTURE_FAMILY,
  IDENTITY_BODY_RELIGIOUS_FINE_FAMILY,
  REPRODUCTIVE_INTIMATE_FAMILY,
  PERSONAL_CARE_AESTHETICS_FAMILY,
];

export const BUILTIN_COLLECTIONS: BuiltinCollectionDefinition[] = BUILTIN_FAMILIES.flatMap(
  (family) => family.collections,
);

const COLLECTIONS_BY_NAME = new Map<string, BuiltinCollectionDefinition>();
const ALIAS_TO_NAME = new Map<string, string>();
const NAME_TO_FAMILY = new Map<string, string>();

for (const family of BUILTIN_FAMILIES) {
  for (const collection of family.collections) {
    if (COLLECTIONS_BY_NAME.has(collection.name)) {
      throw new Error(`Duplicate built-in collection name: ${collection.name}`);
    }
    COLLECTIONS_BY_NAME.set(collection.name, collection);
    NAME_TO_FAMILY.set(collection.name, family.name);
    for (const alias of collection.aliases) {
      const normalized = alias.toLowerCase();
      const previous = ALIAS_TO_NAME.get(normalized);
      if (previous && previous !== collection.name) {
        // First-registered wins; later registrations of the same alias are
        // silently skipped so that B2C aliases declared earlier (e.g.
        // "recipes") aren't shadowed by B2B duplicates with the same word.
        continue;
      }
      ALIAS_TO_NAME.set(normalized, collection.name);
    }
  }
}

export const BUILTIN_COLLECTIONS_BY_NAME: ReadonlyMap<string, BuiltinCollectionDefinition> =
  COLLECTIONS_BY_NAME;

export const BUILTIN_COLLECTIONS_BY_ALIAS: ReadonlyMap<string, string> = ALIAS_TO_NAME;

export const BUILTIN_FAMILY_BY_COLLECTION: ReadonlyMap<string, string> = NAME_TO_FAMILY;

export function resolveBuiltinCollectionName(input: string): string | undefined {
  return ALIAS_TO_NAME.get(input.trim().toLowerCase());
}

export function getBuiltinCollection(name: string): BuiltinCollectionDefinition | undefined {
  return COLLECTIONS_BY_NAME.get(name);
}

export function listBuiltinCollections(options?: {
  family?: string;
}): BuiltinCollectionDefinition[] {
  if (!options?.family) return [...BUILTIN_COLLECTIONS];
  const family = BUILTIN_FAMILIES.find((entry) => entry.name === options.family);
  return family ? [...family.collections] : [];
}

export function listBuiltinFamilies(): BuiltinFamilyDefinition[] {
  return [...BUILTIN_FAMILIES];
}
