// Audit event taxonomy. Mirrors Clawix Swift `AuditEventKind`.

export type AuditEventKind =
  // Proxy / brokered execution
  | "proxyRequest"
  | "proxyExec"
  | "proxySsh"
  | "proxyGit"
  | "proxyRelease"
  | "proxyPublish"
  // UI interactions
  | "uiView"
  | "uiCopy"
  | "uiReveal"
  | "uiExport"
  // Admin / lifecycle
  | "adminCreate"
  | "adminEdit"
  | "adminRotate"
  | "adminToggle"
  | "adminArchive"
  | "adminTrash"
  | "adminPurge"
  | "adminCompromise"
  | "adminRestoreVersion"
  // Secrets lifecycle
  | "secretsSetup"
  | "secretsUnlock"
  | "secretsLocalUnlock"
  | "secretsLock"
  | "secretsFailedUnlock"
  | "secretsPasswordChange"
  | "secretsRecoveryUsed"
  | "secretsExport"
  | "secretsImport"
  // Grants
  | "grantIssued"
  | "grantUsed"
  | "grantRevoked"
  | "grantExpired"
  | "leaseIssued"
  | "leaseRevoked"
  // Anomaly + integrity
  | "anomalyDetected"
  | "auditIntegrityFailed";

export type AuditSource = "proxy" | "ui" | "admin" | "system";

export interface NewAuditEvent {
  kind: AuditEventKind;
  source: AuditSource;
  secretId?: string | null;
  folderId?: string | null;
  versionId?: string | null;
  success?: boolean;
  deviceId?: string | null;
  sessionId?: string | null;
  payload: Record<string, unknown>;
}

export interface DecryptedAuditEvent {
  id: string;
  tenantId: string;
  secretId: string | null;
  folderId: string | null;
  versionId: string | null;
  kind: AuditEventKind;
  timestamp: string;
  source: AuditSource;
  success: boolean | null;
  deviceId: string | null;
  sessionId: string | null;
  sequence: number;
  prevHashBase64: string;
  selfHashBase64: string;
  payload: Record<string, unknown>;
}

export interface AuditEventFilter {
  kinds?: AuditEventKind[];
  source?: AuditSource;
  secretId?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export interface AuditIntegrityReport {
  totalEvents: number;
  verified: number;
  tampered: { eventId: string; sequence: number }[];
  ok: boolean;
}
