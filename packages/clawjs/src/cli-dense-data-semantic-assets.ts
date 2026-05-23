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

export function materializedWorkOrderTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const workOrderId = input.positionals[1];
  if (!workOrderId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const workOrder = store.getRecord(namespaceId, "work_orders", workOrderId);
  if (!workOrder) return undefined;

  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "work_orders", recordId: workOrderId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "work_orders", targetId: workOrderId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "work_orders", targetId: workOrderId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(workOrder, "work_order", workOrder.id, workOrder.title ?? workOrder.id, workOrder.startedAt ?? workOrder.plannedStartAt ?? workOrder.createdAt, workOrder),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "work_orders", id: workOrder.id, label: workOrder.title ?? workOrder.id },
    itemCount: items.length,
    items,
    gaps: qualityGaps.map((record) => ({
      id: record.id,
      label: record.label,
      status: record.status,
      gapKind: record.gapKind,
      severity: record.severity,
      evidenceSourceId: record.evidenceSourceId,
    })),
    sourceCollections: ["work_orders", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedAssetTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const assetId = input.positionals[1];
  if (!assetId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const asset = store.getRecord(namespaceId, "assets", assetId);
  if (!asset) return undefined;

  const company = typeof asset.companyId === "string" ? store.getRecord(namespaceId, "companies", asset.companyId) : undefined;
  const account = typeof asset.accountId === "string" ? store.getRecord(namespaceId, "accounts", asset.accountId) : undefined;
  const product = typeof asset.productCatalogId === "string" ? store.getRecord(namespaceId, "products_catalog", asset.productCatalogId) : undefined;
  const workOrders = store.listRecords(namespaceId, "work_orders", { filter: { assetId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const outgoingRelations = store.listRecords(namespaceId, "entity_relations", { filter: { fromEntityKind: "assets", fromEntityId: assetId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const incomingRelations = store.listRecords(namespaceId, "entity_relations", { filter: { toEntityKind: "assets", toEntityId: assetId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const relations = uniqueRecordsById([...outgoingRelations, ...incomingRelations]);
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "assets", recordId: assetId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "assets", targetId: assetId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "assets", targetId: assetId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(asset, "asset", asset.id, asset.serialNumber ?? asset.id, asset.purchaseDate ?? asset.createdAt, asset),
    ...(company ? [timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company)] : []),
    ...(account ? [timelineItem(account, "account", account.id, account.name ?? account.id, account.createdAt, account)] : []),
    ...(product ? [timelineItem(product, "product", product.id, product.name ?? product.id, product.createdAt, product)] : []),
    ...workOrders.map((record) => timelineItem(record, "work_order", record.id, record.title ?? record.id, record.startedAt ?? record.plannedStartAt ?? record.createdAt, record)),
    ...relations.map((record) => timelineItem(record, "relation", record.id, relationLabel(record), record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "assets", id: asset.id, label: asset.serialNumber ?? asset.id },
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    account: account ? { id: account.id, label: account.name ?? account.id } : null,
    product: product ? { id: product.id, label: product.name ?? product.id } : null,
    summary: {
      workOrders: workOrders.length,
      relations: relations.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      asset,
      company,
      account,
      product,
      workOrders,
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
    sourceCollections: ["assets", "companies", "accounts", "products_catalog", "work_orders", "entity_relations", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedPropertyTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const propertyId = input.positionals[1];
  if (!propertyId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const property = store.getRecord(namespaceId, "property_listings", propertyId);
  if (!property) return undefined;

  const visits = store.listRecords(namespaceId, "property_visits", { filter: { propertyListingId: propertyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const offers = store.listRecords(namespaceId, "property_offers", { filter: { propertyListingId: propertyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const inspections = store.listRecords(namespaceId, "property_inspections", { filter: { propertyListingId: propertyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "property_listings", recordId: propertyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "property_listings", targetId: propertyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "property_listings", targetId: propertyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(property, "property", property.id, property.title ?? property.address ?? property.id, property.createdAt, property),
    ...visits.map((record) => timelineItem(record, "property_visit", record.id, record.visitorName ?? record.id, record.visitedAt ?? record.createdAt, record)),
    ...offers.map((record) => timelineItem(record, "property_offer", record.id, record.buyerName ?? record.amountCents ?? record.id, record.offeredAt ?? record.createdAt, record)),
    ...inspections.map((record) => timelineItem(record, "property_inspection", record.id, record.inspectorName ?? record.id, record.inspectedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "property_listings", id: property.id, label: property.title ?? property.address ?? property.id },
    summary: {
      visits: visits.length,
      offers: offers.length,
      inspections: inspections.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      property,
      visits,
      offers,
      inspections,
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
    sourceCollections: ["property_listings", "property_visits", "property_offers", "property_inspections", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedInsurancePolicyTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const policyId = input.positionals[1];
  if (!policyId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const policy = store.getRecord(namespaceId, "insurance_policies", policyId);
  if (!policy) return undefined;

  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "insurance_policies", recordId: policyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const receipts = store.listRecords(namespaceId, "important_receipts", { limit: DENSE_SEMANTIC_VIEW_LIMIT }).items.filter((record) => {
    const tags = Array.isArray(record.tags) ? record.tags : [];
    return tags.includes("insurance") && tags.includes(policyId);
  });
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "insurance_policies", targetId: policyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "insurance_policies", targetId: policyId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(policy, "insurance_policy", policy.id, policy.title ?? policy.policyNumber ?? policy.id, policy.startedAt ?? policy.createdAt, policy),
    ...receipts.map((record) => timelineItem(record, "receipt", record.id, record.title ?? record.vendor ?? record.id, record.issuedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "insurance_policies", id: policy.id, label: policy.title ?? policy.policyNumber ?? policy.id },
    summary: {
      receipts: receipts.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      policy,
      receipts,
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
    sourceCollections: ["insurance_policies", "important_receipts", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedVehicleTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const vehicleId = input.positionals[1];
  if (!vehicleId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const vehicle = store.getRecord(namespaceId, "vehicles", vehicleId);
  if (!vehicle) return undefined;

  const maintenanceRecords = store.listRecords(namespaceId, "vehicle_maintenance", { filter: { vehicleId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const insurancePolicies = store.listRecords(namespaceId, "vehicle_insurance_policies", { filter: { vehicleId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "vehicles", recordId: vehicleId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "vehicles", targetId: vehicleId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "vehicles", targetId: vehicleId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(vehicle, "vehicle", vehicle.id, vehicle.name ?? vehicle.plate ?? vehicle.id, vehicle.createdAt, vehicle),
    ...maintenanceRecords.map((record) => timelineItem(record, "vehicle_maintenance", record.id, record.title ?? record.id, record.performedAt ?? record.createdAt, record)),
    ...insurancePolicies.map((record) => timelineItem(record, "vehicle_insurance_policy", record.id, record.policyNumber ?? record.provider ?? record.id, record.startedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "vehicles", id: vehicle.id, label: vehicle.name ?? vehicle.plate ?? vehicle.id },
    summary: {
      maintenanceRecords: maintenanceRecords.length,
      insurancePolicies: insurancePolicies.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      vehicle,
      maintenanceRecords,
      insurancePolicies,
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
    sourceCollections: ["vehicles", "vehicle_maintenance", "vehicle_insurance_policies", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedPurchaseOrderTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const purchaseOrderId = input.positionals[1];
  if (!purchaseOrderId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const purchaseOrder = store.getRecord(namespaceId, "purchase_orders", purchaseOrderId);
  if (!purchaseOrder) return undefined;

  const supplier = typeof purchaseOrder.supplierId === "string" ? store.getRecord(namespaceId, "suppliers", purchaseOrder.supplierId) : undefined;
  const company = typeof purchaseOrder.companyId === "string" ? store.getRecord(namespaceId, "companies", purchaseOrder.companyId) : undefined;
  const lineItems = store.listRecords(namespaceId, "purchase_order_line_items", { filter: { purchaseOrderId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "purchase_orders", recordId: purchaseOrderId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "purchase_orders", targetId: purchaseOrderId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "purchase_orders", targetId: purchaseOrderId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(purchaseOrder, "purchase_order", purchaseOrder.id, purchaseOrder.number ?? purchaseOrder.id, purchaseOrder.orderedAt ?? purchaseOrder.createdAt, purchaseOrder),
    ...(supplier ? [timelineItem(supplier, "supplier", supplier.id, supplier.name ?? supplier.id, supplier.createdAt, supplier)] : []),
    ...(company ? [timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company)] : []),
    ...lineItems.map((record) => timelineItem(record, "purchase_order_line_item", record.id, record.description ?? record.id, record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "purchase_orders", id: purchaseOrder.id, label: purchaseOrder.number ?? purchaseOrder.id },
    supplier: supplier ? { id: supplier.id, label: supplier.name ?? supplier.id } : null,
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    summary: {
      lineItems: lineItems.length,
      receivedLineItems: lineItems.filter((record) => record.status === "received").length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      purchaseOrder,
      supplier,
      company,
      lineItems,
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
    sourceCollections: ["purchase_orders", "suppliers", "companies", "purchase_order_line_items", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedWarehouseTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const warehouseId = input.positionals[1];
  if (!warehouseId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const warehouse = store.getRecord(namespaceId, "warehouses", warehouseId);
  if (!warehouse) return undefined;

  const company = typeof warehouse.companyId === "string" ? store.getRecord(namespaceId, "companies", warehouse.companyId) : undefined;
  const inventoryItems = store.listRecords(namespaceId, "inventory_items", { filter: { warehouseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const stockMovements = store.listRecords(namespaceId, "stock_movements", { filter: { warehouseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const productIds = new Set(inventoryItems.map((record) => record.productCatalogId).filter((value): value is string => typeof value === "string"));
  const products = [...productIds].flatMap((productId) => {
    const product = store.getRecord(namespaceId, "products_catalog", productId);
    return product ? [product] : [];
  });
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "warehouses", recordId: warehouseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "warehouses", targetId: warehouseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "warehouses", targetId: warehouseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(warehouse, "warehouse", warehouse.id, warehouse.name ?? warehouse.code ?? warehouse.id, warehouse.createdAt, warehouse),
    ...(company ? [timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company)] : []),
    ...inventoryItems.map((record) => timelineItem(record, "inventory_item", record.id, record.name ?? record.sku ?? record.id, record.createdAt, record)),
    ...stockMovements.map((record) => timelineItem(record, "stock_movement", record.id, record.title ?? record.movementType ?? record.id, record.occurredAt ?? record.createdAt, record)),
    ...products.map((record) => timelineItem(record, "product", record.id, record.name ?? record.id, record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "warehouses", id: warehouse.id, label: warehouse.name ?? warehouse.code ?? warehouse.id },
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    summary: {
      inventoryItems: inventoryItems.length,
      stockMovements: stockMovements.length,
      products: products.length,
      quantityOnHand: sumNumericField(inventoryItems, "quantityOnHand"),
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      warehouse,
      company,
      inventoryItems,
      stockMovements,
      products,
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
    sourceCollections: ["warehouses", "companies", "inventory_items", "stock_movements", "products_catalog", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedSupplyPlanTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const supplyPlanId = input.positionals[1];
  if (!supplyPlanId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const supplyPlan = store.getRecord(namespaceId, "supply_plans", supplyPlanId);
  if (!supplyPlan) return undefined;

  const company = typeof supplyPlan.companyId === "string" ? store.getRecord(namespaceId, "companies", supplyPlan.companyId) : undefined;
  const items = store.listRecords(namespaceId, "supply_plan_items", { filter: { supplyPlanId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const risks = store.listRecords(namespaceId, "supply_risks", { filter: { supplyPlanId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const supplierIds = new Set<string>([
    ...items.map((record) => record.supplierId),
    ...risks.map((record) => record.supplierId),
  ].filter((value): value is string => typeof value === "string"));
  const purchaseOrderIds = new Set<string>([
    ...items.map((record) => record.purchaseOrderId),
    ...risks.map((record) => record.purchaseOrderId),
  ].filter((value): value is string => typeof value === "string"));
  const warehouseIds = new Set<string>([
    ...items.map((record) => record.warehouseId),
    ...risks.map((record) => record.warehouseId),
  ].filter((value): value is string => typeof value === "string"));
  const inventoryItemIds = new Set<string>([
    ...items.map((record) => record.inventoryItemId),
    ...risks.map((record) => record.inventoryItemId),
  ].filter((value): value is string => typeof value === "string"));
  const productIds = new Set<string>(items.map((record) => record.productCatalogId).filter((value): value is string => typeof value === "string"));
  const suppliers = [...supplierIds].flatMap((supplierId) => {
    const record = store.getRecord(namespaceId, "suppliers", supplierId);
    return record ? [record] : [];
  });
  const purchaseOrders = [...purchaseOrderIds].flatMap((purchaseOrderId) => {
    const record = store.getRecord(namespaceId, "purchase_orders", purchaseOrderId);
    return record ? [record] : [];
  });
  const warehouses = [...warehouseIds].flatMap((warehouseId) => {
    const record = store.getRecord(namespaceId, "warehouses", warehouseId);
    return record ? [record] : [];
  });
  const inventoryItems = [...inventoryItemIds].flatMap((inventoryItemId) => {
    const record = store.getRecord(namespaceId, "inventory_items", inventoryItemId);
    return record ? [record] : [];
  });
  const products = [...productIds].flatMap((productId) => {
    const record = store.getRecord(namespaceId, "products_catalog", productId);
    return record ? [record] : [];
  });
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "supply_plans", recordId: supplyPlanId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "supply_plans", targetId: supplyPlanId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "supply_plans", targetId: supplyPlanId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const timelineItems = [
    timelineItem(supplyPlan, "supply_plan", supplyPlan.id, supplyPlan.title ?? supplyPlan.id, supplyPlan.horizonStartAt ?? supplyPlan.createdAt, supplyPlan),
    ...(company ? [timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company)] : []),
    ...items.map((record) => timelineItem(record, "supply_plan_item", record.id, record.title ?? record.id, record.neededBy ?? record.createdAt, record)),
    ...risks.map((record) => timelineItem(record, "supply_risk", record.id, record.title ?? record.riskType ?? record.id, record.identifiedAt ?? record.createdAt, record)),
    ...suppliers.map((record) => timelineItem(record, "supplier", record.id, record.name ?? record.id, record.createdAt, record)),
    ...purchaseOrders.map((record) => timelineItem(record, "purchase_order", record.id, record.number ?? record.id, record.orderedAt ?? record.createdAt, record)),
    ...warehouses.map((record) => timelineItem(record, "warehouse", record.id, record.name ?? record.code ?? record.id, record.createdAt, record)),
    ...inventoryItems.map((record) => timelineItem(record, "inventory_item", record.id, record.name ?? record.sku ?? record.id, record.createdAt, record)),
    ...products.map((record) => timelineItem(record, "product", record.id, record.name ?? record.id, record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "supply_plans", id: supplyPlan.id, label: supplyPlan.title ?? supplyPlan.id },
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    summary: {
      items: items.length,
      risks: risks.length,
      openRisks: risks.filter((record) => record.status !== "resolved" && record.status !== "accepted").length,
      suppliers: suppliers.length,
      purchaseOrders: purchaseOrders.length,
      warehouses: warehouses.length,
      inventoryItems: inventoryItems.length,
      products: products.length,
      quantityRequired: sumNumericField(items, "quantityRequired"),
      quantityAvailable: sumNumericField(items, "quantityAvailable"),
      quantityGap: sumNumericField(items, "quantityGap"),
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: timelineItems.length,
    items: timelineItems,
    records: {
      supplyPlan,
      company,
      items,
      risks,
      suppliers,
      purchaseOrders,
      warehouses,
      inventoryItems,
      products,
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
    sourceCollections: ["supply_plans", "supply_plan_items", "supply_risks", "companies", "suppliers", "purchase_orders", "warehouses", "inventory_items", "products_catalog", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedShipmentTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const shipmentId = input.positionals[1];
  if (!shipmentId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const shipment = store.getRecord(namespaceId, "shipments", shipmentId);
  if (!shipment) return undefined;

  const legs = store.listRecords(namespaceId, "shipment_legs", { filter: { shipmentId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const carrier = typeof shipment.carrierId === "string" ? store.getRecord(namespaceId, "carriers", shipment.carrierId) : undefined;
  const purchaseOrder = typeof shipment.purchaseOrderId === "string" ? store.getRecord(namespaceId, "purchase_orders", shipment.purchaseOrderId) : undefined;
  const warehouse = typeof shipment.warehouseId === "string" ? store.getRecord(namespaceId, "warehouses", shipment.warehouseId) : undefined;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "shipments", recordId: shipmentId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "shipments", targetId: shipmentId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "shipments", targetId: shipmentId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(shipment, "shipment", shipment.id, shipment.title ?? shipment.trackingNumber ?? shipment.id, shipment.shippedAt ?? shipment.plannedShipAt ?? shipment.createdAt, shipment),
    ...(carrier ? [timelineItem(carrier, "carrier", carrier.id, carrier.name ?? carrier.id, carrier.createdAt, carrier)] : []),
    ...(purchaseOrder ? [timelineItem(purchaseOrder, "purchase_order", purchaseOrder.id, purchaseOrder.number ?? purchaseOrder.id, purchaseOrder.orderedAt ?? purchaseOrder.createdAt, purchaseOrder)] : []),
    ...(warehouse ? [timelineItem(warehouse, "warehouse", warehouse.id, warehouse.name ?? warehouse.id, warehouse.createdAt, warehouse)] : []),
    ...legs.map((record) => timelineItem(record, "shipment_leg", record.id, record.title ?? record.trackingNumber ?? record.id, record.actualDepartAt ?? record.plannedDepartAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "shipments", id: shipment.id, label: shipment.title ?? shipment.trackingNumber ?? shipment.id },
    summary: {
      legs: legs.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
      hasCarrier: Boolean(carrier),
      hasPurchaseOrder: Boolean(purchaseOrder),
      hasWarehouse: Boolean(warehouse),
    },
    itemCount: items.length,
    items,
    records: {
      shipment,
      carrier,
      purchaseOrder,
      warehouse,
      legs,
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
    sourceCollections: ["shipments", "shipment_legs", "carriers", "purchase_orders", "warehouses", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedControlTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const controlId = input.positionals[1];
  if (!controlId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const control = store.getRecord(namespaceId, "compliance_controls", controlId);
  if (!control) return undefined;

  const company = typeof control.companyId === "string" ? store.getRecord(namespaceId, "companies", control.companyId) : undefined;
  const obligation = typeof control.obligationId === "string" ? store.getRecord(namespaceId, "compliance_obligations", control.obligationId) : undefined;
  const assessments = store.listRecords(namespaceId, "control_assessments", { filter: { controlId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const findings = store.listRecords(namespaceId, "compliance_findings", { filter: { controlId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "compliance_controls", recordId: controlId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "compliance_controls", targetId: controlId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "compliance_controls", targetId: controlId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(control, "control", control.id, control.title ?? control.controlKey ?? control.id, control.createdAt, control),
    ...(company ? [timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company)] : []),
    ...(obligation ? [timelineItem(obligation, "obligation", obligation.id, obligation.title ?? obligation.reference ?? obligation.id, obligation.effectiveAt ?? obligation.createdAt, obligation)] : []),
    ...assessments.map((record) => timelineItem(record, "control_assessment", record.id, record.title ?? record.result ?? record.id, record.assessedAt ?? record.createdAt, record)),
    ...findings.map((record) => timelineItem(record, "compliance_finding", record.id, record.title ?? record.severity ?? record.id, record.identifiedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "compliance_controls", id: control.id, label: control.title ?? control.controlKey ?? control.id },
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    obligation: obligation ? { id: obligation.id, label: obligation.title ?? obligation.reference ?? obligation.id } : null,
    summary: {
      assessments: assessments.length,
      passedAssessments: assessments.filter((record) => record.result === "pass").length,
      failedAssessments: assessments.filter((record) => record.result === "fail").length,
      findings: findings.length,
      openFindings: findings.filter((record) => record.status !== "closed" && record.status !== "accepted").length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
    },
    itemCount: items.length,
    items,
    records: {
      control,
      company,
      obligation,
      assessments,
      findings,
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
    sourceCollections: ["compliance_controls", "compliance_obligations", "control_assessments", "compliance_findings", "companies", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}

export function materializedPublicCaseTimeline(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  const publicCaseId = input.positionals[1];
  if (!publicCaseId) return undefined;
  const namespaceId = input.flags.namespace ?? "main";
  const store = openProfessionalRecordsStore(input.workspaceRoot);
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });
  const publicCase = store.getRecord(namespaceId, "public_cases", publicCaseId);
  if (!publicCase) return undefined;

  const agency = typeof publicCase.agencyId === "string" ? store.getRecord(namespaceId, "agencies", publicCase.agencyId) : undefined;
  const company = typeof publicCase.companyId === "string" ? store.getRecord(namespaceId, "companies", publicCase.companyId) : undefined;
  const person = typeof publicCase.personId === "string" ? store.getRecord(namespaceId, "people", publicCase.personId) : undefined;
  const permits = store.listRecords(namespaceId, "permits", { filter: { publicCaseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const filings = store.listRecords(namespaceId, "public_filings", { filter: { publicCaseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const evidence = store.listRecords(namespaceId, "evidence_sources", { filter: { collectionName: "public_cases", recordId: publicCaseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const qualityGaps = store.listRecords(namespaceId, "quality_gaps", { filter: { targetCollection: "public_cases", targetId: publicCaseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const provenance = store.listRecords(namespaceId, "provenance_events", { filter: { targetCollection: "public_cases", targetId: publicCaseId }, limit: DENSE_SEMANTIC_VIEW_LIMIT }).items;
  const items = [
    timelineItem(publicCase, "public_case", publicCase.id, publicCase.title ?? publicCase.caseNumber ?? publicCase.id, publicCase.openedAt ?? publicCase.submittedAt ?? publicCase.createdAt, publicCase),
    ...(agency ? [timelineItem(agency, "agency", agency.id, agency.name ?? agency.id, agency.createdAt, agency)] : []),
    ...(company ? [timelineItem(company, "company", company.id, company.name ?? company.legalName ?? company.id, company.createdAt, company)] : []),
    ...(person ? [timelineItem(person, "person", person.id, personLabel(person), person.createdAt, person)] : []),
    ...permits.map((record) => timelineItem(record, "permit", record.id, record.title ?? record.permitNumber ?? record.id, record.issuedAt ?? record.effectiveAt ?? record.createdAt, record)),
    ...filings.map((record) => timelineItem(record, "public_filing", record.id, record.title ?? record.filingNumber ?? record.id, record.submittedAt ?? record.createdAt, record)),
    ...evidence.map((record) => timelineItem(record, "evidence", record.id, record.label ?? record.id, record.capturedAt ?? record.createdAt, record)),
    ...qualityGaps.map((record) => timelineItem(record, "quality_gap", record.id, record.label ?? record.id, record.createdAt, record)),
    ...provenance.map((record) => timelineItem(record, "provenance", record.id, record.eventType ?? record.id, record.occurredAt ?? record.createdAt, record)),
  ].sort((left, right) => String(left.occurredAt).localeCompare(String(right.occurredAt)));

  return {
    id: semanticView.id,
    subject: { collectionName: "public_cases", id: publicCase.id, label: publicCase.title ?? publicCase.caseNumber ?? publicCase.id },
    agency: agency ? { id: agency.id, label: agency.name ?? agency.id } : null,
    company: company ? { id: company.id, label: company.name ?? company.legalName ?? company.id } : null,
    person: person ? { id: person.id, label: personLabel(person) } : null,
    summary: {
      permits: permits.length,
      filings: filings.length,
      evidenceSources: evidence.length,
      qualityGaps: qualityGaps.length,
      hasAgency: Boolean(agency),
      hasCompany: Boolean(company),
      hasPerson: Boolean(person),
    },
    itemCount: items.length,
    items,
    records: {
      publicCase,
      agency,
      company,
      person,
      permits,
      filings,
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
    sourceCollections: ["public_cases", "agencies", "companies", "people", "permits", "public_filings", "evidence_sources", "quality_gaps", "provenance_events"],
    partial: qualityGaps.length > 0,
    intentStatus: intent.status,
  };
}
