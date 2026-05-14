// Collection-level CRUD allowlist permission models. The shape is
// generic enough that the same body covers PocketBase, Airtable, Supabase
// and similar APIs. Each model differs only in id/label/resourceType.

import type { PermissionModel } from "../../types.ts";

const STANDARD_ACTIONS: ReadonlyArray<{ id: string; label: string; isMutation?: boolean }> = [
  { id: "read", label: "Read records" },
  { id: "list", label: "List records" },
  { id: "create", label: "Create records", isMutation: true },
  { id: "update", label: "Update records", isMutation: true },
  { id: "delete", label: "Delete records", isMutation: true },
  { id: "schemaEdit", label: "Edit schema (admin)", isMutation: true },
] as const;

function makeCollectionModel(input: { id: string; label: string; resourceType: string }): PermissionModel {
  return {
    id: input.id,
    label: input.label,
    resourceType: input.resourceType,
    actions: [...STANDARD_ACTIONS],
    validate({ action, resource, storedAllowlist, storedAuthorizations }) {
      if (resource.type !== input.resourceType) {
        return { ok: false, reason: `expected resource type ${input.resourceType}, got ${resource.type}` };
      }
      // Static allowlist check first.
      const inAllowlist = storedAllowlist.some(
        (r) => r.type === resource.type && r.id === resource.id,
      );
      const isMutation = STANDARD_ACTIONS.find((a) => a.id === action)?.isMutation === true;
      if (!isMutation && inAllowlist) return { ok: true };

      // Mutations also require an ephemeral authorization.
      const matching = storedAuthorizations.find(
        (a) => a.kind === input.id && a.scope.resourceId === resource.id && a.scope.action === action,
      );
      if (matching) return { ok: true };

      if (isMutation) {
        return { ok: false, reason: `${action} on ${resource.type}=${resource.id} requires an ephemeral authorization` };
      }
      return { ok: false, reason: `${resource.type}=${resource.id} not in allowlist for ${input.label}` };
    },
  };
}

export const pocketbaseCollectionsModel = makeCollectionModel({
  id: "pocketbase.collections",
  label: "PocketBase collections",
  resourceType: "collection",
});

export const airtableBasesModel = makeCollectionModel({
  id: "airtable.bases-and-tables",
  label: "Airtable bases & tables",
  resourceType: "table",
});

export const supabaseSchemasModel = makeCollectionModel({
  id: "supabase.schemas-and-tables",
  label: "Supabase schemas & tables",
  resourceType: "table",
});

export const githubReposModel = makeCollectionModel({
  id: "github.repos-and-permissions",
  label: "GitHub repos & permissions",
  resourceType: "repository",
});

export const npmPackagesModel = makeCollectionModel({
  id: "npm.packages-and-versions",
  label: "npm packages & versions",
  resourceType: "package",
});

export const appstoreActionsModel = makeCollectionModel({
  id: "appstoreconnect.apps-and-actions",
  label: "App Store Connect apps & actions",
  resourceType: "app",
});
