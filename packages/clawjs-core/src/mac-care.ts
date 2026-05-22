import { z } from "zod";

export const MAC_CARE_SIDECAR_FILENAME = "mac_care.sqlite" as const;

export const macCareRouteFamilySchema = z.enum([
  "system_cache",
  "system_log",
  "user_cache",
  "user_log",
  "application_support",
  "downloads",
  "trash",
  "mail",
  "browser",
  "privacy",
  "permissions",
  "system_tool",
  "applications",
  "developer",
  "backup",
  "temporary",
  "cloud_sync",
  "storage_map",
  "protection",
]);
export type MacCareRouteFamily = z.infer<typeof macCareRouteFamilySchema>;

export const macCareConsumerIntentSchema = z.enum([
  "cleanup",
  "index",
  "monitor",
  "performance",
  "privacy_review",
  "permission_review",
  "app_inventory",
  "cloud_inventory",
  "protection_scan",
  "storage_map",
]);
export type MacCareConsumerIntent = z.infer<typeof macCareConsumerIntentSchema>;

export const macCareRouteSensitivitySchema = z.enum([
  "low",
  "user_data",
  "protected_user_data",
  "system",
  "secret_adjacent",
]);
export type MacCareRouteSensitivity = z.infer<typeof macCareRouteSensitivitySchema>;

export const macCareRouteMutabilitySchema = z.enum([
  "read_only",
  "rebuildable_cache",
  "review_required",
  "host_confirmed_only",
  "blocked",
]);
export type MacCareRouteMutability = z.infer<typeof macCareRouteMutabilitySchema>;

export const macCareEvidenceLevelSchema = z.enum([
  "framework_canon",
  "macos_convention",
  "host_observed",
  "fixture_required",
]);
export type MacCareEvidenceLevel = z.infer<typeof macCareEvidenceLevelSchema>;

export const macCareRouteSourceSchema = z.enum(["home", "system", "volume", "api", "application"]);
export type MacCareRouteSource = z.infer<typeof macCareRouteSourceSchema>;

export const macCareRouteAtlasEntrySchema = z.object({
  id: z.string().min(1),
  family: macCareRouteFamilySchema,
  label: z.string().min(1),
  pathPattern: z.string().min(1),
  source: macCareRouteSourceSchema,
  sensitivity: macCareRouteSensitivitySchema,
  requiredPermissionIds: z.array(z.string()).default([]),
  owner: z.enum(["system", "user", "application", "developer_tool", "cloud_provider", "framework"]),
  evidenceLevel: macCareEvidenceLevelSchema,
  mutability: macCareRouteMutabilitySchema,
  consumerIntents: z.array(macCareConsumerIntentSchema).min(1),
  notes: z.string().optional(),
});
export type MacCareRouteAtlasEntry = z.infer<typeof macCareRouteAtlasEntrySchema>;

export const MAC_CARE_ROUTE_ATLAS = [
  {
    id: "mac_care.route.user_caches",
    family: "user_cache",
    label: "User caches",
    pathPattern: "{home}/Library/Caches",
    source: "home",
    sensitivity: "user_data",
    requiredPermissionIds: ["mac.permission.files_desktop_documents_downloads"],
    owner: "application",
    evidenceLevel: "macos_convention",
    mutability: "review_required",
    consumerIntents: ["cleanup", "index", "performance"],
  },
  {
    id: "mac_care.route.user_logs",
    family: "user_log",
    label: "User logs",
    pathPattern: "{home}/Library/Logs",
    source: "home",
    sensitivity: "user_data",
    requiredPermissionIds: ["mac.permission.files_desktop_documents_downloads"],
    owner: "application",
    evidenceLevel: "macos_convention",
    mutability: "review_required",
    consumerIntents: ["cleanup", "index", "performance"],
  },
  {
    id: "mac_care.route.application_support",
    family: "application_support",
    label: "Application support",
    pathPattern: "{home}/Library/Application Support",
    source: "home",
    sensitivity: "protected_user_data",
    requiredPermissionIds: ["mac.permission.full_disk_access"],
    owner: "application",
    evidenceLevel: "macos_convention",
    mutability: "host_confirmed_only",
    consumerIntents: ["app_inventory", "cleanup", "index", "storage_map"],
  },
  {
    id: "mac_care.route.system_application_support",
    family: "application_support",
    label: "System application support",
    pathPattern: "/Library/Application Support",
    source: "system",
    sensitivity: "system",
    requiredPermissionIds: ["mac.permission.admin_authorization"],
    owner: "system",
    evidenceLevel: "macos_convention",
    mutability: "host_confirmed_only",
    consumerIntents: ["monitor", "storage_map"],
  },
  {
    id: "mac_care.route.downloads",
    family: "downloads",
    label: "Downloads",
    pathPattern: "{home}/Downloads",
    source: "home",
    sensitivity: "user_data",
    requiredPermissionIds: ["mac.permission.files_desktop_documents_downloads"],
    owner: "user",
    evidenceLevel: "macos_convention",
    mutability: "host_confirmed_only",
    consumerIntents: ["cleanup", "index", "storage_map"],
  },
  {
    id: "mac_care.route.user_applications",
    family: "applications",
    label: "User applications",
    pathPattern: "{home}/Applications",
    source: "home",
    sensitivity: "user_data",
    requiredPermissionIds: [],
    owner: "application",
    evidenceLevel: "macos_convention",
    mutability: "host_confirmed_only",
    consumerIntents: ["app_inventory", "cleanup", "storage_map"],
  },
  {
    id: "mac_care.route.system_applications",
    family: "applications",
    label: "System applications",
    pathPattern: "/Applications",
    source: "application",
    sensitivity: "user_data",
    requiredPermissionIds: ["mac.permission.full_disk_access"],
    owner: "application",
    evidenceLevel: "macos_convention",
    mutability: "host_confirmed_only",
    consumerIntents: ["app_inventory", "cleanup", "storage_map"],
  },
  {
    id: "mac_care.route.user_trash",
    family: "trash",
    label: "User Trash",
    pathPattern: "{home}/.Trash",
    source: "home",
    sensitivity: "user_data",
    requiredPermissionIds: [],
    owner: "user",
    evidenceLevel: "macos_convention",
    mutability: "host_confirmed_only",
    consumerIntents: ["cleanup", "storage_map"],
  },
  {
    id: "mac_care.route.volume_trashes",
    family: "trash",
    label: "Volume trashes",
    pathPattern: "/Volumes/*/.Trashes",
    source: "volume",
    sensitivity: "user_data",
    requiredPermissionIds: ["mac.permission.full_disk_access"],
    owner: "user",
    evidenceLevel: "macos_convention",
    mutability: "host_confirmed_only",
    consumerIntents: ["cleanup", "storage_map"],
  },
  {
    id: "mac_care.route.mail",
    family: "mail",
    label: "Mail data",
    pathPattern: "{home}/Library/Mail",
    source: "home",
    sensitivity: "protected_user_data",
    requiredPermissionIds: ["mac.permission.full_disk_access"],
    owner: "application",
    evidenceLevel: "macos_convention",
    mutability: "host_confirmed_only",
    consumerIntents: ["cleanup", "privacy_review", "storage_map"],
  },
  {
    id: "mac_care.route.browser_profiles",
    family: "browser",
    label: "Browser profiles",
    pathPattern: "{home}/Library/Application Support/{browser}",
    source: "application",
    sensitivity: "protected_user_data",
    requiredPermissionIds: ["mac.permission.full_disk_access"],
    owner: "application",
    evidenceLevel: "fixture_required",
    mutability: "host_confirmed_only",
    consumerIntents: ["privacy_review", "cleanup", "storage_map"],
    notes: "Concrete browser adapters must resolve the browser placeholder and use throwaway profiles in tests.",
  },
  {
    id: "mac_care.route.mobile_backups",
    family: "backup",
    label: "Mobile device backups",
    pathPattern: "{home}/Library/Application Support/MobileSync/Backup",
    source: "home",
    sensitivity: "protected_user_data",
    requiredPermissionIds: ["mac.permission.full_disk_access"],
    owner: "application",
    evidenceLevel: "macos_convention",
    mutability: "host_confirmed_only",
    consumerIntents: ["cleanup", "storage_map"],
  },
  {
    id: "mac_care.route.xcode_derived_data",
    family: "developer",
    label: "Xcode DerivedData",
    pathPattern: "{home}/Library/Developer/Xcode/DerivedData",
    source: "home",
    sensitivity: "user_data",
    requiredPermissionIds: [],
    owner: "developer_tool",
    evidenceLevel: "macos_convention",
    mutability: "review_required",
    consumerIntents: ["cleanup", "performance", "storage_map"],
  },
  {
    id: "mac_care.route.cloud_storage",
    family: "cloud_sync",
    label: "Local cloud sync roots",
    pathPattern: "{home}/Library/CloudStorage",
    source: "home",
    sensitivity: "protected_user_data",
    requiredPermissionIds: ["mac.permission.full_disk_access"],
    owner: "cloud_provider",
    evidenceLevel: "macos_convention",
    mutability: "host_confirmed_only",
    consumerIntents: ["cloud_inventory", "index", "storage_map"],
  },
  {
    id: "mac_care.route.volume_spotlight_index",
    family: "system_cache",
    label: "Volume Spotlight index",
    pathPattern: "/Volumes/*/.Spotlight-V100",
    source: "volume",
    sensitivity: "system",
    requiredPermissionIds: ["mac.permission.full_disk_access"],
    owner: "system",
    evidenceLevel: "macos_convention",
    mutability: "blocked",
    consumerIntents: ["performance", "storage_map"],
  },
  {
    id: "mac_care.route.volume_temporary_items",
    family: "system_cache",
    label: "Volume temporary items",
    pathPattern: "/Volumes/*/.TemporaryItems",
    source: "volume",
    sensitivity: "system",
    requiredPermissionIds: ["mac.permission.full_disk_access"],
    owner: "system",
    evidenceLevel: "macos_convention",
    mutability: "blocked",
    consumerIntents: ["performance", "storage_map"],
  },
  {
    id: "mac_care.route.system_caches",
    family: "system_cache",
    label: "System caches",
    pathPattern: "/Library/Caches",
    source: "system",
    sensitivity: "system",
    requiredPermissionIds: ["mac.permission.full_disk_access"],
    owner: "system",
    evidenceLevel: "macos_convention",
    mutability: "blocked",
    consumerIntents: ["cleanup", "performance", "storage_map"],
  },
  {
    id: "mac_care.route.system_temp",
    family: "temporary",
    label: "System temporary directory",
    pathPattern: "/tmp",
    source: "system",
    sensitivity: "system",
    requiredPermissionIds: [],
    owner: "system",
    evidenceLevel: "macos_convention",
    mutability: "rebuildable_cache",
    consumerIntents: ["performance", "storage_map"],
  },
  {
    id: "mac_care.route.system_launch_daemons",
    family: "permissions",
    label: "System LaunchDaemons",
    pathPattern: "/Library/LaunchDaemons",
    source: "system",
    sensitivity: "system",
    requiredPermissionIds: ["mac.permission.admin_authorization"],
    owner: "system",
    evidenceLevel: "macos_convention",
    mutability: "host_confirmed_only",
    consumerIntents: ["monitor", "permission_review"],
  },
  {
    id: "mac_care.route.system_hosts_file",
    family: "permissions",
    label: "System hosts file",
    pathPattern: "/etc/hosts",
    source: "system",
    sensitivity: "system",
    requiredPermissionIds: ["mac.permission.admin_authorization"],
    owner: "system",
    evidenceLevel: "macos_convention",
    mutability: "host_confirmed_only",
    consumerIntents: ["monitor", "permission_review"],
  },
  {
    id: "mac_care.route.system_shortcuts_cli",
    family: "system_tool",
    label: "Shortcuts command line interface",
    pathPattern: "/usr/bin/shortcuts",
    source: "system",
    sensitivity: "low",
    requiredPermissionIds: [],
    owner: "system",
    evidenceLevel: "macos_convention",
    mutability: "read_only",
    consumerIntents: ["monitor", "permission_review"],
  },
  {
    id: "mac_care.route.system_networksetup_cli",
    family: "system_tool",
    label: "networksetup command line interface",
    pathPattern: "/usr/sbin/networksetup",
    source: "system",
    sensitivity: "low",
    requiredPermissionIds: [],
    owner: "system",
    evidenceLevel: "macos_convention",
    mutability: "read_only",
    consumerIntents: ["monitor", "permission_review"],
  },
  {
    id: "mac_care.route.system_launchctl_cli",
    family: "system_tool",
    label: "launchctl command line interface",
    pathPattern: "/bin/launchctl",
    source: "system",
    sensitivity: "low",
    requiredPermissionIds: [],
    owner: "system",
    evidenceLevel: "macos_convention",
    mutability: "read_only",
    consumerIntents: ["monitor", "permission_review"],
  },
  {
    id: "mac_care.route.system_sh_cli",
    family: "system_tool",
    label: "sh command line interface",
    pathPattern: "/bin/sh",
    source: "system",
    sensitivity: "low",
    requiredPermissionIds: [],
    owner: "system",
    evidenceLevel: "macos_convention",
    mutability: "read_only",
    consumerIntents: ["monitor", "permission_review"],
  },
  {
    id: "mac_care.route.system_sudo_cli",
    family: "system_tool",
    label: "sudo command line interface",
    pathPattern: "/usr/bin/sudo",
    source: "system",
    sensitivity: "low",
    requiredPermissionIds: ["mac.permission.admin_authorization"],
    owner: "system",
    evidenceLevel: "macos_convention",
    mutability: "host_confirmed_only",
    consumerIntents: ["monitor", "permission_review"],
  },
  {
    id: "mac_care.route.system_env_cli",
    family: "system_tool",
    label: "env command line interface",
    pathPattern: "/usr/bin/env",
    source: "system",
    sensitivity: "low",
    requiredPermissionIds: [],
    owner: "system",
    evidenceLevel: "macos_convention",
    mutability: "read_only",
    consumerIntents: ["monitor", "permission_review"],
  },
  {
    id: "mac_care.route.system_tar_cli",
    family: "system_tool",
    label: "tar command line interface",
    pathPattern: "/usr/bin/tar",
    source: "system",
    sensitivity: "low",
    requiredPermissionIds: [],
    owner: "system",
    evidenceLevel: "macos_convention",
    mutability: "read_only",
    consumerIntents: ["monitor", "protection_scan"],
  },
  {
    id: "mac_care.route.system_osascript_cli",
    family: "system_tool",
    label: "osascript command line interface",
    pathPattern: "/usr/bin/osascript",
    source: "system",
    sensitivity: "low",
    requiredPermissionIds: [],
    owner: "system",
    evidenceLevel: "macos_convention",
    mutability: "read_only",
    consumerIntents: ["monitor", "permission_review"],
  },
  {
    id: "mac_care.route.system_open_cli",
    family: "system_tool",
    label: "open command line interface",
    pathPattern: "/usr/bin/open",
    source: "system",
    sensitivity: "low",
    requiredPermissionIds: [],
    owner: "system",
    evidenceLevel: "macos_convention",
    mutability: "read_only",
    consumerIntents: ["monitor"],
  },
  {
    id: "mac_care.route.protection_fixture",
    family: "protection",
    label: "Protection fixture root",
    pathPattern: "{fixture}",
    source: "api",
    sensitivity: "low",
    requiredPermissionIds: [],
    owner: "framework",
    evidenceLevel: "fixture_required",
    mutability: "blocked",
    consumerIntents: ["protection_scan"],
    notes: "Hermetic test-only route for protection adapter contract validation; real protection scans must bind to concrete atlas routes.",
  },
] as const satisfies MacCareRouteAtlasEntry[];

export const MAC_CARE_FILESYSTEM_NOISE_DIRECTORIES = [
  {
    name: "DerivedData",
    routeIds: ["mac_care.route.xcode_derived_data"],
    reason: "Generated developer cache; Search should avoid indexing it as user-authored content.",
  },
  {
    name: ".Spotlight-V100",
    routeIds: ["mac_care.route.volume_spotlight_index"],
    reason: "macOS volume metadata; Mac Care may report it, but general Search should skip traversal.",
  },
  {
    name: ".TemporaryItems",
    routeIds: ["mac_care.route.volume_temporary_items"],
    reason: "macOS temporary volume data; Mac Care may report it, but general Search should skip traversal.",
  },
  {
    name: ".Trashes",
    routeIds: ["mac_care.route.volume_trashes"],
    reason: "macOS volume trash container; cleanup requires signed host confirmation, so Search should skip traversal.",
  },
] as const;

export const macCareScannerModuleIdSchema = z.enum([
  "mac_care.module.user_caches",
  "mac_care.module.user_logs",
  "mac_care.module.downloads",
  "mac_care.module.large_old_files",
  "mac_care.module.app_inventory",
  "mac_care.module.cloud_storage_roots",
]);
export type MacCareScannerModuleId = z.infer<typeof macCareScannerModuleIdSchema>;

export const macCareScannerModuleSchema = z.object({
  id: macCareScannerModuleIdSchema,
  title: z.string().min(1),
  routeIds: z.array(z.string()).min(1),
  consumerIntents: z.array(macCareConsumerIntentSchema).min(1),
  readOnly: z.literal(true),
  notes: z.string().optional(),
});
export type MacCareScannerModule = z.infer<typeof macCareScannerModuleSchema>;

export const MAC_CARE_SCANNER_WAVE_1_MODULES = [
  {
    id: "mac_care.module.user_caches",
    title: "User cache inventory",
    routeIds: ["mac_care.route.user_caches"],
    consumerIntents: ["cleanup", "performance", "storage_map"],
    readOnly: true,
  },
  {
    id: "mac_care.module.user_logs",
    title: "User log inventory",
    routeIds: ["mac_care.route.user_logs"],
    consumerIntents: ["cleanup", "performance", "storage_map"],
    readOnly: true,
  },
  {
    id: "mac_care.module.downloads",
    title: "Downloads inventory",
    routeIds: ["mac_care.route.downloads"],
    consumerIntents: ["cleanup", "index", "storage_map"],
    readOnly: true,
  },
  {
    id: "mac_care.module.large_old_files",
    title: "Large and old file review",
    routeIds: ["mac_care.route.downloads", "mac_care.route.user_caches", "mac_care.route.user_logs"],
    consumerIntents: ["cleanup", "storage_map"],
    readOnly: true,
    notes: "The first wave reports candidates only; final action selection belongs to a later signed-host slice.",
  },
  {
    id: "mac_care.module.app_inventory",
    title: "Application inventory",
    routeIds: ["mac_care.route.user_applications", "mac_care.route.system_applications"],
    consumerIntents: ["app_inventory", "cleanup", "storage_map"],
    readOnly: true,
  },
  {
    id: "mac_care.module.cloud_storage_roots",
    title: "Local cloud storage roots",
    routeIds: ["mac_care.route.cloud_storage"],
    consumerIntents: ["cloud_inventory", "index", "storage_map"],
    readOnly: true,
  },
] as const satisfies MacCareScannerModule[];

export const macCareProtectionAdapterIdSchema = z.enum([
  "mac_care.protection.yara_core",
  "mac_care.protection.clamav_adapter",
]);
export type MacCareProtectionAdapterId = z.infer<typeof macCareProtectionAdapterIdSchema>;

export const macCareProtectionAdapterExecutionModeSchema = z.enum([
  "fixture_only",
  "external_engine_required",
]);
export type MacCareProtectionAdapterExecutionMode = z.infer<typeof macCareProtectionAdapterExecutionModeSchema>;

export const macCareProtectionAdapterSchema = z.object({
  id: macCareProtectionAdapterIdSchema,
  label: z.string().min(1),
  engine: z.enum(["yara", "clamav"]),
  executionMode: macCareProtectionAdapterExecutionModeSchema,
  routeIds: z.array(z.string()).min(1),
  readOnly: z.literal(true),
  agentCanQuarantine: z.literal(false),
  updateSource: z.enum(["bundled_fixture", "external_database"]),
  notes: z.string().min(1),
});
export type MacCareProtectionAdapter = z.infer<typeof macCareProtectionAdapterSchema>;

export const macCareProtectionEngineRuntimeStatusSchema = z.enum([
  "fixture_only",
  "external_engine_detected",
  "external_engine_missing",
]);
export type MacCareProtectionEngineRuntimeStatus = z.infer<typeof macCareProtectionEngineRuntimeStatusSchema>;

export const macCareProtectionDatabaseStatusSchema = z.enum([
  "bundled_fixture",
  "external_update_tool_detected",
  "external_update_tool_missing",
]);
export type MacCareProtectionDatabaseStatus = z.infer<typeof macCareProtectionDatabaseStatusSchema>;

export const macCareProtectionDetectedBinarySchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1).nullable(),
  present: z.boolean(),
});
export type MacCareProtectionDetectedBinary = z.infer<typeof macCareProtectionDetectedBinarySchema>;

export const macCareProtectionEngineReadinessSchema = z.object({
  adapterId: macCareProtectionAdapterIdSchema,
  engine: z.enum(["yara", "clamav"]),
  label: z.string().min(1),
  executionMode: macCareProtectionAdapterExecutionModeSchema,
  requiredScanBinaries: z.array(z.string().min(1)),
  requiredUpdateBinaries: z.array(z.string().min(1)),
  detectedBinaries: z.array(macCareProtectionDetectedBinarySchema),
  runtimeStatus: macCareProtectionEngineRuntimeStatusSchema,
  databaseStatus: macCareProtectionDatabaseStatusSchema,
  agentCanScan: z.literal(false),
  agentCanUpdateDatabase: z.literal(false),
  agentCanQuarantine: z.literal(false),
  requiredAuthority: z.literal("signed_host_human_confirmed"),
  notes: z.array(z.string().min(1)).min(1),
});
export type MacCareProtectionEngineReadiness = z.infer<typeof macCareProtectionEngineReadinessSchema>;

export const macCareProtectionEngineReadinessReportSchema = z.object({
  version: z.literal(1),
  status: z.literal("protection_engine_readiness"),
  createdAt: z.string().min(1),
  engines: z.array(macCareProtectionEngineReadinessSchema),
  summary: z.object({
    totalEngines: z.number().int().nonnegative(),
    detectedEngines: z.number().int().nonnegative(),
    agentExecutableScans: z.literal(0),
    agentDatabaseUpdates: z.literal(0),
    agentQuarantineActions: z.literal(0),
    signedHostRequired: z.number().int().nonnegative(),
  }),
});
export type MacCareProtectionEngineReadinessReport = z.infer<typeof macCareProtectionEngineReadinessReportSchema>;

export const macCareProtectionApprovalPackageEngineSchema = z.object({
  id: z.string().min(1),
  adapterId: macCareProtectionAdapterIdSchema,
  engine: z.enum(["yara", "clamav"]),
  label: z.string().min(1),
  runtimeStatus: macCareProtectionEngineRuntimeStatusSchema,
  databaseStatus: macCareProtectionDatabaseStatusSchema,
  approvalState: z.literal("not_requested"),
  willScan: z.literal(false),
  willUpdateDatabase: z.literal(false),
  willQuarantine: z.literal(false),
  agentCanScan: z.literal(false),
  agentCanUpdateDatabase: z.literal(false),
  agentCanQuarantine: z.literal(false),
  executionAuthority: z.literal("signed_host_human_confirmed"),
  requiredEvidence: z.array(z.string().min(1)).min(1),
  reentryCondition: z.string().min(1),
  reasons: z.array(z.string().min(1)).min(1),
});
export type MacCareProtectionApprovalPackageEngine = z.infer<typeof macCareProtectionApprovalPackageEngineSchema>;

export const macCareProtectionApprovalPackageReportSchema = z.object({
  version: z.literal(1),
  status: z.literal("protection_approval_ready"),
  createdAt: z.string().min(1),
  sourceReadinessStatus: z.literal("protection_engine_readiness"),
  engines: z.array(macCareProtectionApprovalPackageEngineSchema),
  summary: z.object({
    totalEngines: z.number().int().nonnegative(),
    detectedEngines: z.number().int().nonnegative(),
    scanRequestsIssued: z.literal(0),
    databaseUpdateRequestsIssued: z.literal(0),
    quarantineRequestsIssued: z.literal(0),
    agentExecutableScans: z.literal(0),
    agentDatabaseUpdates: z.literal(0),
    agentQuarantineActions: z.literal(0),
    signedHostRequired: z.number().int().nonnegative(),
  }),
});
export type MacCareProtectionApprovalPackageReport = z.infer<typeof macCareProtectionApprovalPackageReportSchema>;

export const MAC_CARE_PROTECTION_ADAPTERS = [
  {
    id: "mac_care.protection.yara_core",
    label: "YARA core fixture adapter",
    engine: "yara",
    executionMode: "fixture_only",
    routeIds: ["mac_care.route.protection_fixture", "mac_care.route.downloads", "mac_care.route.user_applications", "mac_care.route.system_applications"],
    readOnly: true,
    agentCanQuarantine: false,
    updateSource: "bundled_fixture",
    notes: "Fixture-only adapter for contract and UI safety validation; real rule execution is a later signed-host integration.",
  },
  {
    id: "mac_care.protection.clamav_adapter",
    label: "ClamAV external adapter",
    engine: "clamav",
    executionMode: "external_engine_required",
    routeIds: ["mac_care.route.protection_fixture", "mac_care.route.downloads", "mac_care.route.user_applications", "mac_care.route.system_applications"],
    readOnly: true,
    agentCanQuarantine: false,
    updateSource: "external_database",
    notes: "Adapter contract only; database updates and engine execution require a later runtime/licensing slice.",
  },
] as const satisfies MacCareProtectionAdapter[];

export const macCareCandidateActionSchema = z.enum([
  "review",
  "delete",
  "move_to_trash",
  "revoke_permission",
  "uninstall_app",
  "update_app",
  "unsync_cloud_item",
  "thin_snapshot",
  "quarantine",
  "ignore",
]);
export type MacCareCandidateAction = z.infer<typeof macCareCandidateActionSchema>;

export const macCareCandidateSelectionSchema = z.enum(["selected", "unselected", "blocked", "warning"]);
export type MacCareCandidateSelection = z.infer<typeof macCareCandidateSelectionSchema>;

export const macCareCandidateSchema = z.object({
  id: z.string().min(1),
  routeId: z.string().min(1),
  path: z.string().min(1),
  displayName: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().optional(),
  action: macCareCandidateActionSchema,
  selection: macCareCandidateSelectionSchema,
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});
export type MacCareCandidate = z.infer<typeof macCareCandidateSchema>;

export const macCareCandidateGroupSchema = z.object({
  id: z.string().min(1),
  moduleId: z.string().min(1),
  title: z.string().min(1),
  routeIds: z.array(z.string()).default([]),
  candidates: z.array(macCareCandidateSchema),
});
export type MacCareCandidateGroup = z.infer<typeof macCareCandidateGroupSchema>;

export const macCareActionPlanSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  groups: z.array(macCareCandidateGroupSchema),
  executionAuthority: z.enum(["agent_plan_only", "signed_host_human_confirmed"]),
  requestedBy: z.enum(["agent", "test", "user", "signed_host"]),
});
export type MacCareActionPlan = z.infer<typeof macCareActionPlanSchema>;

export const macCareReadOnlyScanReportSchema = z.object({
  version: z.literal(1),
  status: z.literal("read_only_scan"),
  scanId: z.string().min(1),
  createdAt: z.string().min(1),
  homeDir: z.string().min(1),
  modules: z.array(macCareScannerModuleSchema),
  groups: z.array(macCareCandidateGroupSchema),
  actionPlan: macCareActionPlanSchema,
});
export type MacCareReadOnlyScanReport = z.infer<typeof macCareReadOnlyScanReportSchema>;

export const macCareProtectionFixtureFindingSchema = z.object({
  id: z.string().min(1),
  adapterId: macCareProtectionAdapterIdSchema,
  path: z.string().min(1),
  displayName: z.string().min(1),
  signatureId: z.string().min(1),
  signatureName: z.string().min(1),
  action: z.literal("quarantine"),
  selection: z.literal("blocked"),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()).min(1),
  warnings: z.array(z.string()).default([]),
});
export type MacCareProtectionFixtureFinding = z.infer<typeof macCareProtectionFixtureFindingSchema>;

export const macCareProtectionFixtureScanReportSchema = z.object({
  version: z.literal(1),
  status: z.literal("protection_fixture_scan"),
  createdAt: z.string().min(1),
  adapterId: macCareProtectionAdapterIdSchema,
  fixtureDir: z.string().min(1),
  findings: z.array(macCareProtectionFixtureFindingSchema),
  actionPlan: macCareActionPlanSchema,
});
export type MacCareProtectionFixtureScanReport = z.infer<typeof macCareProtectionFixtureScanReportSchema>;

export const macCareAppUpdateHandoffKindSchema = z.enum([
  "manual_review",
  "app_store",
  "vendor",
  "system_settings",
]);
export type MacCareAppUpdateHandoffKind = z.infer<typeof macCareAppUpdateHandoffKindSchema>;

export const macCareAppUpdateHandoffItemSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  routeId: z.string().min(1),
  path: z.string().min(1),
  displayName: z.string().min(1),
  handoffKind: macCareAppUpdateHandoffKindSchema,
  status: z.literal("inventory_only"),
  action: z.literal("update_app"),
  selection: z.literal("blocked"),
  executionAuthority: z.literal("signed_host_human_confirmed"),
  agentCanInstall: z.literal(false),
  reasons: z.array(z.string()).min(1),
});
export type MacCareAppUpdateHandoffItem = z.infer<typeof macCareAppUpdateHandoffItemSchema>;

export const macCareAppUpdateHandoffReportSchema = z.object({
  version: z.literal(1),
  status: z.literal("app_update_handoff_inventory"),
  createdAt: z.string().min(1),
  sourceScanId: z.string().min(1),
  items: z.array(macCareAppUpdateHandoffItemSchema),
  actionPlan: macCareActionPlanSchema,
});
export type MacCareAppUpdateHandoffReport = z.infer<typeof macCareAppUpdateHandoffReportSchema>;

export const macCareAppUpdateApprovalPackageItemSchema = z.object({
  id: z.string().min(1),
  handoffItemId: z.string().min(1),
  candidateId: z.string().min(1),
  routeId: z.string().min(1),
  path: z.string().min(1),
  displayName: z.string().min(1),
  handoffKind: macCareAppUpdateHandoffKindSchema,
  requestedOperation: z.literal("update_app"),
  approvalState: z.literal("not_requested"),
  willInstall: z.literal(false),
  installerLaunched: z.literal(false),
  agentCanInstall: z.literal(false),
  executionAuthority: z.literal("signed_host_human_confirmed"),
  requiredEvidence: z.array(z.string()).min(1),
  reentryCondition: z.string().min(1),
  reasons: z.array(z.string()).min(1),
});
export type MacCareAppUpdateApprovalPackageItem = z.infer<typeof macCareAppUpdateApprovalPackageItemSchema>;

export const macCareAppUpdateApprovalPackageReportSchema = z.object({
  version: z.literal(1),
  status: z.literal("app_update_approval_ready"),
  createdAt: z.string().min(1),
  sourceHandoffStatus: z.literal("app_update_handoff_inventory"),
  sourceScanId: z.string().min(1),
  items: z.array(macCareAppUpdateApprovalPackageItemSchema),
  actionPlan: macCareActionPlanSchema,
  summary: z.object({
    totalItems: z.number().int().nonnegative(),
    updateActions: z.number().int().nonnegative(),
    installersLaunched: z.literal(0),
    approvalRequestsIssued: z.literal(0),
    agentInstallActions: z.literal(0),
    signedHostRequired: z.number().int().nonnegative(),
  }),
});
export type MacCareAppUpdateApprovalPackageReport = z.infer<typeof macCareAppUpdateApprovalPackageReportSchema>;

export const macCareCloudProviderHandoffKindSchema = z.enum([
  "local_sync_root_review",
  "provider_external_review",
]);
export type MacCareCloudProviderHandoffKind = z.infer<typeof macCareCloudProviderHandoffKindSchema>;

export const macCareCloudProviderHandoffItemSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  routeId: z.literal("mac_care.route.cloud_storage"),
  path: z.string().min(1),
  displayName: z.string().min(1),
  providerHint: z.string().min(1),
  handoffKind: macCareCloudProviderHandoffKindSchema,
  status: z.literal("inventory_only"),
  action: z.literal("unsync_cloud_item"),
  selection: z.literal("blocked"),
  executionAuthority: z.literal("signed_host_human_confirmed"),
  agentCanMutateProvider: z.literal(false),
  reasons: z.array(z.string()).min(1),
});
export type MacCareCloudProviderHandoffItem = z.infer<typeof macCareCloudProviderHandoffItemSchema>;

export const macCareCloudProviderHandoffReportSchema = z.object({
  version: z.literal(1),
  status: z.literal("cloud_provider_handoff_inventory"),
  createdAt: z.string().min(1),
  sourceScanId: z.string().min(1),
  items: z.array(macCareCloudProviderHandoffItemSchema),
  actionPlan: macCareActionPlanSchema,
});
export type MacCareCloudProviderHandoffReport = z.infer<typeof macCareCloudProviderHandoffReportSchema>;

export const macCareCloudProviderApprovalPackageItemSchema = z.object({
  id: z.string().min(1),
  handoffItemId: z.string().min(1),
  candidateId: z.string().min(1),
  routeId: z.literal("mac_care.route.cloud_storage"),
  path: z.string().min(1),
  displayName: z.string().min(1),
  providerHint: z.string().min(1),
  requestedOperation: z.literal("unsync_cloud_item"),
  approvalState: z.literal("not_requested"),
  credentialsIncluded: z.literal(false),
  willMutateProvider: z.literal(false),
  agentCanMutateProvider: z.literal(false),
  executionAuthority: z.literal("signed_host_human_confirmed"),
  requiredEvidence: z.array(z.string()).min(1),
  reentryCondition: z.string().min(1),
  reasons: z.array(z.string()).min(1),
});
export type MacCareCloudProviderApprovalPackageItem = z.infer<typeof macCareCloudProviderApprovalPackageItemSchema>;

export const macCareCloudProviderApprovalPackageReportSchema = z.object({
  version: z.literal(1),
  status: z.literal("cloud_provider_approval_ready"),
  createdAt: z.string().min(1),
  sourceHandoffStatus: z.literal("cloud_provider_handoff_inventory"),
  sourceScanId: z.string().min(1),
  items: z.array(macCareCloudProviderApprovalPackageItemSchema),
  actionPlan: macCareActionPlanSchema,
  summary: z.object({
    totalItems: z.number().int().nonnegative(),
    providerMutationActions: z.number().int().nonnegative(),
    credentialsIncluded: z.literal(0),
    approvalRequestsIssued: z.literal(0),
    agentProviderMutations: z.literal(0),
    signedHostRequired: z.number().int().nonnegative(),
  }),
});
export type MacCareCloudProviderApprovalPackageReport = z.infer<typeof macCareCloudProviderApprovalPackageReportSchema>;

export const macCareFinalizerRollbackLevelSchema = z.enum([
  "none",
  "best_effort",
  "manual_recovery",
]);
export type MacCareFinalizerRollbackLevel = z.infer<typeof macCareFinalizerRollbackLevelSchema>;

export const macCareFinalizerActionPreviewSchema = z.object({
  id: z.string().min(1),
  candidateId: z.string().min(1),
  routeId: z.string().min(1),
  path: z.string().min(1),
  displayName: z.string().min(1),
  action: macCareCandidateActionSchema,
  selection: macCareCandidateSelectionSchema,
  destructive: z.literal(true),
  executionAuthority: z.literal("signed_host_human_confirmed"),
  requiresHumanConfirmation: z.literal(true),
  blockedForAgents: z.literal(true),
  rollback: z.object({
    level: macCareFinalizerRollbackLevelSchema,
    notes: z.string().min(1),
  }),
  audit: z.object({
    event: z.string().min(1),
    receiptRequired: z.literal(true),
    receiptStatus: z.literal("not_issued"),
  }),
  warnings: z.array(z.string()).default([]),
});
export type MacCareFinalizerActionPreview = z.infer<typeof macCareFinalizerActionPreviewSchema>;

export const macCareFinalizerPreviewReportSchema = z.object({
  version: z.literal(1),
  status: z.literal("finalizer_preview"),
  createdAt: z.string().min(1),
  sourcePlanId: z.string().min(1),
  willExecute: z.literal(false),
  receiptIssued: z.literal(false),
  executionAuthority: z.literal("signed_host_human_confirmed"),
  actions: z.array(macCareFinalizerActionPreviewSchema),
  summary: z.object({
    totalCandidates: z.number().int().nonnegative(),
    destructiveCandidates: z.number().int().nonnegative(),
    blockedForAgents: z.number().int().nonnegative(),
    receiptsIssued: z.literal(0),
  }),
});
export type MacCareFinalizerPreviewReport = z.infer<typeof macCareFinalizerPreviewReportSchema>;

export const macCareFinalizerApprovalPackageActionSchema = z.object({
  id: z.string().min(1),
  previewActionId: z.string().min(1),
  candidateId: z.string().min(1),
  routeId: z.string().min(1),
  path: z.string().min(1),
  displayName: z.string().min(1),
  action: macCareCandidateActionSchema,
  approvalState: z.literal("not_requested"),
  willExecute: z.literal(false),
  receiptWillBeIssued: z.literal(false),
  executionAuthority: z.literal("signed_host_human_confirmed"),
  requiresHumanConfirmation: z.literal(true),
  blockedForAgents: z.literal(true),
  rollback: z.object({
    level: macCareFinalizerRollbackLevelSchema,
    notes: z.string().min(1),
  }),
  audit: z.object({
    event: z.string().min(1),
    receiptRequired: z.literal(true),
    receiptStatus: z.literal("not_issued"),
  }),
  requiredEvidence: z.array(z.string().min(1)).min(1),
  reentryCondition: z.string().min(1),
  warnings: z.array(z.string()).default([]),
});
export type MacCareFinalizerApprovalPackageAction = z.infer<typeof macCareFinalizerApprovalPackageActionSchema>;

export const macCareFinalizerApprovalPackageReportSchema = z.object({
  version: z.literal(1),
  status: z.literal("finalizer_approval_ready"),
  createdAt: z.string().min(1),
  sourcePreviewStatus: z.literal("finalizer_preview"),
  sourcePlanId: z.string().min(1),
  willExecute: z.literal(false),
  receiptIssued: z.literal(false),
  executionAuthority: z.literal("signed_host_human_confirmed"),
  actions: z.array(macCareFinalizerApprovalPackageActionSchema),
  summary: z.object({
    totalActions: z.number().int().nonnegative(),
    destructiveActions: z.number().int().nonnegative(),
    approvalRequestsIssued: z.literal(0),
    executionRequestsIssued: z.literal(0),
    receiptsIssued: z.literal(0),
    blockedForAgents: z.number().int().nonnegative(),
  }),
});
export type MacCareFinalizerApprovalPackageReport = z.infer<typeof macCareFinalizerApprovalPackageReportSchema>;

export const MAC_CARE_DESTRUCTIVE_ACTIONS = [
  "delete",
  "move_to_trash",
  "revoke_permission",
  "uninstall_app",
  "update_app",
  "unsync_cloud_item",
  "thin_snapshot",
  "quarantine",
] as const satisfies MacCareCandidateAction[];

export type MacCareSafetyActor = "agent" | "test" | "user" | "signed_host";

export interface MacCareActionPlanSafetyDecision {
  allowed: boolean;
  requiredAuthority: "none" | "signed_host_human_confirmed";
  destructiveActions: MacCareCandidateAction[];
  reasons: string[];
}

export function listMacCareRoutes(): MacCareRouteAtlasEntry[] {
  return [...MAC_CARE_ROUTE_ATLAS];
}

export function listMacCareScannerWave1Modules(): MacCareScannerModule[] {
  return [...MAC_CARE_SCANNER_WAVE_1_MODULES];
}

export function listMacCareProtectionAdapters(): MacCareProtectionAdapter[] {
  return [...MAC_CARE_PROTECTION_ADAPTERS];
}

export function listMacCareFilesystemNoiseDirectories(): typeof MAC_CARE_FILESYSTEM_NOISE_DIRECTORIES[number][] {
  return [...MAC_CARE_FILESYSTEM_NOISE_DIRECTORIES];
}

export function findMacCareRoute(id: string): MacCareRouteAtlasEntry | undefined {
  return MAC_CARE_ROUTE_ATLAS.find((entry) => entry.id === id);
}

export function isMacCareFilesystemNoiseDirectoryName(name: string): boolean {
  return MAC_CARE_FILESYSTEM_NOISE_DIRECTORIES.some((entry) => entry.name === name);
}

export function buildMacCareFinalizerPreview(plan: MacCareActionPlan, now: Date = new Date()): MacCareFinalizerPreviewReport {
  const parsed = macCareActionPlanSchema.parse(plan);
  const actions: MacCareFinalizerActionPreview[] = [];
  let totalCandidates = 0;
  for (const group of parsed.groups) {
    for (const candidate of group.candidates) {
      totalCandidates += 1;
      if (!MAC_CARE_DESTRUCTIVE_ACTIONS.includes(candidate.action as (typeof MAC_CARE_DESTRUCTIVE_ACTIONS)[number])) continue;
      actions.push(macCareFinalizerActionPreviewSchema.parse({
        id: `finalizer-preview:${candidate.id}`,
        candidateId: candidate.id,
        routeId: candidate.routeId,
        path: candidate.path,
        displayName: candidate.displayName,
        action: candidate.action,
        selection: candidate.selection,
        destructive: true,
        executionAuthority: "signed_host_human_confirmed",
        requiresHumanConfirmation: true,
        blockedForAgents: true,
        rollback: rollbackForMacCareAction(candidate.action),
        audit: {
          event: `mac_care.finalizer.${candidate.action}.request`,
          receiptRequired: true,
          receiptStatus: "not_issued",
        },
        warnings: [
          ...candidate.warnings,
          "preview_only_no_execution",
          "signed_host_human_confirmation_required",
        ],
      }));
    }
  }
  return macCareFinalizerPreviewReportSchema.parse({
    version: 1,
    status: "finalizer_preview",
    createdAt: now.toISOString(),
    sourcePlanId: parsed.id,
    willExecute: false,
    receiptIssued: false,
    executionAuthority: "signed_host_human_confirmed",
    actions,
    summary: {
      totalCandidates,
      destructiveCandidates: actions.length,
      blockedForAgents: actions.length,
      receiptsIssued: 0,
    },
  });
}

export function buildMacCareFinalizerApprovalPackage(preview: MacCareFinalizerPreviewReport, now: Date = new Date()): MacCareFinalizerApprovalPackageReport {
  const parsed = macCareFinalizerPreviewReportSchema.parse(preview);
  return macCareFinalizerApprovalPackageReportSchema.parse({
    version: 1,
    status: "finalizer_approval_ready",
    createdAt: now.toISOString(),
    sourcePreviewStatus: parsed.status,
    sourcePlanId: parsed.sourcePlanId,
    willExecute: false,
    receiptIssued: false,
    executionAuthority: "signed_host_human_confirmed",
    actions: parsed.actions.map((action) => ({
      id: `finalizer-approval:${action.candidateId}`,
      previewActionId: action.id,
      candidateId: action.candidateId,
      routeId: action.routeId,
      path: action.path,
      displayName: action.displayName,
      action: action.action,
      approvalState: "not_requested",
      willExecute: false,
      receiptWillBeIssued: false,
      executionAuthority: "signed_host_human_confirmed",
      requiresHumanConfirmation: true,
      blockedForAgents: true,
      rollback: action.rollback,
      audit: action.audit,
      requiredEvidence: [
        "signed_host_identity_verified",
        "explicit_item_level_confirmation",
        "rollback_policy_reviewed",
        "audit_receipt_destination_confirmed",
      ],
      reentryCondition: "Resume only after signed host authority exists and the human confirms this exact finalizer action set.",
      warnings: action.warnings,
    })),
    summary: {
      totalActions: parsed.actions.length,
      destructiveActions: parsed.actions.length,
      approvalRequestsIssued: 0,
      executionRequestsIssued: 0,
      receiptsIssued: 0,
      blockedForAgents: parsed.actions.filter((action) => action.blockedForAgents).length,
    },
  });
}

export interface MacCareRoutePathContext {
  homeDir?: string;
  browserId?: string;
  systemApplicationsDir?: string;
}

export function resolveMacCareRoutePathPattern(routeOrId: string | MacCareRouteAtlasEntry, input: MacCareRoutePathContext = {}): string | null {
  const route = typeof routeOrId === "string" ? findMacCareRoute(routeOrId) : routeOrId;
  if (!route) return null;
  if (route.id === "mac_care.route.system_applications" && input.systemApplicationsDir) {
    return normalizeMacCarePath(input.systemApplicationsDir);
  }
  let pattern = route.pathPattern;
  if (pattern.includes("{home}")) {
    if (!input.homeDir) return null;
    pattern = pattern.replaceAll("{home}", normalizeMacCarePath(input.homeDir));
  }
  if (pattern.includes("{browser}")) {
    if (!input.browserId) return null;
    pattern = pattern.replaceAll("{browser}", input.browserId);
  }
  if (pattern.includes("{") || pattern.includes("*")) return null;
  return normalizeMacCarePath(pattern);
}

export function requireMacCareRoutePathPattern(routeOrId: string | MacCareRouteAtlasEntry, input: MacCareRoutePathContext = {}): string {
  const resolved = resolveMacCareRoutePathPattern(routeOrId, input);
  if (resolved) return resolved;
  const routeId = typeof routeOrId === "string" ? routeOrId : routeOrId.id;
  throw new Error(`Mac Care route path cannot be resolved: ${routeId}`);
}

export function matchMacCareRoutesForPath(pathname: string, input: { homeDir?: string } = {}): MacCareRouteAtlasEntry[] {
  const normalized = normalizeMacCarePath(pathname);
  const home = normalizeMacCarePath(input.homeDir ?? "{home}");
  return MAC_CARE_ROUTE_ATLAS.filter((entry) => routePatternMatches(normalized, entry.pathPattern, home));
}

export function evaluateMacCareActionPlanSafety(plan: MacCareActionPlan, input: { actor: MacCareSafetyActor; humanConfirmed?: boolean }): MacCareActionPlanSafetyDecision {
  const parsed = macCareActionPlanSchema.parse(plan);
  const destructiveActions = new Set<MacCareCandidateAction>();
  for (const group of parsed.groups) {
    for (const candidate of group.candidates) {
      if (MAC_CARE_DESTRUCTIVE_ACTIONS.includes(candidate.action as (typeof MAC_CARE_DESTRUCTIVE_ACTIONS)[number])) destructiveActions.add(candidate.action);
    }
  }
  if (destructiveActions.size === 0) return { allowed: true, requiredAuthority: "none", destructiveActions: [], reasons: [] };
  const actions = [...destructiveActions].sort();
  if (input.actor === "agent" || input.actor === "test") {
    return {
      allowed: false,
      requiredAuthority: "signed_host_human_confirmed",
      destructiveActions: actions,
      reasons: ["Agents and tests may prepare Mac Care action plans only; destructive execution requires signed host UI confirmation."],
    };
  }
  if (parsed.executionAuthority !== "signed_host_human_confirmed" || input.actor !== "signed_host" || input.humanConfirmed !== true) {
    return {
      allowed: false,
      requiredAuthority: "signed_host_human_confirmed",
      destructiveActions: actions,
      reasons: ["Destructive Mac Care actions require signed host execution after explicit human confirmation."],
    };
  }
  return { allowed: true, requiredAuthority: "signed_host_human_confirmed", destructiveActions: actions, reasons: [] };
}

function normalizeMacCarePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function rollbackForMacCareAction(action: MacCareCandidateAction): { level: MacCareFinalizerRollbackLevel; notes: string } {
  if (action === "move_to_trash") return { level: "best_effort", notes: "Signed host may attempt restore from Trash while the item remains available." };
  if (action === "delete") return { level: "manual_recovery", notes: "Deletion has no guaranteed rollback; require external backup or explicit manual recovery plan." };
  if (action === "revoke_permission") return { level: "best_effort", notes: "Signed host may guide the user to restore the permission after confirmation." };
  if (action === "uninstall_app") return { level: "manual_recovery", notes: "App reinstall and leftover recovery are manual unless a signed host receipt provides a supported restore path." };
  if (action === "update_app") return { level: "manual_recovery", notes: "Update rollback depends on the app vendor, store, or system update mechanism." };
  if (action === "unsync_cloud_item") return { level: "manual_recovery", notes: "Cloud provider state must be reviewed and reversed through provider-owned controls when supported." };
  if (action === "thin_snapshot") return { level: "none", notes: "Snapshot thinning has no framework-guaranteed rollback." };
  if (action === "quarantine") return { level: "best_effort", notes: "Signed host may release quarantine after explicit human confirmation and audit." };
  return { level: "none", notes: "No rollback model is defined for this action." };
}

function routePatternMatches(pathname: string, pattern: string, homeDir: string): boolean {
  const normalizedPattern = normalizeMacCarePath(pattern.replace("{home}", homeDir));
  if (normalizedPattern.includes("*")) {
    const [prefix, suffix] = normalizedPattern.split("*", 2);
    return pathname.startsWith(prefix) && (!suffix || pathname.includes(suffix));
  }
  if (normalizedPattern.includes("{")) return false;
  return pathname === normalizedPattern || pathname.startsWith(`${normalizedPattern}/`);
}
