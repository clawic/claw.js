// Aggregator: assemble the built-in plugin manifest from all the local
// types, executors, sessions, permission models and brand syncs.

import { definePlugin, type PluginManifest } from "../types.ts";

import { BUILTIN_TYPES } from "./types-catalog.ts";
import { brokerHttpExecutor } from "./executors/brokerhttp.ts";
import { gitPushExecutor, gitFetchExecutor, gitCloneExecutor } from "./executors/git.ts";
import { npmPublishExecutor, npmWhoamiExecutor } from "./executors/npm.ts";
import { sshConnectExecutor } from "./executors/ssh.ts";
import { githubReleaseExecutor } from "./executors/github.ts";
import { openaiImageExecutor } from "./executors/openai.ts";
import { commandExecutor } from "./executors/command.ts";
import { jwtBearerRefreshStrategy } from "./sessions/jwt-bearer-refresh.ts";
import { oauth2RefreshStrategy } from "./sessions/oauth2-refresh.ts";
import {
  airtableBasesModel,
  appstoreActionsModel,
  githubReposModel,
  npmPackagesModel,
  pocketbaseCollectionsModel,
  supabaseSchemasModel,
} from "./permissions/collection-allowlist.ts";
import { appStoreConnectAppSync } from "./brand-syncs/appstoreconnect-appsync.ts";

export const builtinPlugin: PluginManifest = definePlugin({
  id: "@clawjs/secrets-builtin",
  version: "0.1.2",
  label: "Built-in secrets plugins",
  description: "Default registry of secret types, executors, sessions, permissions and brand syncs.",
  types: [...BUILTIN_TYPES],
  executors: [
    brokerHttpExecutor,
    gitPushExecutor,
    gitFetchExecutor,
    gitCloneExecutor,
    npmPublishExecutor,
    npmWhoamiExecutor,
    sshConnectExecutor,
    githubReleaseExecutor,
    openaiImageExecutor,
    commandExecutor,
  ],
  sessionStrategies: [jwtBearerRefreshStrategy, oauth2RefreshStrategy],
  permissionModels: [
    pocketbaseCollectionsModel,
    airtableBasesModel,
    supabaseSchemasModel,
    githubReposModel,
    npmPackagesModel,
    appstoreActionsModel,
  ],
  brandSyncs: [appStoreConnectAppSync],
});
