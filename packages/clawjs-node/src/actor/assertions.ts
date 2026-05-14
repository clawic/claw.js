import crypto from "crypto";

import {
  actorAssertionSchema,
  type ActorAssertion,
  type ActorAssertionVerificationResult,
  type ActorContext,
  type ActorKind,
  type ActorTrustSource,
} from "@clawjs/core";

export interface TrustedActorAssertionKey {
  keyId: string;
  publicKeyPem: string;
  trustSource: Extract<ActorTrustSource, "signed-host" | "agent-runtime">;
  issuer?: string;
}

export interface VerifyActorAssertionOptions {
  assertion?: string | ActorAssertion | null;
  trustedKeys?: TrustedActorAssertionKey[];
  requiredScope?: string;
  now?: Date;
}

export interface UntrustedActorInput {
  actorKind?: string;
  actorId?: string;
  sessionId?: string;
  runId?: string;
  hostId?: string;
}

export function unknownActor(reason = "missing_assertion"): ActorContext {
  return {
    actorKind: "unknown",
    scope: [],
    trustSource: "unknown",
    verified: false,
    reason,
  };
}

export function untrustedActor(input: UntrustedActorInput = {}, reason = "untrusted_actor_hint"): ActorContext {
  const parsedKind = parseActorKind(input.actorKind);
  return {
    actorKind: parsedKind,
    ...(input.actorId ? { actorId: input.actorId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.hostId ? { hostId: input.hostId } : {}),
    scope: [],
    trustSource: "untrusted",
    verified: false,
    reason,
  };
}

export function verifyActorAssertion(options: VerifyActorAssertionOptions = {}): ActorAssertionVerificationResult {
  const parsed = parseAssertion(options.assertion);
  if (!parsed) return { ok: false, actor: unknownActor("missing_assertion"), reason: "missing_assertion" };

  const result = actorAssertionSchema.safeParse(parsed);
  if (!result.success) return { ok: false, actor: unknownActor("invalid_assertion_shape"), reason: "invalid_assertion_shape" };

  const assertion = result.data;
  const now = options.now ?? new Date();
  const expiresAt = Date.parse(assertion.expiresAt);
  const issuedAt = Date.parse(assertion.issuedAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    return { ok: false, actor: unknownActor("invalid_assertion_time"), reason: "invalid_assertion_time" };
  }
  if (expiresAt <= now.getTime()) {
    return { ok: false, actor: unknownActor("expired_assertion"), reason: "expired_assertion" };
  }
  if (issuedAt > now.getTime() + 60_000) {
    return { ok: false, actor: unknownActor("future_assertion"), reason: "future_assertion" };
  }
  if (options.requiredScope && !assertion.scope.includes(options.requiredScope) && !assertion.scope.includes("*")) {
    return { ok: false, actor: unknownActor("scope_mismatch"), reason: "scope_mismatch" };
  }

  const trustedKey = options.trustedKeys?.find((key) =>
    key.keyId === assertion.keyId
    && key.trustSource === assertion.trustSource
    && (!key.issuer || key.issuer === assertion.issuer)
  );
  if (!trustedKey) return { ok: false, actor: unknownActor("unknown_trusted_key"), reason: "unknown_trusted_key" };

  const verified = crypto.verify(
    null,
    Buffer.from(canonicalActorAssertionPayload(assertion)),
    trustedKey.publicKeyPem,
    decodeBase64Url(assertion.signature),
  );
  if (!verified) return { ok: false, actor: unknownActor("invalid_signature"), reason: "invalid_signature" };

  const actor: ActorContext = {
    actorKind: assertion.actorKind,
    ...(assertion.actorId ? { actorId: assertion.actorId } : {}),
    ...(assertion.sessionId ? { sessionId: assertion.sessionId } : {}),
    ...(assertion.runId ? { runId: assertion.runId } : {}),
    hostId: assertion.hostId,
    issuedAt: assertion.issuedAt,
    expiresAt: assertion.expiresAt,
    scope: assertion.scope,
    trustSource: assertion.trustSource,
    verified: true,
  };
  return { ok: true, actor };
}

export function canonicalActorAssertionPayload(assertion: Omit<ActorAssertion, "signature"> | ActorAssertion): string {
  const payload = {
    schemaVersion: assertion.schemaVersion,
    actorKind: assertion.actorKind,
    ...(assertion.actorId ? { actorId: assertion.actorId } : {}),
    ...(assertion.sessionId ? { sessionId: assertion.sessionId } : {}),
    ...(assertion.runId ? { runId: assertion.runId } : {}),
    hostId: assertion.hostId,
    issuedAt: assertion.issuedAt,
    expiresAt: assertion.expiresAt,
    scope: [...assertion.scope].sort(),
    trustSource: assertion.trustSource,
    ...(assertion.issuer ? { issuer: assertion.issuer } : {}),
    ...(assertion.keyId ? { keyId: assertion.keyId } : {}),
  };
  return JSON.stringify(payload);
}

export function signActorAssertion(
  assertion: Omit<ActorAssertion, "signature">,
  privateKeyPem: string,
): ActorAssertion {
  const signature = crypto.sign(null, Buffer.from(canonicalActorAssertionPayload(assertion)), privateKeyPem);
  return { ...assertion, signature: encodeBase64Url(signature) };
}

function parseAssertion(value: VerifyActorAssertionOptions["assertion"]): unknown {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    try {
      return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    } catch {
      return null;
    }
  }
}

function parseActorKind(value: string | undefined): ActorKind {
  return value === "human" || value === "agent" || value === "automation" ? value : "unknown";
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function encodeBase64Url(value: Buffer): string {
  return value.toString("base64url");
}
