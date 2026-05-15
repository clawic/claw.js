import { BUILTIN_COLLECTIONS, BUILTIN_FAMILIES } from "./builtins/index.ts";
import { clawCliCommandRegistry } from "./cli-command-registry.ts";
import { clawDomainOwnershipEntriesV1 } from "./domain-ownership.ts";
import { PRODUCTIVITY_COLLECTION_DEFINITIONS } from "./productivity.ts";
import { clawPersistentSurfaceRegistry } from "./surface-registry.ts";

import trackingRegistry from "../../../tracking-registry.json" with { type: "json" };

export const clawDomainSurfaceRegistryVersion = 1;

export type ClawDomainSurfaceKind =
  | "collection"
  | "signal_vertical"
  | "conceptual_family"
  | "aggregate"
  | "system"
  | "service_runtime"
  | "package_api"
  | "module_manifest"
  | "portal_alias"
  | "storage"
  | "host_boundary";

export type ClawDomainSurfaceOwner = "claw" | "signed_host" | "clawix" | "external";

export type ClawDomainSurfaceStatus =
  | "canonical"
  | "registered_hidden"
  | "conceptual_manifest"
  | "runtime_service"
  | "host_required"
  | "external_pending"
  | "cleanup_required";

export interface ClawDomainSurfaceSource {
  file: string;
  symbol?: string;
}

export interface ClawDomainSurfaceEntry {
  id: string;
  kind: ClawDomainSurfaceKind;
  name: string;
  label: string;
  owner: ClawDomainSurfaceOwner;
  status: ClawDomainSurfaceStatus;
  storageIds?: string[];
  cliCommands?: string[];
  packageNames?: string[];
  modulePath?: string;
  source: ClawDomainSurfaceSource;
  aliases?: string[];
  family?: string;
  sensitive?: boolean;
  notes?: string;
  invariants?: string[];
  relatedCollections?: string[];
  relatedSignals?: string[];
}

export interface ClawDomainSurfaceRegistry {
  version: number;
  entries: ClawDomainSurfaceEntry[];
}

const CORE_DB_ID = "claw.database.core";
const SIGNALS_STORAGE_IDS = [
  "claw.database.core.table.signals_verticals",
  "claw.database.core.table.signals_variables",
  "claw.database.core.table.signals_sessions",
  "claw.database.core.table.signals_observations",
] as const;

const PRODUCTIVITY_COLLECTION_NAMES = new Set(PRODUCTIVITY_COLLECTION_DEFINITIONS.map((collection) => collection.name));

const collectionEntries: ClawDomainSurfaceEntry[] = uniqueById([
  ...PRODUCTIVITY_COLLECTION_DEFINITIONS.map((collection): ClawDomainSurfaceEntry => ({
    id: `collection:${collection.name}`,
    kind: "collection",
    name: collection.name,
    label: collection.displayName,
    owner: "claw",
    status: "registered_hidden",
    storageIds: [CORE_DB_ID, "claw.database.core.table.workspace_records"],
    cliCommands: [
      `claw collections ${collection.name} schema`,
      `claw db ${collection.name} list|get|create|update|delete|schema|query`,
    ],
    source: {
      file: "packages/clawjs-core/src/productivity.ts",
      symbol: "PRODUCTIVITY_COLLECTION_DEFINITIONS",
    },
    family: "productivity",
    notes: "Productivity collections remain typed APIs, but DB schema ownership is tracked here instead of living as an unregistered second surface.",
  })),
  ...BUILTIN_COLLECTIONS.map((collection): ClawDomainSurfaceEntry => ({
    id: `collection:${collection.name}`,
    kind: "collection",
    name: collection.name,
    label: collection.displayName,
    owner: "claw",
    status: "registered_hidden",
    storageIds: [CORE_DB_ID, "claw.database.core.table.workspace_records"],
    cliCommands: [
      `claw collections ${collection.name} schema`,
      `claw db ${collection.name} list|get|create|update|delete|schema|query`,
    ],
    source: {
      file: `packages/clawjs-core/src/builtins/${collection.family}/index.ts`,
      symbol: "BUILTIN_FAMILIES",
    },
    aliases: collection.aliases,
    family: collection.family,
    notes: PRODUCTIVITY_COLLECTION_NAMES.has(collection.name)
      ? "Builtin definition is canonical for catalog metadata when it overlaps an older productivity definition."
      : undefined,
  })),
]);

const signalVerticalEntries = trackingRegistry.entries.map((entry): ClawDomainSurfaceEntry => ({
  id: `signal:${entry.id}`,
  kind: "signal_vertical",
  name: entry.id,
  label: entry.label,
  owner: "claw",
  status: "canonical",
  storageIds: [...SIGNALS_STORAGE_IDS],
  cliCommands: [
    "claw signals catalog",
    "claw signals seed-catalog",
    "claw signals observe",
    "claw signals list",
  ],
  packageNames: ["@clawjs/signals", "@clawjs/signals-core"],
  modulePath: `modules/${entry.id}`,
  source: {
    file: "tracking-registry.json",
  },
  family: entry.category,
  sensitive: entry.sensitive,
  notes: "Signal vertical ids are stable v1 ids. Human-facing labels and aliases live in the registry and module manifest layer.",
}));

const conceptualFamilyEntries: ClawDomainSurfaceEntry[] = uniqueById([
  ...BUILTIN_FAMILIES.map((family): ClawDomainSurfaceEntry => ({
    id: `family:${family.name}`,
    kind: "conceptual_family",
    name: family.name,
    label: family.displayName,
    owner: "claw",
    status: "conceptual_manifest",
    source: {
      file: `packages/clawjs-core/src/builtins/${family.name}/index.ts`,
    },
    notes: "Conceptual families group collections for agent discovery. They are not package or service boundaries by default.",
  })),
  {
    id: "family:productivity",
    kind: "conceptual_family",
    name: "productivity",
    label: "Productivity",
    owner: "claw",
    status: "conceptual_manifest",
    source: {
      file: "packages/clawjs-core/src/productivity.ts",
      symbol: "PRODUCTIVITY_COLLECTION_DEFINITIONS",
    },
    notes: "Productivity is a conceptual and typed API family; it must not remain a separate schema source of truth.",
  },
  ...trackingRegistry.categories.map((category): ClawDomainSurfaceEntry => ({
    id: `family:${category.id}`,
    kind: "conceptual_family",
    name: category.id,
    label: category.label,
    owner: "claw",
    status: "conceptual_manifest",
    source: {
      file: "tracking-registry.json",
    },
    notes: "Signals category for discovery and module manifests; not an independent package or service.",
  })),
]);

const aggregateEntries: ClawDomainSurfaceEntry[] = [
  {
    id: "aggregate:habit-tracking",
    kind: "aggregate",
    name: "habit-tracking",
    label: "Habit tracking",
    owner: "claw",
    status: "canonical",
    storageIds: [CORE_DB_ID, ...SIGNALS_STORAGE_IDS],
    cliCommands: ["claw habits list|get|create|update|delete|schema|query", "claw signals list --vertical habits"],
    packageNames: ["@clawjs/core", "@clawjs/signals"],
    modulePath: "modules/habits",
    source: {
      file: "packages/clawjs-core/src/domain-surface-registry.ts",
    },
    relatedCollections: ["habits", "habit_logs"],
    relatedSignals: ["habits"],
    notes: "Aggregate commands may add workflows, but CRUD verbs keep routing to the collection when names collide.",
  },
  {
    id: "aggregate:work-management",
    kind: "aggregate",
    name: "work-management",
    label: "Work management",
    owner: "claw",
    status: "canonical",
    storageIds: [CORE_DB_ID],
    cliCommands: ["claw work agenda|review|export|import|backup", "claw tasks list|get|create|update|delete|schema|query"],
    packageNames: ["@clawjs/core", "@clawjs/workspace"],
    source: {
      file: "packages/clawjs-core/src/productivity.ts",
    },
    relatedCollections: ["tasks", "projects", "goals", "notes", "people", "inbox_threads", "inbox_messages"],
  },
  {
    id: "aggregate:content-publishing",
    kind: "aggregate",
    name: "content-publishing",
    label: "Content publishing",
    owner: "claw",
    status: "canonical",
    storageIds: [CORE_DB_ID],
    cliCommands: ["claw content posts|campaigns|publications", "claw posts list"],
    packageNames: ["@clawjs/core"],
    source: {
      file: "packages/clawjs-core/src/cli-command-registry.ts",
    },
    relatedCollections: ["newsletter_posts", "campaigns", "publications"],
  },
  {
    id: "aggregate:media-production",
    kind: "aggregate",
    name: "media-production",
    label: "Media production",
    owner: "claw",
    status: "canonical",
    storageIds: [CORE_DB_ID],
    cliCommands: ["claw media documents|files|images|audio|video|slides|generations|templates|styles|references"],
    packageNames: ["@clawjs/core", "@clawjs/audio"],
    source: {
      file: "packages/clawjs-core/src/cli-command-registry.ts",
    },
  },
];

const systemEntries: ClawDomainSurfaceEntry[] = [
  {
    id: "system:erp",
    kind: "system",
    name: "erp",
    label: "ERP",
    owner: "claw",
    status: "runtime_service",
    storageIds: [CORE_DB_ID],
    cliCommands: ["claw erp"],
    packageNames: ["@clawjs/core"],
    modulePath: "modules/erp",
    source: {
      file: "modules/erp/package.json",
    },
    invariants: [
      "ERP workflows may coordinate invoices, payments, credit notes, catalog records, and ledger entries.",
      "ERP orchestrates related collections but does not absorb external canonical catalogs.",
    ],
    notes: "ERP qualifies as a system because common operations cross multiple related collections under strong invariants.",
  },
  {
    id: "system:database",
    kind: "system",
    name: "database",
    label: "Database",
    owner: "claw",
    status: "canonical",
    storageIds: [CORE_DB_ID],
    cliCommands: ["claw database", "claw db", "claw collections", "claw records"],
    packageNames: ["@clawjs/database", "@clawjs/core"],
    source: {
      file: "packages/clawjs-database/package.json",
    },
    invariants: ["Custom collection creation is explicit; unknown record writes must not silently create schema."],
  },
  {
    id: "system:host",
    kind: "system",
    name: "host",
    label: "Signed host",
    owner: "signed_host",
    status: "host_required",
    cliCommands: ["claw host", "claw system capabilities"],
    packageNames: ["@clawjs/core"],
    source: {
      file: "packages/clawjs-core/src/domain-ownership.ts",
    },
    invariants: ["Sensitive permissions, grants, approvals, and native audit belong to the active signed host."],
  },
];

const serviceRuntimeEntries = clawDomainOwnershipEntriesV1.map((entry): ClawDomainSurfaceEntry => ({
  id: `service:${entry.domain}`,
  kind: "service_runtime",
  name: entry.domain,
  label: entry.domain.replace(/_/g, " "),
  owner: entry.brokerRequired ? "signed_host" : "claw",
  status: entry.brokerRequired ? "host_required" : "canonical",
  cliCommands: [`claw ${entry.domain.replace(/_/g, "-")}`],
  source: {
    file: "packages/clawjs-core/src/domain-ownership.ts",
    symbol: "clawDomainOwnershipMatrixV1",
  },
  notes: entry.frameworkOwns.join("; "),
}));

const packageEntries = clawPersistentSurfaceRegistry.nodes
  .filter((node) => node.kind === "packageName" && typeof node.value === "string")
  .map((node): ClawDomainSurfaceEntry => ({
    id: `package:${node.value}`,
    kind: "package_api",
    name: node.value!,
    label: node.name,
    owner: node.owner === "clawix" ? "clawix" : node.owner === "external" ? "external" : "claw",
    status: "canonical",
    packageNames: [node.value!],
    source: node.source ?? { file: "packages/clawjs-core/src/surface-registry.ts" },
  }));

const cliEntries = clawCliCommandRegistry.commands.map((command): ClawDomainSurfaceEntry => ({
  id: `cli:${command.name}`,
  kind: "portal_alias",
  name: command.name,
  label: command.name,
  owner: command.securityPolicy === "signed_host_broker" ? "signed_host" : "claw",
  status: command.kind === "alias" ? "registered_hidden" : "canonical",
  cliCommands: [`claw ${command.name}`],
  source: command.source,
  aliases: command.aliases,
  family: command.family,
  notes: command.kind === "portal"
    ? "Portal commands are operational indexes, not package or service ownership boundaries."
    : command.kind === "alias"
      ? `Alias route to ${command.target}.`
      : undefined,
}));

const storageEntries = clawPersistentSurfaceRegistry.nodes
  .filter((node) => ["database", "sidecar", "table", "index"].includes(node.kind))
  .map((node): ClawDomainSurfaceEntry => ({
    id: `storage:${node.id}`,
    kind: "storage",
    name: node.name,
    label: node.name,
    owner: node.owner === "clawix" ? "clawix" : node.owner === "external" ? "external" : "claw",
    status: node.canonicality === "legacyReadOnly" ? "cleanup_required" : "canonical",
    storageIds: [node.id],
    source: node.source ?? { file: "packages/clawjs-core/src/surface-registry.ts" },
    notes: node.notes,
  }));

const signalStorageEntries = SIGNALS_STORAGE_IDS.map((id): ClawDomainSurfaceEntry => ({
  id: `storage:${id}`,
  kind: "storage",
  name: id.replace("claw.database.core.table.", ""),
  label: id.replace("claw.database.core.table.", "").replace(/_/g, " "),
  owner: "claw",
  status: "canonical",
  storageIds: [id],
  source: {
    file: "tracking-registry.json",
  },
  notes: "Signals storage is owned by the signals vertical catalog and core database schema.",
}));

const moduleManifestEntries: ClawDomainSurfaceEntry[] = uniqueById([
  ...trackingRegistry.entries.map((entry): ClawDomainSurfaceEntry => ({
    id: `module:${entry.id}`,
    kind: "module_manifest",
    name: entry.id,
    label: entry.label,
    owner: "claw",
    status: "conceptual_manifest",
    modulePath: `modules/${entry.id}`,
    relatedSignals: [entry.id],
    source: {
      file: "tracking-registry.json",
    },
    sensitive: entry.sensitive,
    notes: "Conceptual module folders are visible manifests for agents. They must not become independent package/server/CLI surfaces.",
  })),
  {
    id: "module:erp",
    kind: "module_manifest",
    name: "erp",
    label: "ERP",
    owner: "claw",
    status: "runtime_service",
    modulePath: "modules/erp",
    cliCommands: ["claw erp"],
    source: {
      file: "modules/erp/package.json",
    },
  },
  {
    id: "module:feed",
    kind: "module_manifest",
    name: "feed",
    label: "Feed",
    owner: "claw",
    status: "runtime_service",
    modulePath: "modules/feed",
    source: {
      file: "modules/feed/package.json",
    },
  },
]);

const hostBoundaryEntries: ClawDomainSurfaceEntry[] = [
  {
    id: "host-boundary:signed-host",
    kind: "host_boundary",
    name: "signed-host",
    label: "Signed host boundary",
    owner: "signed_host",
    status: "host_required",
    cliCommands: ["claw host", "claw system capabilities"],
    source: {
      file: "docs/host-ownership.md",
    },
    invariants: ["Node never asks for sensitive native permissions directly."],
  },
];

export const clawDomainSurfaceRegistry: ClawDomainSurfaceRegistry = {
  version: clawDomainSurfaceRegistryVersion,
  entries: [
    ...collectionEntries,
    ...signalVerticalEntries,
    ...conceptualFamilyEntries,
    ...aggregateEntries,
    ...systemEntries,
    ...serviceRuntimeEntries,
    ...packageEntries,
    ...cliEntries,
    ...storageEntries,
    ...signalStorageEntries,
    ...moduleManifestEntries,
    ...hostBoundaryEntries,
  ],
};

export function listClawDomainSurfaceEntries(options: { kind?: ClawDomainSurfaceKind } = {}): ClawDomainSurfaceEntry[] {
  return clawDomainSurfaceRegistry.entries.filter((entry) => !options.kind || entry.kind === options.kind);
}

export function findClawDomainSurfaceEntry(id: string): ClawDomainSurfaceEntry | undefined {
  return clawDomainSurfaceRegistry.entries.find((entry) => entry.id === id);
}

export function assertClawDomainSurfaceRegistryComplete(): void {
  const ids = new Set(clawDomainSurfaceRegistry.entries.map((entry) => entry.id));
  const missing = [
    ...PRODUCTIVITY_COLLECTION_DEFINITIONS.map((collection) => `collection:${collection.name}`),
    ...BUILTIN_COLLECTIONS.map((collection) => `collection:${collection.name}`),
    ...trackingRegistry.entries.map((entry) => `signal:${entry.id}`),
    ...trackingRegistry.entries.map((entry) => `module:${entry.id}`),
    ...clawCliCommandRegistry.commands.map((command) => `cli:${command.name}`),
    ...clawDomainOwnershipEntriesV1.map((entry) => `service:${entry.domain}`),
    ...SIGNALS_STORAGE_IDS.map((id) => `storage:${id}`),
  ].filter((id) => !ids.has(id));
  if (missing.length > 0) {
    throw new Error(`Claw domain surface registry is missing ${missing.length} entries: ${missing.join(", ")}`);
  }
}

function uniqueById<T extends { id: string }>(entries: T[]): T[] {
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()];
}
