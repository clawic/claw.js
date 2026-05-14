import type {
  BuiltinCatalogEvidenceTag,
  BuiltinRelationKind,
} from "./builtins/_types.ts";

export type CatalogCoverageStatus =
  | "candidate_mapping"
  | "canonical"
  | "custom_database"
  | "gap";

export interface CatalogCoverageRelationNeed {
  name: string;
  kind: BuiltinRelationKind;
  from: string;
  to: string;
}

export interface CatalogCoverageMapping {
  status: CatalogCoverageStatus;
  collectionNames: string[];
  fieldNames?: string[];
  relationNames?: string[];
  notes: string;
}

export interface CatalogCoverageNeed {
  id: string;
  wave: string;
  domain: string;
  archetype: string;
  scenario: string;
  humanValue: string;
  requiredEntities: string[];
  requiredFields: string[];
  requiredRelationships: CatalogCoverageRelationNeed[];
  evidence: BuiltinCatalogEvidenceTag[];
  coverage: CatalogCoverageMapping;
}

interface CoverageWaveSeed {
  id: string;
  domain: string;
  archetypes: string[];
  collectionNames: string[];
  entities: string[];
  evidence: BuiltinCatalogEvidenceTag[];
}

interface CoverageScenarioSeed {
  id: string;
  label: string;
  humanValue: string;
  fields: string[];
  coverageFields?: string[];
  relationKind: BuiltinRelationKind;
  fromEntity: string;
  toEntity: string;
  collectionNames: string[];
  coverageStatus?: CatalogCoverageStatus;
  notes?: string;
}

export const CATALOG_COVERAGE_SCENARIOS: CoverageScenarioSeed[] = [
  { id: "core_record", label: "core record lifecycle", humanValue: "create, update, archive, restore, and export durable records", fields: ["name", "status", "createdAt", "updatedAt", "archivedAt"], coverageFields: ["title", "status", "archivedAt", "source", "metadata"], relationKind: "ownership", fromEntity: "workspace", toEntity: "record", collectionNames: ["documents", "projects", "tasks"] },
  { id: "participant_access", label: "participants and access", humanValue: "track who participates, owns, approves, or can act", fields: ["actorId", "role", "permission", "joinedAt", "leftAt"], coverageFields: ["actorId", "role", "joinedAt", "expiresAt", "displayName"], relationKind: "participant", fromEntity: "actor", toEntity: "activity", collectionNames: ["actors", "role_assignments", "team_memberships", "documents"] },
  { id: "membership_grouping", label: "membership and grouping", humanValue: "organize entities into teams, cohorts, lists, groups, or households", fields: ["groupName", "memberRole", "startsAt", "endsAt", "isPrimary"], coverageFields: ["teamId", "actorId", "role", "joinedAt", "leftAt"], relationKind: "membership", fromEntity: "member", toEntity: "group", collectionNames: ["team_memberships", "cohort_memberships", "grocery_items", "communities_membership", "household_members"] },
  { id: "line_item_breakdown", label: "line item breakdown", humanValue: "represent totals as explainable child rows with quantities and amounts", fields: ["quantity", "unitPrice", "subtotal", "taxAmount", "discountAmount"], coverageFields: ["quantity", "amountCents", "unitAmountCents", "discountCents", "description"], relationKind: "line_item", fromEntity: "lineItem", toEntity: "parentRecord", collectionNames: ["invoice_line_items", "order_line_items", "deal_line_items", "quote_line_items", "recipe_ingredients"] },
  { id: "source_import_sync", label: "source and import provenance", humanValue: "preserve where records came from and how they map to external sources", fields: ["sourceKind", "externalId", "importedAt", "syncedAt", "syncStatus"], coverageFields: ["externalId", "externalSource", "lastSyncedAt", "syncDirection", "sourceMetadata"], relationKind: "source_import", fromEntity: "sourceRecord", toEntity: "canonicalRecord", collectionNames: ["actors", "synced_external_entities", "webhook_deliveries", "external_threads"] },
  { id: "attachment_documents", label: "attachments and documents", humanValue: "attach files, images, certificates, receipts, notes, and supporting media", fields: ["filename", "contentType", "sizeBytes", "uploadedAt", "caption"], coverageFields: ["name", "mimeType", "sizeBytes", "uri", "file"], relationKind: "attachment", fromEntity: "asset", toEntity: "record", collectionNames: ["documents", "attachments", "medical_documents", "financial_documents", "travel_documents"] },
  { id: "place_availability", label: "place and availability", humanValue: "connect records to places, addresses, rooms, routes, and available slots", fields: ["address", "geoPoint", "timezone", "availableFrom", "availableUntil"], coverageFields: ["address", "city", "country", "startsAt", "endsAt"], relationKind: "location", fromEntity: "record", toEntity: "place", collectionNames: ["document_properties", "places_visited", "property_listings", "availability_slots", "booking_slots", "running_routes"] },
  { id: "scheduled_event", label: "scheduled event", humanValue: "represent bookings, appointments, deadlines, visits, and recurrences", fields: ["startsAt", "endsAt", "dueAt", "recurrenceRule", "timezone"], coverageFields: ["startsAt", "endsAt", "dueAt", "recurrenceRule", "status"], relationKind: "temporal_event", fromEntity: "event", toEntity: "subject", collectionNames: ["replays", "bookings", "medical_appointments", "meetings", "events", "availability_slots", "tasks"] },
  { id: "money_movement", label: "money movement", humanValue: "track monetary amounts, balances, payouts, refunds, fees, and settlement", fields: ["amount", "currency", "feeAmount", "settledAt", "balanceAfter"], coverageFields: ["amountCents", "currency", "status", "paid", "balanceCents"], relationKind: "financial_transaction", fromEntity: "transaction", toEntity: "account", collectionNames: ["billing_customers", "transactions", "charges", "refunds", "payouts", "invoices"] },
  { id: "observation_sample", label: "observation sample", humanValue: "record measurements, mood, progress, sensor values, and status samples", fields: ["observedAt", "value", "unit", "severity", "confidence"], coverageFields: ["loggedAt", "severity", "values", "bpm", "submittedAt"], relationKind: "observation_sample", fromEntity: "observation", toEntity: "subject", collectionNames: ["survey_responses", "symptom_logs", "mood_logs", "lab_results", "heart_rate_samples", "body_measurements"] },
  { id: "dependency_trace", label: "dependency and traceability", humanValue: "show blockers, prerequisites, derivations, audits, and downstream impact", fields: ["dependencyKind", "blockedReason", "resolvedAt", "auditNote", "impact"], coverageFields: ["type", "description", "resolvedAt", "status", "dependencyTaskIds"], relationKind: "dependency", fromEntity: "dependentRecord", toEntity: "dependencyRecord", collectionNames: ["labels", "entity_relations", "blockers", "issue_sla_state", "pull_request_issues"] },
  { id: "custom_extension_boundary", label: "custom extension boundary", humanValue: "keep niche fields portable without forcing every private detail into the core catalog", fields: ["customFieldKey", "customFieldValue", "schemaVersion", "visibility", "notesBody"], coverageFields: ["name", "fieldType", "value", "entityType", "metadata"], relationKind: "generic", fromEntity: "customRecord", toEntity: "canonicalRecord", collectionNames: ["custom_fields", "field_values", "templates", "activity_entries"], coverageStatus: "custom_database", notes: "Custom database boundary: canonical records stay portable while niche fields live in custom_fields and field_values." },
];

export const CATALOG_COVERAGE_WAVES: CoverageWaveSeed[] = [
  { id: "commerce_billing", domain: "commerce, billing, payments, subscriptions, taxes, payouts, fraud, invoices, procurement", archetypes: ["payments platform", "subscription billing workspace", "invoice operations desk", "tax collection workflow", "refund and dispute center", "procurement approval tool", "usage-based pricing system"], collectionNames: ["billing_customers", "subscriptions", "invoices", "invoice_line_items", "payment_intents", "charges", "refunds", "payment_methods", "payouts", "disputes", "products_catalog", "prices", "orders", "order_line_items"], entities: ["customer", "account", "invoice", "payment", "subscription", "product", "price", "order", "tax", "payout", "refund"], evidence: ["market_validated", "multi_domain_reuse", "agent_useful"] },
  { id: "learning_progress", domain: "learning, spaced repetition, courses, credentials, tutoring, assessment, knowledge progress", archetypes: ["spaced-repetition learning app", "course platform", "credential tracker", "tutoring scheduler", "assessment workspace", "language learning journal", "knowledge progress dashboard"], collectionNames: ["courses", "lessons", "study_sessions", "flashcards", "flashcard_decks", "flashcard_reviews", "vocabulary_items", "languages_learning", "skills", "skill_progress_logs", "certifications_personal", "exams"], entities: ["learner", "course", "lesson", "card", "review", "assessment", "credential", "tutor", "skill", "language"], evidence: ["human_recognizable", "market_validated", "agent_useful"] },
  { id: "sports_booking", domain: "sports, reservations, venues, memberships, coaching, leagues, classes, availability", archetypes: ["sports booking app", "venue scheduling desk", "club membership manager", "coaching session planner", "league organizer", "class booking system", "availability marketplace"], collectionNames: ["bookings", "availability_slots", "booking_slots", "booking_meeting_types", "routine_workouts", "races_registered", "race_results", "gym_sessions", "personal_records", "places_visited", "communities_membership"], entities: ["player", "coach", "venue", "court", "booking", "class", "league", "membership", "availability", "result"], evidence: ["human_recognizable", "market_validated", "multi_domain_reuse"] },
  { id: "health_care", domain: "health, fitness, mental health, care, medication, symptoms, labs, reproductive and family care", archetypes: ["medical tracker", "medication manager", "symptom diary", "lab result portal", "therapy journal", "fitness log", "family care coordinator"], collectionNames: ["health_conditions", "diagnoses", "doctors", "medical_appointments", "medications", "medication_doses", "lab_results", "symptom_logs", "mood_logs", "therapy_sessions", "body_measurements", "workouts", "children_profiles", "caregivers"], entities: ["patient", "condition", "clinician", "appointment", "medication", "dose", "labResult", "symptom", "mood", "caregiver"], evidence: ["human_recognizable", "market_validated", "agent_useful"] },
  { id: "home_property", domain: "home, property, possessions, maintenance, warranties, utilities, chores, services", archetypes: ["home inventory app", "property management workspace", "maintenance planner", "warranty tracker", "utility management tool", "household chore board", "service visit scheduler"], collectionNames: ["households", "household_members", "home_inventory_items", "appliances", "appliance_maintenance", "chores", "chore_logs", "warranties", "manuals", "real_estate_owned", "property_visits", "property_inspections"], entities: ["household", "property", "room", "item", "appliance", "warranty", "manual", "maintenanceTask", "serviceVisit", "utility"], evidence: ["human_recognizable", "market_validated", "multi_domain_reuse"] },
  { id: "work_people_ops", domain: "work, HR, recruiting, payroll, performance, legal, contracts, operations", archetypes: ["recruiting pipeline", "payroll workspace", "performance review system", "contract operations desk", "operations runbook", "time off manager", "employee engagement tracker"], collectionNames: ["employees", "contractors", "departments", "payroll_runs", "pay_stubs", "time_off_requests", "performance_reviews", "one_on_ones", "engagement_surveys", "contracts", "projects", "support_tickets"], entities: ["employee", "candidate", "department", "payrollRun", "contract", "review", "request", "project", "issue", "policy"], evidence: ["market_validated", "multi_domain_reuse", "agent_useful"] },
  { id: "customer_growth", domain: "CRM, support, marketing, analytics, product management, customer success", archetypes: ["sales pipeline", "support inbox", "marketing campaign builder", "product analytics workspace", "feedback triage board", "customer success planner", "survey analysis tool"], collectionNames: ["accounts", "contacts", "leads", "deals", "deal_line_items", "campaigns", "campaign_members", "support_tickets", "support_messages", "satisfaction_ratings", "analytics_events", "segments", "surveys", "survey_responses"], entities: ["customer", "contact", "lead", "deal", "campaign", "ticket", "message", "feedback", "event", "segment"], evidence: ["market_validated", "multi_domain_reuse", "agent_useful"] },
  { id: "media_creation", domain: "media, reading, writing, creator workflows, publishing, collections, cultural activity", archetypes: ["reading tracker", "creator project workspace", "publishing calendar", "media library", "highlight manager", "music catalog", "event attendance journal"], collectionNames: ["books", "book_notes", "highlights", "reading_lists", "movies", "tv_shows", "podcasts", "creative_projects", "writing_pieces", "music_tracks", "artworks", "newsletter_posts", "concerts_attended"], entities: ["work", "creatorProject", "draft", "publication", "library", "highlight", "collection", "episode", "performance", "artifact"], evidence: ["human_recognizable", "market_validated", "agent_useful"] },
  { id: "travel_mobility", domain: "travel, mobility, vehicles, logistics, itineraries, bookings, documents", archetypes: ["trip planner", "mobility log", "vehicle maintenance app", "route itinerary builder", "travel document vault", "accommodation booking tool", "logistics checklist"], collectionNames: ["trips", "trip_itinerary_items", "trip_packing_lists", "packing_items", "places_visited", "accommodations_booked", "flights", "transports_booked", "travel_documents", "vehicles", "vehicle_maintenance", "mileage_logs"], entities: ["traveler", "trip", "itineraryItem", "place", "booking", "transport", "vehicle", "route", "document", "checklist"], evidence: ["human_recognizable", "market_validated", "multi_domain_reuse"] },
  { id: "community_relationships", domain: "communities, relationships, events, messages, groups, memberships, trust and moderation", archetypes: ["community membership system", "event group planner", "relationship manager", "gift planner", "moderation queue", "message thread workspace", "volunteer coordination tool"], collectionNames: ["personal_contacts", "personal_relationships", "birthdays", "important_dates", "gifts_given", "gift_ideas", "communities_membership", "volunteer_activities", "donations", "external_threads", "email_threads", "support_conversations"], entities: ["person", "relationship", "group", "membership", "event", "message", "moderationItem", "gift", "volunteerActivity", "trustSignal"], evidence: ["human_recognizable", "market_validated", "agent_useful"] },
  { id: "infra_security", domain: "infrastructure, observability, security, audit, incidents, deployments, assets", archetypes: ["observability dashboard", "incident response system", "deployment tracker", "security audit workspace", "asset inventory", "service monitor", "change management log"], collectionNames: ["repositories", "infra_environments", "deployments", "infra_domains", "infra_secrets", "alert_rules", "monitors", "slos", "slo_calculations", "error_events", "error_issues", "audit_log", "policy_gates"], entities: ["service", "environment", "deployment", "incident", "alert", "monitor", "secretReference", "auditEvent", "asset", "policy"], evidence: ["market_validated", "multi_domain_reuse", "agent_useful"] },
  { id: "personal_memory", domain: "personal identity, preferences, profile attributes, documents, memories, goals, routines", archetypes: ["personal profile", "document vault", "memory journal", "goal planner", "routine tracker", "preference center", "life event archive"], collectionNames: ["personal_notes", "journal_entries", "memories", "personal_events", "identity_documents", "general_personal_documents", "goals", "routines", "habit_logs", "intentions", "reflections", "memory_blocks", "knowledge_graphs"], entities: ["person", "profileAttribute", "document", "memory", "goal", "routine", "habit", "preference", "event", "note"], evidence: ["human_recognizable", "multi_domain_reuse", "agent_useful"] },
];

function slug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function buildCoverageNeed(wave: CoverageWaveSeed, archetype: string, scenario: CoverageScenarioSeed): CatalogCoverageNeed {
  const coverageStatus = scenario.coverageStatus ?? "canonical";
  return {
    id: `${wave.id}.${slug(archetype)}.${scenario.id}`,
    wave: wave.id,
    domain: wave.domain,
    archetype,
    scenario: scenario.label,
    humanValue: `${scenario.humanValue} for a ${archetype}`,
    requiredEntities: [...new Set([...wave.entities, scenario.fromEntity, scenario.toEntity])],
    requiredFields: scenario.fields,
    requiredRelationships: [{ name: `${scenario.id}_relation`, kind: scenario.relationKind, from: scenario.fromEntity, to: scenario.toEntity }],
    evidence: wave.evidence,
    coverage: {
      status: coverageStatus,
      collectionNames: [...new Set([...wave.collectionNames, ...scenario.collectionNames])],
      fieldNames: scenario.coverageFields ?? scenario.fields,
      relationNames: [`${scenario.id}_relation`],
      notes: scenario.notes ?? "Phase-1 coverage candidate; final waves must prove exact field and relation coverage or classify the need as canonical gap/custom database.",
    },
  };
}

export const CATALOG_COVERAGE_NEEDS: CatalogCoverageNeed[] = CATALOG_COVERAGE_WAVES.flatMap((wave) =>
  wave.archetypes.flatMap((archetype) =>
    CATALOG_COVERAGE_SCENARIOS.map((scenario) => buildCoverageNeed(wave, archetype, scenario)),
  ),
);

export function listCatalogCoverageNeeds(options?: { wave?: string; status?: CatalogCoverageStatus }): CatalogCoverageNeed[] {
  return CATALOG_COVERAGE_NEEDS.filter((need) => {
    if (options?.wave && need.wave !== options.wave) return false;
    if (options?.status && need.coverage.status !== options.status) return false;
    return true;
  });
}
