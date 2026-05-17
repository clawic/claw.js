import { z } from "zod";

import { clawContractVersionV1 } from "./host-contracts.ts";

export const clawMacControlPlaneRegistryVersion = 1;

export const macRiskTierSchema = z.enum(["read", "low", "medium", "high", "critical"]);
export const macCoverageStateSchema = z.enum([
  "documented",
  "planned",
  "dry_run",
  "executable",
  "host_validated",
  "manual_only",
  "blocked",
  "unsupported",
  "private_fragile",
  "deprecated",
]);
export const macSourceConfidenceSchema = z.enum(["official", "observed", "community_known", "private_fragile", "needs_research"]);
export const macPermissionOsStateSchema = z.enum(["unknown", "not_determined", "authorized", "denied", "restricted", "manual_only", "not_queryable"]);
export const macFrameworkGrantStateSchema = z.enum(["not_required", "not_granted", "granted", "denied", "expired", "revoked"]);
export const macActorKindSchema = z.enum(["owner_cli", "user_ui", "agent", "mcp_client", "automation", "system"]);
export const macRoleSchema = z.enum(["owner", "admin", "operator", "viewer"]);
export const macRevertLevelSchema = z.enum(["guaranteed", "best_effort", "none"]);
export const macActionResultSchema = z.enum(["planned", "ok", "denied", "blocked", "error", "reverted"]);
export const macApprovalStatusSchema = z.enum(["pending", "approved", "rejected", "expired", "revoked"]);
export const macActionBrokerDecisionSchema = z.enum(["dry_run", "allow", "approval_required", "blocked"]);
export const macProgrammaticSurfaceKindSchema = z.enum(["mcp_tool", "api_route", "sdk_method"]);
export const macProgrammaticLifecycleActionSchema = z.enum(["plan", "execute", "revert", "audit", "permissions"]);

export const macActorSchema = z.object({
  kind: macActorKindSchema,
  id: z.string().min(1),
  role: macRoleSchema.optional(),
  assignmentId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
});

export const macHostIdentitySchema = z.object({
  hostId: z.string().min(1),
  bundleId: z.string().min(1),
  signingIdentity: z.string().min(1).optional(),
  teamId: z.string().min(1).optional(),
  appVariant: z.string().min(1).optional(),
  appVersion: z.string().min(1).optional(),
});

export const macActionTargetSchema = z.object({
  kind: z.string().min(1),
  id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  selector: z.record(z.unknown()).default({}),
});

export const macActionRequestSchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  requestId: z.string().min(1),
  capabilityId: z.string().regex(/^mac\.[a-z0-9_-]+(\.[a-z0-9_-]+)+$/),
  actor: macActorSchema,
  host: macHostIdentitySchema,
  target: macActionTargetSchema.optional(),
  arguments: z.record(z.unknown()).default({}),
  dryRun: z.boolean().default(false),
  reason: z.string().min(1).optional(),
});

export const macRequiredApprovalSchema = z.object({
  risk: macRiskTierSchema,
  reason: z.string().min(1),
  approverRoles: z.array(z.enum(["owner", "admin"])).min(1),
  requestId: z.string().min(1).optional(),
});

export const macPermissionRequirementSchema = z.object({
  permissionId: z.string().regex(/^mac\.permission\.[a-z0-9_-]+$/),
  required: z.boolean(),
  currentOsState: macPermissionOsStateSchema.default("unknown"),
  currentFrameworkGrant: macFrameworkGrantStateSchema.default("not_granted"),
  guidance: z.string().min(1).optional(),
});

export const macRollbackPlanSchema = z.object({
  level: macRevertLevelSchema,
  timerSeconds: z.number().int().positive().optional(),
  snapshotRequired: z.boolean().default(false),
  snapshotRef: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
});

export const macActionPlanSchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  planId: z.string().min(1),
  requestId: z.string().min(1),
  capabilityId: z.string().min(1),
  risk: macRiskTierSchema,
  coverageState: macCoverageStateSchema,
  actor: macActorSchema,
  host: macHostIdentitySchema,
  resolvedTarget: macActionTargetSchema.optional(),
  permissionRequirements: z.array(macPermissionRequirementSchema).default([]),
  requiredApprovals: z.array(macRequiredApprovalSchema).default([]),
  rollback: macRollbackPlanSchema,
  willMutate: z.boolean(),
  executable: z.boolean(),
  blockedReasons: z.array(z.string().min(1)).default([]),
  relatedSurfaces: z.array(z.string().min(1)).default([]),
});

export const macActionReceiptSchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  id: z.string().regex(/^macact_[a-zA-Z0-9_-]+$/),
  requestId: z.string().min(1),
  planId: z.string().min(1).optional(),
  capabilityId: z.string().min(1),
  actor: macActorSchema,
  host: macHostIdentitySchema,
  result: macActionResultSchema,
  risk: macRiskTierSchema,
  permissionSnapshotRefs: z.array(z.string().min(1)).default([]),
  beforeRef: z.string().min(1).optional(),
  afterRef: z.string().min(1).optional(),
  auditId: z.string().min(1),
  revert: macRollbackPlanSchema,
  secretRefs: z.array(z.string().min(1)).default([]),
  redaction: z.object({
    level: z.enum(["high", "medium", "low"]),
    fields: z.array(z.string().min(1)).default([]),
  }).default({ level: "high", fields: [] }),
  createdAt: z.string().min(1),
});

export const macActionAuditEventSchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  id: z.string().regex(/^macaudit_[a-zA-Z0-9_-]+$/),
  receiptId: z.string().regex(/^macact_[a-zA-Z0-9_-]+$/),
  requestId: z.string().min(1),
  planId: z.string().min(1).optional(),
  capabilityId: z.string().min(1),
  actor: macActorSchema,
  host: macHostIdentitySchema,
  result: macActionResultSchema,
  risk: macRiskTierSchema,
  summary: z.string().min(1),
  redaction: z.object({
    level: z.enum(["high", "medium", "low"]),
    fields: z.array(z.string().min(1)).default([]),
  }),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().min(1),
});

export const macActionBrokerEvaluationSchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  decision: macActionBrokerDecisionSchema,
  requestId: z.string().min(1),
  planId: z.string().min(1),
  capabilityId: z.string().min(1),
  actor: macActorSchema,
  host: macHostIdentitySchema,
  reasons: z.array(z.string().min(1)).default([]),
  approvalRequestIds: z.array(z.string().min(1)).default([]),
  receipt: macActionReceiptSchema.optional(),
  auditEvent: macActionAuditEventSchema.optional(),
});

export const macPermissionStateSchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  permissionId: z.string().regex(/^mac\.permission\.[a-z0-9_-]+$/),
  host: macHostIdentitySchema,
  osState: macPermissionOsStateSchema,
  frameworkGrant: macFrameworkGrantStateSchema,
  requestedBefore: z.boolean(),
  canRequest: z.boolean(),
  requiresRestart: z.boolean().default(false),
  source: z.string().min(1),
  guidance: z.string().min(1).optional(),
  firstUsedAt: z.string().min(1).optional(),
  lastCheckedAt: z.string().min(1),
  lastRequestedAt: z.string().min(1).optional(),
  lastRequestResult: macPermissionOsStateSchema.optional(),
  revocationDetectedAt: z.string().min(1).optional(),
});

export const macPolicyGrantSchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  id: z.string().min(1),
  subject: z.object({
    kind: z.enum(["role", "user", "agent", "assignment", "run", "mcp_client", "automation"]),
    id: z.string().min(1),
  }),
  capabilityIds: z.array(z.string().min(1)).default([]),
  permissionIds: z.array(z.string().min(1)).default([]),
  riskCeiling: macRiskTierSchema.default("read"),
  duration: z.object({
    kind: z.enum(["task", "session", "ttl", "permanent"]),
    ttlSeconds: z.number().int().positive().optional(),
  }).default({ kind: "task", ttlSeconds: 1800 }),
  createdBy: macActorSchema,
  createdAt: z.string().min(1),
  expiresAt: z.string().min(1).optional(),
  status: z.enum(["active", "expired", "revoked"]).default("active"),
});

export const macApprovalRequestSchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  id: z.string().min(1),
  actionRequest: macActionRequestSchema,
  plan: macActionPlanSchema,
  approverRoles: z.array(z.enum(["owner", "admin"])).min(1),
  status: macApprovalStatusSchema,
  createdAt: z.string().min(1),
  decidedAt: z.string().min(1).optional(),
  decidedBy: macActorSchema.optional(),
});

export const macRoleAssignmentSchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  id: z.string().min(1),
  localIdentityId: z.string().min(1),
  role: macRoleSchema,
  hostId: z.string().min(1),
  assignedByRole: z.literal("owner"),
  createdAt: z.string().min(1),
  revokedAt: z.string().min(1).optional(),
});

export const macAtlasCapabilitySchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  id: z.string().regex(/^mac\.[a-z0-9_-]+(\.[a-z0-9_-]+)+$/),
  family: z.string().min(1),
  action: z.string().min(1),
  label: z.string().min(1),
  summary: z.string().min(1),
  portableFamily: z.string().min(1).optional(),
  platforms: z.array(z.enum(["darwin", "linux", "win32"])).min(1),
  macos: z.object({
    minVersion: z.string().min(1).default("14"),
    maxVersion: z.string().min(1).optional(),
    knownChanges: z.array(z.string().min(1)).default([]),
    validation: z.array(z.enum(["fixture", "dry_run", "host_isolated", "host_real"])).default(["fixture"]),
  }).default({ minVersion: "14", knownChanges: [], validation: ["fixture"] }),
  coverageState: macCoverageStateSchema,
  sourceConfidence: macSourceConfidenceSchema,
  sources: z.array(z.object({
    label: z.string().min(1),
    url: z.string().min(1).optional(),
    localPath: z.string().min(1).optional(),
  })).min(1),
  backend: z.object({
    strategy: z.enum(["corewlan", "networksetup", "accessibility_ax", "cgwindow_observation", "shortcuts_cli", "system_cli", "appkit", "manual", "blocked", "mixed"]),
    executablePath: z.string().min(1).optional(),
    notes: z.string().min(1).optional(),
  }),
  permissions: z.array(z.string().regex(/^mac\.permission\.[a-z0-9_-]+$/)).default([]),
  risk: macRiskTierSchema,
  mutatesState: z.boolean(),
  revert: macRevertLevelSchema,
  cli: z.object({
    root: z.string().min(1),
    canonicalUsage: z.string().min(1),
    aliases: z.array(z.string().min(1)).default([]),
    relatedSurfaces: z.array(z.string().min(1)).default([]),
  }),
  uiPack: z.string().min(1),
  testRefs: z.array(z.string().min(1)).default([]),
});

export const macProgrammaticSurfaceSchema = z.object({
  schemaVersion: z.literal(clawContractVersionV1),
  id: z.string().regex(/^mac\.surface\.[a-z0-9_-]+(\.[a-z0-9_-]+)+$/),
  kind: macProgrammaticSurfaceKindSchema,
  name: z.string().min(1),
  transport: z.enum(["mcp", "http", "sdk"]),
  lifecycleAction: macProgrammaticLifecycleActionSchema,
  summary: z.string().min(1),
  inputSchemaId: z.string().min(1),
  outputSchemaId: z.string().min(1),
  mutatesNativeState: z.boolean(),
  requiresSignedHost: z.boolean(),
  requiresApproval: z.boolean(),
  route: z.string().min(1).optional(),
  relatedCli: z.array(z.string().min(1)).default([]),
  testRefs: z.array(z.string().min(1)).default([]),
});

export type MacRiskTier = z.infer<typeof macRiskTierSchema>;
export type MacCoverageState = z.infer<typeof macCoverageStateSchema>;
export type MacActionBrokerDecision = z.infer<typeof macActionBrokerDecisionSchema>;
export type MacActionBrokerEvaluation = z.infer<typeof macActionBrokerEvaluationSchema>;
export type MacActionAuditEvent = z.infer<typeof macActionAuditEventSchema>;
export type MacActionRequest = z.infer<typeof macActionRequestSchema>;
export type MacActionPlan = z.infer<typeof macActionPlanSchema>;
export type MacActionReceipt = z.infer<typeof macActionReceiptSchema>;
export type MacActionResult = z.infer<typeof macActionResultSchema>;
export type MacPermissionState = z.infer<typeof macPermissionStateSchema>;
export type MacPolicyGrant = z.infer<typeof macPolicyGrantSchema>;
export type MacApprovalRequest = z.infer<typeof macApprovalRequestSchema>;
export type MacRoleAssignment = z.infer<typeof macRoleAssignmentSchema>;
export type MacAtlasCapability = z.infer<typeof macAtlasCapabilitySchema>;
export type MacProgrammaticSurface = z.infer<typeof macProgrammaticSurfaceSchema>;
export type MacProgrammaticSurfaceKind = z.infer<typeof macProgrammaticSurfaceKindSchema>;
export type MacProgrammaticLifecycleAction = z.infer<typeof macProgrammaticLifecycleActionSchema>;

export interface BuildMacActionPlanInput {
  request: MacActionRequest;
  capability?: MacAtlasCapability;
  permissionStates?: MacPermissionState[];
}

export interface BuildMacActionReceiptInput {
  request: MacActionRequest;
  plan: MacActionPlan;
  result: MacActionResult;
  now?: string;
  id?: string;
  auditId?: string;
  permissionSnapshotRefs?: string[];
  beforeRef?: string;
  afterRef?: string;
  secretRefs?: string[];
  redaction?: {
    level: "high" | "medium" | "low";
    fields?: string[];
  };
}

export interface BuildMacActionAuditEventInput {
  receipt: MacActionReceipt;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface EvaluateMacActionBrokerInput {
  request: MacActionRequest;
  plan: MacActionPlan;
  approvals?: MacApprovalRequest[];
  now?: string;
}

export interface MacControlCommandRoot {
  root: string;
  family: string;
  summary: string;
  canonical: boolean;
  support: "atlas" | "dry_run" | "executable";
  relatedSurfaces?: string[];
}

export interface MacPermissionCatalogEntry {
  id: string;
  label: string;
  pack: string;
  osName: string;
  tccService?: string;
  usageDescriptionKeys?: string[];
  entitlementKeys?: string[];
  canPrompt: boolean;
  manualOnly?: boolean;
  source: "official" | "observed" | "needs_research";
}

export interface MacPermissionPack {
  id: string;
  label: string;
  intent: string;
  permissionIds: string[];
}

export const MAC_CONTROL_COMMAND_ROOTS: MacControlCommandRoot[] = [
  { root: "mac", family: "control-plane", summary: "Mac atlas, coverage, doctor, audit, planning and revert portal.", canonical: true, support: "dry_run" },
  { root: "permissions", family: "permissions", summary: "Central OS permission and framework grant control plane.", canonical: true, support: "dry_run", relatedSurfaces: ["claw mac permissions", "claw host permissions"] },
  { root: "wifi", family: "network", summary: "Wi-Fi status, scan/list, connect, disconnect and power state.", canonical: true, support: "executable" },
  { root: "window", family: "window", summary: "List, focus, move, resize, close and minimize local windows.", canonical: true, support: "executable" },
  { root: "shortcut", family: "automation", summary: "List, inspect and run existing macOS Shortcuts.", canonical: true, support: "executable" },
  { root: "app", family: "apps", summary: "Local app lifecycle and focus control.", canonical: true, support: "atlas", relatedSurfaces: ["claw apps"] },
  { root: "process", family: "process", summary: "Process inspection and governed signal/termination actions.", canonical: true, support: "atlas" },
  { root: "network", family: "network", summary: "Network umbrella diagnostics and shared status.", canonical: true, support: "atlas" },
  { root: "vpn", family: "network", summary: "VPN status and governed connection changes.", canonical: true, support: "atlas" },
  { root: "proxy", family: "network", summary: "Proxy status and governed configuration changes.", canonical: true, support: "atlas" },
  { root: "firewall", family: "network", summary: "Firewall status and governed configuration changes.", canonical: true, support: "atlas" },
  { root: "bluetooth", family: "peripherals", summary: "Bluetooth status and governed device connection actions.", canonical: true, support: "atlas" },
  { root: "display", family: "display", summary: "Monitor arrangement, resolution and brightness controls.", canonical: true, support: "atlas" },
  { root: "screen", family: "screen", summary: "Screen capture, recording and observation capabilities.", canonical: true, support: "atlas" },
  { root: "audio", family: "audio", summary: "System audio devices, volume and mute controls.", canonical: true, support: "atlas", relatedSurfaces: ["claw media audio"] },
  { root: "input", family: "input", summary: "Input device and event capabilities.", canonical: true, support: "atlas" },
  { root: "keyboard", family: "input", summary: "Keyboard input and shortcut-related capabilities.", canonical: true, support: "atlas" },
  { root: "mouse", family: "input", summary: "Mouse pointer and click-related capabilities.", canonical: true, support: "atlas" },
  { root: "trackpad", family: "input", summary: "Trackpad status and gesture-related capabilities.", canonical: true, support: "atlas" },
  { root: "clipboard", family: "clipboard", summary: "Clipboard read/write capabilities.", canonical: true, support: "atlas" },
  { root: "focus", family: "focus", summary: "Focus/Do Not Disturb state and governed changes.", canonical: true, support: "atlas" },
  { root: "notification", family: "notification", summary: "Notification permission and status control.", canonical: true, support: "atlas", relatedSurfaces: ["claw notify"] },
  { root: "power", family: "power", summary: "Power, sleep and wake-related status and actions.", canonical: true, support: "atlas" },
  { root: "battery", family: "power", summary: "Battery status and power mode capabilities.", canonical: true, support: "atlas" },
  { root: "camera", family: "privacy", summary: "Camera permission and capture-related capabilities.", canonical: true, support: "atlas" },
  { root: "microphone", family: "privacy", summary: "Microphone permission and input device capabilities.", canonical: true, support: "atlas", relatedSurfaces: ["claw stt", "claw tts"] },
  { root: "speech", family: "privacy", summary: "macOS Speech Recognition permission and OS speech capabilities.", canonical: true, support: "atlas", relatedSurfaces: ["claw stt", "claw tts"] },
  { root: "printer", family: "peripherals", summary: "Printer status and governed print actions.", canonical: true, support: "atlas" },
  { root: "usb", family: "peripherals", summary: "USB and attached peripheral observation capabilities.", canonical: true, support: "atlas" },
  { root: "disk", family: "storage", summary: "Disk and removable volume observation and governed actions.", canonical: true, support: "atlas" },
  { root: "privacy", family: "privacy", summary: "Privacy-related permission and protection atlas.", canonical: true, support: "atlas" },
  { root: "security", family: "security", summary: "Security posture, gatekeeper and sensitive system controls.", canonical: true, support: "atlas" },
  { root: "automation", family: "automation", summary: "Apple Events, Shortcuts and UI automation capability atlas.", canonical: true, support: "atlas" },
  { root: "accessibility", family: "accessibility", summary: "Accessibility permission and AX-backed automation capabilities.", canonical: true, support: "atlas" },
  { root: "dock", family: "desktop", summary: "Dock state and governed preference capabilities.", canonical: true, support: "atlas" },
  { root: "finder", family: "desktop", summary: "Finder and desktop interaction capabilities.", canonical: true, support: "atlas" },
  { root: "desktop", family: "desktop", summary: "Desktop, spaces and Mission Control capability atlas.", canonical: true, support: "atlas" },
];

export const MAC_PERMISSION_PACKS: MacPermissionPack[] = [
  { id: "windows", label: "Windows", intent: "Window focus and UI automation", permissionIds: ["mac.permission.accessibility", "mac.permission.screen_capture"] },
  { id: "voice", label: "Voice", intent: "Microphone and speech recognition", permissionIds: ["mac.permission.microphone", "mac.permission.speech_recognition"] },
  { id: "network", label: "Network", intent: "Network, VPN and connectivity changes", permissionIds: [] },
  { id: "automation", label: "Automation", intent: "Apple Events, Shortcuts and UI scripting", permissionIds: ["mac.permission.automation_apple_events", "mac.permission.accessibility"] },
  { id: "files", label: "Files", intent: "Protected folders and full disk access", permissionIds: ["mac.permission.files_desktop_documents_downloads", "mac.permission.full_disk_access"] },
  { id: "screen", label: "Screen", intent: "Screen capture and recording", permissionIds: ["mac.permission.screen_capture"] },
  { id: "privacy", label: "Privacy", intent: "Camera, location, contacts, calendars and reminders", permissionIds: ["mac.permission.camera", "mac.permission.location", "mac.permission.contacts", "mac.permission.calendar", "mac.permission.reminders"] },
  { id: "notifications", label: "Notifications", intent: "Notification permission and delivery state", permissionIds: ["mac.permission.notifications"] },
];

export const MAC_PERMISSION_CATALOG: MacPermissionCatalogEntry[] = [
  { id: "mac.permission.accessibility", label: "Accessibility", pack: "windows", osName: "Accessibility", tccService: "kTCCServiceAccessibility", canPrompt: false, manualOnly: true, source: "official" },
  { id: "mac.permission.screen_capture", label: "Screen Recording", pack: "screen", osName: "Screen Recording", tccService: "kTCCServiceScreenCapture", canPrompt: true, source: "official" },
  { id: "mac.permission.microphone", label: "Microphone", pack: "voice", osName: "Microphone", tccService: "kTCCServiceMicrophone", usageDescriptionKeys: ["NSMicrophoneUsageDescription"], canPrompt: true, source: "official" },
  { id: "mac.permission.speech_recognition", label: "Speech Recognition", pack: "voice", osName: "Speech Recognition", usageDescriptionKeys: ["NSSpeechRecognitionUsageDescription"], canPrompt: true, source: "official" },
  { id: "mac.permission.camera", label: "Camera", pack: "privacy", osName: "Camera", tccService: "kTCCServiceCamera", usageDescriptionKeys: ["NSCameraUsageDescription"], canPrompt: true, source: "official" },
  { id: "mac.permission.automation_apple_events", label: "Automation Apple Events", pack: "automation", osName: "Automation", tccService: "kTCCServiceAppleEvents", usageDescriptionKeys: ["NSAppleEventsUsageDescription"], canPrompt: true, source: "official" },
  { id: "mac.permission.notifications", label: "Notifications", pack: "notifications", osName: "Notifications", canPrompt: true, source: "official" },
  { id: "mac.permission.location", label: "Location Services", pack: "privacy", osName: "Location Services", tccService: "kTCCServiceLocation", usageDescriptionKeys: ["NSLocationUsageDescription"], canPrompt: true, source: "official" },
  { id: "mac.permission.contacts", label: "Contacts", pack: "privacy", osName: "Contacts", tccService: "kTCCServiceAddressBook", usageDescriptionKeys: ["NSContactsUsageDescription"], canPrompt: true, source: "official" },
  { id: "mac.permission.calendar", label: "Calendar", pack: "privacy", osName: "Calendar", tccService: "kTCCServiceCalendar", usageDescriptionKeys: ["NSCalendarsUsageDescription"], canPrompt: true, source: "official" },
  { id: "mac.permission.reminders", label: "Reminders", pack: "privacy", osName: "Reminders", tccService: "kTCCServiceReminders", usageDescriptionKeys: ["NSRemindersUsageDescription"], canPrompt: true, source: "official" },
  { id: "mac.permission.files_desktop_documents_downloads", label: "Protected Folders", pack: "files", osName: "Files and Folders", canPrompt: false, manualOnly: true, source: "official" },
  { id: "mac.permission.full_disk_access", label: "Full Disk Access", pack: "files", osName: "Full Disk Access", canPrompt: false, manualOnly: true, source: "official" },
  { id: "mac.permission.bluetooth", label: "Bluetooth", pack: "privacy", osName: "Bluetooth", tccService: "kTCCServiceBluetoothAlways", usageDescriptionKeys: ["NSBluetoothAlwaysUsageDescription"], canPrompt: true, source: "official" },
];

function programmaticSurface(input: Omit<z.input<typeof macProgrammaticSurfaceSchema>, "schemaVersion">): MacProgrammaticSurface {
  return macProgrammaticSurfaceSchema.parse({ schemaVersion: clawContractVersionV1, ...input });
}

const macProgrammaticSurfaceTests = ["packages/clawjs-core/src/mac-control-plane.test.ts"];

export const MAC_PROGRAMMATIC_SURFACES: MacProgrammaticSurface[] = [
  programmaticSurface({
    id: "mac.surface.mcp.plan",
    kind: "mcp_tool",
    name: "mac.plan",
    transport: "mcp",
    lifecycleAction: "plan",
    summary: "Build a Mac action plan from an action request without native execution.",
    inputSchemaId: "macActionRequestSchema",
    outputSchemaId: "macActionPlanSchema",
    mutatesNativeState: false,
    requiresSignedHost: false,
    requiresApproval: false,
    relatedCli: ["claw mac plan", "claw wifi connect --dry-run"],
    testRefs: macProgrammaticSurfaceTests,
  }),
  programmaticSurface({
    id: "mac.surface.mcp.execute",
    kind: "mcp_tool",
    name: "mac.execute",
    transport: "mcp",
    lifecycleAction: "execute",
    summary: "Evaluate broker policy and hand an approved action plan to the active signed host.",
    inputSchemaId: "macActionPlanSchema",
    outputSchemaId: "macActionBrokerEvaluationSchema",
    mutatesNativeState: true,
    requiresSignedHost: true,
    requiresApproval: true,
    relatedCli: ["claw mac plan", "claw approvals"],
    testRefs: macProgrammaticSurfaceTests,
  }),
  programmaticSurface({
    id: "mac.surface.mcp.revert",
    kind: "mcp_tool",
    name: "mac.revert",
    transport: "mcp",
    lifecycleAction: "revert",
    summary: "Plan and route a revert for a previous Mac action receipt.",
    inputSchemaId: "macActionReceiptSchema",
    outputSchemaId: "macActionPlanSchema",
    mutatesNativeState: true,
    requiresSignedHost: true,
    requiresApproval: true,
    relatedCli: ["claw mac revert"],
    testRefs: macProgrammaticSurfaceTests,
  }),
  programmaticSurface({
    id: "mac.surface.mcp.audit",
    kind: "mcp_tool",
    name: "mac.audit",
    transport: "mcp",
    lifecycleAction: "audit",
    summary: "Read redacted Mac action receipts and audit events.",
    inputSchemaId: "macActionAuditQuerySchema",
    outputSchemaId: "macActionAuditEventSchema",
    mutatesNativeState: false,
    requiresSignedHost: false,
    requiresApproval: false,
    relatedCli: ["claw mac audit"],
    testRefs: macProgrammaticSurfaceTests,
  }),
  programmaticSurface({
    id: "mac.surface.mcp.permissions",
    kind: "mcp_tool",
    name: "mac.permissions",
    transport: "mcp",
    lifecycleAction: "permissions",
    summary: "Read permission state or create just-in-time permission request plans through the central broker.",
    inputSchemaId: "macPermissionStateSchema",
    outputSchemaId: "macPermissionStateSchema",
    mutatesNativeState: false,
    requiresSignedHost: true,
    requiresApproval: false,
    relatedCli: ["claw permissions check", "claw permissions request"],
    testRefs: macProgrammaticSurfaceTests,
  }),
  ...[
    ["plan", "/v1/mac/plan", "macActionRequestSchema", "macActionPlanSchema", false, false, false],
    ["execute", "/v1/mac/execute", "macActionPlanSchema", "macActionBrokerEvaluationSchema", true, true, true],
    ["revert", "/v1/mac/revert", "macActionReceiptSchema", "macActionPlanSchema", true, true, true],
    ["audit", "/v1/mac/audit", "macActionAuditQuerySchema", "macActionAuditEventSchema", false, false, false],
    ["permissions", "/v1/mac/permissions", "macPermissionStateSchema", "macPermissionStateSchema", false, true, false],
  ].map(([action, route, inputSchemaId, outputSchemaId, mutatesNativeState, requiresSignedHost, requiresApproval]) => programmaticSurface({
    id: `mac.surface.api.${action}`,
    kind: "api_route",
    name: route as string,
    transport: "http",
    lifecycleAction: action as z.infer<typeof macProgrammaticLifecycleActionSchema>,
    summary: `HTTP ${route} projection of the Mac ${action} contract.`,
    inputSchemaId: inputSchemaId as string,
    outputSchemaId: outputSchemaId as string,
    mutatesNativeState: mutatesNativeState as boolean,
    requiresSignedHost: requiresSignedHost as boolean,
    requiresApproval: requiresApproval as boolean,
    route: route as string,
    relatedCli: action === "permissions" ? ["claw permissions"] : [`claw mac ${action}`],
    testRefs: macProgrammaticSurfaceTests,
  })),
  ...[
    ["plan", "claw.mac.plan", "macActionRequestSchema", "macActionPlanSchema", false, false, false],
    ["execute", "claw.mac.execute", "macActionPlanSchema", "macActionBrokerEvaluationSchema", true, true, true],
    ["revert", "claw.mac.revert", "macActionReceiptSchema", "macActionPlanSchema", true, true, true],
    ["audit", "claw.mac.audit", "macActionAuditQuerySchema", "macActionAuditEventSchema", false, false, false],
    ["permissions", "claw.mac.permissions", "macPermissionStateSchema", "macPermissionStateSchema", false, true, false],
  ].map(([action, name, inputSchemaId, outputSchemaId, mutatesNativeState, requiresSignedHost, requiresApproval]) => programmaticSurface({
    id: `mac.surface.sdk.${action}`,
    kind: "sdk_method",
    name: name as string,
    transport: "sdk",
    lifecycleAction: action as z.infer<typeof macProgrammaticLifecycleActionSchema>,
    summary: `SDK projection of the Mac ${action} contract.`,
    inputSchemaId: inputSchemaId as string,
    outputSchemaId: outputSchemaId as string,
    mutatesNativeState: mutatesNativeState as boolean,
    requiresSignedHost: requiresSignedHost as boolean,
    requiresApproval: requiresApproval as boolean,
    relatedCli: action === "permissions" ? ["claw permissions"] : [`claw mac ${action}`],
    testRefs: macProgrammaticSurfaceTests,
  })),
];

const appleProtectedResources = "https://developer.apple.com/documentation/bundleresources/protected-resources";
const appleAx = "https://developer.apple.com/documentation/applicationservices/axuielement_h";
const appleCoreWlan = "https://developer.apple.com/documentation/corewlan/cwinterface";
const appleShortcuts = "https://support.apple.com/guide/shortcuts-mac/apd455c82f02/mac";

type MacAtlasCapabilityInput = z.input<typeof macAtlasCapabilitySchema>;

function capability(input: Omit<MacAtlasCapabilityInput, "schemaVersion">): MacAtlasCapability {
  return macAtlasCapabilitySchema.parse({ schemaVersion: clawContractVersionV1, ...input });
}

const wifiPermissions: string[] = [];
const windowPermissions = ["mac.permission.accessibility"];
const screenPermissions = ["mac.permission.screen_capture"];

export const MAC_CAPABILITY_ATLAS: MacAtlasCapability[] = [
  capability({
    id: "mac.wifi.status",
    family: "wifi",
    action: "status",
    label: "Wi-Fi status",
    summary: "Read Wi-Fi power, interface and current network state.",
    portableFamily: "network.wifi.status",
    platforms: ["darwin"],
    coverageState: "executable",
    sourceConfidence: "official",
    sources: [{ label: "CoreWLAN CWInterface", url: appleCoreWlan }, { label: "networksetup", localPath: "/usr/sbin/networksetup" }],
    backend: { strategy: "mixed", notes: "CoreWLAN for read/list where useful; networksetup for stable interface state." },
    permissions: wifiPermissions,
    risk: "read",
    mutatesState: false,
    revert: "none",
    cli: { root: "wifi", canonicalUsage: "claw wifi status", aliases: [] },
    uiPack: "network",
    testRefs: ["packages/clawjs-core/src/mac-control-plane.test.ts"],
  }),
  capability({
    id: "mac.wifi.list",
    family: "wifi",
    action: "list",
    label: "List Wi-Fi networks",
    summary: "List known or available Wi-Fi networks with redaction policy.",
    portableFamily: "network.wifi.list",
    platforms: ["darwin"],
    coverageState: "executable",
    sourceConfidence: "official",
    sources: [{ label: "CoreWLAN CWInterface", url: appleCoreWlan }, { label: "networksetup", localPath: "/usr/sbin/networksetup" }],
    backend: { strategy: "mixed" },
    permissions: wifiPermissions,
    risk: "read",
    mutatesState: false,
    revert: "none",
    cli: { root: "wifi", canonicalUsage: "claw wifi list", aliases: ["claw wifi scan"] },
    uiPack: "network",
    testRefs: ["packages/clawjs-core/src/mac-control-plane.test.ts"],
  }),
  capability({
    id: "mac.wifi.connect",
    family: "wifi",
    action: "connect",
    label: "Connect Wi-Fi",
    summary: "Connect to a specific Wi-Fi SSID using prompt or Secrets lease for credentials.",
    portableFamily: "network.wifi.connect",
    platforms: ["darwin"],
    coverageState: "executable",
    sourceConfidence: "official",
    sources: [{ label: "networksetup", localPath: "/usr/sbin/networksetup" }],
    backend: { strategy: "networksetup", executablePath: "/usr/sbin/networksetup" },
    permissions: wifiPermissions,
    risk: "high",
    mutatesState: true,
    revert: "best_effort",
    cli: { root: "wifi", canonicalUsage: "claw wifi connect --ssid <ssid>", aliases: ["claw wifi join"], relatedSurfaces: ["claw secrets"] },
    uiPack: "network",
    testRefs: ["packages/clawjs-core/src/mac-control-plane.test.ts"],
  }),
  capability({
    id: "mac.wifi.disconnect",
    family: "wifi",
    action: "disconnect",
    label: "Disconnect Wi-Fi",
    summary: "Disconnect Wi-Fi with continuity breaker and rollback timer when possible.",
    portableFamily: "network.wifi.disconnect",
    platforms: ["darwin"],
    coverageState: "planned",
    sourceConfidence: "official",
    sources: [{ label: "networksetup", localPath: "/usr/sbin/networksetup" }],
    backend: { strategy: "networksetup", executablePath: "/usr/sbin/networksetup", notes: "Planned until the signed host has a continuity-safe CoreWLAN disconnect implementation." },
    permissions: wifiPermissions,
    risk: "critical",
    mutatesState: true,
    revert: "best_effort",
    cli: { root: "wifi", canonicalUsage: "claw wifi disconnect" },
    uiPack: "network",
    testRefs: ["packages/clawjs-core/src/mac-control-plane.test.ts"],
  }),
  capability({
    id: "mac.wifi.power.on",
    family: "wifi",
    action: "on",
    label: "Turn Wi-Fi on",
    summary: "Enable Wi-Fi power.",
    portableFamily: "network.wifi.power",
    platforms: ["darwin"],
    coverageState: "executable",
    sourceConfidence: "official",
    sources: [{ label: "networksetup", localPath: "/usr/sbin/networksetup" }],
    backend: { strategy: "networksetup", executablePath: "/usr/sbin/networksetup" },
    permissions: wifiPermissions,
    risk: "medium",
    mutatesState: true,
    revert: "best_effort",
    cli: { root: "wifi", canonicalUsage: "claw wifi on", aliases: ["claw wifi enable"] },
    uiPack: "network",
    testRefs: ["packages/clawjs-core/src/mac-control-plane.test.ts"],
  }),
  capability({
    id: "mac.wifi.power.off",
    family: "wifi",
    action: "off",
    label: "Turn Wi-Fi off",
    summary: "Disable Wi-Fi power with continuity breaker and rollback timer.",
    portableFamily: "network.wifi.power",
    platforms: ["darwin"],
    coverageState: "executable",
    sourceConfidence: "official",
    sources: [{ label: "networksetup", localPath: "/usr/sbin/networksetup" }],
    backend: { strategy: "networksetup", executablePath: "/usr/sbin/networksetup" },
    permissions: wifiPermissions,
    risk: "critical",
    mutatesState: true,
    revert: "best_effort",
    cli: { root: "wifi", canonicalUsage: "claw wifi off", aliases: ["claw wifi disable"] },
    uiPack: "network",
    testRefs: ["packages/clawjs-core/src/mac-control-plane.test.ts"],
  }),
  ...["list", "focus", "move", "resize", "close", "minimize"].map((action) => capability({
    id: `mac.window.${action}`,
    family: "window",
    action,
    label: `Window ${action}`,
    summary: `Governed local window ${action} action through Accessibility.`,
    portableFamily: `desktop.window.${action}`,
    platforms: ["darwin"],
    coverageState: ["list", "close", "minimize"].includes(action) ? "executable" : "planned",
    sourceConfidence: "official",
    sources: [{ label: "AXUIElement", url: appleAx }],
    backend: {
      strategy: action === "list" ? "cgwindow_observation" : "accessibility_ax",
      notes: ["list", "close", "minimize"].includes(action)
        ? "AX is primary for control; CGWindow is observation only."
        : "Atlas entry only until the signed host implements this AX action.",
    },
    permissions: action === "list" ? screenPermissions : windowPermissions,
    risk: action === "list" ? "read" : action === "close" ? "medium" : "low",
    mutatesState: action !== "list",
    revert: action === "move" || action === "resize" || action === "minimize" ? "best_effort" : "none",
    cli: {
      root: "window",
      canonicalUsage: action === "list" ? "claw window list" : `claw window ${action} --focused|--id <id>|--app <app>|--title <title>`,
      aliases: action === "close" ? ["claw window quit"] : [],
    },
    uiPack: "windows",
    testRefs: ["packages/clawjs-core/src/mac-control-plane.test.ts"],
  })),
  ...["list", "show", "run"].map((action) => capability({
    id: `mac.shortcut.${action}`,
    family: "shortcut",
    action,
    label: `Shortcut ${action}`,
    summary: `Governed macOS Shortcut ${action} operation.`,
    portableFamily: `automation.shortcut.${action}`,
    platforms: ["darwin"],
    coverageState: "executable",
    sourceConfidence: "official",
    sources: [{ label: "Shortcuts command line interface", url: appleShortcuts }],
    backend: { strategy: "shortcuts_cli", executablePath: "/usr/bin/shortcuts" },
    permissions: [],
    risk: action === "run" ? "high" : "read",
    mutatesState: action === "run",
    revert: "none",
    cli: {
      root: "shortcut",
      canonicalUsage: action === "run" ? "claw shortcut run <name-or-id> --input text|json|file --output text|json" : `claw shortcut ${action}`,
      aliases: [],
    },
    uiPack: "automation",
    testRefs: ["packages/clawjs-core/src/mac-control-plane.test.ts"],
  })),
  capability({
    id: "mac.privacy.permission.request",
    family: "permissions",
    action: "request",
    label: "Request Mac permission",
    summary: "Create or execute a just-in-time permission request plan through the signed host.",
    portableFamily: "host.permission.request",
    platforms: ["darwin"],
    coverageState: "dry_run",
    sourceConfidence: "official",
    sources: [{ label: "Apple Protected Resources", url: appleProtectedResources }],
    backend: { strategy: "mixed", notes: "Central Permission Broker owns prompt/guidance flow." },
    permissions: [],
    risk: "medium",
    mutatesState: true,
    revert: "none",
    cli: { root: "permissions", canonicalUsage: "claw permissions request <permission>", relatedSurfaces: ["claw mac permissions", "claw host permissions"] },
    uiPack: "privacy",
    testRefs: ["packages/clawjs-core/src/mac-control-plane.test.ts"],
  }),
  ...[
    ["app", "open", "claw app open <app>"],
    ["app", "quit", "claw app quit <app>"],
    ["process", "terminate", "claw process terminate --pid <pid>"],
    ["vpn", "connect", "claw vpn connect <name>"],
    ["bluetooth", "connect", "claw bluetooth connect <device>"],
    ["audio", "volume", "claw audio volume set <value>"],
    ["display", "brightness", "claw display brightness set <value>"],
    ["screen", "capture", "claw screen capture"],
    ["focus", "set", "claw focus set <mode>"],
    ["notification", "status", "claw notification status"],
    ["power", "sleep", "claw power sleep"],
    ["clipboard", "read", "claw clipboard read"],
  ].map(([family, action, usage]) => capability({
    id: `mac.${family}.${action}`,
    family,
    action,
    label: `${family} ${action}`,
    summary: `Atlas entry for governed ${family} ${action}.`,
    platforms: ["darwin"],
    coverageState: "planned",
    sourceConfidence: "needs_research",
    sources: [{ label: "Mac Control Plane source audit", localPath: "docs/mac-control-plane.md" }],
    backend: { strategy: "manual", notes: "Planned atlas entry; not executable in V1." },
    permissions: family === "screen" ? ["mac.permission.screen_capture"] : family === "app" || family === "clipboard" ? ["mac.permission.accessibility"] : [],
    risk: family === "vpn" || family === "power" || family === "process" ? "critical" : family === "clipboard" ? "medium" : "low",
    mutatesState: action !== "read" && action !== "status",
    revert: "none",
    cli: { root: family, canonicalUsage: usage, relatedSurfaces: family === "audio" ? ["claw media audio"] : family === "notification" ? ["claw notify"] : [] },
    uiPack: family === "vpn" ? "network" : family === "screen" ? "screen" : family === "notification" ? "notifications" : family,
    testRefs: ["packages/clawjs-core/src/mac-control-plane.test.ts"],
  })),
];

export const clawMacControlPlaneRegistry = {
  version: clawMacControlPlaneRegistryVersion,
  defaultMacosMajor: "14",
  commandRoots: MAC_CONTROL_COMMAND_ROOTS,
  permissionPacks: MAC_PERMISSION_PACKS,
  permissionCatalog: MAC_PERMISSION_CATALOG,
  capabilities: MAC_CAPABILITY_ATLAS,
  programmaticSurfaces: MAC_PROGRAMMATIC_SURFACES,
  policyDefaults: {
    precedence: "most_restrictive_wins",
    defaultAgentAccess: "safe_read_only",
    sensitiveGrantDuration: { kind: "task", ttlSeconds: 1800 },
    criticalRevertTimerSeconds: 120,
    riskTiers: macRiskTierSchema.options,
    roles: macRoleSchema.options,
  },
  validationGates: {
    executableV1MustNotBeExternalPending: true,
    signedHostsRequired: ["Clawix embedded", "Claw.app standalone"],
    staticNativeUsageGuardrail: true,
  },
} as const;

export function listMacAtlasCapabilities(options: { family?: string; coverageState?: z.infer<typeof macCoverageStateSchema> } = {}): MacAtlasCapability[] {
  return MAC_CAPABILITY_ATLAS.filter((capability) =>
    (!options.family || capability.family === options.family) &&
    (!options.coverageState || capability.coverageState === options.coverageState)
  );
}

export function findMacAtlasCapability(id: string): MacAtlasCapability | undefined {
  return MAC_CAPABILITY_ATLAS.find((capability) => capability.id === id);
}

export function listMacProgrammaticSurfaces(options: { kind?: MacProgrammaticSurfaceKind; lifecycleAction?: MacProgrammaticLifecycleAction } = {}): MacProgrammaticSurface[] {
  return MAC_PROGRAMMATIC_SURFACES.filter((surface) =>
    (!options.kind || surface.kind === options.kind) &&
    (!options.lifecycleAction || surface.lifecycleAction === options.lifecycleAction)
  );
}

export function buildMacActionPlan(input: BuildMacActionPlanInput): MacActionPlan {
  const capability = input.capability ?? findMacAtlasCapability(input.request.capabilityId);
  if (!capability) throw new Error(`Unknown Mac capability: ${input.request.capabilityId}`);

  const permissionStates = new Map((input.permissionStates ?? []).map((state) => [state.permissionId, state]));
  const permissionRequirements = capability.permissions.map((permissionId) => {
    const state = permissionStates.get(permissionId);
    return macPermissionRequirementSchema.parse({
      permissionId,
      required: true,
      currentOsState: state?.osState ?? "unknown",
      currentFrameworkGrant: state?.frameworkGrant ?? "not_granted",
      guidance: state?.guidance,
    });
  });
  const approvalRequired = ["medium", "high", "critical"].includes(capability.risk);
  const executable = capability.coverageState === "executable" || capability.coverageState === "host_validated";
  const plaintextWifiPassword =
    capability.id === "mac.wifi.connect" &&
    typeof input.request.arguments.password === "string" &&
    input.request.arguments.password.length > 0;
  const blockedReasons = [
    ...(!executable ? [`coverage_state:${capability.coverageState}`] : []),
    ...(plaintextWifiPassword ? ["secret_blocked:plaintext_wifi_password"] : []),
    ...permissionRequirements
      .filter((permission) => permission.currentOsState === "denied" || permission.currentOsState === "restricted" || permission.currentFrameworkGrant === "denied")
      .map((permission) => `permission_blocked:${permission.permissionId}`),
  ];

  return macActionPlanSchema.parse({
    schemaVersion: clawContractVersionV1,
    planId: `macplan_${input.request.requestId.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
    requestId: input.request.requestId,
    capabilityId: capability.id,
    risk: capability.risk,
    coverageState: capability.coverageState,
    actor: input.request.actor,
    host: input.request.host,
    resolvedTarget: input.request.target,
    permissionRequirements,
    requiredApprovals: approvalRequired
      ? [{
          risk: capability.risk,
          reason: input.request.reason ?? `${capability.label} requires ${capability.risk} approval`,
          approverRoles: ["owner", "admin"],
        }]
      : [],
    rollback: {
      level: capability.revert,
      timerSeconds: capability.risk === "critical" && capability.revert !== "none" ? clawMacControlPlaneRegistry.policyDefaults.criticalRevertTimerSeconds : undefined,
      snapshotRequired: capability.mutatesState && capability.revert !== "none" && (capability.risk === "high" || capability.risk === "critical"),
      reason: capability.revert === "none" ? "No reliable automated revert is declared for this capability." : undefined,
    },
    willMutate: capability.mutatesState,
    executable,
    blockedReasons,
    relatedSurfaces: capability.cli.relatedSurfaces,
  });
}

function macStableId(prefix: "macact" | "macaudit", parts: string[]): string {
  return `${prefix}_${parts.join("_").replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function collectMacSecretRefs(request: MacActionRequest, explicitSecretRefs: string[] = []): string[] {
  const refs = new Set(explicitSecretRefs);
  const secretRef = request.arguments.secretRef;
  if (typeof secretRef === "string" && secretRef.length > 0) refs.add(secretRef);
  const secretRefs = request.arguments.secretRefs;
  if (Array.isArray(secretRefs)) {
    for (const ref of secretRefs) {
      if (typeof ref === "string" && ref.length > 0) refs.add(ref);
    }
  }
  return [...refs];
}

function macDefaultRedaction(plan: MacActionPlan, secretRefs: string[]): { level: "high" | "medium" | "low"; fields: string[] } {
  const sensitiveRisk = plan.risk === "high" || plan.risk === "critical";
  const fields = ["arguments"];
  if (plan.resolvedTarget?.selector && Object.keys(plan.resolvedTarget.selector).length > 0) fields.push("target.selector");
  if (secretRefs.length > 0) fields.push("secretRefs");
  return {
    level: sensitiveRisk || secretRefs.length > 0 ? "high" : plan.risk === "medium" ? "medium" : "low",
    fields,
  };
}

function assertMacActionPlanMatchesRequest(request: MacActionRequest, plan: MacActionPlan): void {
  if (plan.requestId !== request.requestId) throw new Error(`Mac action plan ${plan.planId} does not match request ${request.requestId}`);
  if (plan.capabilityId !== request.capabilityId) throw new Error(`Mac action plan ${plan.planId} targets ${plan.capabilityId}, not ${request.capabilityId}`);
}

export function buildMacActionReceipt(input: BuildMacActionReceiptInput): MacActionReceipt {
  assertMacActionPlanMatchesRequest(input.request, input.plan);
  const createdAt = input.now ?? new Date().toISOString();
  const secretRefs = collectMacSecretRefs(input.request, input.secretRefs);
  const redaction = input.redaction ?? macDefaultRedaction(input.plan, secretRefs);
  const id = input.id ?? macStableId("macact", [input.request.requestId, input.result]);
  const auditId = input.auditId ?? macStableId("macaudit", [input.request.requestId, input.result]);

  return macActionReceiptSchema.parse({
    schemaVersion: clawContractVersionV1,
    id,
    requestId: input.request.requestId,
    planId: input.plan.planId,
    capabilityId: input.plan.capabilityId,
    actor: input.plan.actor,
    host: input.plan.host,
    result: input.result,
    risk: input.plan.risk,
    permissionSnapshotRefs: input.permissionSnapshotRefs ?? [],
    beforeRef: input.beforeRef,
    afterRef: input.afterRef,
    auditId,
    revert: input.plan.rollback,
    secretRefs,
    redaction: {
      level: redaction.level,
      fields: redaction.fields ?? [],
    },
    createdAt,
  });
}

export function buildMacActionAuditEvent(input: BuildMacActionAuditEventInput): MacActionAuditEvent {
  return macActionAuditEventSchema.parse({
    schemaVersion: clawContractVersionV1,
    id: input.receipt.auditId,
    receiptId: input.receipt.id,
    requestId: input.receipt.requestId,
    planId: input.receipt.planId,
    capabilityId: input.receipt.capabilityId,
    actor: input.receipt.actor,
    host: input.receipt.host,
    result: input.receipt.result,
    risk: input.receipt.risk,
    summary: input.summary ?? `Mac action ${input.receipt.capabilityId} ${input.receipt.result}`,
    redaction: input.receipt.redaction,
    metadata: input.metadata ?? {},
    createdAt: input.receipt.createdAt,
  });
}

function macApprovalSatisfiesPlan(approval: MacApprovalRequest, request: MacActionRequest, plan: MacActionPlan): boolean {
  return approval.status === "approved" &&
    approval.actionRequest.requestId === request.requestId &&
    approval.plan.planId === plan.planId &&
    approval.plan.capabilityId === plan.capabilityId;
}

export function evaluateMacActionBroker(input: EvaluateMacActionBrokerInput): MacActionBrokerEvaluation {
  assertMacActionPlanMatchesRequest(input.request, input.plan);
  const approvalRequestIds = input.plan.requiredApprovals
    .map((approval) => approval.requestId)
    .filter((requestId): requestId is string => Boolean(requestId));
  const approved = input.plan.requiredApprovals.length === 0 ||
    (input.approvals ?? []).some((approval) => macApprovalSatisfiesPlan(approval, input.request, input.plan));

  const blockedReasons = [...input.plan.blockedReasons];
  if (!input.plan.executable) blockedReasons.push("plan_not_executable");
  if (blockedReasons.length > 0) {
    const receipt = buildMacActionReceipt({ request: input.request, plan: input.plan, result: "blocked", now: input.now });
    return macActionBrokerEvaluationSchema.parse({
      schemaVersion: clawContractVersionV1,
      decision: "blocked",
      requestId: input.request.requestId,
      planId: input.plan.planId,
      capabilityId: input.plan.capabilityId,
      actor: input.plan.actor,
      host: input.plan.host,
      reasons: [...new Set(blockedReasons)],
      approvalRequestIds,
      receipt,
      auditEvent: buildMacActionAuditEvent({ receipt, metadata: { reasons: [...new Set(blockedReasons)] } }),
    });
  }

  if (input.request.dryRun) {
    const receipt = buildMacActionReceipt({ request: input.request, plan: input.plan, result: "planned", now: input.now });
    return macActionBrokerEvaluationSchema.parse({
      schemaVersion: clawContractVersionV1,
      decision: "dry_run",
      requestId: input.request.requestId,
      planId: input.plan.planId,
      capabilityId: input.plan.capabilityId,
      actor: input.plan.actor,
      host: input.plan.host,
      reasons: ["dry_run"],
      approvalRequestIds,
      receipt,
      auditEvent: buildMacActionAuditEvent({ receipt, metadata: { reasons: ["dry_run"] } }),
    });
  }

  if (!approved) {
    const receipt = buildMacActionReceipt({ request: input.request, plan: input.plan, result: "planned", now: input.now });
    return macActionBrokerEvaluationSchema.parse({
      schemaVersion: clawContractVersionV1,
      decision: "approval_required",
      requestId: input.request.requestId,
      planId: input.plan.planId,
      capabilityId: input.plan.capabilityId,
      actor: input.plan.actor,
      host: input.plan.host,
      reasons: ["approval_required"],
      approvalRequestIds,
      receipt,
      auditEvent: buildMacActionAuditEvent({ receipt, metadata: { reasons: ["approval_required"] } }),
    });
  }

  return macActionBrokerEvaluationSchema.parse({
    schemaVersion: clawContractVersionV1,
    decision: "allow",
    requestId: input.request.requestId,
    planId: input.plan.planId,
    capabilityId: input.plan.capabilityId,
    actor: input.plan.actor,
    host: input.plan.host,
    reasons: [],
    approvalRequestIds,
  });
}

export function listMacCommandRoots(): MacControlCommandRoot[] {
  return [...MAC_CONTROL_COMMAND_ROOTS];
}

export function listMacRelatedSurfaces(root: string): string[] {
  return MAC_CONTROL_COMMAND_ROOTS.find((entry) => entry.root === root)?.relatedSurfaces ?? [];
}

export function assertMacControlPlaneRegistryComplete(): void {
  const capabilityIds = new Set<string>();
  for (const capability of MAC_CAPABILITY_ATLAS) {
    macAtlasCapabilitySchema.parse(capability);
    if (capabilityIds.has(capability.id)) throw new Error(`Duplicate Mac capability id: ${capability.id}`);
    capabilityIds.add(capability.id);
    if (capability.coverageState === "executable" && capability.sources.some((source) => source.label.includes("EXTERNAL PENDING"))) {
      throw new Error(`Executable Mac capability cannot be external pending: ${capability.id}`);
    }
  }

  const permissionIds = new Set(MAC_PERMISSION_CATALOG.map((permission) => permission.id));
  for (const pack of MAC_PERMISSION_PACKS) {
    for (const permissionId of pack.permissionIds) {
      if (!permissionIds.has(permissionId)) throw new Error(`Mac permission pack ${pack.id} references unknown permission ${permissionId}`);
    }
  }

  const requiredExecutable = [
    "mac.wifi.status",
    "mac.wifi.list",
    "mac.wifi.connect",
    "mac.wifi.power.on",
    "mac.wifi.power.off",
    "mac.window.list",
    "mac.window.close",
    "mac.window.minimize",
    "mac.shortcut.list",
    "mac.shortcut.show",
    "mac.shortcut.run",
  ];
  for (const id of requiredExecutable) {
    const entry = findMacAtlasCapability(id);
    if (!entry) throw new Error(`Missing executable Mac V1 capability: ${id}`);
    if (entry.coverageState !== "executable" && entry.coverageState !== "host_validated") {
      throw new Error(`Mac V1 capability ${id} must be executable or host_validated, got ${entry.coverageState}`);
    }
  }

  const roots = new Set(MAC_CONTROL_COMMAND_ROOTS.map((entry) => entry.root));
  for (const root of ["mac", "permissions", "wifi", "window", "shortcut", "app", "audio", "notification"]) {
    if (!roots.has(root)) throw new Error(`Missing Mac command root: ${root}`);
  }

  const surfaceNames = new Set(MAC_PROGRAMMATIC_SURFACES.map((entry) => entry.name));
  for (const name of ["mac.plan", "mac.execute", "mac.revert", "mac.audit", "mac.permissions", "/v1/mac/plan", "/v1/mac/execute", "claw.mac.plan", "claw.mac.execute"]) {
    if (!surfaceNames.has(name)) throw new Error(`Missing Mac programmatic surface: ${name}`);
  }
  for (const surface of MAC_PROGRAMMATIC_SURFACES) {
    macProgrammaticSurfaceSchema.parse(surface);
    if (surface.mutatesNativeState && !surface.requiresSignedHost) throw new Error(`Mutating Mac surface must require signed host: ${surface.name}`);
    if (surface.lifecycleAction === "execute" && !surface.requiresApproval) throw new Error(`Mac execute surface must require approval: ${surface.name}`);
  }
}
