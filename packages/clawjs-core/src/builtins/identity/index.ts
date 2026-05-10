import type { BuiltinFamilyDefinition } from "../_types.ts";

import { ACTORS } from "./actors.ts";
import { EXTERNAL_USERS } from "./external_users.ts";
import { AUTH_IDENTITY_PROVIDERS } from "./auth_identity_providers.ts";
import { SCIM_PROVISIONING_STATE } from "./scim_provisioning_state.ts";
import { API_KEYS } from "./api_keys.ts";
import { OAUTH_APPS } from "./oauth_apps.ts";
import { OAUTH_APP_APPROVALS } from "./oauth_app_approvals.ts";
import { MAGIC_AUTH_TOKENS } from "./magic_auth_tokens.ts";
import { ORGANIZATION_INVITES } from "./organization_invites.ts";
import { ROLES } from "./roles.ts";
import { PROJECT_ROLES } from "./project_roles.ts";
import { ROLE_ASSIGNMENTS } from "./role_assignments.ts";
import { AUDIT_LOG } from "./audit_log.ts";
import { TEAMS } from "./teams.ts";
import { TEAM_MEMBERSHIPS } from "./team_memberships.ts";

export const IDENTITY_FAMILY: BuiltinFamilyDefinition = {
  name: "identity",
  displayName: "Identity & Permissions",
  description: "Actors, teams, roles, SSO, audit log and authentication primitives.",
  collections: [
    ACTORS,
    EXTERNAL_USERS,
    AUTH_IDENTITY_PROVIDERS,
    SCIM_PROVISIONING_STATE,
    API_KEYS,
    OAUTH_APPS,
    OAUTH_APP_APPROVALS,
    MAGIC_AUTH_TOKENS,
    ORGANIZATION_INVITES,
    ROLES,
    PROJECT_ROLES,
    ROLE_ASSIGNMENTS,
    AUDIT_LOG,
    TEAMS,
    TEAM_MEMBERSHIPS,
  ],
};

export { ACTORS, EXTERNAL_USERS, AUTH_IDENTITY_PROVIDERS, SCIM_PROVISIONING_STATE, API_KEYS, OAUTH_APPS, OAUTH_APP_APPROVALS, MAGIC_AUTH_TOKENS, ORGANIZATION_INVITES, ROLES, PROJECT_ROLES, ROLE_ASSIGNMENTS, AUDIT_LOG, TEAMS, TEAM_MEMBERSHIPS };
