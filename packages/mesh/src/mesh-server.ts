import { clawApiPath } from "@clawjs/core";
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { z } from "zod";

import { AuditStore, type AuditAction } from "./audit-store.ts";
import {
  bytesEqualConstantTime,
  toBase64Url,
  utf8,
} from "./crypto.ts";
import {
  decryptEnvelope,
  type EncryptedEnvelope,
  EnvelopeReplayCache,
  EnvelopeReplayError,
  EnvelopeSignatureError,
} from "./signed-envelope.ts";
import { HostStore } from "./host-store.ts";
import {
  HOST_KINDS,
  HostInputSchema,
  type Host,
  type HostEndpoint,
  type HostKind,
} from "./models.ts";
import {
  SshStoredSecretSchema,
  type SshSecretStore,
} from "./ssh-secret-store.ts";
import {
  PairingAcceptRequestSchema,
  PairingAcceptResponseSchema,
  compareBearerTokensConstantTime,
} from "./pairing.ts";
import { IdentityStore, type NodeIdentity } from "./identity-store.ts";
import { WorkspaceStore } from "./workspace-store.ts";

export const LOOPBACK_HOSTS = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
  "localhost",
]);

export interface MeshServerDeps {
  identityStore: IdentityStore;
  hostStore: HostStore;
  workspaceStore: WorkspaceStore;
  auditStore: AuditStore;
  capabilities: string[];
  endpointResolver: () => HostEndpoint[];
  jobHandler?: MeshJobHandler;
  linkClient?: MeshLinkClient;
  replayCache?: EnvelopeReplayCache;
  sshSecretStore?: SshSecretStore;
  now?: () => Date;
}

export type MeshJobHandler = (input: {
  senderId: string;
  payload: unknown;
}) => Promise<MeshJobHandlerResult>;

export interface MeshJobHandlerResult {
  jobId: string;
  status: "accepted" | "rejected" | "completed";
  detail?: string;
}

export interface MeshLinkRequest {
  remoteHost: string;
  remotePort: number;
  remoteToken: string;
  remoteKind?: HostKind;
}

export type MeshLinkClient = (
  request: MeshLinkRequest,
  selfIdentity: NodeIdentity,
  selfKind: HostKind,
) => Promise<MeshLinkClientResult>;

export interface MeshLinkClientResult {
  remoteNodeId: string;
  remoteDisplayName: string;
  remoteSigningPublicKey: string;
  remoteAgreementPublicKey: string;
}

export interface MeshIdentityResponse {
  v: 1;
  nodeId: string;
  displayName: string;
  signingPublicKey: string;
  agreementPublicKey: string;
  endpoints: HostEndpoint[];
  capabilities: string[];
}

const MeshLinkBodySchema = z.object({
  remoteHost: z.string().min(1),
  remotePort: z.number().int().min(1).max(65535),
  remoteToken: z.string().min(1),
  remoteKind: z.enum(HOST_KINDS).optional(),
  selfKind: z.enum(HOST_KINDS).default("mac"),
});

const MeshRemoteJobBodySchema = z.object({
  peerNodeId: z.string().min(1),
  payload: z.unknown(),
});

const MeshJobsBodySchema: z.ZodType<EncryptedEnvelope> = z.object({
  v: z.number(),
  alg: z.literal("x25519-xchacha20poly1305"),
  senderId: z.string(),
  recipientId: z.string(),
  ts: z.string(),
  nonce: z.string(),
  ephemeralPublicKey: z.string(),
  ciphertext: z.string(),
  aeadNonce: z.string(),
  sig: z.string(),
});

export const meshServerPlugin = (deps: MeshServerDeps): FastifyPluginAsync =>
  async function plugin(app: FastifyInstance) {
    const replayCache = deps.replayCache ?? new EnvelopeReplayCache();
    const now = deps.now ?? (() => new Date());

    const requireBearer = (request: FastifyRequest): NodeIdentity | null => {
      const header = request.headers["authorization"];
      if (typeof header !== "string" || !header.startsWith("Bearer ")) {
        return null;
      }
      const presented = header.slice("Bearer ".length);
      const identity = deps.identityStore.get();
      if (!identity) return null;
      return compareBearerTokensConstantTime(presented, identity.bearerToken)
        ? identity
        : null;
    };

    const ensureLoopback = (
      request: FastifyRequest,
      reply: FastifyReply,
    ): boolean => {
      if (LOOPBACK_HOSTS.has(request.ip)) return true;
      reply.code(403).send({ error: "loopback only" });
      return false;
    };

    const audit = (
      action: AuditAction,
      outcome: "allow" | "deny" | "success" | "failure",
      info: { actor?: string; target?: string; context?: Record<string, unknown> } = {},
    ) => {
      try {
        deps.auditStore.record({
          action,
          outcome,
          actorId: info.actor,
          targetId: info.target,
          context: info.context,
        });
      } catch {
        // audit failures must not break the request path
      }
    };

    app.get(clawApiPath("mesh/identity"), async (request, reply) => {
      const identity = requireBearer(request);
      if (!identity) {
        audit("bridgeAuth", "deny", { context: { route: "identity" } });
        reply.code(401).send({ error: "unauthorized" });
        return;
      }
      audit("bridgeAuth", "allow", { actor: identity.nodeId, context: { route: "identity" } });
      const body: MeshIdentityResponse = {
        v: 1,
        nodeId: identity.nodeId,
        displayName: identity.displayName,
        signingPublicKey: toBase64Url(identity.signingPublicKey),
        agreementPublicKey: toBase64Url(identity.agreementPublicKey),
        endpoints: deps.endpointResolver(),
        capabilities: deps.capabilities,
      };
      reply.send(body);
    });

    app.get(clawApiPath("mesh/peers"), async (request, reply) => {
      if (!ensureLoopback(request, reply)) return;
      reply.send({ peers: deps.hostStore.list({ includeRevoked: true }) });
    });

    app.get(clawApiPath("mesh/workspaces"), async (request, reply) => {
      if (!ensureLoopback(request, reply)) return;
      reply.send({ workspaces: deps.workspaceStore.list() });
    });

    app.post(clawApiPath("mesh/link"), async (request, reply) => {
      if (!ensureLoopback(request, reply)) return;
      const parsed = MeshLinkBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid body", issues: parsed.error.issues });
        return;
      }
      const linkClient = deps.linkClient;
      if (!linkClient) {
        reply.code(501).send({ error: "link client not configured" });
        return;
      }
      const identity = deps.identityStore.get();
      if (!identity) {
        reply.code(503).send({ error: "identity not initialized" });
        return;
      }
      try {
        const remote = await linkClient(parsed.data, identity, parsed.data.selfKind);
        const peer = deps.hostStore.upsert({
          id: remote.remoteNodeId,
          kind: parsed.data.remoteKind ?? "mac",
          displayName: remote.remoteDisplayName,
          signingPublicKey: remote.remoteSigningPublicKey,
          agreementPublicKey: remote.remoteAgreementPublicKey,
          endpoints: [
            {
              kind: "linked",
              host: parsed.data.remoteHost,
              port: parsed.data.remotePort,
              protocol: "bridge",
            },
          ],
          permissionProfile: "scoped",
          capabilities: ["bridge"],
          metadata: { tags: ["linked"] },
        });
        audit("meshLink", "success", {
          actor: identity.nodeId,
          target: remote.remoteNodeId,
          context: { remoteHost: parsed.data.remoteHost, remotePort: parsed.data.remotePort },
        });
        reply.send({ peer });
      } catch (err) {
        audit("meshLink", "failure", {
          actor: identity.nodeId,
          context: { error: String(err) },
        });
        reply.code(502).send({ error: "link failed", detail: String(err) });
      }
    });

    app.post(clawApiPath("mesh/pair"), async (request, reply) => {
      const identity = deps.identityStore.get();
      if (!identity) {
        reply.code(503).send({ error: "identity not initialized" });
        return;
      }
      const parsed = PairingAcceptRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid body", issues: parsed.error.issues });
        return;
      }
      const presentedToken = utf8(parsed.data.token);
      const expectedToken = utf8(identity.bearerToken);
      if (!bytesEqualConstantTime(presentedToken, expectedToken)) {
        audit("meshPair", "deny", {
          target: parsed.data.clientNodeId,
          context: { reason: "bad-token" },
        });
        reply.code(403).send({ error: "invalid token" });
        return;
      }
      deps.hostStore.upsert({
        id: parsed.data.clientNodeId,
        kind: parsed.data.clientKind,
        displayName: parsed.data.clientDisplayName,
        signingPublicKey: parsed.data.clientSigningPublicKey,
        agreementPublicKey: parsed.data.clientAgreementPublicKey,
        endpoints: [],
        permissionProfile: "scoped",
        capabilities: ["pair"],
        metadata: { tags: ["paired"] },
      });
      audit("meshPair", "success", {
        actor: parsed.data.clientNodeId,
        target: identity.nodeId,
      });
      const body = PairingAcceptResponseSchema.parse({
        v: 1,
        hostNodeId: identity.nodeId,
        hostDisplayName: identity.displayName,
        hostSigningPublicKey: toBase64Url(identity.signingPublicKey),
        hostAgreementPublicKey: toBase64Url(identity.agreementPublicKey),
      });
      reply.send(body);
    });

    app.post(clawApiPath("mesh/jobs"), async (request, reply) => {
      const identity = deps.identityStore.get();
      if (!identity) {
        reply.code(503).send({ error: "identity not initialized" });
        return;
      }
      const parsed = MeshJobsBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid envelope", issues: parsed.error.issues });
        return;
      }
      const envelope = parsed.data;
      const sender = deps.hostStore.get(envelope.senderId);
      if (!sender || sender.revokedAt || !sender.signingPublicKey) {
        audit("meshJob", "deny", {
          target: identity.nodeId,
          actor: envelope.senderId,
          context: { reason: "unknown-or-revoked-sender" },
        });
        reply.code(403).send({ error: "unknown or revoked sender" });
        return;
      }
      let payload: unknown;
      try {
        payload = decryptEnvelope({
          envelope,
          recipientId: identity.nodeId,
          recipientAgreementPrivateKey: identity.agreementPrivateKey,
          senderSigningPublicKey: parseB64(sender.signingPublicKey),
          replayCache,
          now: now(),
        });
      } catch (err) {
        if (err instanceof EnvelopeReplayError || err instanceof EnvelopeSignatureError) {
          audit("meshJob", "deny", {
            target: identity.nodeId,
            actor: envelope.senderId,
            context: { reason: err.name },
          });
          reply.code(403).send({ error: err.message });
          return;
        }
        throw err;
      }
      const handler = deps.jobHandler ?? defaultJobHandler;
      const result = await handler({ senderId: envelope.senderId, payload });
      deps.hostStore.touch(envelope.senderId);
      audit("meshJob", "success", {
        target: identity.nodeId,
        actor: envelope.senderId,
        context: { jobId: result.jobId, status: result.status },
      });
      reply.send({ ok: true, ...result });
    });

    app.post(clawApiPath("mesh/remote-jobs"), async (request, reply) => {
      if (!ensureLoopback(request, reply)) return;
      const parsed = MeshRemoteJobBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid body", issues: parsed.error.issues });
        return;
      }
      reply.send({ accepted: true, peerNodeId: parsed.data.peerNodeId });
      audit("meshRemoteJob", "success", {
        target: parsed.data.peerNodeId,
        context: { stub: true },
      });
    });

    app.post(clawApiPath("mesh/hosts"), async (request, reply) => {
      if (!ensureLoopback(request, reply)) return;
      const parsed = HostUpsertBodySchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send({ error: "invalid body", issues: parsed.error.issues });
        return;
      }
      let storedSecretMeta: { id: string; kind: string } | undefined;
      if (parsed.data.sshSecret) {
        if (!deps.sshSecretStore) {
          reply.code(503).send({ error: "ssh secret store not configured" });
          return;
        }
        const meta = deps.sshSecretStore.put(
          parsed.data.sshSecret.id,
          parsed.data.sshSecret.secret,
        );
        storedSecretMeta = { id: meta.id, kind: meta.kind };
      }
      const host = deps.hostStore.upsert(parsed.data.host);
      audit("meshLink", "success", {
        target: host.id,
        context: {
          op: "host-upsert",
          kind: host.kind,
          hasSshSecret: !!storedSecretMeta,
        },
      });
      reply.send({ host, sshSecret: storedSecretMeta });
    });

    app.delete<{ Params: { id: string } }>(
      clawApiPath("mesh/hosts/:id"),
      async (request, reply) => {
        if (!ensureLoopback(request, reply)) return;
        const id = request.params.id;
        const removed = deps.hostStore.remove(id);
        audit("meshRevoke", removed ? "success" : "deny", {
          target: id,
          context: { op: "host-delete" },
        });
        if (!removed) {
          reply.code(404).send({ error: "host not found" });
          return;
        }
        reply.send({ removed: true, id });
      },
    );

    app.post<{ Params: { id: string } }>(
      clawApiPath("mesh/hosts/:id/revoke"),
      async (request, reply) => {
        if (!ensureLoopback(request, reply)) return;
        const id = request.params.id;
        const ok = deps.hostStore.revoke(id);
        audit("meshRevoke", ok ? "success" : "deny", {
          target: id,
          context: { op: "host-revoke" },
        });
        reply.send({ revoked: ok, id });
      },
    );

    app.post<{ Params: { id: string } }>(
      clawApiPath("mesh/hosts/:id/unrevoke"),
      async (request, reply) => {
        if (!ensureLoopback(request, reply)) return;
        const id = request.params.id;
        const ok = deps.hostStore.unrevoke(id);
        audit("meshRevoke", ok ? "success" : "deny", {
          target: id,
          context: { op: "host-unrevoke" },
        });
        reply.send({ unrevoked: ok, id });
      },
    );

    app.get(clawApiPath("mesh/ssh/secrets"), async (request, reply) => {
      if (!ensureLoopback(request, reply)) return;
      if (!deps.sshSecretStore) {
        reply.send({ secrets: [] });
        return;
      }
      reply.send({ secrets: deps.sshSecretStore.list() });
    });

    app.delete<{ Params: { id: string } }>(
      clawApiPath("mesh/ssh/secrets/:id"),
      async (request, reply) => {
        if (!ensureLoopback(request, reply)) return;
        if (!deps.sshSecretStore) {
          reply.code(503).send({ error: "ssh secret store not configured" });
          return;
        }
        const removed = deps.sshSecretStore.remove(request.params.id);
        if (!removed) {
          reply.code(404).send({ error: "secret not found" });
          return;
        }
        reply.send({ removed: true, id: request.params.id });
      },
    );
  };

const HostUpsertBodySchema = z.object({
  host: HostInputSchema,
  sshSecret: z
    .object({
      id: z.string().min(1),
      secret: SshStoredSecretSchema,
    })
    .optional(),
});

const defaultJobHandler: MeshJobHandler = async ({ senderId }) => ({
  jobId: `${senderId}:${Date.now()}`,
  status: "accepted",
});

function parseB64(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, "base64url"));
}

export function publicHostFromIdentity(
  identity: NodeIdentity,
  endpoints: HostEndpoint[],
  capabilities: string[],
): Host {
  return {
    id: identity.nodeId,
    kind: "mac",
    displayName: identity.displayName,
    signingPublicKey: toBase64Url(identity.signingPublicKey),
    agreementPublicKey: toBase64Url(identity.agreementPublicKey),
    endpoints,
    permissionProfile: "fullTrust",
    capabilities,
    metadata: { tags: ["self"] },
    createdAt: identity.createdAt,
  };
}
