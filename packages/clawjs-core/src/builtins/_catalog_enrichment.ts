import type {
  BuiltinCollectionCatalogMetadata,
  BuiltinCollectionDefinition,
  BuiltinFamilyDefinition,
  BuiltinFieldDefinition,
  BuiltinRelationKind,
  BuiltinRequiredFieldReason,
} from "./_types.ts";

const IDENTITY_FIELD_PATTERN = /(^|[A-Z])(name|title|code|number|identifier|email|symbol|slug|fingerprint|key|year)$/;
const LIFECYCLE_FIELD_PATTERN = /(^|[A-Z])(status|state|stage|kind|type|phase|startedAt|endedAt|createdAt|updatedAt|archivedAt|issuedAt|paidAt|postedAt|takenAt|collectedAt|reportedAt|expiresAt)$/;
const INTEGRITY_FIELD_PATTERN = /(^|[A-Z])(amount|amountCents|currency|quantity|count|score|value|duration|total|subtotal|balance|rate|percent|year)$/;

const ATTACHMENT_PATTERN = /(attachment|file|document|asset|image|photo|video|audio|memo|receipt|manual|page)/;
const DEPENDENCY_PATTERN = /(parent|previous|next|depends|dependency|block|source|target|issue|pullRequest|commit|branch|repository|release|deployment|version|component|redirect|relation)/;
const FINANCIAL_PATTERN = /(invoice|payment|charge|refund|payout|transaction|account|price|pricing|coupon|discount|subscription|bill|budget|loan|debt|holding|wallet|currency|tax|expense|income|cost|balance)/;
const LINE_ITEM_PATTERN = /(lineItem|line_items|line_item|itemId|priceId|productVariantId|productCatalogId|recipeIngredient|subscriptionItem)/;
const LOCATION_PATTERN = /(location|address|place|property|room|route|trip|flight|transport|country|city|clinic|accommodation|vehicle|garden|plot)/;
const MEMBERSHIP_PATTERN = /(member|membership|role|team|group|cohort|segment|household|family|community|class|club|list|collection|department)/;
const OBSERVATION_PATTERN = /(sample|measurement|log|result|rating|response|symptom|mood|habit|sleep|step|weight|heart|labResult|lab_results|labValue|lab_value|dose|diagnosis|condition|episode|visit|observation|survey|evaluation|metric)/;
const PARTICIPANT_PATTERN = /(actor|user|person|customer|contact|employee|contractor|candidate|assignee|author|reviewer|approver|doctor|therapist|teacher|caregiver|client|provider|owner|recipient|subscriber|lead|partner)/;
const SOURCE_IMPORT_PATTERN = /(external|provider|sync|source|import|webhook|integration|intake|recording|replay|session|thread|message|formSubmission|delivery)/;
const TEMPORAL_PATTERN = /(event|session|appointment|meeting|booking|slot|window|schedule|calendar|deadline|reminder|race|visit|trip|itinerary|run|period|routine)/;

function words(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

function compact(value: string): string {
  return value.replace(/_/g, "").toLowerCase();
}

function relationKindFor(field: BuiltinFieldDefinition): BuiltinRelationKind {
  const relationTarget = field.relation?.collectionName ?? "";
  const haystack = `${field.name} ${relationTarget} ${compact(field.name)} ${compact(relationTarget)}`;

  if (LINE_ITEM_PATTERN.test(haystack)) return "line_item";
  if (ATTACHMENT_PATTERN.test(haystack)) return "attachment";
  if (FINANCIAL_PATTERN.test(haystack)) return "financial_transaction";
  if (OBSERVATION_PATTERN.test(haystack)) return "observation_sample";
  if (TEMPORAL_PATTERN.test(haystack)) return "temporal_event";
  if (LOCATION_PATTERN.test(haystack)) return "location";
  if (SOURCE_IMPORT_PATTERN.test(haystack)) return "source_import";
  if (MEMBERSHIP_PATTERN.test(haystack)) return "membership";
  if (PARTICIPANT_PATTERN.test(haystack)) return "participant";
  if (DEPENDENCY_PATTERN.test(haystack)) return "dependency";
  if (/company|organization|workspace|project|folder|parent/.test(haystack)) return "ownership";

  return "ownership";
}

function requiredReasonFor(field: BuiltinFieldDefinition): BuiltinRequiredFieldReason | undefined {
  if (!field.required) return field.requiredReason;
  if (field.requiredReason) return field.requiredReason;
  if (field.type === "relation") return "relation_integrity";
  if (IDENTITY_FIELD_PATTERN.test(field.name)) return "identity";
  if (LIFECYCLE_FIELD_PATTERN.test(field.name)) return "lifecycle";
  if (INTEGRITY_FIELD_PATTERN.test(field.name)) return "integrity";
  return "integrity";
}

function catalogMetadataFor(
  collection: BuiltinCollectionDefinition,
  family: BuiltinFamilyDefinition,
): BuiltinCollectionCatalogMetadata {
  if (collection.catalog) return collection.catalog;

  return {
    purpose: `Stores ${words(collection.displayName)} records for ${words(family.displayName)} workflows.`,
    evidence: ["human_recognizable", "market_validated"],
    fieldGuidance: "Keep domain-specific fields optional unless identity, integrity, lifecycle, or relation integrity requires them.",
    relationGuidance: "Prefer semantic relation fields over copied external ids or unstructured references.",
  };
}

function enrichField(field: BuiltinFieldDefinition): BuiltinFieldDefinition {
  const relation = field.relation
    ? {
        ...field.relation,
        kind: field.relation.kind ?? relationKindFor(field),
      }
    : undefined;

  return {
    ...field,
    requiredReason: requiredReasonFor(field),
    ...(relation ? { relation } : {}),
  };
}

function enrichCollection(
  collection: BuiltinCollectionDefinition,
  family: BuiltinFamilyDefinition,
): BuiltinCollectionDefinition {
  return {
    ...collection,
    catalog: catalogMetadataFor(collection, family),
    fields: collection.fields.map(enrichField),
  };
}

export function enrichBuiltinFamilies(families: BuiltinFamilyDefinition[]): BuiltinFamilyDefinition[] {
  return families.map((family) => ({
    ...family,
    collections: family.collections.map((collection) => enrichCollection(collection, family)),
  }));
}
