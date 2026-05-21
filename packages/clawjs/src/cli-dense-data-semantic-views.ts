import type { DenseSemanticViewEntry, ProfessionalRecordsCliInput, ProfessionalRecordsIntent } from "./cli-dense-data-semantic-common.ts";
import {
  materializedCaseEvidence,
  materializedCaseTimeline,
  materializedExperimentTimeline,
  materializedLabNotebookTimeline,
  materializedPatientMedications,
  materializedPatientTimeline,
  materializedSampleTimeline,
  materializedServiceTimeline,
  materializedStudyCohort,
  materializedStudyTimeline,
} from "./cli-dense-data-semantic-health.ts";
import {
  materializedAssetTimeline,
  materializedControlTimeline,
  materializedInsurancePolicyTimeline,
  materializedPropertyTimeline,
  materializedPublicCaseTimeline,
  materializedPurchaseOrderTimeline,
  materializedShipmentTimeline,
  materializedSupplyPlanTimeline,
  materializedVehicleTimeline,
  materializedWarehouseTimeline,
  materializedWorkOrderTimeline,
} from "./cli-dense-data-semantic-assets.ts";
import {
  materializedConstructionProjectTimeline,
  materializedContentEntryTimeline,
  materializedCourseTimeline,
  materializedDrugProductTimeline,
  materializedEmployeeTimeline,
  materializedErpCompanyOverview,
  materializedInvoiceList,
  materializedIotDeviceTimeline,
  materializedLearnerTimeline,
  materializedProductSpecTimeline,
} from "./cli-dense-data-semantic-products.ts";
import {
  materializedCompanyTimeline,
  materializedCrmAccountOverview,
  materializedFinanceEntityOverview,
} from "./cli-dense-data-semantic-company.ts";

export function materializedSemanticViewForIntent(
  input: ProfessionalRecordsCliInput,
  intent: ProfessionalRecordsIntent,
  semanticView: DenseSemanticViewEntry,
) {
  if (semanticView.id === "patient.timeline") return materializedPatientTimeline(input, intent, semanticView);
  if (semanticView.id === "patient.medications") return materializedPatientMedications(input, intent, semanticView);
  if (semanticView.id === "case.timeline") return materializedCaseTimeline(input, intent, semanticView);
  if (semanticView.id === "case.evidence") return materializedCaseEvidence(input, intent, semanticView);
  if (semanticView.id === "service.timeline") return materializedServiceTimeline(input, intent, semanticView);
  if (semanticView.id === "study.timeline") return materializedStudyTimeline(input, intent, semanticView);
  if (semanticView.id === "study.cohort") return materializedStudyCohort(input, intent, semanticView);
  if (semanticView.id === "sample.timeline") return materializedSampleTimeline(input, intent, semanticView);
  if (semanticView.id === "experiment.timeline") return materializedExperimentTimeline(input, intent, semanticView);
  if (semanticView.id === "lab_notebook.timeline") return materializedLabNotebookTimeline(input, intent, semanticView);
  if (semanticView.id === "work_order.timeline") return materializedWorkOrderTimeline(input, intent, semanticView);
  if (semanticView.id === "company.timeline") return materializedCompanyTimeline(input, intent, semanticView);
  if (semanticView.id === "erp.company.overview") return materializedErpCompanyOverview(input, intent, semanticView);
  if (semanticView.id === "invoice.list") return materializedInvoiceList(input, intent, semanticView);
  if (semanticView.id === "crm.account.overview") return materializedCrmAccountOverview(input, intent, semanticView);
  if (semanticView.id === "finance.entity.overview") return materializedFinanceEntityOverview(input, intent, semanticView);
  if (semanticView.id === "learner.timeline") return materializedLearnerTimeline(input, intent, semanticView);
  if (semanticView.id === "course.timeline") return materializedCourseTimeline(input, intent, semanticView);
  if (semanticView.id === "employee.timeline") return materializedEmployeeTimeline(input, intent, semanticView);
  if (semanticView.id === "asset.timeline") return materializedAssetTimeline(input, intent, semanticView);
  if (semanticView.id === "property.timeline") return materializedPropertyTimeline(input, intent, semanticView);
  if (semanticView.id === "insurance_policy.timeline") return materializedInsurancePolicyTimeline(input, intent, semanticView);
  if (semanticView.id === "vehicle.timeline") return materializedVehicleTimeline(input, intent, semanticView);
  if (semanticView.id === "purchase_order.timeline") return materializedPurchaseOrderTimeline(input, intent, semanticView);
  if (semanticView.id === "warehouse.timeline") return materializedWarehouseTimeline(input, intent, semanticView);
  if (semanticView.id === "supply_plan.timeline") return materializedSupplyPlanTimeline(input, intent, semanticView);
  if (semanticView.id === "shipment.timeline") return materializedShipmentTimeline(input, intent, semanticView);
  if (semanticView.id === "control.timeline") return materializedControlTimeline(input, intent, semanticView);
  if (semanticView.id === "public_case.timeline") return materializedPublicCaseTimeline(input, intent, semanticView);
  if (semanticView.id === "product_spec.timeline") return materializedProductSpecTimeline(input, intent, semanticView);
  if (semanticView.id === "drug_product.timeline") return materializedDrugProductTimeline(input, intent, semanticView);
  if (semanticView.id === "content_entry.timeline") return materializedContentEntryTimeline(input, intent, semanticView);
  if (semanticView.id === "thing.timeline") return materializedIotDeviceTimeline(input, intent, semanticView);
  if (semanticView.id === "construction_project.timeline") return materializedConstructionProjectTimeline(input, intent, semanticView);
  return undefined;
}
