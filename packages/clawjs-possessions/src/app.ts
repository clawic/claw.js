import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildTrackingApp,
  catalogJsonToEntries,
  loadCatalogJson,
  type BuildTrackingAppOptions,
} from "@clawjs/tracking-runtime";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_CATALOG_PATH = path.resolve(__dirname, "catalog.json");
const SOURCE_CATALOG_PATH = path.resolve(__dirname, "../src/catalog.json");
const CATALOG_PATH = fs.existsSync(DIST_CATALOG_PATH) ? DIST_CATALOG_PATH : SOURCE_CATALOG_PATH;

export const DOMAIN = "possessions" as const;
export const DEFAULT_PORT = 4751;
export const HAS_SESSIONS = false;
export const ENV_PREFIX = "POSSESSIONS";

export interface BuildPossessionsAppOptions {
  configOverrides?: BuildTrackingAppOptions["configOverrides"];
}

export function buildPossessionsApp(options: BuildPossessionsAppOptions = {}) {
  const catalog = loadCatalogJson(CATALOG_PATH);
  return buildTrackingApp({
    domain: DOMAIN,
    defaultPort: DEFAULT_PORT,
    hasSessions: HAS_SESSIONS,
    envPrefix: ENV_PREFIX,
    configOverrides: options.configOverrides,
    seedCatalog: catalogJsonToEntries(catalog),
  });
}
