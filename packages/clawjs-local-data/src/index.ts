export const localDataCapabilityPack = {
  id: "local-data",
  packageName: "@clawjs/local-data",
  capabilities: ["core.sqlite", "productivity-db", "local-memory"],
  nativeDependencies: ["better-sqlite3"],
} as const;

export function isLocalDataCapabilityPackInstalled(): boolean {
  return true;
}
