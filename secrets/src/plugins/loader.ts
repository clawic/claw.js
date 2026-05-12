// Plugin loader. Boots the registry with built-in plugins and lazy-loads
// any plugins found in the secrets's external `plugins/` directory.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PluginRegistry } from "./registry.ts";
import { builtinPlugin } from "./builtin/index.ts";
import type { PluginManifest } from "./types.ts";

export interface LoaderOptions {
  externalPluginsDir?: string;
}

export async function bootPluginRegistry(opts: LoaderOptions = {}): Promise<PluginRegistry> {
  const registry = new PluginRegistry();
  registry.install(builtinPlugin);

  const externalDir = opts.externalPluginsDir;
  if (externalDir && fs.existsSync(externalDir)) {
    const entries = fs.readdirSync(externalDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
      const file = path.join(externalDir, entry.name);
      try {
        const mod = (await import(pathToFileURL(file).href)) as { default?: PluginManifest };
        if (mod.default && typeof mod.default === "object") {
          registry.install(mod.default);
        }
      } catch (err) {
        console.error(`Failed to load plugin ${file}:`, err);
      }
    }
  }
  return registry;
}
