import type {
  AgentAssignmentRouteRequest,
  AgentEffectiveAccessInput,
} from "@clawjs/core";

export type MCPTransport = "stdio" | "http" | "sse";

export interface MCPServerRecord {
  id: string;
  name: string;
  transport: MCPTransport;
  endpoint: string;
  envJson: Record<string, string> | null;
  enabled: boolean;
  lastHealthCheckAt: number | null;
  lastHealthOk: boolean | null;
  capabilities: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

export interface MCPToolRecord {
  serverId: string;
  toolName: string;
  prefixedName: string;
  description: string | null;
  inputSchema: Record<string, unknown> | null;
  discoveredAt: number;
}

export interface RegisterMCPServerInput {
  id?: string;
  name: string;
  transport: MCPTransport;
  endpoint: string;
  env?: Record<string, string> | null;
  enabled?: boolean;
}

export interface UpdateMCPServerInput {
  name?: string;
  endpoint?: string;
  env?: Record<string, string> | null;
  enabled?: boolean;
}

export interface MCPToolCallInput {
  serverId?: string;
  prefixedName?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  controlPlane?: import("./control-plane.ts").MCPConnectorControlPlaneInput;
  agentPolicy?: MCPAgentAssignmentPolicyInput;
}

export interface MCPAgentAssignmentPolicyInput {
  route: AgentAssignmentRouteRequest;
  access: AgentEffectiveAccessInput;
}

export interface MCPToolCallResult {
  ok: boolean;
  content: unknown;
  error: string | null;
  durationMs: number;
}

export interface MCPExposedTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}
