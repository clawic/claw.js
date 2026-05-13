import {
  BASE,
  baseBodyFields,
  fieldBodyFields,
  spec,
  stringField,
  tableBodyFields,
  type AirtableOperationSpec,
} from "./airtable-operation-core.ts";

const TABLE_ID = stringField("tableId", { default: "tblTable123" });
const FIELD_ID = stringField("fieldId", { default: "fldField123" });

export const AIRTABLE_METADATA_ACTION_SPECS = [
  spec("list-bases", "GET", "v0/meta/bases", [], {
    requiredPaths: ["bases"],
  }),
  spec("get-base-schema", "GET", "v0/meta/bases/{baseId}/tables", BASE, {
    requiredPaths: ["tables"],
  }),
  spec("create-base", "POST", "v0/meta/bases", baseBodyFields(), {
    body: ["name", "workspaceId", "tables"],
    requiredPaths: ["id", "name", "tables"],
  }),
  spec("create-table", "POST", "v0/meta/bases/{baseId}/tables", [...BASE, ...tableBodyFields()], {
    body: ["name", "description", "fields"],
    requiredPaths: ["id", "name", "fields"],
  }),
  spec("update-table", "PATCH", "v0/meta/bases/{baseId}/tables/{tableId}", [...BASE, TABLE_ID, ...tableBodyFields({ optional: true })], {
    body: ["name", "description", "fields"],
    requiredPaths: ["id", "name"],
  }),
  spec("create-field", "POST", "v0/meta/bases/{baseId}/tables/{tableId}/fields", [...BASE, TABLE_ID, ...fieldBodyFields()], {
    body: ["name", "type", "description", "options"],
    requiredPaths: ["id", "name", "type"],
  }),
  spec("update-field", "PATCH", "v0/meta/bases/{baseId}/tables/{tableId}/fields/{fieldId}", [...BASE, TABLE_ID, FIELD_ID, ...fieldBodyFields({ optional: true })], {
    body: ["name", "type", "description", "options"],
    requiredPaths: ["id", "name", "type"],
  }),
] as const satisfies readonly AirtableOperationSpec[];
