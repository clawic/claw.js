import {
  clawDenseDataAcceptanceFixture,
  clawDenseDataOsRegistry,
  findClawDenseDataSystem,
  listClawDenseDataSemanticViewEntries,
  resolveBuiltinCollectionName,
  resolveClawDenseDataIntent,
} from "@clawjs/core";
import fs from "fs";
import path from "path";

import { CLI_EXIT_DEGRADED, CLI_EXIT_OK } from "./cli-errors.ts";
import { formatCliTable } from "./cli-flag-parsers.ts";
import { writeJsonOk } from "./cli-json.ts";
import { runMagicDbCli } from "./database-magic.ts";
import { openMainDataStore } from "./v1-data.ts";

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
const DENSE_FIXTURE_COMMANDS = new Set(["dense-fixture", "dense-fixtures"]);
const FOUNDATION_COLLECTION_COMMANDS: Record<string, string> = {
  "domain-system": "domain_systems",
  "domain-systems": "domain_systems",
  "domain-pack": "domain_packs",
  "domain-packs": "domain_packs",
  "domain-role": "domain_roles",
  "domain-roles": "domain_roles",
  "domain-profile": "domain_profiles",
  "domain-profiles": "domain_profiles",
  "typed-profile": "domain_profiles",
  "typed-profiles": "domain_profiles",
  "evidence-source": "evidence_sources",
  "evidence-sources": "evidence_sources",
  "provenance-event": "provenance_events",
  "provenance-events": "provenance_events",
  "quality-gap": "quality_gaps",
  "quality-gaps": "quality_gaps",
  "data-gap": "quality_gaps",
  "data-gaps": "quality_gaps",
  "canonical-operation": "canonical_operations",
  "canonical-operations": "canonical_operations",
  "semantic-view": "semantic_views",
  "semantic-views": "semantic_views",
  "domain-intent": "domain_intents",
  "domain-intents": "domain_intents",
  vocabulary: "vocabularies",
  vocabularies: "vocabularies",
  concept: "concepts",
  concepts: "concepts",
  "concept-mapping": "concept_mappings",
  "concept-mappings": "concept_mappings",
  unit: "units",
  units: "units",
  instrument: "instruments",
  instruments: "instruments",
  "instrument-item": "instrument_items",
  "instrument-items": "instrument_items",
  "instrument-response": "instrument_responses",
  "instrument-responses": "instrument_responses",
  relation: "entity_relations",
  relations: "entity_relations",
  "universal-relation": "entity_relations",
  "universal-relations": "entity_relations",
};

export async function runDenseDataCli(input: DenseDataCliInput): Promise<number | null> {
  const phrase = input.positionals.join(" ");
  const group = input.positionals[0];
  const action = input.positionals[1];
  if (!group || !action) return null;
  if (DENSE_FIXTURE_COMMANDS.has(group)) return runDenseFixtureCli(input, action);
  if (!isDenseDataCommandGroup(group)) return null;

  const foundationCollectionName = collectionForFoundationRoute(group);
  const foundationDbAction = action === "add" ? "create" : action;
  if (foundationCollectionName && CRUD_ACTIONS.has(action) && foundationDbAction !== "purge") {
    return await runMagicDbCli({
      argv: denseDbArgv(input.argv, foundationCollectionName, foundationDbAction),
      positionals: [group, foundationCollectionName, foundationDbAction, ...input.positionals.slice(2)],
      flags: input.flags,
      workspaceRoot: input.workspaceRoot,
      stdout: input.context.stdout,
      stderr: input.context.stderr,
      wantsJson: input.wantsJson,
      binName: input.binName,
    });
  }

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

  const semanticView = semanticViewForIntent(intent);
  if (semanticView) {
    const payload = {
      intent,
      semanticView,
      coverage: {
        routeKnown: true,
        executable: true,
        databaseConnected: false,
        recordsMaterialized: false,
        store: "core.sqlite",
        implementationStatus: "semantic_view_contract",
      },
      view: {
        id: semanticView.id,
        label: semanticView.label,
        operationId: semanticView.operationId,
        requiredInputs: semanticView.requiredInputs,
        outputShape: semanticView.outputShape,
        createsOrReads: intent.operation?.createsOrReads ?? [],
      },
      gap: null,
      registry: denseRegistryPayload(intent.system?.id, group, action),
    };
    if (input.wantsJson) {
      writeJsonOk(input.context.stdout, payload, {
        schemaVersion: 1,
        canonicalCommand: intent.center?.commandNoun ?? intent.system?.canonicalCommand ?? group,
        invokedCommand: group,
        subcommand: action,
        denseData: true,
        semanticView: true,
      });
    } else {
      input.context.stdout.write(renderDenseSemanticView(payload.view));
    }
    return CLI_EXIT_OK;
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

function runDenseFixtureCli(input: DenseDataCliInput, action: string): number | null {
  if (action !== "seed") return null;
  const namespaceId = input.flags.namespace ?? "main";
  const dataDir = path.join(input.workspaceRoot, ".claw", "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const store = openMainDataStore({
    ...process.env,
    CLAW_DATA_DIR: dataDir,
  });
  store.ensureNamespace({ id: namespaceId, displayName: namespaceId === "main" ? "Main" : namespaceId });

  const seeded = clawDenseDataAcceptanceFixture.records.map((fixtureRecord) => {
    const record = store.putRecord({
      namespaceId,
      collectionName: fixtureRecord.collectionName,
      recordId: fixtureRecord.id,
      payload: fixtureRecord.data,
      createdAt: "2026-05-17T00:00:00.000Z",
      updatedAt: "2026-05-17T00:00:00.000Z",
    });
    return {
      id: record.id,
      collectionName: fixtureRecord.collectionName,
      label: fixtureRecord.label,
      covers: fixtureRecord.covers,
    };
  });
  const payload = {
    fixtureSetId: clawDenseDataAcceptanceFixture.fixtureSetId,
    sourceConversationId: clawDenseDataAcceptanceFixture.sourceConversationId,
    namespaceId,
    store: "core.sqlite",
    seeded,
  };
  if (input.wantsJson) {
    writeJsonOk(input.context.stdout, payload, {
      schemaVersion: 1,
      canonicalCommand: "dense-fixtures",
      invokedCommand: input.positionals[0] ?? "dense-fixtures",
      subcommand: action,
      denseData: true,
    });
  } else {
    input.context.stdout.write(`${formatCliTable(seeded.map((record) => ({
      id: record.id,
      collection: record.collectionName,
      covers: record.covers.join(", "),
    })))}\n`);
  }
  return CLI_EXIT_OK;
}

function semanticViewForIntent(intent: ReturnType<typeof resolveClawDenseDataIntent>) {
  if (!intent.system || !intent.operation) return undefined;
  return listClawDenseDataSemanticViewEntries().find((entry) => entry.systemId === intent.system?.id && entry.operationId === intent.operation?.id);
}

function collectionForDenseRoute(command: string | undefined, centerCollectionName: string | undefined): string | undefined {
  if (centerCollectionName) return centerCollectionName;
  if (!command) return undefined;
  return resolveBuiltinCollectionName(command);
}

function collectionForFoundationRoute(command: string | undefined): string | undefined {
  if (!command) return undefined;
  const explicit = FOUNDATION_COLLECTION_COMMANDS[command];
  if (explicit) return explicit;
  const resolved = resolveBuiltinCollectionName(command);
  if (!resolved) return undefined;
  return Object.values(clawDenseDataOsRegistry.foundationCollections).includes(resolved) ? resolved : undefined;
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
  if (collectionName === "biology_experiments" && flags.organism && !flags["organism-id"]) {
    nextFlags = { ...nextFlags, "organism-id": flags.organism };
  }
  if (collectionName === "samples" && flags.experiment && !flags["biology-experiment-id"]) {
    nextFlags = { ...nextFlags, "biology-experiment-id": flags.experiment };
  }
  if (collectionName === "samples" && flags.organism && !flags["organism-id"]) {
    nextFlags = { ...nextFlags, "organism-id": flags.organism };
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
    parentCommand: "experiment",
    relationFlag: "biology-experiment-id",
    relationField: "biologyExperimentId",
    collections: {
      sample: "samples",
      samples: "samples",
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

  const routeFlags = dbAction === "create"
    ? { ...input.flags, [config.relationFlag]: input.flags[config.relationFlag] ?? patientId }
    : { ...input.flags, filter: input.flags.filter ?? JSON.stringify({ [config.relationField]: patientId }) };
  const flags = denseDbFlags(routeFlags, collectionName);

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
  if (collectionForFoundationRoute(group)) return true;
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

function renderDenseSemanticView(view: { id: string; label: string; operationId: string; requiredInputs: string[]; outputShape: string; createsOrReads: string[] }): string {
  return `${formatCliTable([{
    id: view.id,
    operation: view.operationId,
    inputs: view.requiredInputs.join(", "),
    data: view.createsOrReads.join(", "),
  }])}\n`;
}
