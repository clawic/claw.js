export type ClawCapabilityMaturity = "incomplete" | "experimental" | "beta" | "stable" | "retired";
export type ClawMaturityProfile = "stable" | "beta" | "experimental" | "dev";
export type ClawCapabilityActivationPolicy = "enabled" | "opt_in" | "dev_allowlist";
export type ClawCapabilityMaturityOwner = "claw" | "clawix" | "signed_host" | "external";

export interface ClawCapabilityPromotionDecision {
  ref: string;
  path: string;
}

export interface ClawCapabilityMaturitySource {
  file: string;
  symbol?: string;
}

export interface ClawCapabilityMaturityEntry {
  id: string;
  parentId?: string;
  owner: ClawCapabilityMaturityOwner;
  title: string;
  summary: string;
  maturity: ClawCapabilityMaturity;
  activationPolicy: ClawCapabilityActivationPolicy;
  promotionDecision?: ClawCapabilityPromotionDecision;
  surfaces: string[];
  tests: string[];
  source: ClawCapabilityMaturitySource;
  externalPending?: boolean;
  notes?: string;
}

export interface ClawCapabilityMaturityRegistry {
  version: number;
  entries: ClawCapabilityMaturityEntry[];
}

export interface ClawCapabilityMaturityContext {
  profile?: ClawMaturityProfile;
  enabledCapabilityIds?: readonly string[];
  devAllowlistCapabilityIds?: readonly string[];
}

export interface ClawCapabilityMaturityDecision {
  allowed: boolean;
  code: "allowed" | "maturity_blocked" | "opt_in_required" | "dev_allowlist_required" | "retired";
  requiredProfile?: ClawMaturityProfile;
  reason: string;
}

export interface ClawCapabilityMaturityAuditResult {
  ok: boolean;
  failures: string[];
}

const maturityRank: Record<Exclude<ClawCapabilityMaturity, "retired">, number> = {
  incomplete: 0,
  experimental: 1,
  beta: 2,
  stable: 3,
};

const profileCeiling: Record<ClawMaturityProfile, Exclude<ClawCapabilityMaturity, "retired">> = {
  stable: "stable",
  beta: "beta",
  experimental: "experimental",
  dev: "incomplete",
};

const maturityRequiredProfile: Record<Exclude<ClawCapabilityMaturity, "retired">, ClawMaturityProfile> = {
  stable: "stable",
  beta: "beta",
  experimental: "experimental",
  incomplete: "dev",
};

export function defineClawCapabilityMaturityEntry(
  input: Omit<ClawCapabilityMaturityEntry, "maturity" | "activationPolicy"> &
    Partial<Pick<ClawCapabilityMaturityEntry, "maturity" | "activationPolicy">>,
): ClawCapabilityMaturityEntry {
  const maturity = input.maturity ?? "incomplete";
  const activationPolicy = input.activationPolicy ?? (maturity === "incomplete" ? "dev_allowlist" : "opt_in");
  return {
    ...input,
    maturity,
    activationPolicy,
  };
}

export function resolveClawMaturityProfile(value?: string | null): ClawMaturityProfile {
  if (value === "stable" || value === "beta" || value === "experimental" || value === "dev") return value;
  return "stable";
}

export function isMaturityAllowedInProfile(maturity: ClawCapabilityMaturity, profile: ClawMaturityProfile): boolean {
  if (maturity === "retired") return false;
  if (profile === "dev") return true;
  return maturityRank[maturity] >= maturityRank[profileCeiling[profile]];
}

export function evaluateClawCapabilityMaturity(
  capability: ClawCapabilityMaturityEntry,
  context: ClawCapabilityMaturityContext = {},
): ClawCapabilityMaturityDecision {
  const profile = context.profile ?? "stable";
  if (capability.maturity === "retired") {
    return {
      allowed: false,
      code: "retired",
      reason: `${capability.id} is retired and cannot be activated.`,
    };
  }

  if (!isMaturityAllowedInProfile(capability.maturity, profile)) {
    return {
      allowed: false,
      code: "maturity_blocked",
      requiredProfile: maturityRequiredProfile[capability.maturity],
      reason: `${capability.id} requires ${maturityRequiredProfile[capability.maturity]} profile.`,
    };
  }

  if (capability.maturity === "incomplete" || capability.activationPolicy === "dev_allowlist") {
    if (profile !== "dev" || !context.devAllowlistCapabilityIds?.includes(capability.id)) {
      return {
        allowed: false,
        code: "dev_allowlist_required",
        requiredProfile: "dev",
        reason: `${capability.id} is incomplete and requires dev profile plus explicit dev allowlist.`,
      };
    }
  }

  if (capability.activationPolicy === "opt_in" && !context.enabledCapabilityIds?.includes(capability.id)) {
    return {
      allowed: false,
      code: "opt_in_required",
      reason: `${capability.id} is eligible in ${profile} profile but requires explicit opt-in.`,
    };
  }

  return {
    allowed: true,
    code: "allowed",
    reason: `${capability.id} is allowed in ${profile} profile.`,
  };
}

export function assertClawCapabilityAllowed(
  capability: ClawCapabilityMaturityEntry,
  context: ClawCapabilityMaturityContext = {},
): void {
  const decision = evaluateClawCapabilityMaturity(capability, context);
  if (!decision.allowed) {
    const error = new Error(decision.reason) as Error & { code?: string; decision?: ClawCapabilityMaturityDecision };
    error.code = decision.code;
    error.decision = decision;
    throw error;
  }
}

export function auditClawCapabilityMaturityRegistry(
  registry: ClawCapabilityMaturityRegistry = clawCapabilityMaturityRegistry,
): ClawCapabilityMaturityAuditResult {
  const failures: string[] = [];
  const seenIds = new Set<string>();
  for (const entry of registry.entries) {
    if (!entry.id) failures.push("capability maturity entry is missing id");
    if (seenIds.has(entry.id)) failures.push(`${entry.id}: duplicate capability id`);
    seenIds.add(entry.id);
    if (!entry.owner) failures.push(`${entry.id}: missing owner`);
    if (!entry.maturity) failures.push(`${entry.id}: missing maturity`);
    if (entry.maturity === "stable" || entry.maturity === "beta") {
      if (!entry.promotionDecision?.ref || !entry.promotionDecision.path) {
        failures.push(`${entry.id}: ${entry.maturity} capability requires promotionDecision`);
      }
    }
    if (entry.maturity === "incomplete" && entry.activationPolicy !== "dev_allowlist") {
      failures.push(`${entry.id}: incomplete capability must use dev_allowlist activation`);
    }
    if (!entry.surfaces.length) failures.push(`${entry.id}: missing surfaces`);
    if (!entry.tests.length) failures.push(`${entry.id}: missing tests`);
  }
  return { ok: failures.length === 0, failures };
}

const source: ClawCapabilityMaturitySource = {
  file: "packages/clawjs-core/src/capability-maturity.ts",
  symbol: "clawCapabilityMaturityRegistry",
};

export const clawCapabilityMaturityRegistry: ClawCapabilityMaturityRegistry = {
  version: 1,
  entries: [
    defineClawCapabilityMaturityEntry({
      id: "claw.shell.core",
      owner: "claw",
      title: "Core shell",
      summary: "Minimum stable shell: local chat, bridge/session core, basic settings, persistence, inspect registry, and diagnostics.",
      maturity: "stable",
      activationPolicy: "enabled",
      promotionDecision: {
        ref: "adr:0004:stable-surface-registry",
        path: "docs/adr/0004-persistent-surface-registry-and-inspection.md",
      },
      surfaces: ["claw inspect", "clawix.bridge.local", "clawix.ui.chat", "clawix.ui.settings"],
      tests: ["packages/clawjs-core/src/capability-maturity.test.ts"],
      source,
    }),
    defineClawCapabilityMaturityEntry({
      id: "system.telemetry",
      owner: "claw",
      title: "System telemetry",
      summary: "Framework and host system telemetry capability family; experimental until granular promotion decisions are recorded.",
      maturity: "experimental",
      activationPolicy: "opt_in",
      surfaces: ["claw system", "clawix.systemTelemetry"],
      tests: ["packages/clawjs-core/src/capability-maturity.test.ts"],
      source,
    }),
    defineClawCapabilityMaturityEntry({
      id: "system.telemetry.cpu.monitoring",
      parentId: "system.telemetry",
      owner: "clawix",
      title: "CPU monitoring",
      summary: "Host-side CPU telemetry monitoring and recording.",
      maturity: "experimental",
      activationPolicy: "opt_in",
      surfaces: ["clawix.systemTelemetry.monitoring", "claw system watch"],
      tests: ["packages/clawjs-core/src/capability-maturity.test.ts"],
      source,
    }),
    defineClawCapabilityMaturityEntry({
      id: "system.telemetry.cpu.graphs",
      parentId: "system.telemetry",
      owner: "clawix",
      title: "CPU graphs",
      summary: "Native CPU history graph rendering and related menu/widget visualizations.",
      maturity: "experimental",
      activationPolicy: "opt_in",
      surfaces: ["clawix.systemTelemetry.graphs", "clawix.menuBar.widgets"],
      tests: ["packages/clawjs-core/src/capability-maturity.test.ts"],
      source,
    }),
    defineClawCapabilityMaturityEntry({
      id: "claw.dev.incomplete-work",
      owner: "claw",
      title: "Incomplete development work",
      summary: "Representative incomplete capability used to enforce that dirty or unfinished work can live on main only when registered and dev-allowlisted.",
      surfaces: ["claw.dev.harness"],
      tests: ["packages/clawjs-core/src/capability-maturity.test.ts"],
      source,
    }),
  ],
};

export function listClawCapabilityMaturityEntries(): ClawCapabilityMaturityEntry[] {
  return [...clawCapabilityMaturityRegistry.entries];
}

export function getClawCapabilityMaturityEntry(id: string): ClawCapabilityMaturityEntry | undefined {
  return clawCapabilityMaturityRegistry.entries.find((entry) => entry.id === id);
}
