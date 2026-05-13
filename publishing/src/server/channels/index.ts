import type { DB } from "../db/index.ts";
import { jsonStringify } from "../db/index.ts";
import type { ChannelFamilyDescriptor } from "../../shared/types.ts";
import type { AdapterModule, ChannelAdapter } from "./contract.ts";
import { FAMILIES } from "./families.ts";
import { makeSkeleton } from "./skeleton.ts";
import { devnullModule } from "./devnull.ts";
import { blueskyModule } from "./bluesky.ts";
import { mastodonModule } from "./mastodon.ts";

const CONCRETE_MODULES: AdapterModule[] = [devnullModule, blueskyModule, mastodonModule];

export class ChannelRegistry {
  private readonly modules = new Map<string, AdapterModule>();

  constructor() {
    for (const family of FAMILIES) {
      const concrete = CONCRETE_MODULES.find((m) => m.family.id === family.id);
      this.modules.set(family.id, concrete ?? makeSkeleton(family));
    }
  }

  list(): ChannelFamilyDescriptor[] {
    return Array.from(this.modules.values()).map((m) => m.family);
  }

  get(familyId: string): AdapterModule | null {
    return this.modules.get(familyId) ?? null;
  }

  adapter(familyId: string): ChannelAdapter | null {
    return this.modules.get(familyId)?.adapter ?? null;
  }

  family(familyId: string): ChannelFamilyDescriptor | null {
    return this.modules.get(familyId)?.family ?? null;
  }

  seed(db: DB): void {
    const stmt = db.prepare(
      `INSERT INTO channel_family (id, name, "group", auth_kind, capability_schema_version, enabled, adapter_module, capabilities)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name,
         "group"=excluded."group",
         auth_kind=excluded.auth_kind,
         capability_schema_version=excluded.capability_schema_version,
         adapter_module=excluded.adapter_module,
         capabilities=excluded.capabilities`,
    );
    const tx = db.transaction(() => {
      for (const family of this.list()) {
        stmt.run(
          family.id,
          family.name,
          family.group,
          family.authKind,
          family.capabilitySchemaVersion ?? 1,
          `src/server/channels/${family.id}.ts`,
          jsonStringify(family.capabilities),
        );
      }
    });
    tx();
  }
}
