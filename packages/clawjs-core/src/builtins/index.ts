export type {
  BuiltinCollectionDefinition,
  BuiltinFamilyDefinition,
  BuiltinFieldDefinition,
  BuiltinIndexDefinition,
  BuiltinRelationDefinition,
} from "./_types.ts";

export {
  BUILTIN_COLLECTIONS,
  BUILTIN_COLLECTIONS_BY_ALIAS,
  BUILTIN_COLLECTIONS_BY_NAME,
  BUILTIN_FAMILIES,
  BUILTIN_FAMILY_BY_COLLECTION,
  getBuiltinCollection,
  listBuiltinCollections,
  listBuiltinFamilies,
  resolveBuiltinCollectionName,
} from "./_registry.ts";

export { COOKING_FAMILY, RECIPES } from "./cooking/index.ts";
export { IDENTITY_FAMILY } from "./identity/index.ts";
export { WORK_FAMILY } from "./work/index.ts";
export { COLLABORATION_FAMILY } from "./collaboration/index.ts";
export { CUSTOMER_INTAKE_FAMILY } from "./customer_intake/index.ts";
export { FLOW_FAMILY } from "./flow/index.ts";
export { AUDIT_FAMILY } from "./audit/index.ts";
export { INTEGRATIONS_FAMILY } from "./integrations/index.ts";
export { BILLING_FAMILY } from "./billing/index.ts";
export { CRM_FAMILY } from "./crm/index.ts";
export { SUPPORT_FAMILY } from "./support/index.ts";
export { ANALYTICS_FAMILY } from "./analytics/index.ts";
export { OBSERVABILITY_FAMILY } from "./observability/index.ts";
export { INFRA_FAMILY } from "./infra/index.ts";
export { MARKETING_FAMILY } from "./marketing/index.ts";
export { AGENTS_FAMILY } from "./agents/index.ts";
export { HR_FAMILY } from "./hr/index.ts";
export { CALENDAR_FAMILY } from "./calendar/index.ts";
export { COMMERCE_FAMILY } from "./commerce/index.ts";
