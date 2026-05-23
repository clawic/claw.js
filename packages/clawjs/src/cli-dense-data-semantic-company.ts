import {
  type DenseSemanticViewEntry,
  type ProfessionalRecordsCliInput,
  type ProfessionalRecordsIntent,
  firstStringField,
  openProfessionalRecordsStore,
  personLabel,
  relationLabel,
  sumNumericField,
  timelineItem,
  uniqueRecordsById,
} from "./cli-dense-data-semantic-common.ts";

const DENSE_SEMANTIC_VIEW_LIMIT = 50;

export function materializedCompanyTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const companyId = input.positionals[1];
  if (input.positionals[0] !== "company" || input.positionals[2] !== "timeline" || !companyId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const company = store.getRecord(namespaceId, "companies", companyId);
  if (!company) return undefined;

  const accounts = store.listRecords(namespaceId, "accounts", { filter: { companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const deals = store.listRecords(namespaceId, "deals", { filter: { companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const contacts = store.listRecords(namespaceId, "contacts", { filter: { companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const activities = store.listRecords(namespaceId, "activities", { filter: { companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const billingCustomers = store.listRecords(namespaceId, "billing_customers", { filter: { companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const invoices = billingCustomers.flatMap((record) => store.listRecords(namespaceId, "invoices", { filter: { billingCustomerId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items);
  const paymentsByCustomer = billingCustomers.flatMap((record) => store.listRecords(namespaceId, "payment_intents", { filter: { billingCustomerId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items);
  const paymentsByInvoice = invoices.flatMap((record) => store.listRecords(namespaceId, "payment_intents", { filter: { invoiceId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items);
  const payments = uniqueRecordsById([...paymentsByCustomer, ...paymentsByInvoice]);
  const services = store.listRecords(namespaceId, "services", { filter: { companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const workOrders = store.listRecords(namespaceId, "work_orders", { filter: { companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const assets = store.listRecords(namespaceId, "assets", { filter: { companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const products = store.listRecords(namespaceId, "products_catalog", { filter: { companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const outgoingRelations = store.listRecords(namespaceId, "entity_relations", { filter: { fromEntityKind: "companies", fromEntityId: companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const incomingRelations = store.listRecords(namespaceId, "entity_relations", { filter: { toEntityKind: "companies", toEntityId: companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const relations = uniqueRecordsById([...outgoingRelations, ...incomingRelations]);
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "companies", recordId: companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "companies", targetId: companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "companies", targetId: companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company),
    ...accounts.map((record) => timelineItem(record, "account", record.id, record.name ?? record.id, record.createdAt, record)),
    ...deals.map((record) => timelineItem(record, "deal", record.id, record.title ?? record.name ?? record.id, record.createdAt, record)),
    ...contacts.map((record) => timelineItem(record, "contact", record.id, personLabel(record), record.createdAt, record)),
    ...activities.map((record) => timelineItem(record, "activity", record.id, record.subject ?? record.kind ?? record.id, record.createdAt, record)),
    ...billingCustomers.map((record) => timelineItem(record, "billing_customer", record.id, record.name ?? record.id, record.createdAt, record)),
    ...invoices.map((record) => timelineItem(record, "invoice", record.id, record.number ?? record.id, record.issuedAt ?? record.createdAt, record)),
    ...payments.map((record) => timelineItem(record, "payment", record.id, record.status ?? record.id, record.createdAt, record)),
    ...services.map((record) => timelineItem(record, "service", record.id, record.name ?? record.id, record.createdAt, record)),
    ...workOrders.map((record) => timelineItem(record, "work_order", record.id, record.title ?? record.id, record.startedAt ?? record.plannedStartAt ?? record.createdAt, record)),
    ...assets.map((record) => timelineItem(record, "asset", record.id, record.serialNumber ?? record.id, record.purchaseDate ?? record.createdAt, record)),
    ...products.map((record) => timelineItem(record, "product", record.id, record.name ?? record.id, record.createdAt, record)),
    ...relations.map((record) => timelineItem(record, "relation", record.id, relationLabel(record), record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "companies", id: company.id, label: company.name ?? company.legalName ?? company.id },
    summary: {
      accounts: accounts.length,
      deals: deals.length,
      contacts: contacts.length,
      activities: activities.length,
      billingCustomers: billingCustomers.length,
      invoices: invoices.length,
      payments: payments.length,
      services: services.length,
      workOrders: workOrders.length,
      assets: assets.length,
      products: products.length,
      relations: relations.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      company,
      accounts,
      deals,
      contacts,
      activities,
      billingCustomers,
      invoices,
      payments,
      services,
      workOrders,
      assets,
      products,
      relations,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["companies", "accounts", "deals", "contacts", "activities", "billing_customers", "invoices", "payment_intents", "services", "work_orders", "assets", "products_catalog", "entity_relations", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedCrmAccountOverview(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const accountId = input.positionals[2];
  if (input.positionals[0] !== "crm" || input.positionals[1] !== "account" || input.positionals[3] !== "overview" || !accountId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const account = store.getRecord(namespaceId, "accounts", accountId);
  if (!account) return undefined;

  const companyId = typeof account.companyId === "string" ? account.companyId : undefined;
  const company = companyId ? store.getRecord(namespaceId, "companies", companyId) : undefined;
  const deals = store.listRecords(namespaceId, "deals", { filter: { accountId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const contacts = store.listRecords(namespaceId, "contacts", { filter: { accountId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const activities = store.listRecords(namespaceId, "activities", { filter: { accountId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "accounts", recordId: accountId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "accounts", targetId: accountId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "accounts", targetId: accountId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const openDealValueCents = sumNumericField(deals.filter((record) => record.status !== "lost"), "valueCents");

  return {
    id: semanticView.id,
    subject: { collectionName: "accounts", id: account.id, label: account.name ?? account.id },
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    summary: {
      deals: deals.length,
      openDealValueCents,
      contacts: contacts.length,
      activities: activities.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    records: {
      account,
      company,
      deals,
      contacts,
      activities,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["accounts", "companies", "deals", "contacts", "activities", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedFinanceEntityOverview(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const entityId = input.positionals[2];
  const command = input.positionals[0];
  if ((command !== "finance" && command !== "accounting") || input.positionals[1] !== "entity" || input.positionals[3] !== "overview" || !entityId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const financialAccount = store.getRecord(namespaceId, "financial_accounts", entityId);
  if (!financialAccount) return undefined;

  const transactions = store.listRecords(namespaceId, "transactions", { filter: { accountId: entityId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "financial_accounts", recordId: entityId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "financial_accounts", targetId: entityId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "financial_accounts", targetId: entityId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const debitCents = sumNumericField(transactions.filter((record) => record.kind !== "credit" && typeof record.amountCents === "number" && record.amountCents > 0), "amountCents");
  const creditCents = sumNumericField(transactions.filter((record) => record.kind === "credit" || (typeof record.amountCents === "number" && record.amountCents < 0)), "amountCents");
  const netAmountCents = sumNumericField(transactions, "amountCents");

  return {
    id: semanticView.id,
    subject: { collectionName: "financial_accounts", id: financialAccount.id, label: financialAccount.name ?? financialAccount.id },
    summary: {
      transactions: transactions.length,
      debitCents,
      creditCents,
      netAmountCents,
      currency: financialAccount.currency ?? firstStringField(transactions, "currency") ?? null,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    records: {
      financialAccount,
      transactions,
      evidence,
      provenance,
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["financial_accounts", "transactions", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}
