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
  insecureTransport?: boolean;
  localNetwork?: boolean;
  agent?: string;
}

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

  // Host whitelist.
  const allowedHosts = parseJsonArray(secret.allowed_hosts_json);
  if (ctx.host && allowedHosts.length > 0 && !allowedHosts.includes(ctx.host)) {
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
  if (secret.allowed_agents_json && ctx.agent) {
    const allowedAgents = parseJsonArray(secret.allowed_agents_json);
    if (allowedAgents.length > 0 && !allowedAgents.includes(ctx.agent)) {
      reasons.push("agent_not_allowed");
    }
  }

  const approvalMode = secret.approval_mode as ApprovalMode;
  const needsApproval = approvalMode === "every-use" || approvalMode === "window";
  const needsVpn = secret.requires_vpn === 1;

  return {
    allowed: reasons.length === 0,
    reasons,
    needsApproval,
    needsVpn,
  };
}

export function describeReason(reason: GovernanceDenialReason): string {
  switch (reason) {
    case "host_not_allowed": return "Target host not in allowed list";
    case "header_not_allowed": return "One or more request headers are not allowed";
    case "placement_not_allowed": return "Secret cannot be injected at this placement";
    case "insecure_transport_blocked": return "Insecure transport (http://) is blocked for this secret";
    case "local_network_blocked": return "Local network targets are blocked for this secret";
    case "agent_not_allowed": return "This agent is not allowed to use this secret";
    case "secret_archived": return "Secret is archived";
    case "secret_compromised": return "Secret is marked as compromised";
    case "secret_locked": return "Secret is locked";
    case "secret_read_only": return "Secret is read-only";
    case "secret_trashed": return "Secret is in trash";
    case "ttl_expired": return "Secret has expired";
    case "max_uses_exhausted": return "Secret reached its max uses";
    case "approval_required": return "Approval window required";
    case "vpn_required": return "VPN connection required";
  }
}
