import type {
  BuiltinCatalogEvidenceTag,
  BuiltinRelationKind,
} from "./builtins/_types.ts";
import { AUDITED_NEED_TEMPLATE_OVERRIDES } from "./catalog-audited-overrides.ts";

export type CatalogCoverageStatus =
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

export type CatalogAuditBatchStatus = "audited" | "mapping_seeded";

export type CatalogAuditConfidence = "high" | "medium";

export type CatalogAuditStructuralChange =
  | "existing"
  | "additive"
  | "migration_required"
  | "merge_split_candidate"
  | "custom_database";

export type CatalogJsonAuditStatus =
  | "typed_fields_available"
  | "justified_extension"
  | "audit_debt";

export interface CatalogAuditedBatch {
  id: string;
  order: number;
  domain: string;
  status: CatalogAuditBatchStatus;
}

export interface CatalogAuditedArchetype {
  id: string;
  batch: string;
  domain: string;
  archetype: string;
  valueProposition: string;
  workflow: string;
  collectionNames: string[];
  evidence: BuiltinCatalogEvidenceTag[];
}

export interface CatalogAuditedFieldMapping {
  collectionName: string;
  fieldName: string;
  aliasesReviewed?: string[];
}

export interface CatalogAuditedRelationMapping {
  collectionName: string;
  fieldName: string;
  targetCollectionName: string;
  kind: BuiltinRelationKind;
}

export interface CatalogAuditedNeed {
  id: string;
  batch: string;
  domain: string;
  archetypeId: string;
  archetype: string;
  structuralNeed: string;
  workflow: string;
  humanValue: string;
  requiredEntities: string[];
  requiredFields: string[];
  requiredRelationships: CatalogCoverageRelationNeed[];
  evidence: BuiltinCatalogEvidenceTag[];
  fieldMappings: CatalogAuditedFieldMapping[];
  relationMappings: CatalogAuditedRelationMapping[];
  jsonAudit: {
    status: CatalogJsonAuditStatus;
    notes: string;
  };
  coverage: CatalogCoverageMapping & {
    confidence: CatalogAuditConfidence;
    structuralChange: CatalogAuditStructuralChange;
  };
}

export interface CatalogAuditedBatchReport {
  batch: string;
  status: CatalogAuditBatchStatus;
  archetypes: number;
  needs: number;
  domainMappedNeeds: number;
  seededNeeds: number;
  gaps: number;
  customDatabaseBoundaries: number;
  additiveChanges: number;
  jsonAuditDebt: number;
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

interface AuditedNeedTemplate {
  id: string;
  label: string;
  humanValue: string;
  fields: string[];
  requiredEntities: string[];
  relationKind: BuiltinRelationKind;
  fieldMappings: CatalogAuditedFieldMapping[];
  relationMappings: CatalogAuditedRelationMapping[];
  jsonAudit: CatalogAuditedNeed["jsonAudit"];
  structuralChange?: CatalogAuditStructuralChange;
  coverageStatus?: CatalogCoverageStatus;
  notes: string;
}

export const CATALOG_AUDITED_BATCHES: CatalogAuditedBatch[] = [
  { id: "commerce_billing_procurement", order: 1, domain: "commerce, billing, payments, procurement, tax, settlement, disputes", status: "audited" },
  { id: "learning_assessment", order: 2, domain: "learning, spaced repetition, courses, tutoring, credentialing, assessment", status: "audited" },
  { id: "sports_booking_venues", order: 3, domain: "sports, venue booking, coaching, classes, memberships, leagues", status: "audited" },
  { id: "health_fitness_care", order: 4, domain: "health, fitness, care coordination, mental health, labs, medication", status: "audited" },
  { id: "home_property_possessions", order: 5, domain: "home, property, possessions, maintenance, warranties, utilities", status: "mapping_seeded" },
  { id: "work_hr_legal_ops", order: 6, domain: "work, HR, legal, contracts, operations, payroll, recruiting", status: "mapping_seeded" },
  { id: "crm_support_growth", order: 7, domain: "CRM, support, marketing, analytics, customer success, feedback", status: "mapping_seeded" },
  { id: "personal_memory_documents", order: 8, domain: "personal memory, documents, goals, routines, preferences, archives", status: "mapping_seeded" },
];

const CORE_COMMERCE_COLLECTIONS = [
  "billing_customers",
  "orders",
  "order_line_items",
  "invoices",
  "invoice_line_items",
  "payment_intents",
  "charges",
  "refunds",
  "payment_methods",
  "balance_transactions",
  "payouts",
  "disputes",
  "products_catalog",
  "prices",
  "tax_filings",
  "bills",
  "bill_payments",
  "documents",
  "custom_fields",
  "field_values",
];

export const CATALOG_AUDITED_ARCHETYPES: CatalogAuditedArchetype[] = [
  ...[
    "checkout operations console",
    "subscription revenue workspace",
    "invoice collection desk",
    "refund dispute triage",
    "procurement request board",
    "vendor bill approval flow",
    "usage metering ledger",
    "tax filing organizer",
    "payout reconciliation desk",
    "quote to cash pipeline",
    "order fulfillment tracker",
    "payment method vault",
    "coupon promotion manager",
    "accounts receivable aging view",
    "purchase receipt archive",
  ].map((archetype) => ({
    id: `commerce_${slug(archetype)}`,
    batch: "commerce_billing_procurement",
    domain: "commerce, billing, payments, procurement, tax, settlement, disputes",
    archetype,
    valueProposition: `Operate ${archetype} workflows with portable customers, money movement, line items, documents, and exceptions.`,
    workflow: "Capture commercial actors, itemized obligations, payment state, settlement, evidence, and operational follow-up without provider-specific vocabulary.",
    collectionNames: CORE_COMMERCE_COLLECTIONS,
    evidence: ["market_validated", "multi_domain_reuse", "agent_useful"] as BuiltinCatalogEvidenceTag[],
  })),
  ...[
    "spaced repetition trainer",
    "course authoring workspace",
    "student progress portal",
    "tutoring session scheduler",
    "exam preparation dashboard",
    "credential renewal tracker",
    "language practice journal",
    "skills matrix planner",
    "cohort learning community",
    "assignment feedback board",
    "knowledge assessment lab",
    "lesson resource library",
    "mentor office hours desk",
    "microlearning sequence builder",
    "practice streak coach",
  ].map((archetype) => ({
    id: `learning_${slug(archetype)}`,
    batch: "learning_assessment",
    domain: "learning, spaced repetition, courses, tutoring, credentialing, assessment",
    archetype,
    valueProposition: `Track ${archetype} outcomes with learners, content, sessions, assessments, and durable progress signals.`,
    workflow: "Represent learning objects, participants, review cycles, schedules, observations, and evidence-backed progress.",
    collectionNames: ["courses", "lessons", "study_sessions", "flashcards", "flashcard_decks", "flashcard_reviews", "vocabulary_items", "skills", "skill_progress_logs", "exams", "certifications_personal", "survey_responses"],
    evidence: ["human_recognizable", "market_validated", "agent_useful"] as BuiltinCatalogEvidenceTag[],
  })),
  ...[
    "court reservation calendar",
    "club membership manager",
    "coach session planner",
    "league fixture board",
    "class booking marketplace",
    "venue availability desk",
    "athlete progress notebook",
    "personal record tracker",
    "race registration hub",
    "team roster workspace",
    "training plan library",
    "equipment rental schedule",
    "wellness studio booking",
    "match result recorder",
    "facility access planner",
  ].map((archetype) => ({
    id: `sports_${slug(archetype)}`,
    batch: "sports_booking_venues",
    domain: "sports, venue booking, coaching, classes, memberships, leagues",
    archetype,
    valueProposition: `Coordinate ${archetype} workflows with people, places, slots, payments, membership, and performance records.`,
    workflow: "Model bookings, participants, venues, membership status, financial links, schedules, and measurable activity outcomes.",
    collectionNames: ["bookings", "availability_slots", "booking_slots", "booking_meeting_types", "routine_workouts", "workouts", "workout_exercises", "personal_records", "races_registered", "race_results", "communities_membership", "team_memberships", "places_visited"],
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse"] as BuiltinCatalogEvidenceTag[],
  })),
  ...[
    "condition care timeline",
    "medication adherence tracker",
    "symptom diary",
    "lab result review portal",
    "therapy reflection journal",
    "fitness measurement log",
    "family caregiver coordinator",
    "appointment follow up board",
    "vaccination record vault",
    "nutrition response tracker",
    "sleep recovery notebook",
    "pain episode mapper",
    "rehab exercise planner",
    "mental health check in",
    "clinical document archive",
  ].map((archetype) => ({
    id: `health_${slug(archetype)}`,
    batch: "health_fitness_care",
    domain: "health, fitness, care coordination, mental health, labs, medication",
    archetype,
    valueProposition: `Support ${archetype} workflows with people, observations, care events, documents, and longitudinal state.`,
    workflow: "Keep health records human-readable while preserving appointments, samples, clinicians, caregivers, documents, and trend evidence.",
    collectionNames: ["health_conditions", "diagnoses", "doctors", "clinics", "medical_appointments", "medications", "medication_doses", "lab_results", "symptom_logs", "mood_logs", "therapy_sessions", "body_measurements", "workouts", "medical_documents"],
    evidence: ["human_recognizable", "market_validated", "agent_useful"] as BuiltinCatalogEvidenceTag[],
  })),
  ...[
    "home inventory vault",
    "property maintenance planner",
    "appliance service log",
    "warranty renewal tracker",
    "utility account dashboard",
    "household chore board",
    "service visit scheduler",
    "rental inspection notebook",
    "room asset organizer",
    "move checklist workspace",
    "insurance evidence folder",
    "repair quote comparison",
    "smart home device registry",
    "garden maintenance journal",
    "shared household budget",
  ].map((archetype) => ({
    id: `home_${slug(archetype)}`,
    batch: "home_property_possessions",
    domain: "home, property, possessions, maintenance, warranties, utilities",
    archetype,
    valueProposition: `Manage ${archetype} workflows with homes, assets, rooms, vendors, documents, costs, and recurring work.`,
    workflow: "Represent owned things, property context, maintenance events, supporting documents, responsibilities, and financial obligations.",
    collectionNames: ["households", "household_members", "home_inventory_items", "appliances", "appliance_maintenance", "chores", "chore_logs", "warranties", "manuals", "real_estate_owned", "property_visits", "property_inspections", "financial_documents"],
    evidence: ["human_recognizable", "market_validated", "multi_domain_reuse"] as BuiltinCatalogEvidenceTag[],
  })),
  ...[
    "recruiting pipeline",
    "candidate interview loop",
    "employee onboarding plan",
    "payroll run workspace",
    "time off request manager",
    "performance review cycle",
    "contract approval desk",
    "policy attestation tracker",
    "operations runbook board",
    "vendor agreement archive",
    "legal matter timeline",
    "department planning system",
    "engagement survey console",
    "one on one notebook",
    "workforce asset register",
  ].map((archetype) => ({
    id: `work_${slug(archetype)}`,
    batch: "work_hr_legal_ops",
    domain: "work, HR, legal, contracts, operations, payroll, recruiting",
    archetype,
    valueProposition: `Run ${archetype} workflows with employees, candidates, approvals, documents, obligations, and operational state.`,
    workflow: "Connect people, teams, contracts, reviews, policies, payroll events, and dependencies without collapsing them into generic notes.",
    collectionNames: ["employees", "contractors", "departments", "payroll_runs", "pay_stubs", "time_off_requests", "performance_reviews", "one_on_ones", "engagement_surveys", "contracts", "projects", "support_tickets", "approvals"],
    evidence: ["market_validated", "multi_domain_reuse", "agent_useful"] as BuiltinCatalogEvidenceTag[],
  })),
  ...[
    "sales pipeline",
    "support inbox",
    "customer success planner",
    "marketing campaign builder",
    "feedback triage board",
    "product analytics workspace",
    "survey analysis tool",
    "renewal risk dashboard",
    "account health timeline",
    "lead routing queue",
    "conversation quality monitor",
    "campaign attribution view",
    "segment builder",
    "knowledge base feedback loop",
    "service level operations desk",
  ].map((archetype) => ({
    id: `growth_${slug(archetype)}`,
    batch: "crm_support_growth",
    domain: "CRM, support, marketing, analytics, customer success, feedback",
    archetype,
    valueProposition: `Improve ${archetype} workflows with accounts, contacts, tickets, events, campaigns, surveys, and outcomes.`,
    workflow: "Unify customer actors, commercial intent, support conversations, marketing membership, metrics, and feedback evidence.",
    collectionNames: ["accounts", "contacts", "leads", "deals", "deal_line_items", "campaigns", "campaign_members", "support_tickets", "support_messages", "satisfaction_ratings", "analytics_events", "segments", "surveys", "survey_responses"],
    evidence: ["market_validated", "multi_domain_reuse", "agent_useful"] as BuiltinCatalogEvidenceTag[],
  })),
  ...[
    "personal document vault",
    "memory journal",
    "goal planning board",
    "routine tracker",
    "preference center",
    "life event archive",
    "identity record folder",
    "habit reflection notebook",
    "important date planner",
    "personal knowledge graph",
    "commitment tracker",
    "decision log",
    "travel memory album",
    "relationship timeline",
    "private reference library",
  ].map((archetype) => ({
    id: `personal_${slug(archetype)}`,
    batch: "personal_memory_documents",
    domain: "personal memory, documents, goals, routines, preferences, archives",
    archetype,
    valueProposition: `Maintain ${archetype} workflows with portable personal records, documents, memories, goals, and routines.`,
    workflow: "Preserve human-recognizable personal objects, dates, evidence, relationships, preferences, and follow-up state.",
    collectionNames: ["personal_notes", "journal_entries", "memories", "personal_events", "identity_documents", "general_personal_documents", "goals", "routines", "habit_logs", "intentions", "reflections", "memory_blocks", "knowledge_graphs"],
    evidence: ["human_recognizable", "multi_domain_reuse", "agent_useful"] as BuiltinCatalogEvidenceTag[],
  })),
];

const AUDITED_NEED_TEMPLATES: AuditedNeedTemplate[] = [
  {
    id: "record_lifecycle",
    label: "record lifecycle and status",
    humanValue: "create, identify, progress, archive, and recover the primary record",
    fields: ["number", "status", "archivedAt"],
    requiredEntities: ["workspace", "primaryRecord"],
    relationKind: "ownership",
    fieldMappings: [
      { collectionName: "orders", fieldName: "number", aliasesReviewed: ["orderNumber"] },
      { collectionName: "orders", fieldName: "status" },
      { collectionName: "orders", fieldName: "archivedAt" },
    ],
    relationMappings: [{ collectionName: "orders", fieldName: "companyId", targetCollectionName: "companies", kind: "ownership" }],
    jsonAudit: { status: "typed_fields_available", notes: "Lifecycle state is represented by typed identity, status, and archive fields." },
    notes: "Existing canonical lifecycle fields cover the workflow; batch work checks aliases and naming consistency.",
  },
  {
    id: "actor_account",
    label: "actor, customer, owner, or account link",
    humanValue: "know who owns, requests, approves, receives, or pays for the record",
    fields: ["email", "name", "linkedCustomerId"],
    requiredEntities: ["actor", "customer", "account"],
    relationKind: "participant",
    fieldMappings: [
      { collectionName: "billing_customers", fieldName: "email", aliasesReviewed: ["billingEmail", "buyerEmail"] },
      { collectionName: "billing_customers", fieldName: "name", aliasesReviewed: ["billingName", "buyerName"] },
      { collectionName: "billing_customers", fieldName: "linkedCustomerId" },
    ],
    relationMappings: [{ collectionName: "orders", fieldName: "customerId", targetCollectionName: "customers", kind: "participant" }],
    jsonAudit: { status: "typed_fields_available", notes: "Actor identity maps to typed email/name fields and semantic participant relations." },
    notes: "The canonical model keeps commercial actor identity separate from provider-specific account ids.",
  },
  {
    id: "itemized_breakdown",
    label: "itemized quantities and amounts",
    humanValue: "explain totals through line rows, quantities, prices, discounts, and descriptions",
    fields: ["description", "amountCents", "quantity", "priceId"],
    requiredEntities: ["parentRecord", "lineItem", "catalogItem", "price"],
    relationKind: "line_item",
    fieldMappings: [
      { collectionName: "invoice_line_items", fieldName: "description" },
      { collectionName: "invoice_line_items", fieldName: "amountCents", aliasesReviewed: ["lineAmountCents"] },
      { collectionName: "invoice_line_items", fieldName: "quantity" },
      { collectionName: "invoice_line_items", fieldName: "priceId" },
    ],
    relationMappings: [{ collectionName: "invoice_line_items", fieldName: "priceId", targetCollectionName: "prices", kind: "line_item" }],
    jsonAudit: { status: "typed_fields_available", notes: "Line item amounts and catalog links are first-class typed fields." },
    notes: "Line items remain separate child records rather than embedded arrays on the parent.",
  },
  {
    id: "payment_settlement",
    label: "payment, balance, payout, and settlement",
    humanValue: "trace gross, fees, net, currency, settlement timing, and payout status",
    fields: ["amountCents", "currency", "feeCents", "netCents", "sourceKind", "sourceId"],
    requiredEntities: ["transaction", "account", "settlement"],
    relationKind: "financial_transaction",
    fieldMappings: [
      { collectionName: "balance_transactions", fieldName: "amountCents", aliasesReviewed: ["balanceTransactionAmountCents"] },
      { collectionName: "balance_transactions", fieldName: "currency" },
      { collectionName: "balance_transactions", fieldName: "feeCents", aliasesReviewed: ["processingFeeCents"] },
      { collectionName: "balance_transactions", fieldName: "netCents" },
      { collectionName: "balance_transactions", fieldName: "sourceKind" },
      { collectionName: "balance_transactions", fieldName: "sourceId" },
    ],
    relationMappings: [{ collectionName: "charges", fieldName: "paymentIntentId", targetCollectionName: "payment_intents", kind: "financial_transaction" }],
    jsonAudit: { status: "typed_fields_available", notes: "Money movement uses typed amount, currency, fee, net, and source reference fields." },
    notes: "Settlement mapping is provider-neutral and preserves auditability across charges, refunds, and payouts.",
  },
  {
    id: "source_sync",
    label: "source, import, and synchronization provenance",
    humanValue: "preserve external origin, retry state, sync attempts, and canonical mapping",
    fields: ["sourceKind", "sourceId", "eventType", "attemptCount", "succeededAt"],
    requiredEntities: ["sourceRecord", "canonicalRecord", "delivery"],
    relationKind: "source_import",
    fieldMappings: [
      { collectionName: "balance_transactions", fieldName: "sourceKind" },
      { collectionName: "balance_transactions", fieldName: "sourceId" },
      { collectionName: "webhook_deliveries", fieldName: "eventType" },
      { collectionName: "webhook_deliveries", fieldName: "attemptCount" },
      { collectionName: "webhook_deliveries", fieldName: "succeededAt" },
    ],
    relationMappings: [{ collectionName: "webhook_deliveries", fieldName: "webhookId", targetCollectionName: "webhooks_outbound", kind: "source_import" }],
    jsonAudit: { status: "justified_extension", notes: "Raw payload remains JSON by design, while event type and retry state are typed." },
    notes: "Imported payloads are evidence, not the canonical field model.",
  },
  {
    id: "supporting_document",
    label: "documents, receipts, files, and evidence",
    humanValue: "attach receipts, PDFs, certificates, screenshots, and supporting documents",
    fields: ["title", "content", "receiptUrl", "pdfUrl"],
    requiredEntities: ["document", "attachment", "evidence"],
    relationKind: "attachment",
    fieldMappings: [
      { collectionName: "documents", fieldName: "title" },
      { collectionName: "documents", fieldName: "content" },
      { collectionName: "charges", fieldName: "receiptUrl", aliasesReviewed: ["chargeReceiptUrl"] },
      { collectionName: "invoices", fieldName: "pdfUrl", aliasesReviewed: ["invoicePdfUrl"] },
    ],
    relationMappings: [{ collectionName: "documents", fieldName: "parentDocumentId", targetCollectionName: "documents", kind: "attachment" }],
    jsonAudit: { status: "justified_extension", notes: "Document body variants can stay structured in contentData while common receipt/PDF links are typed." },
    notes: "Evidence is represented through document and attachment semantics rather than opaque string lists.",
  },
  {
    id: "location_fulfillment",
    label: "location, address, and fulfillment context",
    humanValue: "ship, visit, inspect, deliver, or schedule records against real places",
    fields: ["shippingAddress", "shippingCity", "shippingCountry", "billingCity", "billingCountry"],
    requiredEntities: ["record", "place", "address"],
    relationKind: "location",
    fieldMappings: [
      { collectionName: "orders", fieldName: "shippingAddress" },
      { collectionName: "orders", fieldName: "shippingCity" },
      { collectionName: "orders", fieldName: "shippingCountry" },
      { collectionName: "orders", fieldName: "billingCity" },
      { collectionName: "orders", fieldName: "billingCountry" },
    ],
    relationMappings: [{ collectionName: "medical_appointments", fieldName: "clinicId", targetCollectionName: "clinics", kind: "location" }],
    jsonAudit: { status: "typed_fields_available", notes: "Common address dimensions are typed while full address JSON remains available for edge formats." },
    structuralChange: "additive",
    notes: "The first batch adds typed address breakouts so common commerce workflows do not depend only on JSON addresses.",
  },
  {
    id: "scheduled_commitment",
    label: "booking, deadline, recurrence, and calendar commitment",
    humanValue: "reserve time, track deadlines, and link payment or attendance to a scheduled event",
    fields: ["startTime", "endTime", "status", "paid", "paymentIntentId"],
    requiredEntities: ["event", "slot", "participant"],
    relationKind: "temporal_event",
    fieldMappings: [
      { collectionName: "booking_slots", fieldName: "startTime" },
      { collectionName: "booking_slots", fieldName: "endTime" },
      { collectionName: "booking_slots", fieldName: "status" },
      { collectionName: "booking_slots", fieldName: "paid" },
      { collectionName: "booking_slots", fieldName: "paymentIntentId" },
    ],
    relationMappings: [{ collectionName: "booking_slots", fieldName: "meetingTypeId", targetCollectionName: "booking_meeting_types", kind: "temporal_event" }],
    jsonAudit: { status: "typed_fields_available", notes: "Booking state, time bounds, and payment link are typed." },
    notes: "Temporal commitments are first-class records, not incidental date fields on unrelated objects.",
  },
  {
    id: "exception_resolution",
    label: "exception, dispute, refund, and resolution",
    humanValue: "record reason, evidence, due date, resolution state, and financial impact",
    fields: ["reason", "status", "evidenceSummary", "evidenceSubmittedAt", "dueBy"],
    requiredEntities: ["exception", "evidence", "resolution"],
    relationKind: "financial_transaction",
    fieldMappings: [
      { collectionName: "disputes", fieldName: "reason" },
      { collectionName: "disputes", fieldName: "status" },
      { collectionName: "disputes", fieldName: "evidenceSummary" },
      { collectionName: "disputes", fieldName: "evidenceSubmittedAt" },
      { collectionName: "disputes", fieldName: "dueBy" },
    ],
    relationMappings: [{ collectionName: "disputes", fieldName: "chargeId", targetCollectionName: "charges", kind: "financial_transaction" }],
    jsonAudit: { status: "typed_fields_available", notes: "Common dispute evidence fields are typed; detailed evidence payload remains an extension." },
    structuralChange: "additive",
    notes: "The batch adds typed dispute evidence summary fields to reduce dependence on evidence JSON.",
  },
  {
    id: "observation_metric",
    label: "observation, rating, sample, or response",
    humanValue: "capture user input, measurements, ratings, and follow-up observations",
    fields: ["submittedAt", "answers", "status", "confidence"],
    requiredEntities: ["observation", "subject", "survey"],
    relationKind: "observation_sample",
    fieldMappings: [
      { collectionName: "survey_responses", fieldName: "submittedAt" },
      { collectionName: "survey_responses", fieldName: "answers" },
      { collectionName: "support_tickets", fieldName: "status" },
      { collectionName: "satisfaction_ratings", fieldName: "score" },
    ],
    relationMappings: [{ collectionName: "survey_responses", fieldName: "surveyId", targetCollectionName: "surveys", kind: "observation_sample" }],
    jsonAudit: { status: "justified_extension", notes: "Survey answers are intentionally JSON because answer schema varies by survey definition." },
    notes: "Observation workflows preserve typed timestamps and ratings while allowing survey-specific answer shapes.",
  },
  {
    id: "dependency_approval",
    label: "approval, blocker, dependency, and audit trail",
    humanValue: "show what must happen before a record can advance and who decided it",
    fields: ["linkedIssueId", "priority", "status", "description"],
    requiredEntities: ["dependency", "approver", "blockedRecord"],
    relationKind: "dependency",
    fieldMappings: [
      { collectionName: "support_tickets", fieldName: "linkedIssueId" },
      { collectionName: "support_tickets", fieldName: "priority" },
      { collectionName: "support_tickets", fieldName: "status" },
      { collectionName: "support_tickets", fieldName: "description" },
    ],
    relationMappings: [{ collectionName: "support_tickets", fieldName: "linkedIssueId", targetCollectionName: "issues", kind: "dependency" }],
    jsonAudit: { status: "typed_fields_available", notes: "Dependency state maps to relation fields and typed priority/status." },
    notes: "Dependency and approval information must remain graph-addressable for agents.",
  },
  {
    id: "custom_extension_boundary",
    label: "custom extension boundary",
    humanValue: "support niche or tenant-specific fields without polluting the canonical schema",
    fields: ["name", "entityType", "fieldType", "value"],
    requiredEntities: ["customField", "fieldValue", "canonicalRecord"],
    relationKind: "dependency",
    fieldMappings: [
      { collectionName: "custom_fields", fieldName: "name" },
      { collectionName: "custom_fields", fieldName: "entityType" },
      { collectionName: "custom_fields", fieldName: "fieldType" },
      { collectionName: "field_values", fieldName: "value" },
    ],
    relationMappings: [{ collectionName: "support_tickets", fieldName: "linkedIssueId", targetCollectionName: "issues", kind: "dependency" }],
    jsonAudit: { status: "justified_extension", notes: "The custom field value is JSON by design because it is governed by fieldType/options." },
    structuralChange: "custom_database",
    coverageStatus: "custom_database",
    notes: "Custom databases remain first-class for private or unapproved fields; the boundary itself is canonical.",
  },
];

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
      notes: scenario.notes ?? "Final coverage mapping: the need resolves to canonical collections/fields/relations or an explicit custom database boundary.",
    },
  };
}

function resolveAuditedTemplate(archetype: CatalogAuditedArchetype, template: AuditedNeedTemplate): AuditedNeedTemplate {
  const override = AUDITED_NEED_TEMPLATE_OVERRIDES[archetype.batch]?.[template.id];
  if (!override) return template;

  return {
    ...template,
    ...override,
    id: template.id,
    label: template.label,
    humanValue: template.humanValue,
    jsonAudit: override.jsonAudit ?? template.jsonAudit,
    structuralChange: override.structuralChange ?? "existing",
  };
}

function buildAuditedNeed(archetype: CatalogAuditedArchetype, template: AuditedNeedTemplate): CatalogAuditedNeed {
  const resolvedTemplate = resolveAuditedTemplate(archetype, template);
  const coverageStatus = resolvedTemplate.coverageStatus ?? "canonical";
  const collectionNames = [
    ...new Set([
      ...archetype.collectionNames,
      ...resolvedTemplate.fieldMappings.map((mapping) => mapping.collectionName),
      ...resolvedTemplate.relationMappings.map((mapping) => mapping.collectionName),
    ]),
  ];
  const fieldNames = [...new Set(resolvedTemplate.fieldMappings.map((mapping) => mapping.fieldName))];
  const relationNames = [...new Set(resolvedTemplate.relationMappings.map((mapping) => mapping.fieldName))];

  return {
    id: `${archetype.id}.${resolvedTemplate.id}`,
    batch: archetype.batch,
    domain: archetype.domain,
    archetypeId: archetype.id,
    archetype: archetype.archetype,
    structuralNeed: resolvedTemplate.label,
    workflow: archetype.workflow,
    humanValue: `${resolvedTemplate.humanValue} for a ${archetype.archetype}`,
    requiredEntities: [...new Set([...resolvedTemplate.requiredEntities, "canonicalRecord"])],
    requiredFields: resolvedTemplate.fields,
    requiredRelationships: resolvedTemplate.relationMappings.map((mapping) => ({
      name: `${resolvedTemplate.id}_${mapping.kind}`,
      kind: mapping.kind,
      from: mapping.collectionName,
      to: mapping.targetCollectionName,
    })),
    evidence: archetype.evidence,
    fieldMappings: resolvedTemplate.fieldMappings,
    relationMappings: resolvedTemplate.relationMappings,
    jsonAudit: resolvedTemplate.jsonAudit,
    coverage: {
      status: coverageStatus,
      collectionNames,
      fieldNames,
      relationNames,
      confidence: coverageStatus === "gap" ? "medium" : "high",
      structuralChange: resolvedTemplate.structuralChange ?? "existing",
      notes: resolvedTemplate.notes,
    },
  };
}

export const CATALOG_COVERAGE_NEEDS: CatalogCoverageNeed[] = CATALOG_COVERAGE_WAVES.flatMap((wave) =>
  wave.archetypes.flatMap((archetype) =>
    CATALOG_COVERAGE_SCENARIOS.map((scenario) => buildCoverageNeed(wave, archetype, scenario)),
  ),
);

export const CATALOG_AUDITED_NEEDS: CatalogAuditedNeed[] = CATALOG_AUDITED_ARCHETYPES.flatMap((archetype) =>
  AUDITED_NEED_TEMPLATES.map((template) => buildAuditedNeed(archetype, template)),
);

export function listCatalogCoverageNeeds(options?: { wave?: string; status?: CatalogCoverageStatus }): CatalogCoverageNeed[] {
  return CATALOG_COVERAGE_NEEDS.filter((need) => {
    if (options?.wave && need.wave !== options.wave) return false;
    if (options?.status && need.coverage.status !== options.status) return false;
    return true;
  });
}

export function listCatalogAuditedNeeds(options?: { batch?: string; status?: CatalogCoverageStatus }): CatalogAuditedNeed[] {
  return CATALOG_AUDITED_NEEDS.filter((need) => {
    if (options?.batch && need.batch !== options.batch) return false;
    if (options?.status && need.coverage.status !== options.status) return false;
    return true;
  });
}

export function summarizeCatalogAuditedBatch(batch: string): CatalogAuditedBatchReport {
  const needs = listCatalogAuditedNeeds({ batch });
  const archetypes = new Set(needs.map((need) => need.archetypeId));
  const batchDefinition = CATALOG_AUDITED_BATCHES.find((candidate) => candidate.id === batch);
  const status = batchDefinition?.status ?? "mapping_seeded";
  const isAudited = status === "audited";

  return {
    batch,
    status,
    archetypes: archetypes.size,
    needs: needs.length,
    domainMappedNeeds: isAudited ? needs.length : 0,
    seededNeeds: isAudited ? 0 : needs.length,
    gaps: needs.filter((need) => need.coverage.status === "gap").length,
    customDatabaseBoundaries: isAudited ? needs.filter((need) => need.coverage.status === "custom_database").length : 0,
    additiveChanges: isAudited ? needs.filter((need) => need.coverage.structuralChange === "additive").length : 0,
    jsonAuditDebt: needs.filter((need) => need.jsonAudit.status === "audit_debt").length,
  };
}
