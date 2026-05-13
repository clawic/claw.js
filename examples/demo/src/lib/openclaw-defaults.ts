export const DEFAULT_CLAW_OPENCLAW_AGENT_ID = "clawjs-demo";

export function defaultClawJsWorkspacePath(
  agentId: string = DEFAULT_CLAW_OPENCLAW_AGENT_ID,
): string {
  return `~/.openclaw/workspaces/${agentId}`;
}

export function defaultClawJsWorkspaceConfigPath(
  agentId: string = DEFAULT_CLAW_OPENCLAW_AGENT_ID,
): string {
  return `${defaultClawJsWorkspacePath(agentId)}/config`;
}

export function defaultClawJsWorkspaceDataPath(
  agentId: string = DEFAULT_CLAW_OPENCLAW_AGENT_ID,
): string {
  return `${defaultClawJsWorkspacePath(agentId)}/data`;
}

export function defaultClawJsTranscriptionDbPath(
  agentId: string = DEFAULT_CLAW_OPENCLAW_AGENT_ID,
): string {
  return `${defaultClawJsWorkspacePath(agentId)}/audio.sqlite`;
}

export function defaultClawJsActivityStoreDbPath(
  agentId: string = DEFAULT_CLAW_OPENCLAW_AGENT_ID,
): string {
  return `${defaultClawJsWorkspaceDataPath(agentId)}/runtime.sqlite`;
}

export function defaultClawJsLocalSettingsPath(
  agentId: string = DEFAULT_CLAW_OPENCLAW_AGENT_ID,
): string {
  return `${defaultClawJsWorkspacePath(agentId)}/settings.json`;
}
