import path from "path";
import { fileURLToPath } from "url";

import {
  createPackageName,
  createTitle,
  detectPackageManager,
  scaffoldProject,
  type ScaffoldContext,
  type SupportedPackageManager,
} from "../../clawjs/src/scaffold.ts";

export interface CreateClawAgentContext extends ScaffoldContext {}

export const CREATE_CLAW_AGENT_EXIT_OK = 0;
export const CREATE_CLAW_AGENT_EXIT_FAILURE = 1;
export const CREATE_CLAW_AGENT_EXIT_USAGE = 64;
export const CREATE_CLAW_AGENT_USAGE = "Usage: create-claw-agent <project-directory> [--skip-install] [--use-npm|--use-pnpm] [--template node]";

interface ParsedArgs {
  targetDir: string | null;
  install: boolean;
  packageManager: SupportedPackageManager;
  template: string;
  wantsHelp: boolean;
  unknownOption: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
  let targetDir: string | null = null;
  let install = true;
  let packageManager: SupportedPackageManager = detectPackageManager();
  let template = "node";
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

  return { targetDir, install, packageManager, template, wantsHelp, unknownOption };
}

export async function runCreateClawAgent(argv: string[], context: CreateClawAgentContext): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.wantsHelp) {
    context.stdout.write(`${CREATE_CLAW_AGENT_USAGE}\n`);
    return parsed.targetDir ? CREATE_CLAW_AGENT_EXIT_USAGE : CREATE_CLAW_AGENT_EXIT_OK;
  }

  if (parsed.unknownOption) {
    context.stderr.write(`Unknown option: ${parsed.unknownOption}\n${CREATE_CLAW_AGENT_USAGE}\n`);
    return CREATE_CLAW_AGENT_EXIT_USAGE;
  }

  if (!parsed.targetDir) {
    context.stdout.write(`${CREATE_CLAW_AGENT_USAGE}\n`);
    return CREATE_CLAW_AGENT_EXIT_OK;
  }

  if (parsed.template !== "node") {
    context.stderr.write(`Unsupported template: ${parsed.template}\n`);
    return CREATE_CLAW_AGENT_EXIT_USAGE;
  }

  const targetPath = path.resolve(context.cwd, parsed.targetDir);
  const appSlug = createPackageName(path.basename(targetPath), "claw-agent");
  const appTitle = createTitle(appSlug, "Claw Agent");

  try {
    await scaffoldProject({
      context,
      targetPath,
      templateDir: fileURLToPath(new URL("../template", import.meta.url)),
      replacements: {
        "__APP_NAME__": appSlug,
        "__APP_SLUG__": appSlug,
        "__APP_TITLE__": appTitle,
      },
      packageManager: parsed.packageManager,
      install: parsed.install,
      successLabel: appSlug,
      nextSteps: [
        `${parsed.packageManager} run claw:init`,
        `${parsed.packageManager} run agent:report`,
        `${parsed.packageManager} run agent:reply -- "Say hello"`,
      ],
      completionNote: "The generated agent uses the demo adapter by default. Switch the scripts and src/claw.ts to openclaw when you want a real runtime.",
    });
    return CREATE_CLAW_AGENT_EXIT_OK;
  } catch (error) {
    context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return CREATE_CLAW_AGENT_EXIT_FAILURE;
  }
}
