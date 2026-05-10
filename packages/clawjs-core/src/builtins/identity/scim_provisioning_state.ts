import type { BuiltinCollectionDefinition } from "../_types.ts";

export const SCIM_PROVISIONING_STATE: BuiltinCollectionDefinition = {
  name: "scim_provisioning_state",
  displayName: "SCIM Provisioning State",
  family: "identity",
  aliases: ["scim","scim_state","scim_provisioning_state"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "idpId", type: "relation", required: true, relation: { collectionName: "auth_identity_providers" } },
    { name: "directoryId", type: "text" },
    { name: "lastSyncedAt", type: "date" },
    { name: "userCount", type: "number" },
    { name: "groupCount", type: "number" },
    { name: "status", type: "select", options: ["idle","syncing","error","paused"] },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "scim_company_idx", fields: ["companyId"] },
  ],
};
