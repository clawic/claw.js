// Type definitions for the mp/1.0.0 marketplace protocol tables.
// These types are stored alongside the regular index entities but on their
// own tables (`mp_*`).

export interface MpRootKeyRow {
  id: string;
  pubkey: Uint8Array;
  label?: string | null;
  createdAt: string;
  revokedAt?: string | null;
}

export interface MpDeviceKeyRow {
  id: string;
  rootKeyId: string;
  pubkey: Uint8Array;
  deviceName: string;
  certificateCbor: Uint8Array;
  createdAt: string;
  revokedAt?: string | null;
}

export interface MpRoleKeyRow {
  id: string;
  rootKeyId: string;
  pubkey: Uint8Array;
  roleName: string;
  vertical: string;
  certificateCbor: Uint8Array;
  createdAt: string;
  revokedAt?: string | null;
}

export type MpIntentSide = "offer" | "want";
export type MpIntentStatus = "draft" | "published" | "withdrawn" | "expired";
export type MpProvenance = "native" | "observed";

export interface MpIntentRow {
  id: string;
  intentIdHash: Uint8Array;
  side: MpIntentSide;
  roleKeyId?: string | null;
  ephemeralPubkey?: Uint8Array | null;
  vertical: string;
  payload: Record<string, unknown>;
  payloadCbor: Uint8Array;
  visibilityLevels: Record<string, number>;
  revealKeys?: Record<string, string> | null;
  signatureRole?: Uint8Array | null;
  signatureDevice?: Uint8Array | null;
  provenance: MpProvenance;
  observedSource?: string | null;
  observedExternalUrl?: string | null;
  status: MpIntentStatus;
  expiresAt?: string | null;
  createdAt: string;
  publishedAt?: string | null;
  withdrawnAt?: string | null;
}

export type MpReceiptStatus =
  | "proposed_by_peer"
  | "proposed_by_me"
  | "awaiting_human_approval"
  | "signed"
  | "rejected"
  | "expired";

export interface MpMatchReceiptRow {
  id: string;
  receiptHash: Uint8Array;
  myRoleKeyId: string;
  peerRolePubkey: Uint8Array;
  offerIntentId?: string | null;
  wantIntentId?: string | null;
  reachedLevel: number;
  fieldsRevealed: string[];
  contactHandover?: Record<string, unknown> | null;
  mySignature?: Uint8Array | null;
  peerSignature?: Uint8Array | null;
  status: MpReceiptStatus;
  proposedAt: string;
  signedAt?: string | null;
  rejectedAt?: string | null;
  payloadCbor: Uint8Array;
}

export interface MpPeerLevelRow {
  id: string;
  myRoleKeyId: string;
  peerPubkey: Uint8Array;
  intentId?: string | null;
  currentLevel: number;
  proofs?: Record<string, unknown> | null;
  lastUpdatedAt: string;
}

export interface MpInboundMessageRow {
  id: string;
  recipientRoleKeyId: string;
  senderPubkey: Uint8Array;
  threadId?: Uint8Array | null;
  inReplyTo?: Uint8Array | null;
  intentIdRef?: string | null;
  kind: string;
  plaintext: Record<string, unknown>;
  signature?: Uint8Array | null;
  ttlExpiresAt?: string | null;
  receivedAt: string;
  readAt?: string | null;
}

export interface MpOutboundMessageRow {
  id: string;
  senderRoleKeyId: string;
  recipientPubkey: Uint8Array;
  threadId?: Uint8Array | null;
  inReplyTo?: Uint8Array | null;
  intentIdRef?: string | null;
  kind: string;
  plaintext: Record<string, unknown>;
  ciphertext?: Uint8Array | null;
  signature?: Uint8Array | null;
  sentAt: string;
  deliveryStatus: "queued" | "sent" | "delivered" | "failed";
}

export interface MpKnownBrokerRow {
  id: string;
  brokerPubkey: Uint8Array;
  endpoints: string[];
  verticalsSupported: string[];
  policies?: Record<string, unknown> | null;
  trustLocal: boolean;
  lastSeenAt: string;
}

export interface MpVouchInboundRow {
  id: string;
  myRoleKeyId: string;
  voucherPubkey: Uint8Array;
  context: string;
  text: string;
  receivedAt: string;
  signature: Uint8Array;
}

export interface MpVouchOutboundRow {
  id: string;
  voucherRoleKeyId: string;
  voucheePubkey: Uint8Array;
  context: string;
  text: string;
  signedAt: string;
  expiresAt?: string | null;
  signature: Uint8Array;
}

export interface MpRatingRow {
  id: string;
  matchReceiptId: string;
  raterRolePubkey: Uint8Array;
  score: number;
  comment?: string | null;
  signedAt: string;
  signature: Uint8Array;
  countersignature?: Uint8Array | null;
  mutualConsent: boolean;
}

export interface MpRevocationRow {
  id: string;
  revokedPubkey: Uint8Array;
  revokedKind: "device" | "role";
  reason?: string | null;
  signedAt: string;
  rootPubkey: Uint8Array;
  rootSignature: Uint8Array;
  observedAt: string;
}
