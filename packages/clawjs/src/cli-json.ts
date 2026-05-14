import { redactSecrets } from "@clawjs/claw";

import { CliHandledError } from "./cli-errors.ts";

export function writeJson(stream: NodeJS.WritableStream, payload: unknown): void {
  stream.write(`${JSON.stringify(redactSecrets(payload), null, 2)}\n`);
}

export function writeJsonLine(stream: NodeJS.WritableStream, payload: unknown): void {
  stream.write(`${JSON.stringify(redactSecrets(payload))}\n`);
}

export function writeCliError(stream: NodeJS.WritableStream, error: unknown): void {
  const handled = error instanceof CliHandledError
    ? error
    : new CliHandledError("internal_error", error instanceof Error ? error.message : String(error));
  writeJson(stream, {
    ok: false,
    error: {
      code: handled.code,
      message: handled.message,
    },
  });
}

export function cliErrorFromUnknown(error: unknown): CliHandledError {
  return error instanceof CliHandledError
    ? error
    : new CliHandledError("internal_error", error instanceof Error ? error.message : String(error));
}
