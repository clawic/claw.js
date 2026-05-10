import type { BuiltinCollectionDefinition } from "../_types.ts";

export const AUTH_IDENTITY_PROVIDERS: BuiltinCollectionDefinition = {
  name: "auth_identity_providers",
  displayName: "Auth Identity Providers",
  family: "identity",
  aliases: ["idp","auth_identity_provider","auth_identity_providers"],
  fields: [
    { name: "companyId", type: "relation", required: true, relation: { collectionName: "companies" } },
    { name: "type", type: "select", required: true, options: ["SAML","SCIM","OIDC","OAUTH","GOOGLE_WORKSPACE","MICROSOFT_ENTRA"] },
    { name: "issuerEntityId", type: "text" },
    { name: "spEntityId", type: "text" },
    { name: "ssoEndpoint", type: "text" },
    { name: "ssoBinding", type: "select", options: ["POST","Redirect"] },
    { name: "ssoSigningCert", type: "text" },
    { name: "ssoSignAlgo", type: "text" },
    { name: "samlEnabled", type: "boolean" },
    { name: "scimEnabled", type: "boolean" },
    { name: "priority", type: "number" },
    { name: "config", type: "json" },
    { name: "source", type: "json" },
    { name: "links", type: "json" },
    { name: "metadata", type: "json" },
    { name: "archivedAt", type: "date" },
  ],
  indexes: [
    { name: "auth_idp_company_idx", fields: ["companyId"] },
    { name: "auth_idp_type_idx", fields: ["type"] },
  ],
};
