import type { BuiltinCollectionDefinition } from "../_types.ts";

export const CASE_EVIDENCE: BuiltinCollectionDefinition = {
  name: "case_evidence",
  displayName: "Case Evidence",
  family: "legal",
  aliases: ["case_evidence", "evidence_item", "evidence_items"],
  catalog: {
    purpose: "Evidence item linked to a legal case, including source, custody, confidence, and quality gaps.",
    evidence: ["human_recognizable", "agent_useful"],
    relationGuidance: "Use caseId for the matter anchor and documentId or source fields for underlying files/raw evidence.",
    notes: "This collection records evidence metadata; raw documents remain in document/file collections or sidecar file storage.",
  },
  fields: [
    { name: "caseId", type: "relation", required: true, requiredReason: "relation_integrity", relation: { collectionName: "legal_cases" }, aliases: ["case", "matterId"] },
    { name: "title", type: "text", required: true, requiredReason: "identity", aliases: ["name"] },
    { name: "kind", type: "text" },
    { name: "documentId", type: "relation", relation: { collectionName: "documents" } },
    { name: "source", type: "json" },
    { name: "custody", type: "json" },
    { name: "confidence", type: "number" },
    { name: "observedAt", type: "date" },
    { name: "qualityGaps", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "case_evidence_case_idx", fields: ["caseId"] },
    { name: "case_evidence_title_idx", fields: ["title"] },
  ],
};
