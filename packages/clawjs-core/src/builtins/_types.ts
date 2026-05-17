type BuiltinFieldType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "json"
  | "select"
  | "relation"
  | "file"
  | "email"
  | "url"
  | "money"
  | "currency"
  | "address"
  | "phone"
  | "geo_point"
  | "rating"
  | "duration"
  | "percent"
  | "markdown"
  | "color_hex"
  | "barcode";

type BuiltinBarcodeKind = "isbn10" | "isbn13" | "ean13" | "upc12" | "qr_text" | "generic";

type BuiltinDurationDisplayUnit = "second" | "minute" | "hour" | "day";

export type BuiltinCatalogEvidenceTag =
  | "human_recognizable"
  | "market_validated"
  | "multi_domain_reuse"
  | "agent_useful";

export type BuiltinRelationKind =
  | "ownership"
  | "membership"
  | "participant"
  | "line_item"
  | "source_import"
  | "attachment"
  | "location"
  | "temporal_event"
  | "financial_transaction"
  | "observation_sample"
  | "dependency"
  | "generic";

export type BuiltinRequiredFieldReason =
  | "identity"
  | "integrity"
  | "lifecycle"
  | "relation_integrity";

export interface BuiltinRelationDefinition {
  collectionName: string;
  kind?: BuiltinRelationKind;
  inverseName?: string;
}

export interface BuiltinFieldDefinition {
  name: string;
  type: BuiltinFieldType;
  aliases?: string[];
  required?: boolean;
  requiredReason?: BuiltinRequiredFieldReason;
  options?: string[];
  relation?: BuiltinRelationDefinition;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  unique?: boolean;
  enumScale?: number;
  barcodeKind?: BuiltinBarcodeKind;
  durationDisplayUnit?: BuiltinDurationDisplayUnit;
}

export interface BuiltinIndexDefinition {
  name: string;
  fields: string[];
  unique?: boolean;
}

type BuiltinCollectionRule =
  | { kind: "compare_dates"; left: string; op: "<" | "<=" | "==" | ">=" | ">"; right: string; message?: string }
  | { kind: "required_if"; field: string; whenField: string; whenEquals: unknown; message?: string }
  | { kind: "number_compare"; left: string; op: "<" | "<=" | "==" | ">=" | ">"; right: string | number; message?: string }
  | { kind: "regex"; field: string; pattern: string; message?: string };

export interface BuiltinCollectionCatalogMetadata {
  purpose: string;
  evidence: BuiltinCatalogEvidenceTag[];
  fieldGuidance?: string;
  relationGuidance?: string;
  notes?: string;
}

export interface BuiltinCollectionDefinition {
  name: string;
  displayName: string;
  family: string;
  aliases: string[];
  catalog?: BuiltinCollectionCatalogMetadata;
  fields: BuiltinFieldDefinition[];
  indexes: BuiltinIndexDefinition[];
  rules?: BuiltinCollectionRule[];
}

export interface BuiltinFamilyDefinition {
  name: string;
  displayName: string;
  description: string;
  collections: BuiltinCollectionDefinition[];
}
