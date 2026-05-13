import {
  booleanField,
  COMMENT,
  RECORD,
  recordBodyFields,
  RECORD_LIST_FIELDS,
  spec,
  TABLE,
  type AirtableOperationSpec,
} from "./airtable-operation-core.ts";

const ARRAY_QUERY = {
  fields: { style: "form", explode: true },
  records: { style: "form", explode: true },
  sort: { style: "form", explode: true },
} as const;

export const AIRTABLE_RECORD_ACTION_SPECS = [
  spec("list-records", "GET", "v0/{baseId}/{tableIdOrName}", RECORD_LIST_FIELDS, {
    query: ["pageSize", "offset", "view", "fields", "filterByFormula", "sort", "cellFormat", "timeZone", "userLocale", "returnFieldsByFieldId"],
    querySerialization: ARRAY_QUERY,
    requiredPaths: ["records"],
    paginateRecords: true,
  }),
  spec("get-record", "GET", "v0/{baseId}/{tableIdOrName}/{recordId}", [
    ...RECORD,
    booleanField("returnFieldsByFieldId", { optional: true, default: false }),
  ], {
    query: ["returnFieldsByFieldId"],
    requiredPaths: ["id", "fields"],
  }),
  spec("create-record", "POST", "v0/{baseId}/{tableIdOrName}", [...TABLE, ...recordBodyFields()], {
    body: ["fields", "typecast", "returnFieldsByFieldId"],
    requiredPaths: ["id", "fields"],
  }),
  spec("create-records", "POST", "v0/{baseId}/{tableIdOrName}", [...TABLE, ...recordBodyFields({ bulk: true })], {
    body: ["records", "typecast", "returnFieldsByFieldId"],
    requiredPaths: ["records"],
  }),
  spec("update-record", "PATCH", "v0/{baseId}/{tableIdOrName}/{recordId}", [...RECORD, ...recordBodyFields({ optionalFields: true })], {
    body: ["fields", "typecast", "returnFieldsByFieldId"],
    requiredPaths: ["id", "fields"],
  }),
  spec("replace-record", "PUT", "v0/{baseId}/{tableIdOrName}/{recordId}", [...RECORD, ...recordBodyFields()], {
    body: ["fields", "typecast", "returnFieldsByFieldId"],
    requiredPaths: ["id", "fields"],
  }),
  spec("update-records", "PATCH", "v0/{baseId}/{tableIdOrName}", [...TABLE, ...recordBodyFields({ bulk: true })], {
    body: ["records", "typecast", "returnFieldsByFieldId"],
    requiredPaths: ["records"],
  }),
  spec("replace-records", "PUT", "v0/{baseId}/{tableIdOrName}", [...TABLE, ...recordBodyFields({ bulk: true })], {
    body: ["records", "typecast", "returnFieldsByFieldId"],
    requiredPaths: ["records"],
  }),
  spec("delete-record", "DELETE", "v0/{baseId}/{tableIdOrName}/{recordId}", RECORD, {
    requiredPaths: ["id", "deleted"],
  }),
  spec("delete-records", "DELETE", "v0/{baseId}/{tableIdOrName}", [
    ...TABLE,
    { name: "records", type: "array", optional: false, default: ["recRecord123"] },
  ], {
    query: ["records"],
    querySerialization: ARRAY_QUERY,
    requiredPaths: ["records"],
  }),
  spec("list-record-comments", "GET", "v0/{baseId}/{tableIdOrName}/{recordId}/comments", RECORD, {
    requiredPaths: ["comments"],
  }),
  spec("create-record-comment", "POST", "v0/{baseId}/{tableIdOrName}/{recordId}/comments", [
    ...RECORD,
    { name: "text", type: "string", optional: false, default: "Looks good" },
  ], {
    body: ["text"],
    requiredPaths: ["id", "text"],
  }),
  spec("update-record-comment", "PATCH", "v0/{baseId}/{tableIdOrName}/{recordId}/comments/{commentId}", [
    ...COMMENT,
    { name: "text", type: "string", optional: false, default: "Updated comment" },
  ], {
    body: ["text"],
    requiredPaths: ["id", "text"],
  }),
  spec("delete-record-comment", "DELETE", "v0/{baseId}/{tableIdOrName}/{recordId}/comments/{commentId}", COMMENT, {
    requiredPaths: ["id", "deleted"],
  }),
] as const satisfies readonly AirtableOperationSpec[];
