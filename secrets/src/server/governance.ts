// Governance enforcement. Reads the per-secret governance fields from
// the SecretRow and validates a request context (host, headers,
// placement, transport, network, allowed agents, TTL, max uses,
// approval mode, requiresVPN). Returns a result with allowance flags.

import {
  parseJsonArray,
  type SecretRow,
  type ApprovalMode,
  type Placement,
} from "./db.ts";

export interface ResolveContext {
  host?: string;
  method?: string;
  headers?: Record<string, string>;
  placements?: Placement[]; // where the resolved value will be injected
  riskTier?: RiskTier;
  insecureTransport?: boolean;
  localNetwork?: boolean;
  agent?: string;
  requireCompleteContext?: boolean;
  approvalSatisfied?: boolean;
  vpnSatisfied?: boolean;
  writeIntent?: boolean;
}

export type RiskTier = "read" | "write" | "destructive" | "cost" | "system";

export type GovernanceDenialReason =
  | "host_not_allowed"
  | "header_not_allowed"
  | "placement_not_allowed"
  | "insecure_transport_blocked"
  | "local_network_blocked"
  | "agent_not_allowed"
  | "secret_archived"
  | "secret_compromised"
  | "secret_locked"
  | "secret_read_only"
  | "secret_trashed"
  | "missing_context"
  | "ttl_expired"
  | "max_uses_exhausted"
  | "approval_required"
  | "vpn_required";

export interface GovernanceDecision {
  allowed: boolean;
  reasons: GovernanceDenialReason[];
  needsApproval: boolean;
  needsVpn: boolean;
}

function normalizeHost(input: string): string {
  const trimmed = input.trim().toLowerCase();
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).host;
  } catch {
    return trimmed.replace(/\/.*$/, "");
  }
}

function hostnameOnly(input: string): string {
  const host = normalizeHost(input);
  if (host.startsWith("[") && host.includes("]")) return host.slice(1, host.indexOf("]"));
  return host.split(":")[0] ?? host;
}

function hostMatches(allowedPattern: string, actualHost: string): boolean {
  const allowed = normalizeHost(allowedPattern);
  const actual = normalizeHost(actualHost);
  if (allowed === actual) return true;

  if (!allowed.startsWith("*.")) return false;
  const suffix = allowed.slice(2);
  const actualName = hostnameOnly(actual);
  return actualName.endsWith(`.${suffix}`) && actualName !== suffix;
}

export function evaluateGovernance(secret: SecretRow, ctx: ResolveContext): GovernanceDecision {
  const reasons: GovernanceDenialReason[] = [];

  if (secret.trashed_at) reasons.push("secret_trashed");
  if (secret.is_archived === 1) reasons.push("secret_archived");
  if (secret.is_compromised === 1) reasons.push("secret_compromised");
  if (secret.is_locked === 1) reasons.push("secret_locked");

  // TTL / max uses.
  if (secret.ttl_expires_at && new Date(secret.ttl_expires_at).getTime() <= Date.now()) {
    reasons.push("ttl_expired");
  }
  if (secret.max_uses != null && secret.use_count >= secret.max_uses) {
    reasons.push("max_uses_exhausted");
  }
  if (ctx.writeIntent === true && secret.read_only === 1) {
    reasons.push("secret_read_only");
  }

  // Host whitelist.
  const allowedHosts = parseJsonArray(secret.allowed_hosts_json);
  if (ctx.requireCompleteContext === true && allowedHosts.length === 0) {
    reasons.push("host_not_allowed");
  }
  if (ctx.requireCompleteContext === true && allowedHosts.length > 0 && !ctx.host) {
    reasons.push("missing_context");
  }
  if (ctx.host && allowedHosts.length > 0 && !allowedHosts.some((host) => hostMatches(host, ctx.host!))) {
    reasons.push("host_not_allowed");
  }

  // Header whitelist.
  const allowedHeaders = parseJsonArray(secret.allowed_headers_json).map((h) => h.toLowerCase());
  if (ctx.headers && allowedHeaders.length > 0) {
    for (const headerName of Object.keys(ctx.headers)) {
      if (!allowedHeaders.includes(headerName.toLowerCase())) {
        reasons.push("header_not_allowed");
        break;
      }
    }
  }

  // Placement enforcement.
  // - header: covered by allowedHeaders whitelist above.
  // - query (URL query string): requires allow_in_url.
  // - body: requires allow_in_body.
  // - env: requires allow_in_env.
  // - none: not injected, no flag required.
  if (ctx.requireCompleteContext === true && !ctx.placements) {
    reasons.push("missing_context");
  }
  if (ctx.requireCompleteContext === true && !ctx.riskTier) {
    reasons.push("missing_context");
  }
  if (ctx.placements) {
    for (const placement of ctx.placements) {
      if (placement === "query" && secret.allow_in_url === 0) {
        reasons.push("placement_not_allowed");
        break;
      }
      if (placement === "body" && secret.allow_in_body === 0) {
        reasons.push("placement_not_allowed");
        break;
      }
      if (placement === "env" && secret.allow_in_env === 0) {
        reasons.push("placement_not_allowed");
        break;
      }
    }
  }

  if (ctx.insecureTransport === true && secret.allow_insecure_transport === 0) {
    reasons.push("insecure_transport_blocked");
  }

  if (ctx.localNetwork === true && secret.allow_local_network === 0) {
    reasons.push("local_network_blocked");
  }

  // Allowed agents.
  const allowedAgents = secret.allowed_agents_json ? parseJsonArray(secret.allowed_agents_json) : [];
  if (allowedAgents.length > 0) {
    if (ctx.requireCompleteContext === true && !ctx.agent) {
      reasons.push("missing_context");
    } else if (ctx.agent && !allowedAgents.includes(ctx.agent)) {
      reasons.push("agent_not_allowed");
    }
  }

  const approvalMode = secret.approval_mode as ApprovalMode;
  const needsApproval = approvalMode === "every-use" || approvalMode === "window";
  const needsVpn = secret.requires_vpn === 1;
  if (needsApproval && ctx.approvalSatisfied !== true) {
    reasons.push("approval_required");
  }
  if (ctx.riskTier && ctx.riskTier !== "read" && ctx.approvalSatisfied !== true) {
    reasons.push("approval_required");
  }
  if (needsVpn && ctx.vpnSatisfied !== true) {
    reasons.push("vpn_required");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    needsApproval,
    needsVpn,
  };
}
