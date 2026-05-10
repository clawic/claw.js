import type { BuiltinFamilyDefinition } from "../_types.ts";

import { REPOSITORIES } from "./repositories.ts";
import { INFRA_ENVIRONMENTS } from "./infra_environments.ts";
import { DEPLOYMENTS } from "./deployments.ts";
import { INFRA_DOMAINS } from "./infra_domains.ts";
import { INFRA_SECRETS } from "./infra_secrets.ts";
import { ACTION_RUNS } from "./action_runs.ts";
import { REDIRECTS } from "./redirects.ts";
import { RELEASE_PIPELINES } from "./release_pipelines.ts";
import { RELEASE_STAGES } from "./release_stages.ts";
import { RELEASE_RUNS } from "./release_runs.ts";

export const INFRA_FAMILY: BuiltinFamilyDefinition = {
  name: "infra",
  displayName: "Deployment & Infrastructure",
  description: "Repositories, environments, deployments, domains, secrets, CI runs and release pipelines.",
  collections: [
    REPOSITORIES,
    INFRA_ENVIRONMENTS,
    DEPLOYMENTS,
    INFRA_DOMAINS,
    INFRA_SECRETS,
    ACTION_RUNS,
    REDIRECTS,
    RELEASE_PIPELINES,
    RELEASE_STAGES,
    RELEASE_RUNS,
  ],
};

export { REPOSITORIES, INFRA_ENVIRONMENTS, DEPLOYMENTS, INFRA_DOMAINS, INFRA_SECRETS, ACTION_RUNS, REDIRECTS, RELEASE_PIPELINES, RELEASE_STAGES, RELEASE_RUNS };
