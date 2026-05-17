import { z } from "zod";

import {
  remoteActorContextSchema,
  syncAuthoritySchema,
  syncResourceManifestSchema,
  type RemoteActorContext,
  type SyncAuthority,
  type SyncResourceManifest,
} from "./remote-sync.ts";

export const syncAuthorityHandoffReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  receiptId: z.string().min(1),
  resourceId: z.string().min(1),
  fromNodeId: z.string().min(1),
  toNodeId: z.string().min(1),
  previousAuthority: syncAuthoritySchema,
  requestedAuthority: syncAuthoritySchema,
  previousResidency: z.array(z.string().min(1)).min(1),
  requestedResidency: z.array(z.string().min(1)).min(1),
  routeIds: z.array(z.string().min(1)).min(1),
  actor: remoteActorContextSchema,
  status: z.enum(["signed_pending_authority_handoff", "accepted", "rejected"]),
  physicalAuthorityApplied: z.boolean(),
  externalPending: z.array(z.enum(["physical_authority_handoff"])),
  createdAt: z.string().datetime(),
  auditEventId: z.string().min(1),
  writes: z.literal(false),
});

export type SyncAuthorityHandoffReceipt = z.infer<typeof syncAuthorityHandoffReceiptSchema>;

function syncAuthorityHandoffReceiptId(parts: string[]): string {
  return `sync_authority_handoff_${parts.join("_")}`.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function createSyncAuthorityHandoffReceipt(input: {
  manifest: SyncResourceManifest;
  toNodeId: string;
  actor: RemoteActorContext;
  requestedAuthority?: SyncAuthority;
  requestedResidency?: string[];
  createdAt?: string;
  physicalAuthorityApplied?: boolean;
  rejected?: boolean;
}): SyncAuthorityHandoffReceipt {
  const manifest = syncResourceManifestSchema.parse(input.manifest);
  const actor = remoteActorContextSchema.parse(input.actor);
  const requestedAuthority = input.requestedAuthority ?? manifest.authority;
  const requestedResidency = uniqueStrings(input.requestedResidency?.length ? input.requestedResidency : [...manifest.residency, input.toNodeId]);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const physicalAuthorityApplied = input.physicalAuthorityApplied ?? false;
  const status = input.rejected
    ? "rejected"
    : physicalAuthorityApplied ? "accepted" : "signed_pending_authority_handoff";

  return syncAuthorityHandoffReceiptSchema.parse({
    schemaVersion: 1,
    receiptId: syncAuthorityHandoffReceiptId([manifest.resourceId, manifest.ownerNodeId, input.toNodeId, createdAt]),
    resourceId: manifest.resourceId,
    fromNodeId: manifest.ownerNodeId,
    toNodeId: input.toNodeId,
    previousAuthority: manifest.authority,
    requestedAuthority,
    previousResidency: manifest.residency,
    requestedResidency,
    routeIds: manifest.routeIds,
    actor,
    status,
    physicalAuthorityApplied,
    externalPending: physicalAuthorityApplied || input.rejected ? [] : ["physical_authority_handoff"],
    createdAt,
    auditEventId: syncAuthorityHandoffReceiptId(["audit", manifest.resourceId, manifest.ownerNodeId, input.toNodeId, createdAt]),
    writes: false,
  });
}
