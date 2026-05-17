export type IntegrationQaCoverageStatus =
  | "implemented"
  | "fixture_only"
  | "live_smoke"
  | "manual_only"
  | "unsupported_by_policy";

export type IntegrationQaLiveLane =
  | "none"
  | "brokered_live"
  | "manual_physical"
  | "blocked_by_policy";

export interface OfficialApiCoverageEntry {
  provider: string;
  officialApiVersion: string;
  officialMethod: string;
  status: IntegrationQaCoverageStatus;
  liveLane: IntegrationQaLiveLane;
  connectorOperationIds: string[];
  requiresCredentialLease: boolean;
  notes: string;
}

export interface OfficialApiCoverageMatrix {
  provider: string;
  officialApiVersion: string;
  officialSourceUrl: string;
  officialSourceDate: string;
  officialMethods: readonly string[];
  entries: readonly OfficialApiCoverageEntry[];
}

export interface OfficialApiCoverageMatrixReport {
  provider: string;
  officialApiVersion: string;
  totalOfficialMethods: number;
  totalEntries: number;
  implemented: number;
  fixtureOnly: number;
  liveSmoke: number;
  manualOnly: number;
  unsupportedByPolicy: number;
}

export class IntegrationQaCoverageMatrixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationQaCoverageMatrixError";
  }
}

const COVERAGE_STATUSES = new Set<IntegrationQaCoverageStatus>([
  "implemented",
  "fixture_only",
  "live_smoke",
  "manual_only",
  "unsupported_by_policy",
]);

const LIVE_LANES = new Set<IntegrationQaLiveLane>([
  "none",
  "brokered_live",
  "manual_physical",
  "blocked_by_policy",
]);

export function verifyOfficialApiCoverageMatrix(
  matrix: OfficialApiCoverageMatrix,
): OfficialApiCoverageMatrixReport {
  const errors: string[] = [];
  const officialMethods = new Set<string>();
  const seenEntries = new Set<string>();

  for (const method of matrix.officialMethods) {
    if (!method) {
      errors.push("official method list contains an empty method");
      continue;
    }
    if (officialMethods.has(method)) {
      errors.push(`official method list contains duplicate method ${method}`);
    }
    officialMethods.add(method);
  }

  for (const entry of matrix.entries) {
    if (entry.provider !== matrix.provider) {
      errors.push(`${entry.officialMethod} uses provider ${entry.provider}, expected ${matrix.provider}`);
    }
    if (entry.officialApiVersion !== matrix.officialApiVersion) {
      errors.push(
        `${entry.officialMethod} uses API version ${entry.officialApiVersion}, expected ${matrix.officialApiVersion}`,
      );
    }
    if (!officialMethods.has(entry.officialMethod)) {
      errors.push(`${entry.officialMethod} is classified but is not in the official method snapshot`);
    }
    if (seenEntries.has(entry.officialMethod)) {
      errors.push(`${entry.officialMethod} has multiple matrix entries`);
    }
    seenEntries.add(entry.officialMethod);

    if (!COVERAGE_STATUSES.has(entry.status)) {
      errors.push(`${entry.officialMethod} has invalid status ${entry.status}`);
    }
    if (!LIVE_LANES.has(entry.liveLane)) {
      errors.push(`${entry.officialMethod} has invalid live lane ${entry.liveLane}`);
    }
    if (!entry.notes.trim()) {
      errors.push(`${entry.officialMethod} must include a rationale note`);
    }
    if (entry.status === "implemented" && entry.connectorOperationIds.length === 0) {
      errors.push(`${entry.officialMethod} is implemented but has no connector operation ids`);
    }
    if (entry.liveLane === "brokered_live" && !entry.requiresCredentialLease) {
      errors.push(`${entry.officialMethod} is brokered-live but does not require a credential lease`);
    }
    if (entry.status === "unsupported_by_policy" && entry.liveLane !== "blocked_by_policy") {
      errors.push(`${entry.officialMethod} is policy-blocked but liveLane is ${entry.liveLane}`);
    }
  }

  for (const method of officialMethods) {
    if (!seenEntries.has(method)) {
      errors.push(`${method} is present in the official snapshot but has no coverage entry`);
    }
  }

  if (errors.length > 0) {
    throw new IntegrationQaCoverageMatrixError(errors.join("\n"));
  }

  return {
    provider: matrix.provider,
    officialApiVersion: matrix.officialApiVersion,
    totalOfficialMethods: officialMethods.size,
    totalEntries: matrix.entries.length,
    implemented: matrix.entries.filter((entry) => entry.status === "implemented").length,
    fixtureOnly: matrix.entries.filter((entry) => entry.status === "fixture_only").length,
    liveSmoke: matrix.entries.filter((entry) => entry.status === "live_smoke").length,
    manualOnly: matrix.entries.filter((entry) => entry.status === "manual_only").length,
    unsupportedByPolicy: matrix.entries.filter((entry) => entry.status === "unsupported_by_policy").length,
  };
}
