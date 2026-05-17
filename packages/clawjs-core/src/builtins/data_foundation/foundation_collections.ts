import type { BuiltinCollectionDefinition } from "../_types.ts";

export const DOMAIN_SYSTEMS: BuiltinCollectionDefinition = {
  name: "domain_systems",
  displayName: "Domain Systems",
  family: "data_foundation",
  aliases: ["domain_system", "domain_systems"],
  catalog: {
    purpose: "Stores visible dense-data systems such as EHR, CTMS, LIMS, ERP, CRM, MES, LMS, ITSM, and future packs as auditable records.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use domain systems as the catalog anchor; packs, intents, views, operations, and quality gaps should reference this key instead of inventing another system registry.",
  },
  fields: [
    { name: "key", type: "text", required: true, requiredReason: "identity" },
    { name: "label", type: "text", required: true, requiredReason: "identity" },
    { name: "wave", type: "select", required: true, requiredReason: "lifecycle", options: ["foundation", "first_wave", "roadmap", "custom"] },
    { name: "canonicalCommand", type: "text" },
    { name: "aliases", type: "json" },
    { name: "sensitivityDefault", type: "select", options: ["normal", "high"] },
    { name: "storagePolicy", type: "select", options: ["core_sqlite", "sidecar_exception_only"] },
    { name: "standards", type: "json" },
    { name: "status", type: "select", options: ["active", "draft", "retired"] },
    { name: "source", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "domain_systems_key_unique", fields: ["key"], unique: true },
    { name: "domain_systems_wave_idx", fields: ["wave"] },
  ],
};

export const DOMAIN_PACKS: BuiltinCollectionDefinition = {
  name: "domain_packs",
  displayName: "Domain Packs",
  family: "data_foundation",
  aliases: ["domain_pack", "domain_packs"],
  fields: [
    { name: "systemKey", type: "text", required: true },
    { name: "key", type: "text", required: true },
    { name: "label", type: "text", required: true },
    { name: "description", type: "text" },
    { name: "collectionNames", type: "json" },
    { name: "commandPatterns", type: "json" },
    { name: "fixtures", type: "json" },
    { name: "status", type: "select", options: ["active", "draft", "roadmap", "retired"] },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "domain_packs_system_idx", fields: ["systemKey"] },
    { name: "domain_packs_key_unique", fields: ["systemKey", "key"], unique: true },
  ],
};

export const DOMAIN_ROLES: BuiltinCollectionDefinition = {
  name: "domain_roles",
  displayName: "Domain Roles",
  family: "data_foundation",
  aliases: ["domain_role", "domain_roles"],
  catalog: {
    purpose: "Stores domain role labels such as patient, participant, legal client, employee, vendor, learner, or service owner without duplicating identity.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use domain profiles for concrete role assignment on a person, organization, agent, asset, or other entity.",
  },
  fields: [
    { name: "key", type: "text", required: true, requiredReason: "identity" },
    { name: "label", type: "text", required: true, requiredReason: "identity" },
    { name: "domainSystemKey", type: "text" },
    { name: "description", type: "text" },
    { name: "permissions", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "domain_roles_key_unique", fields: ["key"], unique: true },
    { name: "domain_roles_system_idx", fields: ["domainSystemKey"] },
  ],
};

export const DOMAIN_PROFILES: BuiltinCollectionDefinition = {
  name: "domain_profiles",
  displayName: "Domain Profiles",
  family: "data_foundation",
  aliases: ["domain_profile", "domain_profiles", "typed_profile", "typed_profiles"],
  catalog: {
    purpose: "Stores typed role/profile records that attach domain-specific meaning to shared identities or other entities without copying the base identity.",
    evidence: ["human_recognizable", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use entityKind/entityId for the shared identity or object, and domainRoleKey/profileKind for the specialized role.",
  },
  fields: [
    { name: "entityKind", type: "text", required: true, requiredReason: "relation_integrity" },
    { name: "entityId", type: "text", required: true, requiredReason: "relation_integrity" },
    { name: "domainSystemKey", type: "text" },
    { name: "domainRoleKey", type: "text" },
    { name: "profileKind", type: "text", required: true, requiredReason: "identity" },
    { name: "status", type: "select", options: ["active", "inactive", "candidate", "archived"] },
    { name: "fields", type: "json" },
    { name: "evidenceSourceIds", type: "json" },
    { name: "qualityGapIds", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "domain_profiles_entity_idx", fields: ["entityKind", "entityId"] },
    { name: "domain_profiles_kind_idx", fields: ["profileKind"] },
  ],
};

export const EVIDENCE_SOURCES: BuiltinCollectionDefinition = {
  name: "evidence_sources",
  displayName: "Evidence Sources",
  family: "data_foundation",
  aliases: ["evidence_source", "evidence_sources", "evidence"],
  catalog: {
    purpose: "Stores source material that supports structured records: documents, notes, files, imports, messages, forms, manual observations, and external references.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Raw files remain in file/document storage; this collection records the structured evidence handle and provenance metadata.",
  },
  fields: [
    { name: "label", type: "text", required: true, requiredReason: "identity" },
    { name: "kind", type: "select", required: true, requiredReason: "lifecycle", options: ["document", "file", "note", "import", "external_system", "manual_observation", "form", "message", "other"] },
    { name: "uri", type: "url" },
    { name: "collectionName", type: "text" },
    { name: "recordId", type: "text" },
    { name: "sourceSystem", type: "text" },
    { name: "capturedAt", type: "date" },
    { name: "summary", type: "text" },
    { name: "rawReference", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "evidence_sources_kind_idx", fields: ["kind"] },
    { name: "evidence_sources_record_idx", fields: ["collectionName", "recordId"] },
  ],
};

export const PROVENANCE_EVENTS: BuiltinCollectionDefinition = {
  name: "provenance_events",
  displayName: "Provenance Events",
  family: "data_foundation",
  aliases: ["provenance_event", "provenance_events", "provenance"],
  fields: [
    { name: "eventType", type: "text", required: true },
    { name: "targetCollection", type: "text", required: true },
    { name: "targetId", type: "text", required: true },
    { name: "actorId", type: "relation", relation: { collectionName: "actors", kind: "participant" } },
    { name: "evidenceSourceId", type: "relation", relation: { collectionName: "evidence_sources", kind: "source_import" } },
    { name: "occurredAt", type: "date" },
    { name: "summary", type: "text" },
    { name: "diff", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "provenance_events_target_idx", fields: ["targetCollection", "targetId"] },
    { name: "provenance_events_type_idx", fields: ["eventType"] },
  ],
};

export const QUALITY_GAPS: BuiltinCollectionDefinition = {
  name: "quality_gaps",
  displayName: "Quality Gaps",
  family: "data_foundation",
  aliases: ["quality_gap", "quality_gaps", "data_gap", "data_gaps"],
  catalog: {
    purpose: "Stores explicit incompleteness, uncertainty, conflict, blocked workflow, external pending, and normalization gaps so partial data is useful without pretending to be complete.",
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse", "agent_useful"],
    relationGuidance: "Use targetCollection/targetId for the affected record and evidenceSourceId when the gap comes from a concrete source.",
  },
  fields: [
    { name: "label", type: "text", required: true, requiredReason: "identity" },
    { name: "targetCollection", type: "text", required: true, requiredReason: "relation_integrity" },
    { name: "targetId", type: "text", required: true, requiredReason: "relation_integrity" },
    { name: "gapKind", type: "select", required: true, requiredReason: "lifecycle", options: ["missing", "uncertain", "conflicting", "unverified", "external_pending", "blocked", "normalization_needed"] },
    { name: "severity", type: "select", options: ["low", "medium", "high", "critical"] },
    { name: "status", type: "select", options: ["open", "accepted", "resolved", "archived"] },
    { name: "detail", type: "text" },
    { name: "nextStep", type: "text" },
    { name: "evidenceSourceId", type: "relation", relation: { collectionName: "evidence_sources", kind: "source_import" } },
    { name: "resolvedAt", type: "date" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "quality_gaps_target_idx", fields: ["targetCollection", "targetId"] },
    { name: "quality_gaps_kind_idx", fields: ["gapKind"] },
    { name: "quality_gaps_status_idx", fields: ["status"] },
  ],
};

export const CANONICAL_OPERATIONS: BuiltinCollectionDefinition = {
  name: "canonical_operations",
  displayName: "Canonical Operations",
  family: "data_foundation",
  aliases: ["canonical_operation", "canonical_operations"],
  fields: [
    { name: "key", type: "text", required: true },
    { name: "domainSystemKey", type: "text" },
    { name: "label", type: "text", required: true },
    { name: "routes", type: "json" },
    { name: "createsOrReads", type: "json" },
    { name: "sensitivity", type: "select", options: ["normal", "high"] },
    { name: "status", type: "select", options: ["covered", "partial", "workflow_gap", "external_pending", "blocked"] },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "canonical_operations_key_unique", fields: ["key"], unique: true },
    { name: "canonical_operations_system_idx", fields: ["domainSystemKey"] },
  ],
};

export const SEMANTIC_VIEWS: BuiltinCollectionDefinition = {
  name: "semantic_views",
  displayName: "Semantic Views",
  family: "data_foundation",
  aliases: ["semantic_view", "semantic_views"],
  fields: [
    { name: "key", type: "text", required: true },
    { name: "domainSystemKey", type: "text" },
    { name: "label", type: "text", required: true },
    { name: "commandPattern", type: "text" },
    { name: "operationKey", type: "text" },
    { name: "requiredInputs", type: "json" },
    { name: "outputShape", type: "text" },
    { name: "collectionNames", type: "json" },
    { name: "status", type: "select", options: ["active", "draft", "retired"] },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "semantic_views_key_unique", fields: ["key"], unique: true },
    { name: "semantic_views_system_idx", fields: ["domainSystemKey"] },
  ],
};

export const DOMAIN_INTENTS: BuiltinCollectionDefinition = {
  name: "domain_intents",
  displayName: "Domain Intents",
  family: "data_foundation",
  aliases: ["domain_intent", "domain_intents", "intent_coverage"],
  fields: [
    { name: "key", type: "text", required: true },
    { name: "domainSystemKey", type: "text" },
    { name: "phrase", type: "text", required: true },
    { name: "status", type: "select", required: true, options: ["covered", "partial", "alias_candidate", "data_gap", "workflow_gap", "external_pending", "blocked", "custom_pack"] },
    { name: "mappedCommand", type: "text" },
    { name: "operationKey", type: "text" },
    { name: "collectionName", type: "text" },
    { name: "reasons", type: "json" },
    { name: "nextSteps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "domain_intents_key_unique", fields: ["key"], unique: true },
    { name: "domain_intents_status_idx", fields: ["status"] },
    { name: "domain_intents_system_idx", fields: ["domainSystemKey"] },
  ],
};

export const VOCABULARIES: BuiltinCollectionDefinition = {
  name: "vocabularies",
  displayName: "Vocabularies",
  family: "data_foundation",
  aliases: ["vocabulary", "vocabularies"],
  fields: [
    { name: "key", type: "text", required: true },
    { name: "label", type: "text", required: true },
    { name: "authority", type: "text" },
    { name: "version", type: "text" },
    { name: "uri", type: "url" },
    { name: "status", type: "select", options: ["active", "deprecated", "external_pending"] },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "vocabularies_key_unique", fields: ["key"], unique: true },
    { name: "vocabularies_authority_idx", fields: ["authority"] },
  ],
};

export const CONCEPTS: BuiltinCollectionDefinition = {
  name: "concepts",
  displayName: "Concepts",
  family: "data_foundation",
  aliases: ["concept", "concepts"],
  fields: [
    { name: "vocabularyId", type: "relation", relation: { collectionName: "vocabularies", kind: "membership" } },
    { name: "code", type: "text", required: true },
    { name: "label", type: "text", required: true },
    { name: "definition", type: "text" },
    { name: "synonyms", type: "json" },
    { name: "status", type: "select", options: ["active", "deprecated", "external_pending"] },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "concepts_code_idx", fields: ["vocabularyId", "code"] },
    { name: "concepts_label_idx", fields: ["label"] },
  ],
};

export const CONCEPT_MAPPINGS: BuiltinCollectionDefinition = {
  name: "concept_mappings",
  displayName: "Concept Mappings",
  family: "data_foundation",
  aliases: ["concept_mapping", "concept_mappings"],
  fields: [
    { name: "fromConceptId", type: "relation", required: true, relation: { collectionName: "concepts", kind: "source_import" } },
    { name: "toConceptId", type: "relation", required: true, relation: { collectionName: "concepts", kind: "dependency" } },
    { name: "mappingKind", type: "select", required: true, options: ["exact", "broad", "narrow", "related", "custom"] },
    { name: "confidence", type: "number", min: 0, max: 1 },
    { name: "evidenceSourceId", type: "relation", relation: { collectionName: "evidence_sources", kind: "source_import" } },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "concept_mappings_from_idx", fields: ["fromConceptId"] },
    { name: "concept_mappings_to_idx", fields: ["toConceptId"] },
  ],
};

export const UNITS: BuiltinCollectionDefinition = {
  name: "units",
  displayName: "Units",
  family: "data_foundation",
  aliases: ["unit", "units"],
  fields: [
    { name: "code", type: "text", required: true },
    { name: "label", type: "text", required: true },
    { name: "system", type: "select", options: ["UCUM", "SI", "ISO4217", "custom"] },
    { name: "dimension", type: "text" },
    { name: "symbol", type: "text" },
    { name: "canonicalUnitId", type: "relation", relation: { collectionName: "units", kind: "dependency" } },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "units_code_unique", fields: ["code"], unique: true },
    { name: "units_dimension_idx", fields: ["dimension"] },
  ],
};

export const INSTRUMENTS: BuiltinCollectionDefinition = {
  name: "instruments",
  displayName: "Instruments",
  family: "data_foundation",
  aliases: ["instrument", "instruments"],
  fields: [
    { name: "key", type: "text", required: true },
    { name: "label", type: "text", required: true },
    { name: "domainSystemKey", type: "text" },
    { name: "version", type: "text" },
    { name: "kind", type: "select", options: ["form", "survey", "assessment", "lab_panel", "protocol", "checklist", "other"] },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "instruments_key_unique", fields: ["key"], unique: true },
    { name: "instruments_system_idx", fields: ["domainSystemKey"] },
  ],
};

export const INSTRUMENT_ITEMS: BuiltinCollectionDefinition = {
  name: "instrument_items",
  displayName: "Instrument Items",
  family: "data_foundation",
  aliases: ["instrument_item", "instrument_items"],
  fields: [
    { name: "instrumentId", type: "relation", required: true, relation: { collectionName: "instruments", kind: "membership" } },
    { name: "key", type: "text", required: true },
    { name: "label", type: "text", required: true },
    { name: "itemType", type: "select", required: true, options: ["text", "number", "boolean", "date", "select", "multi_select", "scale", "file"] },
    { name: "options", type: "json" },
    { name: "unitId", type: "relation", relation: { collectionName: "units", kind: "observation_sample" } },
    { name: "sortOrder", type: "number" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "instrument_items_instrument_idx", fields: ["instrumentId"] },
    { name: "instrument_items_key_unique", fields: ["instrumentId", "key"], unique: true },
  ],
};

export const INSTRUMENT_RESPONSES: BuiltinCollectionDefinition = {
  name: "instrument_responses",
  displayName: "Instrument Responses",
  family: "data_foundation",
  aliases: ["instrument_response", "instrument_responses"],
  fields: [
    { name: "instrumentId", type: "relation", relation: { collectionName: "instruments", kind: "membership" } },
    { name: "instrumentItemId", type: "relation", relation: { collectionName: "instrument_items", kind: "membership" } },
    { name: "targetCollection", type: "text", required: true },
    { name: "targetId", type: "text", required: true },
    { name: "respondentEntityKind", type: "text" },
    { name: "respondentEntityId", type: "text" },
    { name: "value", type: "json", required: true },
    { name: "unitId", type: "relation", relation: { collectionName: "units", kind: "observation_sample" } },
    { name: "evidenceSourceId", type: "relation", relation: { collectionName: "evidence_sources", kind: "source_import" } },
    { name: "recordedAt", type: "date" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "instrument_responses_target_idx", fields: ["targetCollection", "targetId"] },
    { name: "instrument_responses_item_idx", fields: ["instrumentItemId"] },
  ],
};
