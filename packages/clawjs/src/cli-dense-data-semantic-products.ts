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

export function materializedProductSpecTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const productSpecId = input.positionals[1];
  if (!productSpecId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const productSpec = store.getRecord(namespaceId, "product_specs", productSpecId);
  if (!productSpec) return undefined;

  const product = typeof productSpec.productCatalogId === "string" ? store.getRecord(namespaceId, "products_catalog", productSpec.productCatalogId) : undefined;
  const company = typeof productSpec.companyId === "string" ? store.getRecord(namespaceId, "companies", productSpec.companyId) : undefined;
  const owner = typeof productSpec.ownerEmployeeId === "string" ? store.getRecord(namespaceId, "employees", productSpec.ownerEmployeeId) : undefined;
  const revisions = store.listRecords(namespaceId, "product_revisions", { filter: { productSpecId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const requirements = store.listRecords(namespaceId, "product_requirements", { filter: { productSpecId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const boms = store.listRecords(namespaceId, "product_boms", { filter: { productSpecId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "product_specs", recordId: productSpecId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "product_specs", targetId: productSpecId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "product_specs", targetId: productSpecId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(productSpec, "product_spec", productSpec.id, productSpec.title ?? productSpec.sku ?? productSpec.id, productSpec.createdAt, productSpec),
    ...(product ? [timelineItem(product, "product", product.id, product.name ?? product.id, product.createdAt, product)] : []),
    ...(company ? [timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company)] : []),
    ...(owner ? [timelineItem(owner, "employee", owner.id, owner.displayName ?? owner.email ?? owner.id, owner.createdAt, owner)] : []),
    ...revisions.map((record) => timelineItem(record, "product_revision", record.id, record.title ?? record.revision ?? record.id, record.releasedAt ?? record.approvedAt ?? record.createdAt, record)),
    ...requirements.map((record) => timelineItem(record, "product_requirement", record.id, record.title ?? record.requirementType ?? record.id, record.createdAt, record)),
    ...boms.map((record) => timelineItem(record, "product_bom", record.id, record.title ?? record.bomVersion ?? record.id, record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "product_specs", id: productSpec.id, label: productSpec.title ?? productSpec.sku ?? productSpec.id },
    product: product ? { id: product.id, label: product.name ?? product.id } : null,
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    owner: owner ? { id: owner.id, label: owner.displayName ?? owner.email ?? owner.id } : null,
    summary: {
      revisions: revisions.length,
      releasedRevisions: revisions.filter((record) => record.status === "released").length,
      requirements: requirements.length,
      openRequirements: requirements.filter((record) => record.status !== "verified" && record.status !== "rejected" && record.status !== "superseded").length,
      boms: boms.length,
      releasedBoms: boms.filter((record) => record.status === "released").length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
      hasCatalogProduct: Boolean(product),
      hasCompany: Boolean(company),
    },
    itemCount: items.length,
    items,
    records: {
      productSpec,
      product,
      company,
      owner,
      revisions,
      requirements,
      boms,
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
    sourceCollections: ["product_specs", "products_catalog", "companies", "employees", "product_revisions", "product_requirements", "product_boms", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedDrugProductTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const drugProductId = input.positionals[1];
  if (!drugProductId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const drugProduct = store.getRecord(namespaceId, "drug_products", drugProductId);
  if (!drugProduct) return undefined;

  const product = typeof drugProduct.productCatalogId === "string" ? store.getRecord(namespaceId, "products_catalog", drugProduct.productCatalogId) : undefined;
  const productSpec = typeof drugProduct.productSpecId === "string" ? store.getRecord(namespaceId, "product_specs", drugProduct.productSpecId) : undefined;
  const company = typeof drugProduct.companyId === "string" ? store.getRecord(namespaceId, "companies", drugProduct.companyId) : undefined;
  const batches = store.listRecords(namespaceId, "batch_records", { filter: { drugProductId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const lotReleases = store.listRecords(namespaceId, "lot_releases", { filter: { drugProductId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const adverseEvents = store.listRecords(namespaceId, "adverse_events", { filter: { drugProductId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const patientIds = new Set<string>(adverseEvents.map((record) => record.patientId).filter((value): value is string => typeof value === "string"));
  const studyIds = new Set<string>(adverseEvents.map((record) => record.studyId).filter((value): value is string => typeof value === "string"));
  const patients = [...patientIds].flatMap((patientId) => {
    const record = store.getRecord(namespaceId, "patients", patientId);
    return record ? [record] : [];
  });
  const studies = [...studyIds].flatMap((studyId) => {
    const record = store.getRecord(namespaceId, "studies", studyId);
    return record ? [record] : [];
  });
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "drug_products", recordId: drugProductId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "drug_products", targetId: drugProductId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "drug_products", targetId: drugProductId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(drugProduct, "drug_product", drugProduct.id, drugProduct.title ?? drugProduct.marketAuthorizationNumber ?? drugProduct.id, drugProduct.createdAt, drugProduct),
    ...(product ? [timelineItem(product, "product", product.id, product.name ?? product.id, product.createdAt, product)] : []),
    ...(productSpec ? [timelineItem(productSpec, "product_spec", productSpec.id, productSpec.title ?? productSpec.id, productSpec.createdAt, productSpec)] : []),
    ...(company ? [timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company)] : []),
    ...batches.map((record) => timelineItem(record, "batch_record", record.id, record.title ?? record.batchNumber ?? record.id, record.startedAt ?? record.createdAt, record)),
    ...lotReleases.map((record) => timelineItem(record, "lot_release", record.id, record.title ?? record.certificateNumber ?? record.id, record.releasedAt ?? record.createdAt, record)),
    ...adverseEvents.map((record) => timelineItem(record, "adverse_event", record.id, record.title ?? record.eventTerm ?? record.id, record.occurredAt ?? record.reportedAt ?? record.createdAt, record)),
    ...patients.map((record) => timelineItem(record, "patient", record.id, record.displayName ?? record.id, record.createdAt, record)),
    ...studies.map((record) => timelineItem(record, "study", record.id, record.title ?? record.id, record.startedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "drug_products", id: drugProduct.id, label: drugProduct.title ?? drugProduct.marketAuthorizationNumber ?? drugProduct.id },
    product: product ? { id: product.id, label: product.name ?? product.id } : null,
    productSpec: productSpec ? { id: productSpec.id, label: productSpec.title ?? productSpec.id } : null,
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    summary: {
      batches: batches.length,
      completedBatches: batches.filter((record) => record.status === "completed" || record.status === "released").length,
      lotReleases: lotReleases.length,
      releasedLots: lotReleases.filter((record) => record.status === "released" || record.disposition === "release").length,
      adverseEvents: adverseEvents.length,
      seriousAdverseEvents: adverseEvents.filter((record) => record.seriousness === "serious" || record.seriousness === "life_threatening" || record.seriousness === "fatal").length,
      patients: patients.length,
      studies: studies.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
      hasCatalogProduct: Boolean(product),
      hasProductSpec: Boolean(productSpec),
    },
    itemCount: items.length,
    items,
    records: {
      drugProduct,
      product,
      productSpec,
      company,
      batches,
      lotReleases,
      adverseEvents,
      patients,
      studies,
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
    sourceCollections: ["drug_products", "products_catalog", "product_specs", "companies", "batch_records", "lot_releases", "adverse_events", "patients", "studies", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedContentEntryTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const contentEntryId = input.positionals[1];
  if (!contentEntryId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const entry = store.getRecord(namespaceId, "content_entries", contentEntryId);
  if (!entry) return undefined;

  const brand = typeof entry.contentBrandId === "string" ? store.getRecord(namespaceId, "content_brands", entry.contentBrandId) : undefined;
  const campaign = typeof entry.contentCampaignId === "string" ? store.getRecord(namespaceId, "content_campaigns", entry.contentCampaignId) : undefined;
  const document = typeof entry.documentId === "string" ? store.getRecord(namespaceId, "documents", entry.documentId) : undefined;
  const owner = typeof entry.ownerActorId === "string" ? store.getRecord(namespaceId, "actors", entry.ownerActorId) : undefined;
  const author = typeof entry.authorActorId === "string" ? store.getRecord(namespaceId, "actors", entry.authorActorId) : undefined;
  const revisions = store.listRecords(namespaceId, "content_revisions", { filter: { contentEntryId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const variants = store.listRecords(namespaceId, "content_variants", { filter: { contentEntryId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const approvals = store.listRecords(namespaceId, "content_approvals", { filter: { contentEntryId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const publications = store.listRecords(namespaceId, "content_publications", { filter: { contentEntryId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const destinationIds = new Set<string>([
    ...variants.map((record) => record.contentDestinationId),
    ...approvals.map((record) => record.contentDestinationId),
    ...publications.map((record) => record.contentDestinationId),
  ].filter((value): value is string => typeof value === "string"));
  const destinations = [...destinationIds].flatMap((destinationId) => {
    const record = store.getRecord(namespaceId, "content_destinations", destinationId);
    return record ? [record] : [];
  });
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "content_entries", recordId: contentEntryId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "content_entries", targetId: contentEntryId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "content_entries", targetId: contentEntryId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(entry, "content_entry", entry.id, entry.title ?? entry.slug ?? entry.id, entry.createdAt, entry),
    ...(brand ? [timelineItem(brand, "content_brand", brand.id, brand.name ?? brand.slug ?? brand.id, brand.createdAt, brand)] : []),
    ...(campaign ? [timelineItem(campaign, "content_campaign", campaign.id, campaign.name ?? campaign.slug ?? campaign.id, campaign.startsAt ?? campaign.createdAt, campaign)] : []),
    ...(document ? [timelineItem(document, "document", document.id, document.title ?? document.id, document.createdAt, document)] : []),
    ...(owner ? [timelineItem(owner, "owner_actor", owner.id, owner.displayName ?? owner.name ?? owner.id, owner.createdAt, owner)] : []),
    ...(author ? [timelineItem(author, "author_actor", author.id, author.displayName ?? author.name ?? author.id, author.createdAt, author)] : []),
    ...destinations.map((record) => timelineItem(record, "content_destination", record.id, record.name ?? record.id, record.lastCheckedAt ?? record.createdAt, record)),
    ...revisions.map((record) => timelineItem(record, "content_revision", record.id, record.title ?? `Revision ${record.revisionNumber ?? record.id}`, record.authoredAt ?? record.createdAt, record)),
    ...variants.map((record) => timelineItem(record, "content_variant", record.id, record.title ?? record.format ?? record.id, record.createdAt, record)),
    ...approvals.map((record) => timelineItem(record, "content_approval", record.id, record.title ?? record.status ?? record.id, record.reviewedAt ?? record.requestedAt ?? record.createdAt, record)),
    ...publications.map((record) => timelineItem(record, "content_publication", record.id, record.title ?? record.externalUrl ?? record.status ?? record.id, record.publishedAt ?? record.scheduledAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "content_entries", id: entry.id, label: entry.title ?? entry.slug ?? entry.id },
    brand: brand ? { id: brand.id, label: brand.name ?? brand.slug ?? brand.id } : null,
    campaign: campaign ? { id: campaign.id, label: campaign.name ?? campaign.slug ?? campaign.id } : null,
    document: document ? { id: document.id, label: document.title ?? document.id } : null,
    summary: {
      revisions: revisions.length,
      variants: variants.length,
      approvals: approvals.length,
      approvedApprovals: approvals.filter((record) => record.status === "approved").length,
      publications: publications.length,
      publishedPublications: publications.filter((record) => record.status === "published").length,
      destinations: destinations.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
      hasBrand: Boolean(brand),
      hasCampaign: Boolean(campaign),
    },
    itemCount: items.length,
    items,
    records: {
      entry,
      brand,
      campaign,
      document,
      owner,
      author,
      destinations,
      revisions,
      variants,
      approvals,
      publications,
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
    sourceCollections: ["content_entries", "content_brands", "content_campaigns", "content_destinations", "content_revisions", "content_variants", "content_approvals", "content_publications", "documents", "actors", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedIotDeviceTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const thingId = input.positionals[1];
  if (!thingId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const thing = store.getRecord(namespaceId, "iot_things", thingId);
  if (!thing) return undefined;

  const company = typeof thing.companyId === "string" ? store.getRecord(namespaceId, "companies", thing.companyId) : undefined;
  const asset = typeof thing.assetId === "string" ? store.getRecord(namespaceId, "assets", thing.assetId) : undefined;
  const devices = store.listRecords(namespaceId, "iot_devices", { filter: { thingId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const deviceIds = new Set(devices.map((record) => record.id));
  const readingsByThing = store.listRecords(namespaceId, "sensor_readings", { filter: { thingId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const readingsByDevice = devices.flatMap((record) => store.listRecords(namespaceId, "sensor_readings", { filter: { deviceId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items);
  const readings = uniqueRecordsById([...readingsByThing, ...readingsByDevice]);
  const commandsByThing = store.listRecords(namespaceId, "device_commands", { filter: { thingId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const commandsByDevice = devices.flatMap((record) => store.listRecords(namespaceId, "device_commands", { filter: { deviceId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items);
  const commands = uniqueRecordsById([...commandsByThing, ...commandsByDevice]);
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "iot_things", recordId: thingId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "iot_things", targetId: thingId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "iot_things", targetId: thingId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(thing, "thing", thing.id, thing.name ?? thing.id, thing.createdAt, thing),
    ...(company ? [timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company)] : []),
    ...(asset ? [timelineItem(asset, "asset", asset.id, asset.serialNumber ?? asset.name ?? asset.id, asset.createdAt, asset)] : []),
    ...devices.map((record) => timelineItem(record, "iot_device", record.id, record.name ?? record.id, record.lastSeenAt ?? record.createdAt, record)),
    ...readings.map((record) => timelineItem(record, "sensor_reading", record.id, record.metric ?? record.id, record.observedAt ?? record.createdAt, record)),
    ...commands.map((record) => timelineItem(record, "device_command", record.id, record.title ?? record.commandType ?? record.id, record.executedAt ?? record.requestedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "iot_things", id: thing.id, label: thing.name ?? thing.id },
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    asset: asset ? { id: asset.id, label: asset.serialNumber ?? asset.name ?? asset.id } : null,
    summary: {
      devices: devices.length,
      onlineDevices: devices.filter((record) => record.status === "online").length,
      readings: readings.length,
      commands: commands.length,
      pendingCommands: commands.filter((record) => record.status === "pending_approval" || record.status === "draft").length,
      deviceIds: [...deviceIds],
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      thing,
      company,
      asset,
      devices,
      readings,
      commands,
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
    sourceCollections: ["iot_things", "iot_devices", "sensor_readings", "device_commands", "companies", "assets", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedConstructionProjectTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const projectId = input.positionals[1];
  if (!projectId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const project = store.getRecord(namespaceId, "construction_projects", projectId);
  if (!project) return undefined;

  const company = typeof project.companyId === "string" ? store.getRecord(namespaceId, "companies", project.companyId) : undefined;
  const customerCompany = typeof project.customerCompanyId === "string" ? store.getRecord(namespaceId, "companies", project.customerCompanyId) : undefined;
  const sites = store.listRecords(namespaceId, "construction_sites", { filter: { projectId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const rfis = store.listRecords(namespaceId, "construction_rfis", { filter: { projectId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const changeOrders = store.listRecords(namespaceId, "construction_change_orders", { filter: { projectId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "construction_projects", recordId: projectId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "construction_projects", targetId: projectId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "construction_projects", targetId: projectId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(project, "construction_project", project.id, project.title ?? project.id, project.startAt ?? project.createdAt, project),
    ...(company ? [timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company)] : []),
    ...(customerCompany ? [timelineItem(customerCompany, "customer_company", customerCompany.id, customerCompany.name ?? customerCompany.legalName ?? customerCompany.id, customerCompany.createdAt, customerCompany)] : []),
    ...sites.map((record) => timelineItem(record, "construction_site", record.id, record.name ?? record.id, record.createdAt, record)),
    ...rfis.map((record) => timelineItem(record, "construction_rfi", record.id, record.title ?? record.number ?? record.id, record.answeredAt ?? record.requestedAt ?? record.createdAt, record)),
    ...changeOrders.map((record) => timelineItem(record, "construction_change_order", record.id, record.title ?? record.number ?? record.id, record.approvedAt ?? record.submittedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "construction_projects", id: project.id, label: project.title ?? project.id },
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    customerCompany: customerCompany ? { id: customerCompany.id, label: customerCompany.name ?? customerCompany.legalName ?? customerCompany.id } : null,
    summary: {
      sites: sites.length,
      rfis: rfis.length,
      openRfis: rfis.filter((record) => record.status !== "answered" && record.status !== "closed").length,
      changeOrders: changeOrders.length,
      approvedChangeOrders: changeOrders.filter((record) => record.status === "approved").length,
      changeOrderAmountCents: sumNumericField(changeOrders, "amountCents"),
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      project,
      company,
      customerCompany,
      sites,
      rfis,
      changeOrders,
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
    sourceCollections: ["construction_projects", "construction_sites", "construction_rfis", "construction_change_orders", "companies", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedLearnerTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const learnerId = input.positionals[1];
  if (!learnerId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const learner = store.getRecord(namespaceId, "learners", learnerId);
  if (!learner) return undefined;

  const outgoingRelations = store.listRecords(namespaceId, "entity_relations", { filter: { fromEntityKind: "learners", fromEntityId: learnerId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const incomingRelations = store.listRecords(namespaceId, "entity_relations", { filter: { toEntityKind: "learners", toEntityId: learnerId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const relations = uniqueRecordsById([...outgoingRelations, ...incomingRelations]);
  const relatedCourseIds = new Set<string>();
  for (const relation of relations) {
    if (relation.fromEntityKind === "learners" && relation.fromEntityId === learnerId && relation.toEntityKind === "courses" && typeof relation.toEntityId === "string") relatedCourseIds.add(relation.toEntityId);
    if (relation.toEntityKind === "learners" && relation.toEntityId === learnerId && relation.fromEntityKind === "courses" && typeof relation.fromEntityId === "string") relatedCourseIds.add(relation.fromEntityId);
  }
  const courses = [...relatedCourseIds].flatMap((courseId) => {
    const record = store.getRecord(namespaceId, "courses", courseId);
    return record ? [record] : [];
  });
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "learners", recordId: learnerId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "learners", targetId: learnerId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "learners", targetId: learnerId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(learner, "learner", learner.id, learner.displayName ?? learner.id, learner.startedAt ?? learner.createdAt, learner),
    ...courses.map((record) => timelineItem(record, "course", record.id, record.title ?? record.id, record.startedAt ?? record.completedAt ?? record.createdAt, record)),
    ...relations.map((record) => timelineItem(record, "relation", record.id, relationLabel(record), record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "learners", id: learner.id, label: learner.displayName ?? learner.id },
    summary: {
      courses: courses.length,
      relations: relations.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      learner,
      courses,
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
    sourceCollections: ["learners", "courses", "entity_relations", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedCourseTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const courseId = input.positionals[1];
  if (!courseId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const course = store.getRecord(namespaceId, "courses", courseId);
  if (!course) return undefined;

  const lessons = store.listRecords(namespaceId, "lessons", { filter: { courseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const studySessions = store.listRecords(namespaceId, "study_sessions", { filter: { courseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const outgoingRelations = store.listRecords(namespaceId, "entity_relations", { filter: { fromEntityKind: "courses", fromEntityId: courseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const incomingRelations = store.listRecords(namespaceId, "entity_relations", { filter: { toEntityKind: "courses", toEntityId: courseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const relations = uniqueRecordsById([...outgoingRelations, ...incomingRelations]);
  const relatedLearnerIds = new Set<string>();
  for (const relation of relations) {
    if (relation.fromEntityKind === "courses" && relation.fromEntityId === courseId && relation.toEntityKind === "learners" && typeof relation.toEntityId === "string") relatedLearnerIds.add(relation.toEntityId);
    if (relation.toEntityKind === "courses" && relation.toEntityId === courseId && relation.fromEntityKind === "learners" && typeof relation.fromEntityId === "string") relatedLearnerIds.add(relation.fromEntityId);
  }
  const learners = [...relatedLearnerIds].flatMap((learnerId) => {
    const record = store.getRecord(namespaceId, "learners", learnerId);
    return record ? [record] : [];
  });
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "courses", recordId: courseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "courses", targetId: courseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "courses", targetId: courseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(course, "course", course.id, course.title ?? course.id, course.startedAt ?? course.createdAt, course),
    ...lessons.map((record) => timelineItem(record, "lesson", record.id, record.title ?? record.id, record.createdAt, record)),
    ...studySessions.map((record) => timelineItem(record, "study_session", record.id, record.topic ?? record.id, record.startedAt ?? record.createdAt, record)),
    ...learners.map((record) => timelineItem(record, "learner", record.id, record.displayName ?? record.id, record.startedAt ?? record.createdAt, record)),
    ...relations.map((record) => timelineItem(record, "relation", record.id, relationLabel(record), record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "courses", id: course.id, label: course.title ?? course.id },
    summary: {
      lessons: lessons.length,
      studySessions: studySessions.length,
      learners: learners.length,
      relations: relations.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      course,
      lessons,
      studySessions,
      learners,
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
    sourceCollections: ["courses", "lessons", "study_sessions", "learners", "entity_relations", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedEmployeeTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const employeeId = input.positionals[1];
  if (!employeeId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const employee = store.getRecord(namespaceId, "employees", employeeId);
  if (!employee) return undefined;

  const timeOffRequests = store.listRecords(namespaceId, "time_off_requests", { filter: { employeeId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const performanceReviews = store.listRecords(namespaceId, "performance_reviews", { filter: { employeeId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const payStubs = store.listRecords(namespaceId, "pay_stubs", { filter: { employeeId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const benefits = store.listRecords(namespaceId, "benefits_enrollments", { filter: { employeeId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const managedOneOnOnes = store.listRecords(namespaceId, "one_on_ones", { filter: { managerEmployeeId: employeeId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const reportOneOnOnes = store.listRecords(namespaceId, "one_on_ones", { filter: { reportEmployeeId: employeeId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const oneOnOnes = uniqueRecordsById([...managedOneOnOnes, ...reportOneOnOnes]);
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "employees", recordId: employeeId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "employees", targetId: employeeId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "employees", targetId: employeeId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(employee, "employee", employee.id, employee.displayName ?? employee.email ?? employee.id, employee.hireDate ?? employee.createdAt, employee),
    ...timeOffRequests.map((record) => timelineItem(record, "time_off_request", record.id, record.kind ?? record.id, record.startDate ?? record.createdAt, record)),
    ...performanceReviews.map((record) => timelineItem(record, "performance_review", record.id, record.cycleName ?? record.rating ?? record.id, record.completedAt ?? record.createdAt, record)),
    ...payStubs.map((record) => timelineItem(record, "pay_stub", record.id, record.period ?? record.payrollRunId ?? record.id, record.createdAt, record)),
    ...benefits.map((record) => timelineItem(record, "benefits_enrollment", record.id, record.planId ?? record.id, record.enrolledAt ?? record.effectiveAt ?? record.createdAt, record)),
    ...oneOnOnes.map((record) => timelineItem(record, "one_on_one", record.id, record.notes ?? record.id, record.completedAt ?? record.scheduledAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "employees", id: employee.id, label: employee.displayName ?? employee.email ?? employee.id },
    summary: {
      timeOffRequests: timeOffRequests.length,
      performanceReviews: performanceReviews.length,
      payStubs: payStubs.length,
      benefits: benefits.length,
      oneOnOnes: oneOnOnes.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      employee,
      timeOffRequests,
      performanceReviews,
      payStubs,
      benefits,
      oneOnOnes,
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
    sourceCollections: ["employees", "time_off_requests", "performance_reviews", "pay_stubs", "benefits_enrollments", "one_on_ones", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedErpCompanyOverview(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const companyId = input.positionals[2];
  if (input.positionals[0] !== "erp" || input.positionals[1] !== "company" || input.positionals[3] !== "overview" || !companyId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const company = store.getRecord(namespaceId, "companies", companyId);
  if (!company) return undefined;

  const accounts = store.listRecords(namespaceId, "accounts", { filter: { companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const deals = store.listRecords(namespaceId, "deals", { filter: { companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const billingCustomers = store.listRecords(namespaceId, "billing_customers", { filter: { companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const billingCustomerIds = new Set(billingCustomers.map((record) => record.id));
  const invoices = billingCustomers.flatMap((record) => store.listRecords(namespaceId, "invoices", { filter: { billingCustomerId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items);
  const invoiceIds = new Set(invoices.map((record) => record.id));
  const paymentsByCustomer = billingCustomers.flatMap((record) => store.listRecords(namespaceId, "payment_intents", { filter: { billingCustomerId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items);
  const paymentsByInvoice = invoices.flatMap((record) => store.listRecords(namespaceId, "payment_intents", { filter: { invoiceId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items);
  const payments = uniqueRecordsById([...paymentsByCustomer, ...paymentsByInvoice]);
  const services = store.listRecords(namespaceId, "services", { filter: { companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const workOrders = store.listRecords(namespaceId, "work_orders", { filter: { companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "companies", recordId: companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "companies", targetId: companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "companies", targetId: companyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const invoiceTotalCents = sumNumericField(invoices, "totalCents");
  const paymentTotalCents = sumNumericField(payments, "amountCents");
  const openDealValueCents = sumNumericField(deals.filter((record) => record.status !== "lost"), "valueCents");

  return {
    id: semanticView.id,
    subject: { collectionName: "companies", id: company.id, label: company.name ?? company.legalName ?? company.id },
    summary: {
      accounts: accounts.length,
      deals: deals.length,
      openDealValueCents,
      billingCustomers: billingCustomers.length,
      invoices: invoices.length,
      invoiceTotalCents,
      payments: payments.length,
      paymentTotalCents,
      services: services.length,
      workOrders: workOrders.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    records: {
      company,
      accounts,
      deals,
      billingCustomers,
      invoices,
      payments,
      services,
      workOrders,
      evidence,
      provenance,
    },
    linkedIds: {
      billingCustomerIds: [...billingCustomerIds],
      invoiceIds: [...invoiceIds],
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["companies", "accounts", "deals", "billing_customers", "invoices", "payment_intents", "services", "work_orders", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedInvoiceList(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  if (input.positionals[0] !== "invoice" || input.positionals[1] !== "list") return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });

  const invoices = store.listRecords(namespaceId, "invoices", { limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const billingCustomers = uniqueRecordsById(invoices.flatMap((record): Array<Record<string, unknown>> => {
    if (typeof record.billingCustomerId !== "string") return [];
    const billingCustomer = store.getRecord(namespaceId, "billing_customers", record.billingCustomerId);
    return billingCustomer ? [billingCustomer as Record<string, unknown>] : [];
  }));
  const billingCustomerIds = new Set(billingCustomers.map((record) => record.id));
  const paymentsByInvoice = invoices.flatMap((record) => store.listRecords(namespaceId, "payment_intents", { filter: { invoiceId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items);
  const paymentsByCustomer = billingCustomers.flatMap((record) => store.listRecords(namespaceId, "payment_intents", { filter: { billingCustomerId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items);
  const payments = uniqueRecordsById([...paymentsByInvoice, ...paymentsByCustomer]);
  const evidence = invoices.flatMap((record) => store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "invoices", recordId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items);
  const qualityGaps = invoices.flatMap((record) => store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "invoices", targetId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items);
  const provenance = invoices.flatMap((record) => store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "invoices", targetId: record.id }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items);
  const invoiceTotalCents = sumNumericField(invoices, "totalCents");
  const paymentTotalCents = sumNumericField(payments, "amountCents");
  const items = [
    ...invoices.map((record) => timelineItem(record, "invoice", record.id, record.number ?? record.title ?? record.id, record.issuedAt ?? record.createdAt, record)),
    ...payments.map((record) => timelineItem(record, "payment", record.id, record.status ?? record.id, record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "invoices", id: "all", label: "Invoices" },
    summary: {
      invoices: invoices.length,
      billingCustomers: billingCustomers.length,
      invoiceTotalCents,
      payments: payments.length,
      paymentTotalCents,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      invoices,
      billingCustomers,
      payments,
      evidence,
      provenance,
    },
    linkedIds: {
      billingCustomerIds: [...billingCustomerIds],
    },
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["invoices", "billing_customers", "payment_intents", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}
