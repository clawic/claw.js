// Five orthogonal registries that aggregate plugin contributions.

import type {
  BrandSync,
  ExecutorPlugin,
  PermissionModel,
  PluginManifest,
  SecretTypeDeclaration,
  SessionStrategy,
} from "./types.ts";

export class PluginRegistry {
  private types = new Map<string, SecretTypeDeclaration>();
  private executors = new Map<string, ExecutorPlugin>();
  private sessions = new Map<string, SessionStrategy>();
  private permissions = new Map<string, PermissionModel>();
  private syncs = new Map<string, BrandSync>();
  private installedManifests = new Map<string, PluginManifest>();

  install(manifest: PluginManifest): void {
    if (this.installedManifests.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} already installed`);
    }
    this.installedManifests.set(manifest.id, manifest);
    for (const t of manifest.types ?? []) {
      if (this.types.has(t.typeId)) throw new Error(`typeId clash: ${t.typeId}`);
      this.types.set(t.typeId, t);
    }
    for (const e of manifest.executors ?? []) {
      if (this.executors.has(e.id)) throw new Error(`executorId clash: ${e.id}`);
      this.executors.set(e.id, e);
    }
    for (const s of manifest.sessionStrategies ?? []) {
      if (this.sessions.has(s.id)) throw new Error(`sessionStrategyId clash: ${s.id}`);
      this.sessions.set(s.id, s);
    }
    for (const p of manifest.permissionModels ?? []) {
      if (this.permissions.has(p.id)) throw new Error(`permissionModelId clash: ${p.id}`);
      this.permissions.set(p.id, p);
    }
    for (const b of manifest.brandSyncs ?? []) {
      if (this.syncs.has(b.id)) throw new Error(`brandSyncId clash: ${b.id}`);
      this.syncs.set(b.id, b);
    }
  }

  uninstall(pluginId: string): void {
    const manifest = this.installedManifests.get(pluginId);
    if (!manifest) return;
    for (const t of manifest.types ?? []) this.types.delete(t.typeId);
    for (const e of manifest.executors ?? []) this.executors.delete(e.id);
    for (const s of manifest.sessionStrategies ?? []) this.sessions.delete(s.id);
    for (const p of manifest.permissionModels ?? []) this.permissions.delete(p.id);
    for (const b of manifest.brandSyncs ?? []) this.syncs.delete(b.id);
    this.installedManifests.delete(pluginId);
  }

  // ---- Lookups ----

  getType(typeId: string): SecretTypeDeclaration | undefined {
    return this.types.get(typeId);
  }
  listTypes(): SecretTypeDeclaration[] {
    return [...this.types.values()].sort((a, b) => a.typeId.localeCompare(b.typeId));
  }

  getExecutor(id: string): ExecutorPlugin | undefined {
    return this.executors.get(id);
  }
  listExecutors(): ExecutorPlugin[] {
    return [...this.executors.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  getSession(id: string): SessionStrategy | undefined {
    return this.sessions.get(id);
  }
  listSessions(): SessionStrategy[] {
    return [...this.sessions.values()];
  }

  getPermissionModel(id: string): PermissionModel | undefined {
    return this.permissions.get(id);
  }
  listPermissionModels(): PermissionModel[] {
    return [...this.permissions.values()];
  }

  getBrandSync(id: string): BrandSync | undefined {
    return this.syncs.get(id);
  }
  listBrandSyncs(): BrandSync[] {
    return [...this.syncs.values()];
  }

  listPlugins(): PluginManifest[] {
    return [...this.installedManifests.values()];
  }
}
