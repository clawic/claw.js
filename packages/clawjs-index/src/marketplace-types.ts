// Type definitions for the marketplace/1.0.0 marketplace protocol tables.
// These types are stored alongside the regular index entities but on their
// own tables (`marketplace_*`).

export interface MarketplaceRootKeyRow {
  id: string;
  pubkey: Uint8Array;
  label?: string | null;
  createdAt: string;
  revokedAt?: string | null;
}

export interface MarketplaceDeviceKeyRow {
  id: string;
  rootKeyId: string;
  pubkey: Uint8Array;
  deviceName: string;
  certificateCbor: Uint8Array;
  createdAt: string;
  revokedAt?: string | null;
}

export interface MarketplaceRoleKeyRow {
  id: string;
  rootKeyId: string;
  pubkey: Uint8Array;
  roleName: string;
  vertical: string;
  certificateCbor: Uint8Array;
  createdAt: string;
  revokedAt?: string | null;
}

export type MarketplaceIntentSide = "offer" | "want";
export type MarketplaceIntentStatus = "draft" | "published" | "withdrawn" | "expired";
export type MarketplaceProvenance = "native" | "observed";

export interface MarketplaceIntentRow {
  id: string;
  intentIdHash: Uint8Array;
  side: MarketplaceIntentSide;
  roleKeyId?: string | null;
  ephemeralPubkey?: Uint8Array | null;
  vertical: string;
  payload: Record<string, unknown>;
  payloadCbor: Uint8Array;
  visibilityLevels: Record<string, number>;
  revealKeys?: Record<string, string> | null;
  signatureRole?: Uint8Array | null;
  signatureDevice?: Uint8Array | null;
  provenance: MarketplaceProvenance;
  observedSource?: string | null;
  observedExternalUrl?: string | null;
  status: MarketplaceIntentStatus;
  expiresAt?: string | null;
  createdAt: string;
  publishedAt?: string | null;
  withdrawnAt?: string | null;
}

export type MarketplaceReceiptStatus =
  | "proposed_by_peer"
  | "proposed_by_me"
  | "awaiting_human_approval"
  | "signed"
  | "rejected"
  | "expired";

export interface MarketplaceMatchReceiptRow {
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
  status: MarketplaceReceiptStatus;
  proposedAt: string;
  signedAt?: string | null;
  rejectedAt?: string | null;
  payloadCbor: Uint8Array;
}

export interface MarketplacePeerLevelRow {
  id: string;
  myRoleKeyId: string;
  peerPubkey: Uint8Array;
  intentId?: string | null;
  currentLevel: number;
  proofs?: Record<string, unknown> | null;
  lastUpdatedAt: string;
}

export interface MarketplaceInboundMessageRow {
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

export interface MarketplaceOutboundMessageRow {
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

export interface MarketplaceKnownBrokerRow {
  id: string;
  brokerPubkey: Uint8Array;
  endpoints: string[];
  verticalsSupported: string[];
  policies?: Record<string, unknown> | null;
  trustLocal: boolean;
  lastSeenAt: string;
}

export interface MarketplaceVouchInboundRow {
  id: string;
  myRoleKeyId: string;
  voucherPubkey: Uint8Array;
  context: string;
  text: string;
  receivedAt: string;
  signature: Uint8Array;
}

export interface MarketplaceVouchOutboundRow {
  id: string;
  voucherRoleKeyId: string;
  voucheePubkey: Uint8Array;
  context: string;
  text: string;
  signedAt: string;
  expiresAt?: string | null;
  signature: Uint8Array;
}

export interface MarketplaceRatingRow {
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

export interface MarketplaceRevocationRow {
  id: string;
  revokedPubkey: Uint8Array;
  revokedKind: "device" | "role";
  reason?: string | null;
  signedAt: string;
  rootPubkey: Uint8Array;
  rootSignature: Uint8Array;
  observedAt: string;
}
