import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

import { fromBase64 } from "./crypto.ts";

const ASSERTION_HEADER = "x-claw-secrets-host-assertion";
const MAX_CLOCK_SKEW_MS = 60_000;

export function signHostAssertion(input: {
  keyBase64: string;
  method: string;
  path: string;
  timestampMs?: number;
  nonce?: string;
}): string {
  const timestampMs = input.timestampMs ?? Date.now();
  const nonce = input.nonce ?? randomNonce();
  const mac = createHmac("sha256", Buffer.from(fromBase64(input.keyBase64)))
    .update(assertionMessage(input.method, input.path, timestampMs, nonce))
    .digest("base64url");
  return `v1:${timestampMs}:${nonce}:${mac}`;
}

export function requireHostAssertion(
  req: FastifyRequest,
  reply: FastifyReply,
  keyBase64?: string,
): boolean {
  if (!keyBase64) return true;
  const header = req.headers[ASSERTION_HEADER];
  const assertion = Array.isArray(header) ? header[0] : header;
  if (!assertion) {
    void reply.code(403).send({ error: "signed host assertion required" });
    return false;
  }
  const parts = assertion.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    void reply.code(403).send({ error: "signed host assertion invalid" });
    return false;
  }
  const timestampMs = Number(parts[1]);
  const nonce = parts[2] ?? "";
  const mac = parts[3] ?? "";
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_MS || nonce.length < 16) {
    void reply.code(403).send({ error: "signed host assertion expired" });
    return false;
  }
  const expected = signHostAssertion({
    keyBase64,
    method: req.method,
    path: requestPath(req),
    timestampMs,
    nonce,
  }).split(":")[3];
  if (!safeEqual(mac, expected)) {
    void reply.code(403).send({ error: "signed host assertion mismatch" });
    return false;
  }
  return true;
}

function assertionMessage(method: string, path: string, timestampMs: number, nonce: string): string {
  return `${method.toUpperCase()}\n${path}\n${timestampMs}\n${nonce}`;
}

function requestPath(req: FastifyRequest): string {
  return new URL(req.url, "http://127.0.0.1").pathname;
}

function safeEqual(a: string, b: string): boolean {
  const aBytes = Buffer.from(a);
  const bBytes = Buffer.from(b);
  return aBytes.length === bBytes.length && timingSafeEqual(aBytes, bBytes);
}

function randomNonce(): string {
  return randomBytes(16).toString("hex");
}
