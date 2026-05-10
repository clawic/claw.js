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
