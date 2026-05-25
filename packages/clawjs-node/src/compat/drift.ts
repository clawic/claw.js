import type { CompatSnapshot } from "@clawjs/core";

import type { RuntimeCompatReport, RuntimeProbeStatus } from "../runtime/contracts.ts";

export interface CompatDriftIssue {
  code: "runtime_adapter" | "runtime_version" | "version_family" | "capability_signature";
  message: string;
}

export interface CompatDriftReport {
  drifted: boolean;
  issues: CompatDriftIssue[];
}

function readStringDiagnostic(source: Record<string, unknown> | undefined, key: string): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildCapabilitySignature(capabilities: Record<string, boolean>): string {
  return Object.entries(capabilities)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([capability, supported]) => `${capability}=${supported ? "1" : "0"}`)
    .join("|");
}

function readCapabilitySignature(source: Record<string, unknown> | undefined, capabilities: Record<string, boolean>): string {
  return readStringDiagnostic(source, "capabilitySignature") ?? buildCapabilitySignature(capabilities);
}

export function buildCompatDriftReport(
  snapshot: CompatSnapshot | null,
  runtime: RuntimeProbeStatus,
  compat: RuntimeCompatReport,
): CompatDriftReport {
  if (!snapshot) {
    return {
      drifted: false,
      issues: [],
    };
  }

  const issues: CompatDriftIssue[] = [];
  if (snapshot.runtimeAdapter !== compat.runtimeAdapter) {
    issues.push({
      code: "runtime_adapter",
      message: `Compat snapshot adapter drifted from ${snapshot.runtimeAdapter} to ${compat.runtimeAdapter}.`,
    });
  }

  if (snapshot.runtimeVersion && compat.runtimeVersion && snapshot.runtimeVersion !== compat.runtimeVersion) {
    issues.push({
      code: "runtime_version",
      message: `Compat snapshot runtime version drifted from ${snapshot.runtimeVersion} to ${compat.runtimeVersion}.`,
    });
  }

  const snapshotVersionFamily = readStringDiagnostic(snapshot.diagnostics, "versionFamily");
  const currentVersionFamily = readStringDiagnostic({
    ...runtime.diagnostics,
    ...(compat.diagnostics ?? {}),
  }, "versionFamily");
  if (snapshotVersionFamily && currentVersionFamily && snapshotVersionFamily !== currentVersionFamily) {
    issues.push({
      code: "version_family",
      message: `Compat snapshot version family drifted from ${snapshotVersionFamily} to ${currentVersionFamily}.`,
    });
  }

  const snapshotCapabilitySignature = readCapabilitySignature(snapshot.diagnostics, snapshot.capabilities);
  const currentCapabilitySignature = readCapabilitySignature({
    ...runtime.diagnostics,
    ...(compat.diagnostics ?? {}),
  }, compat.capabilities);
  if (snapshotCapabilitySignature !== currentCapabilitySignature) {
    issues.push({
      code: "capability_signature",
      message: "Compat snapshot capability signature no longer matches the current runtime probe.",
    });
  }

  return {
    drifted: issues.length > 0,
    issues,
  };
}
