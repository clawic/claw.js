import path from "path";
import { fileURLToPath } from "url";

import {
  createPackageName,
  createPascalCase,
  createTitle,
  detectPackageManager,
  scaffoldProject,
  type ScaffoldContext,
  type SupportedPackageManager,
} from "../../clawjs/src/scaffold.ts";
import { sourceModeRequested } from "../../clawjs/src/source-mode.ts";

export interface CreateClawPluginContext extends ScaffoldContext {}

export const CREATE_CLAW_PLUGIN_EXIT_OK = 0;
export const CREATE_CLAW_PLUGIN_EXIT_FAILURE = 1;
export const CREATE_CLAW_PLUGIN_EXIT_USAGE = 64;
export const CREATE_CLAW_PLUGIN_USAGE = "Usage: create-claw-plugin <project-directory> [--skip-install] [--use-npm|--use-pnpm] [--source] [--source-root PATH] [--template node]";

interface ParsedArgs {
  targetDir: string | null;
  install: boolean;
  packageManager: SupportedPackageManager;
  template: string;
  sourceMode: boolean;
  sourceRoot?: string;
  wantsHelp: boolean;
  unknownOption: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
  let targetDir: string | null = null;
  let install = true;
  let packageManager: SupportedPackageManager = detectPackageManager();
  let template = "node";
  let sourceRoot: string | undefined;
  let wantsHelp = false;
  let unknownOption: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    if (token === "--help" || token === "-h") {
      wantsHelp = true;
      continue;
    }
    if (token === "--skip-install" || token === "--no-install") {
      install = false;
      continue;
    }
    if (token === "--use-npm") {
      packageManager = "npm";
      continue;
    }
    if (token === "--use-pnpm") {
      packageManager = "pnpm";
      continue;
    }
    if (token === "--source") {
      continue;
    }
    if (token === "--source-root") {
      const value = argv[index + 1];
      if (value && !value.startsWith("--")) {
        sourceRoot = value;
        index += 1;
      } else {
        sourceRoot = "";
      }
      continue;
    }
    if (token.startsWith("--source-root=")) {
      sourceRoot = token.slice("--source-root=".length);
      continue;
    }
    if (token === "--template") {
      const value = argv[index + 1];
      if (value && !value.startsWith("--")) {
        template = value;
        index += 1;
      } else {
        template = "";
      }
      continue;
    }
    if (token.startsWith("--template=")) {
      const value = token.slice("--template=".length);
      template = value;
      continue;
    }
    if (token.startsWith("--")) {
      unknownOption ??= token;
      continue;
    }
    if (targetDir) {
      wantsHelp = true;
      continue;
    }
    targetDir = token;
  }

  return { targetDir, install, packageManager, template, sourceMode: sourceModeRequested(argv, sourceRoot ? { "source-root": sourceRoot } : {}), sourceRoot, wantsHelp, unknownOption };
}

export async function runCreateClawPlugin(argv: string[], context: CreateClawPluginContext): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.wantsHelp) {
    context.stdout.write(`${CREATE_CLAW_PLUGIN_USAGE}\n`);
    return parsed.targetDir ? CREATE_CLAW_PLUGIN_EXIT_USAGE : CREATE_CLAW_PLUGIN_EXIT_OK;
  }

  if (parsed.unknownOption) {
    context.stderr.write(`Unknown option: ${parsed.unknownOption}\n${CREATE_CLAW_PLUGIN_USAGE}\n`);
    return CREATE_CLAW_PLUGIN_EXIT_USAGE;
  }

  if (!parsed.targetDir) {
    context.stdout.write(`${CREATE_CLAW_PLUGIN_USAGE}\n`);
    return CREATE_CLAW_PLUGIN_EXIT_OK;
  }

  if (parsed.template !== "node") {
    context.stderr.write(`Unsupported template: ${parsed.template}\n`);
    return CREATE_CLAW_PLUGIN_EXIT_USAGE;
  }

  const targetPath = path.resolve(context.cwd, parsed.targetDir);
  const appSlug = createPackageName(path.basename(targetPath), "claw-plugin");
  const appTitle = createTitle(appSlug, "Claw Plugin");
  const appPascal = createPascalCase(appSlug, "ClawPlugin");

  try {
    await scaffoldProject({
      context,
      targetPath,
      templateDir: fileURLToPath(new URL("../template", import.meta.url)),
      replacements: {
        "__APP_NAME__": appSlug,
        "__APP_SLUG__": appSlug,
        "__APP_TITLE__": appTitle,
        "__APP_PASCAL__": appPascal,
      },
      packageManager: parsed.packageManager,
      install: parsed.install,
      sourceMode: parsed.sourceMode,
      sourceRoot: parsed.sourceRoot,
      successLabel: appSlug,
      nextSteps: [
        `${parsed.packageManager} test`,
        `${parsed.packageManager} run plugin:check`,
      ],
      completionNote: "The generated package is broader than a skill: it combines config, hooks, runtime support metadata, and bundled logic in one distributable plugin.",
    });
    return CREATE_CLAW_PLUGIN_EXIT_OK;
  } catch (error) {
    context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return CREATE_CLAW_PLUGIN_EXIT_FAILURE;
  }
}
