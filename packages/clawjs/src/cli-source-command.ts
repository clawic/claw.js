import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeCommandJsonOk } from "./cli-json.ts";
import { resolveSourceModeStatus } from "./source-mode.ts";

interface SourceCliInput {
  positionals: string[];
  flags: Record<string, string>;
  context: {
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
    cwd: string;
  };
  wantsJson: boolean;
  binName: string;
}

export async function runSourceCli(input: SourceCliInput): Promise<number> {
  const [, command] = input.positionals;
  if (!command || command === "status") {
    const status = resolveSourceModeStatus({
      cwd: input.context.cwd,
      sourceRoot: input.flags["source-root"],
      requested: Boolean(input.flags["source-root"]),
      allowCheckout: true,
    });
    const data = {
      active: status.active,
      trustLabel: status.trustLabel,
      sourceRoot: status.sourceRoot,
      sourceRootSource: status.sourceRootSource,
      branch: status.branch,
      commit: status.commit,
      packageCount: status.packageCount,
      packageMap: Object.fromEntries(Object.entries(status.packageMap).map(([packageName, info]) => [packageName, {
        version: info.version,
        relativePath: info.relativePath,
        dependencyNames: info.dependencyNames,
      }])),
    };
    if (input.wantsJson) {
      writeCommandJsonOk(input.context.stdout, "source", data, { subcommand: "status", trustLabel: status.trustLabel });
    } else if (status.active) {
      input.context.stdout.write(`source ${status.sourceRoot} ${status.branch ?? "unknown-branch"} ${status.commit ?? "unknown-commit"}\n`);
    } else {
      input.context.stdout.write(`source mode inactive\n`);
    }
    return CLI_EXIT_OK;
  }

  throw new CliHandledError("unknown_source_command", `Usage: ${input.binName} source status [--source-root PATH] [--json]`, CLI_EXIT_USAGE);
}
