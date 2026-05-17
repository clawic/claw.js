import {
  clawDenseDataOsRegistry,
  findClawDenseDataSystem,
  resolveBuiltinCollectionName,
  resolveClawDenseDataIntent,
} from "@clawjs/core";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK } from "./cli-errors.ts";
import { formatCliTable } from "./cli-flag-parsers.ts";
import { writeJsonOk } from "./cli-json.ts";
import { runMagicDbCli } from "./database-magic.ts";

interface DenseDataCliInput {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
  };
  wantsJson: boolean;
  binName: string;
  workspaceRoot: string;
}

const INSPECTION_ACTIONS = new Set(["overview", "gaps", "intents", "schema"]);
const CRUD_ACTIONS = new Set(["list", "get", "create", "update", "delete", "query", "schema", "add"]);

export async function runDenseDataCli(input: DenseDataCliInput): Promise<number | null> {
  const phrase = input.positionals.join(" ");
  const group = input.positionals[0];
  const action = input.positionals[1];
  if (!group || !action) return null;
  if (!isDenseDataCommandGroup(group)) return null;

  const intent = resolveClawDenseDataIntent(phrase);
  if (intent.status === "data_gap") return null;
  const nestedRoute = nestedDenseDbRoute(input);
  if (nestedRoute) {
    return await runMagicDbCli(nestedRoute);
  }
  const collectionName = collectionForDenseRoute(input.positionals[0], intent.center?.collectionName);
  const dbAction = action === "add" ? "create" : action;
  if (collectionName && CRUD_ACTIONS.has(action) && dbAction !== "purge") {
    return await runMagicDbCli({
      argv: denseDbArgv(input.argv, collectionName, dbAction),
      positionals: [input.positionals[0] ?? "dense", collectionName, dbAction, ...input.positionals.slice(2)],
      flags: denseDbFlags(input.flags, collectionName),
      workspaceRoot: input.workspaceRoot,
      stdout: input.context.stdout,
      stderr: input.context.stderr,
      wantsJson: input.wantsJson,
      binName: input.binName,
    });
  }

  const inspectionAction = INSPECTION_ACTIONS.has(action);
  if (!inspectionAction && !CRUD_ACTIONS.has(action) && !intent.operation) return null;
  const payload = {
    intent,
    coverage: {
      routeKnown: true,
      executable: inspectionAction,
      databaseConnected: false,
      store: "core.sqlite",
      implementationStatus: inspectionAction ? "inspection_only" : "db_adapter_pending",
    },
    gap: inspectionAction
      ? null
      : {
        status: "workflow_gap",
        reason: "Dense-data route is known, but CRUD execution is not connected to canonical core.sqlite collections yet.",
        nextStep: "Graduate this center into canonical collections, schemas, relations, quality gaps, and DB smoke tests before treating this as executable.",
      },
    registry: denseRegistryPayload(intent.system?.id, group, action),
  };

  if (input.wantsJson) {
    writeJsonOk(input.context.stdout, payload, {
      schemaVersion: 1,
      canonicalCommand: intent.center?.commandNoun ?? intent.system?.canonicalCommand ?? group,
      invokedCommand: group,
      subcommand: action,
      denseData: true,
    });
  } else if (inspectionAction) {
    input.context.stdout.write(renderDenseInspection(payload.registry));
  } else {
    input.context.stderr.write(`Dense-data route known but not executable yet: ${input.binName} ${phrase}\n`);
    input.context.stderr.write(`${payload.gap?.nextStep}\n`);
  }

  return inspectionAction ? CLI_EXIT_OK : CLI_EXIT_DEGRADED;
}

function collectionForDenseRoute(command: string | undefined, centerCollectionName: string | undefined): string | undefined {
  if (centerCollectionName) return centerCollectionName;
  if (!command) return undefined;
  return resolveBuiltinCollectionName(command);
}

function denseDbArgv(argv: string[], collectionName: string, dbAction: string): string[] {
  const firstFlagIndex = argv.findIndex((token) => token.startsWith("--"));
  const tailFlags = firstFlagIndex >= 0 ? argv.slice(firstFlagIndex) : [];
  return ["db", collectionName, dbAction, ...tailFlags];
}

function denseDbFlags(flags: Record<string, string>, collectionName: string): Record<string, string> {
  let nextFlags = flags;
  if (["medications", "symptom_logs"].includes(collectionName) && flags.patient && !flags["patient-id"]) {
    nextFlags = { ...nextFlags, "patient-id": flags.patient };
  }
  if (["accounts", "deals", "billing_customers", "legal_cases", "services", "work_orders"].includes(collectionName) && flags.company && !flags["company-id"]) {
    nextFlags = { ...nextFlags, "company-id": flags.company };
  }
  if (["invoices", "payment_intents"].includes(collectionName) && flags["billing-customer"] && !flags["billing-customer-id"]) {
    nextFlags = { ...nextFlags, "billing-customer-id": flags["billing-customer"] };
  }
  if (collectionName === "incidents" && flags.service && !flags["service-id"]) {
    nextFlags = { ...nextFlags, "service-id": flags.service };
  }
  if (collectionName === "case_evidence" && flags.case && !flags["case-id"]) {
    nextFlags = { ...nextFlags, "case-id": flags.case };
  }
  if (collectionName === "transactions" && flags.account && !flags["account-id"]) {
    nextFlags = { ...nextFlags, "account-id": flags.account };
  }
  if (collectionName === "participants" && flags.study && !flags["study-id"]) {
    nextFlags = { ...nextFlags, "study-id": flags.study };
  }
  if (collectionName === "assays" && flags.sample && !flags["sample-id"]) {
    nextFlags = { ...nextFlags, "sample-id": flags.sample };
  }
  return nextFlags;
}

function nestedDenseDbRoute(input: DenseDataCliInput): Parameters<typeof runMagicDbCli>[0] | null {
  return nestedParentDbRoute(input, {
    parentCommand: "patient",
    relationFlag: "patient-id",
    relationField: "patientId",
    collections: {
      medication: "medications",
      medications: "medications",
      symptom: "symptom_logs",
      symptoms: "symptom_logs",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "case",
    relationFlag: "case-id",
    relationField: "caseId",
    collections: {
      evidence: "case_evidence",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "service",
    relationFlag: "service-id",
    relationField: "serviceId",
    collections: {
      incident: "incidents",
      incidents: "incidents",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "study",
    relationFlag: "study-id",
    relationField: "studyId",
    collections: {
      participant: "participants",
      participants: "participants",
      cohort: "participants",
      cohorts: "participants",
    },
  }) ?? nestedParentDbRoute(input, {
    parentCommand: "sample",
    relationFlag: "sample-id",
    relationField: "sampleId",
    collections: {
      assay: "assays",
      assays: "assays",
      test: "assays",
      tests: "assays",
    },
  });
}

function nestedParentDbRoute(input: DenseDataCliInput, config: {
  parentCommand: string;
  relationFlag: string;
  relationField: string;
  collections: Record<string, string>;
}): Parameters<typeof runMagicDbCli>[0] | null {
  if (input.positionals[0] !== config.parentCommand) return null;
  const patientId = input.positionals[1];
  const noun = input.positionals[2];
  const action = input.positionals[3];
  if (!patientId || !noun || !action) return null;

  const collectionName = config.collections[noun];
  if (!collectionName) return null;
  const dbAction = action === "add" ? "create" : action;
  if (!CRUD_ACTIONS.has(action) || dbAction === "purge") return null;

  const flags = dbAction === "create"
    ? { ...input.flags, [config.relationFlag]: input.flags[config.relationFlag] ?? patientId }
    : { ...input.flags, filter: input.flags.filter ?? JSON.stringify({ [config.relationField]: patientId }) };

  return {
    argv: input.argv,
    positionals: [config.parentCommand, collectionName, dbAction, ...input.positionals.slice(4)],
    flags,
    workspaceRoot: input.workspaceRoot,
    stdout: input.context.stdout,
    stderr: input.context.stderr,
    wantsJson: input.wantsJson,
    binName: input.binName,
  };
}

function isDenseDataCommandGroup(group: string): boolean {
  return clawDenseDataOsRegistry.systems.some((system) =>
    system.canonicalCommand === group
    || system.aliases.includes(group)
    || system.centers.some((center) => center.commandNoun === group || center.commandAliases.includes(group))
  );
}

function denseRegistryPayload(systemId: string | undefined, group: string, action: string) {
  const system = systemId ? findClawDenseDataSystem(systemId) : undefined;
  const systems = system ? [system] : clawDenseDataOsRegistry.systems.filter((entry) => entry.canonicalCommand === group || entry.aliases.includes(group));
  return {
    action,
    systems,
    statuses: clawDenseDataOsRegistry.intentStatuses,
    standardCollectionActions: clawDenseDataOsRegistry.standardCollectionActions,
    routeRejectionReasons: clawDenseDataOsRegistry.routeRejectionReasons,
    foundationPrimitives: clawDenseDataOsRegistry.foundationPrimitives,
  };
}

function renderDenseInspection(registry: ReturnType<typeof denseRegistryPayload>): string {
  const rows = registry.systems.map((system) => ({
    id: system.id,
    command: system.canonicalCommand,
    wave: system.wave,
    centers: system.centers.map((center) => center.commandNoun).join(", "),
  }));
  return `${formatCliTable(rows)}\n`;
}
