import fs from "fs";
import path from "path";
import crypto from "crypto";

import {
  buildSyncQueueEntries,
  reconcileSyncQueue,
  meshInvitationSchema,
  meshResourceShareSchema,
  meshRevocationSchema,
  remoteActorContextSchema,
  remoteSecretLeaseSchema,
  syncCursorSchema,
  syncQueueEntrySchema,
  syncResourceManifestSchema,
  type MeshInvitation,
  type MeshResourceShare,
  type MeshRevocation,
  type RemoteActorContext,
  type RemoteSecretLease,
  type SyncCursor,
  type SyncPlanResult,
  type SyncQueueEntry,
  type SyncReconciliationResult,
  type SyncResourceManifest,
} from "@clawjs/core";

export type RemoteSyncStateAuditEvent = {
  eventId: string;
  eventType: "sync.manifest.recorded" | "sync.queue.enqueued" | "sync.queue.reconciled" | "mesh.invitation.recorded" | "mesh.share.recorded" | "mesh.revocation.recorded" | "secret.lease.issued";
  targetId: string;
  createdAt: string;
  coordinatorSignatureId?: string;
};

export type RemoteSyncCoordinatorSigner = {
  keyId: string;
  privateKeyPem: string;
  publicKeyPem: string;
};

export type RemoteSyncCoordinatorSignature = {
  signatureId: string;
  eventId: string;
  keyId: string;
  algorithm: "ed25519";
  payloadHash: string;
  signedPayload: unknown;
  publicKeyPem: string;
  signature: string;
  createdAt: string;
  verified: boolean;
};

export type RemoteSyncState = {
  schemaVersion: 1;
  updatedAt: string | null;
  manifests: Record<string, SyncResourceManifest>;
  queues: Record<string, SyncQueueEntry[]>;
  cursors: Record<string, SyncCursor>;
  mesh: {
    invitations: Record<string, MeshInvitation>;
    shares: Record<string, MeshResourceShare>;
    revocations: Record<string, MeshRevocation>;
  };
  coordinator: {
    signatures: Record<string, RemoteSyncCoordinatorSignature>;
  };
  secretBroker: {
    leases: Record<string, RemoteSecretLease>;
  };
  audit: RemoteSyncStateAuditEvent[];
};

export type RemoteSyncStateWriteResult<TPayload> = TPayload & {
  statePath: string;
  durable: true;
  coordinatorSignature?: RemoteSyncCoordinatorSignature;
};

function emptyState(): RemoteSyncState {
  return {
    schemaVersion: 1,
    updatedAt: null,
    manifests: {},
    queues: {},
    cursors: {},
    mesh: {
      invitations: {},
      shares: {},
      revocations: {},
    },
    coordinator: {
      signatures: {},
    },
    secretBroker: {
      leases: {},
    },
    audit: [],
  };
}

function auditId(eventType: RemoteSyncStateAuditEvent["eventType"], targetId: string, createdAt: string): string {
  return `remote_sync_${eventType}_${targetId}_${createdAt}`.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

function signatureId(eventId: string, keyId: string): string {
  return `coord_sig_${eventId}_${keyId}`.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}

function payloadHash(payload: unknown): string {
  return crypto.createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

function signCoordinatorPayload(input: {
  signer: RemoteSyncCoordinatorSigner;
  event: RemoteSyncStateAuditEvent;
  payload: unknown;
}): RemoteSyncCoordinatorSignature {
  const payload = {
    schemaVersion: 1,
    event: {
      eventId: input.event.eventId,
      eventType: input.event.eventType,
      targetId: input.event.targetId,
      createdAt: input.event.createdAt,
    },
    payload: input.payload,
  };
  const hash = payloadHash(payload);
  const signature = crypto.sign(null, Buffer.from(hash, "utf8"), input.signer.privateKeyPem).toString("base64");
  const verified = crypto.verify(null, Buffer.from(hash, "utf8"), input.signer.publicKeyPem, Buffer.from(signature, "base64"));
  return {
    signatureId: signatureId(input.event.eventId, input.signer.keyId),
    eventId: input.event.eventId,
    keyId: input.signer.keyId,
    algorithm: "ed25519",
    payloadHash: hash,
    signedPayload: payload,
    publicKeyPem: input.signer.publicKeyPem,
    signature,
    createdAt: input.event.createdAt,
    verified,
  };
}

function parseSignature(value: unknown): RemoteSyncCoordinatorSignature | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Partial<RemoteSyncCoordinatorSignature>;
  if (
    typeof input.signatureId === "string"
    && typeof input.eventId === "string"
    && typeof input.keyId === "string"
    && input.algorithm === "ed25519"
    && typeof input.payloadHash === "string"
    && "signedPayload" in input
    && typeof input.publicKeyPem === "string"
    && typeof input.signature === "string"
    && typeof input.createdAt === "string"
    && typeof input.verified === "boolean"
  ) {
    return input as RemoteSyncCoordinatorSignature;
  }
  return null;
}

function appendAudit(
  state: RemoteSyncState,
  eventType: RemoteSyncStateAuditEvent["eventType"],
  targetId: string,
  createdAt: string,
  payload: unknown,
  signer?: RemoteSyncCoordinatorSigner,
): RemoteSyncCoordinatorSignature | undefined {
  const event: RemoteSyncStateAuditEvent = {
    eventId: auditId(eventType, targetId, createdAt),
    eventType,
    targetId,
    createdAt,
  };
  const signature = signer ? signCoordinatorPayload({ signer, event, payload }) : undefined;
  if (signature) {
    event.coordinatorSignatureId = signature.signatureId;
    state.coordinator.signatures[signature.signatureId] = signature;
  }
  state.audit.push(event);
  return signature;
}

function parseState(raw: unknown): RemoteSyncState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyState();
  const input = raw as Record<string, unknown>;
  const state = emptyState();
  state.updatedAt = typeof input.updatedAt === "string" ? input.updatedAt : null;

  const manifests = input.manifests;
  if (manifests && typeof manifests === "object" && !Array.isArray(manifests)) {
    for (const [resourceId, manifest] of Object.entries(manifests)) {
      state.manifests[resourceId] = syncResourceManifestSchema.parse(manifest);
    }
  }

  const queues = input.queues;
  if (queues && typeof queues === "object" && !Array.isArray(queues)) {
    for (const [resourceId, queue] of Object.entries(queues)) {
      if (!Array.isArray(queue)) continue;
      state.queues[resourceId] = queue.map((entry) => syncQueueEntrySchema.parse(entry));
    }
  }

  const cursors = input.cursors;
  if (cursors && typeof cursors === "object" && !Array.isArray(cursors)) {
    for (const [resourceId, cursor] of Object.entries(cursors)) {
      state.cursors[resourceId] = syncCursorSchema.parse(cursor);
    }
  }

  const mesh = input.mesh;
  if (mesh && typeof mesh === "object" && !Array.isArray(mesh)) {
    const meshObject = mesh as Record<string, unknown>;
    const invitations = meshObject.invitations;
    if (invitations && typeof invitations === "object" && !Array.isArray(invitations)) {
      for (const [invitationId, invitation] of Object.entries(invitations)) {
        state.mesh.invitations[invitationId] = meshInvitationSchema.parse(invitation);
      }
    }
    const shares = meshObject.shares;
    if (shares && typeof shares === "object" && !Array.isArray(shares)) {
      for (const [shareId, share] of Object.entries(shares)) {
        state.mesh.shares[shareId] = meshResourceShareSchema.parse(share);
      }
    }
    const revocations = meshObject.revocations;
    if (revocations && typeof revocations === "object" && !Array.isArray(revocations)) {
      for (const [revocationId, revocation] of Object.entries(revocations)) {
        state.mesh.revocations[revocationId] = meshRevocationSchema.parse(revocation);
      }
    }
  }

  const coordinator = input.coordinator;
  if (coordinator && typeof coordinator === "object" && !Array.isArray(coordinator)) {
    const signatures = (coordinator as Record<string, unknown>).signatures;
    if (signatures && typeof signatures === "object" && !Array.isArray(signatures)) {
      for (const [signatureId, signatureInput] of Object.entries(signatures)) {
        const signature = parseSignature(signatureInput);
        if (signature) state.coordinator.signatures[signatureId] = signature;
      }
    }
  }

  const secretBroker = input.secretBroker;
  if (secretBroker && typeof secretBroker === "object" && !Array.isArray(secretBroker)) {
    const leases = (secretBroker as Record<string, unknown>).leases;
    if (leases && typeof leases === "object" && !Array.isArray(leases)) {
      for (const [leaseId, leaseInput] of Object.entries(leases)) {
        state.secretBroker.leases[leaseId] = remoteSecretLeaseSchema.parse(leaseInput);
      }
    }
  }

  const audit = input.audit;
  if (Array.isArray(audit)) {
    state.audit = audit.flatMap((event) => {
      if (!event || typeof event !== "object" || Array.isArray(event)) return [];
      const entry = event as Partial<RemoteSyncStateAuditEvent>;
      if (
        typeof entry.eventId === "string"
        && typeof entry.eventType === "string"
        && typeof entry.targetId === "string"
        && typeof entry.createdAt === "string"
      ) {
        return [entry as RemoteSyncStateAuditEvent];
      }
      return [];
    });
  }

  return state;
}

function upsertQueue(existing: SyncQueueEntry[], incoming: SyncQueueEntry[]): SyncQueueEntry[] {
  const byId = new Map(existing.map((entry) => [entry.queueEntryId, entry]));
  for (const entry of incoming) byId.set(entry.queueEntryId, entry);
  return [...byId.values()].sort((left, right) => left.queuedAt.localeCompare(right.queuedAt) || left.queueEntryId.localeCompare(right.queueEntryId));
}

function terminalQueueStatus(status: SyncQueueEntry["status"]): boolean {
  return status === "applied" || status === "resolved" || status === "failed" || status === "skipped";
}

export class RemoteSyncStateStore {
  readonly stateDir: string;
  readonly statePath: string;

  constructor(input: { stateDir: string }) {
    this.stateDir = path.resolve(input.stateDir);
    this.statePath = path.join(this.stateDir, "remote-sync-state.json");
  }

  read(): RemoteSyncState {
    if (!fs.existsSync(this.statePath)) return emptyState();
    return parseState(JSON.parse(fs.readFileSync(this.statePath, "utf8")) as unknown);
  }

  write(state: RemoteSyncState): RemoteSyncState {
    fs.mkdirSync(this.stateDir, { recursive: true });
    const tmpPath = `${this.statePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.renameSync(tmpPath, this.statePath);
    return state;
  }

  recordManifest(manifestInput: SyncResourceManifest, input: { now?: string; signer?: RemoteSyncCoordinatorSigner } = {}): RemoteSyncStateWriteResult<{ manifest: SyncResourceManifest }> {
    const manifest = syncResourceManifestSchema.parse(manifestInput);
    const now = input.now ?? new Date().toISOString();
    const state = this.read();
    state.manifests[manifest.resourceId] = manifest;
    state.updatedAt = now;
    const coordinatorSignature = appendAudit(state, "sync.manifest.recorded", manifest.resourceId, now, manifest, input.signer);
    this.write(state);
    return { manifest, statePath: this.statePath, durable: true, ...(coordinatorSignature ? { coordinatorSignature } : {}) };
  }

  enqueuePlan(planInput: SyncPlanResult, input: { now?: string; cursorBefore?: SyncCursor; signer?: RemoteSyncCoordinatorSigner } = {}): RemoteSyncStateWriteResult<{ entries: SyncQueueEntry[]; queue: SyncQueueEntry[] }> {
    const now = input.now ?? new Date().toISOString();
    const entries = buildSyncQueueEntries(planInput, { queuedAt: now, cursorBefore: input.cursorBefore });
    const state = this.read();
    state.manifests[planInput.manifest.resourceId] = planInput.manifest;
    state.queues[planInput.manifest.resourceId] = upsertQueue(state.queues[planInput.manifest.resourceId] ?? [], entries);
    if (planInput.nextCursor) state.cursors[planInput.manifest.resourceId] = planInput.nextCursor;
    state.updatedAt = now;
    const coordinatorSignature = appendAudit(state, "sync.queue.enqueued", planInput.manifest.resourceId, now, { manifest: planInput.manifest, entries }, input.signer);
    this.write(state);
    return { entries, queue: state.queues[planInput.manifest.resourceId] ?? [], statePath: this.statePath, durable: true, ...(coordinatorSignature ? { coordinatorSignature } : {}) };
  }

  reconcile(manifestInput: SyncResourceManifest, input: { acknowledgedChangeIds?: string[]; resolvedConflictIds?: string[]; now?: string; signer?: RemoteSyncCoordinatorSigner } = {}): RemoteSyncStateWriteResult<{ reconciliation: SyncReconciliationResult }> {
    const manifest = syncResourceManifestSchema.parse(manifestInput);
    const now = input.now ?? new Date().toISOString();
    const state = this.read();
    const reconciliation = reconcileSyncQueue({
      manifest,
      queue: state.queues[manifest.resourceId] ?? [],
      acknowledgedChangeIds: input.acknowledgedChangeIds,
      resolvedConflictIds: input.resolvedConflictIds,
      now,
    });
    state.manifests[manifest.resourceId] = manifest;
    state.queues[manifest.resourceId] = reconciliation.queue;
    if (reconciliation.nextCursor) state.cursors[manifest.resourceId] = reconciliation.nextCursor;
    state.updatedAt = now;
    const coordinatorSignature = appendAudit(state, "sync.queue.reconciled", manifest.resourceId, now, reconciliation, input.signer);
    this.write(state);
    return { reconciliation, statePath: this.statePath, durable: true, ...(coordinatorSignature ? { coordinatorSignature } : {}) };
  }

  recordInvitation(invitationInput: MeshInvitation, input: { now?: string; signer?: RemoteSyncCoordinatorSigner } = {}): RemoteSyncStateWriteResult<{ invitation: MeshInvitation }> {
    const invitation = meshInvitationSchema.parse(invitationInput);
    const now = input.now ?? invitation.createdAt;
    const state = this.read();
    state.mesh.invitations[invitation.invitationId] = invitation;
    state.updatedAt = now;
    const coordinatorSignature = appendAudit(state, "mesh.invitation.recorded", invitation.invitationId, now, invitation, input.signer);
    this.write(state);
    return { invitation, statePath: this.statePath, durable: true, ...(coordinatorSignature ? { coordinatorSignature } : {}) };
  }

  recordShare(shareInput: MeshResourceShare, input: { now?: string; signer?: RemoteSyncCoordinatorSigner } = {}): RemoteSyncStateWriteResult<{ share: MeshResourceShare }> {
    const share = meshResourceShareSchema.parse(shareInput);
    const now = input.now ?? share.createdAt;
    const state = this.read();
    state.mesh.shares[share.shareId] = share;
    state.manifests[share.syncManifest.resourceId] = share.syncManifest;
    state.updatedAt = now;
    const coordinatorSignature = appendAudit(state, "mesh.share.recorded", share.shareId, now, share, input.signer);
    this.write(state);
    return { share, statePath: this.statePath, durable: true, ...(coordinatorSignature ? { coordinatorSignature } : {}) };
  }

  recordRevocation(revocationInput: MeshRevocation, input: { now?: string; signer?: RemoteSyncCoordinatorSigner } = {}): RemoteSyncStateWriteResult<{ revocation: MeshRevocation; cascadedQueueEntries: SyncQueueEntry[] }> {
    const revocation = meshRevocationSchema.parse(revocationInput);
    const now = input.now ?? revocation.revokedAt;
    const state = this.read();
    state.mesh.revocations[revocation.revocationId] = revocation;

    const affectedResourceIds = new Set<string>();
    if (revocation.targetType === "share") {
      const share = state.mesh.shares[revocation.targetId];
      if (share) affectedResourceIds.add(share.resourceId);
    }
    if (revocation.targetType === "invitation") {
      for (const share of Object.values(state.mesh.shares)) {
        if (share.invitationId === revocation.targetId) affectedResourceIds.add(share.resourceId);
      }
    }

    const cascadedQueueEntries: SyncQueueEntry[] = [];
    for (const resourceId of affectedResourceIds) {
      const queue = state.queues[resourceId] ?? [];
      state.queues[resourceId] = queue.map((entry) => {
        if (terminalQueueStatus(entry.status)) return entry;
        const cascaded = syncQueueEntrySchema.parse({
          ...entry,
          status: "skipped",
          updatedAt: now,
          reason: `revoked:${revocation.targetType}:${revocation.targetId}`,
          writes: false,
        });
        cascadedQueueEntries.push(cascaded);
        return cascaded;
      });
    }

    state.updatedAt = now;
    const coordinatorSignature = appendAudit(state, "mesh.revocation.recorded", revocation.revocationId, now, { revocation, cascadedQueueEntries }, input.signer);
    this.write(state);
    return { revocation, cascadedQueueEntries, statePath: this.statePath, durable: true, ...(coordinatorSignature ? { coordinatorSignature } : {}) };
  }

  issueSecretLease(input: {
    secretRef: string;
    actor: RemoteActorContext;
    action: string;
    resourceId: string;
    expiresAt: string;
    now?: string;
    signer: RemoteSyncCoordinatorSigner;
  }): RemoteSyncStateWriteResult<{ lease: RemoteSecretLease }> {
    const actor = remoteActorContextSchema.parse(input.actor);
    const now = input.now ?? new Date().toISOString();
    const auditEventId = auditId("secret.lease.issued", `${input.resourceId}:${input.secretRef}`, now);
    const lease = remoteSecretLeaseSchema.parse({
      leaseId: `secret_lease_${input.resourceId}_${input.secretRef}_${now}`.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase(),
      secretRef: input.secretRef,
      actor,
      action: input.action,
      resourceId: input.resourceId,
      expiresAt: input.expiresAt,
      plaintextReturned: false,
      auditEventId,
    });
    const state = this.read();
    state.secretBroker.leases[lease.leaseId] = lease;
    state.updatedAt = now;
    const coordinatorSignature = appendAudit(state, "secret.lease.issued", `${input.resourceId}:${input.secretRef}`, now, lease, input.signer);
    this.write(state);
    return { lease, statePath: this.statePath, durable: true, coordinatorSignature };
  }

  verifyCoordinatorSignatures(): { signatureCount: number; valid: number; invalid: number } {
    const state = this.read();
    let valid = 0;
    let invalid = 0;
    for (const signature of Object.values(state.coordinator.signatures)) {
      const hashMatches = payloadHash(signature.signedPayload) === signature.payloadHash;
      const verified = crypto.verify(null, Buffer.from(signature.payloadHash, "utf8"), signature.publicKeyPem, Buffer.from(signature.signature, "base64"));
      if (hashMatches && verified && signature.verified) valid += 1;
      else invalid += 1;
    }
    return {
      signatureCount: Object.keys(state.coordinator.signatures).length,
      valid,
      invalid,
    };
  }
}
