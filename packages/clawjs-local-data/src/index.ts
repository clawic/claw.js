export const localSqliteCapabilityPack = {
  id: "local-data",
  packageName: "@clawjs/local-data",
  capabilities: ["core.sqlite", "productivity-db", "local-memory"],
  nativeDependencies: ["better-sqlite3"],
} as const;

export function isLocalSqliteCapabilityPackInstalled(): boolean {
  return true;
}

export const localDataCapabilityPack = localSqliteCapabilityPack;

export const isLocalDataCapabilityPackInstalled = isLocalSqliteCapabilityPackInstalled;
