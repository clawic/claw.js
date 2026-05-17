import { z } from "zod";

import { HOST_KINDS } from "./models.ts";
import {
  bytesEqualConstantTime,
  randomBytes,
  toBase64Url,
  utf8,
} from "./crypto.ts";

export const SHORT_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const SHORT_CODE_GROUP = 3;
export const SHORT_CODE_GROUPS = 3;
const SHORT_CODE_RAW_LENGTH = SHORT_CODE_GROUP * SHORT_CODE_GROUPS;
const SHORT_CODE_FORMATTED_LENGTH = SHORT_CODE_RAW_LENGTH + (SHORT_CODE_GROUPS - 1);

export function generateShortCode(): string {
  const bytes = randomBytes(SHORT_CODE_RAW_LENGTH);
  let raw = "";
  for (let i = 0; i < SHORT_CODE_RAW_LENGTH; i++) {
    raw += SHORT_CODE_ALPHABET[bytes[i]! & 0x1f];
  }
  const groups: string[] = [];
  for (let i = 0; i < SHORT_CODE_GROUPS; i++) {
    groups.push(raw.slice(i * SHORT_CODE_GROUP, (i + 1) * SHORT_CODE_GROUP));
  }
  return groups.join("-");
}

export function isValidShortCode(text: string): boolean {
  if (text.length !== SHORT_CODE_FORMATTED_LENGTH) return false;
  for (let i = 0; i < text.length; i++) {
    const expected = (i + 1) % (SHORT_CODE_GROUP + 1) === 0 ? "-" : null;
    const ch = text[i]!;
    if (expected === "-") {
      if (ch !== "-") return false;
    } else {
      if (!SHORT_CODE_ALPHABET.includes(ch)) return false;
    }
  }
  return true;
}

export function normalizeShortCode(text: string): string {
  return text.replace(/[\s-]/g, "").toUpperCase();
}

export function compareShortCodesConstantTime(
  presented: string,
  expected: string,
): boolean {
  const a = utf8(normalizeShortCode(presented));
  const b = utf8(normalizeShortCode(expected));
  return bytesEqualConstantTime(a, b);
}

export const BEARER_TOKEN_BYTES = 32;

export function generateBearerToken(): string {
  return toBase64Url(randomBytes(BEARER_TOKEN_BYTES));
}

export function compareBearerTokensConstantTime(
  presented: string,
  expected: string,
): boolean {
  return bytesEqualConstantTime(utf8(presented), utf8(expected));
}

export const PairingPayloadSchema = z.object({
  v: z.literal(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  token: z.string().min(1),
  shortCode: z.string().min(1),
  hostDisplayName: z.string().min(1),
  tailscaleHost: z.string().min(1).optional(),
  nodeId: z.string().min(1).optional(),
  signingPublicKey: z.string().min(1).optional(),
  agreementPublicKey: z.string().min(1).optional(),
  coordinatorUrl: z.string().url().optional(),
  irohNodeId: z.string().min(1).optional(),
  relayUrl: z.string().url().optional(),
});

export type PairingPayload = z.infer<typeof PairingPayloadSchema>;

export const CoordinatorJoinRequestSchema = z.object({
  v: z.literal(1),
  coordinatorUrl: z.string().url(),
  email: z.string().email(),
  deviceLabel: z.string().min(1).optional(),
  platform: z.string().min(1).optional(),
});

export type CoordinatorJoinRequest = z.infer<typeof CoordinatorJoinRequestSchema>;

export const CoordinatorJoinResultSchema = z.object({
  status: z.enum(["pending", "approved", "expired", "invalid"]),
  delivered: z.boolean().optional(),
  reason: z.string().optional(),
});

export type CoordinatorJoinResult = z.infer<typeof CoordinatorJoinResultSchema>;

export interface CoordinatorJoinSession {
  start: () => Promise<CoordinatorJoinResult>;
  consume: (token: string) => Promise<{
    deviceId: string;
    tenantId: string;
    accessToken: string;
    refreshToken: string;
    expiresInSec: number;
  }>;
}

export function joinViaCoordinator(request: CoordinatorJoinRequest): CoordinatorJoinSession {
  const parsed = CoordinatorJoinRequestSchema.parse(request);
  const base = parsed.coordinatorUrl.replace(/\/$/, "");
  return {
    async start() {
      const response = await fetch(`${base}/v1/auth/magic-link/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: parsed.email,
          purpose: "device-register",
          deviceLabel: parsed.deviceLabel,
          platform: parsed.platform,
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`coordinator magic-link/start failed: ${response.status} ${body}`);
      }
      const json = (await response.json()) as { delivered: boolean; reason: string | null };
      return {
        status: "pending",
        delivered: json.delivered,
        ...(json.reason ? { reason: json.reason } : {}),
      };
    },
    async consume(token: string) {
      const response = await fetch(`${base}/v1/auth/magic-link/consume`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, deviceLabel: parsed.deviceLabel, platform: parsed.platform }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`coordinator magic-link/consume failed: ${response.status} ${body}`);
      }
      return (await response.json()) as {
        deviceId: string;
        tenantId: string;
        accessToken: string;
        refreshToken: string;
        expiresInSec: number;
      };
    },
  };
}

export function encodePairingPayload(payload: PairingPayload): string {
  return JSON.stringify(PairingPayloadSchema.parse(payload));
}

export function decodePairingPayload(text: string): PairingPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("pairing payload: invalid json");
  }
  return PairingPayloadSchema.parse(parsed);
}

export const PairingShortCodeRequestSchema = z.object({
  shortCode: z.string(),
  clientName: z.string().min(1).optional(),
});

export type PairingShortCodeRequest = z.infer<
  typeof PairingShortCodeRequestSchema
>;

export const PairingAcceptRequestSchema = z.object({
  v: z.literal(1),
  token: z.string().min(1),
  clientNodeId: z.string().min(1),
  clientDisplayName: z.string().min(1),
  clientSigningPublicKey: z.string().min(1),
  clientAgreementPublicKey: z.string().min(1),
  clientKind: z.enum(["companion", "desktop"]),
  platform: z.enum(HOST_KINDS),
});

export type PairingAcceptRequest = z.infer<typeof PairingAcceptRequestSchema>;

export const PairingAcceptResponseSchema = z.object({
  v: z.literal(1),
  hostNodeId: z.string().min(1),
  hostDisplayName: z.string().min(1),
  hostSigningPublicKey: z.string().min(1),
  hostAgreementPublicKey: z.string().min(1),
});

export type PairingAcceptResponse = z.infer<
  typeof PairingAcceptResponseSchema
>;
