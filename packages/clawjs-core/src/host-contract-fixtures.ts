import { clawContractVersionV1 } from "./host-contracts.ts";
import type {
  ClawApproval,
  ClawAuditEvent,
  ClawCapability,
  ClawCommandRequest,
  ClawCommandResponse,
  ClawGrant,
  ClawHostDescriptor,
  ClawHostRegistry,
} from "./host-contracts.ts";

export const clawContractFixtureTimestamp = "2026-05-13T10:00:00.000Z";

export const clawHostCapabilityFixturesV1: ClawCapability[] = [
  {
    id: "calendar.events.list",
    domain: "calendar",
    actions: ["list", "get", "search"],
    riskLevel: "read",
    brokerRequired: true,
    destructive: false,
    costSensitive: false,
    requiresOSPermission: true,
    osPermissionState: "unknown",
  },
  {
    id: "files.entries.delete",
    domain: "files",
    actions: ["delete"],
    riskLevel: "destructive",
    brokerRequired: true,
    destructive: true,
    costSensitive: false,
    requiresOSPermission: false,
    osPermissionState: "not_applicable",
  },
  {
    id: "models.remote.generate",
    domain: "models",
    actions: ["generate"],
    riskLevel: "cost",
    brokerRequired: true,
    destructive: false,
    costSensitive: true,
    requiresOSPermission: false,
    osPermissionState: "not_applicable",
  },
];

export const clawHostDescriptorFixtureV1: ClawHostDescriptor = {
  schemaVersion: clawContractVersionV1,
  id: "clawix",
  displayName: "Clawix",
  kind: "embedded",
  bundleId: "com.example.clawix",
  executablePath: "/Applications/Clawix.app/Contents/MacOS/Clawix",
  appSupportDir: "/Users/demo/Library/Application Support/Clawix",
  endpoint: {
    transport: "unix_socket",
    address: "/Users/demo/Library/Application Support/Clawix/daemon.sock",
  },
  capabilities: clawHostCapabilityFixturesV1,
  registeredAt: clawContractFixtureTimestamp,
  updatedAt: clawContractFixtureTimestamp,
};

export const clawHostRegistryFixtureV1: ClawHostRegistry = {
  schemaVersion: clawContractVersionV1,
  activeHostId: "clawix",
  hosts: [clawHostDescriptorFixtureV1],
  updatedAt: clawContractFixtureTimestamp,
};

export const clawCommandRequestFixtureV1: ClawCommandRequest = {
  schemaVersion: clawContractVersionV1,
  requestId: "req-calendar-list",
  domain: "calendar",
  resource: "events",
  action: "list",
  arguments: { limit: 10 },
  clientContext: {
    bundleId: "com.example.clawix",
    executablePath: "/Applications/Clawix.app/Contents/MacOS/Clawix",
    tty: false,
  },
  validationMode: "host_real",
};

export const clawCommandResponseFixtureV1: ClawCommandResponse = {
  schemaVersion: clawContractVersionV1,
  requestId: "req-calendar-list",
  ok: true,
  data: {
    events: [],
  },
  meta: {
    hostId: "clawix",
    capabilityId: "calendar.events.list",
    riskLevel: "read",
    validationMode: "host_real",
    durationMs: 4,
  },
};

export const clawGrantFixtureV1: ClawGrant = {
  schemaVersion: clawContractVersionV1,
  id: "grant-calendar-read",
  hostId: "clawix",
  capabilityId: "calendar.events.list",
  domain: "calendar",
  action: "list",
  status: "active",
  reason: "User enabled calendar reads for Clawix.",
  createdAt: clawContractFixtureTimestamp,
  expiresAt: null,
  revokedAt: null,
};

export const clawApprovalFixtureV1: ClawApproval = {
  schemaVersion: clawContractVersionV1,
  id: "approval-files-delete",
  hostId: "clawix",
  requestId: "req-files-delete",
  capabilityId: "files.entries.delete",
  status: "pending",
  riskLevel: "destructive",
  reason: "Delete requires explicit host approval.",
  createdAt: clawContractFixtureTimestamp,
  decidedAt: null,
};

export const clawAuditEventFixtureV1: ClawAuditEvent = {
  schemaVersion: clawContractVersionV1,
  id: "audit-calendar-list",
  hostId: "clawix",
  requestId: "req-calendar-list",
  capabilityId: "calendar.events.list",
  domain: "calendar",
  action: "list",
  riskLevel: "read",
  result: "ok",
  message: "Listed calendar events through Clawix host.",
  createdAt: clawContractFixtureTimestamp,
};

export const clawContractFixturesV1 = {
  commandRequest: clawCommandRequestFixtureV1,
  commandResponse: clawCommandResponseFixtureV1,
  hostDescriptor: clawHostDescriptorFixtureV1,
  hostRegistry: clawHostRegistryFixtureV1,
  capabilities: clawHostCapabilityFixturesV1,
  grant: clawGrantFixtureV1,
  approval: clawApprovalFixtureV1,
  auditEvent: clawAuditEventFixtureV1,
};
