export type BuiltinFieldType =
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

export type BuiltinBarcodeKind = "isbn10" | "isbn13" | "ean13" | "upc12" | "qr_text" | "generic";

export type BuiltinDurationDisplayUnit = "second" | "minute" | "hour" | "day";

export interface BuiltinRelationDefinition {
  collectionName: string;
}

export interface BuiltinFieldDefinition {
  name: string;
  type: BuiltinFieldType;
  required?: boolean;
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

export type BuiltinCollectionRule =
  | { kind: "compare_dates"; left: string; op: "<" | "<=" | "==" | ">=" | ">"; right: string; message?: string }
  | { kind: "required_if"; field: string; whenField: string; whenEquals: unknown; message?: string }
  | { kind: "number_compare"; left: string; op: "<" | "<=" | "==" | ">=" | ">"; right: string | number; message?: string }
  | { kind: "regex"; field: string; pattern: string; message?: string };

export interface BuiltinCollectionDefinition {
  name: string;
  displayName: string;
  family: string;
  aliases: string[];
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
