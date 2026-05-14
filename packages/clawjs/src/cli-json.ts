import { redactSecrets } from "@clawjs/claw";
import { resolveClawCliCommand } from "@clawjs/core";

import { CliHandledError } from "./cli-errors.ts";

export type CliJsonMeta = Record<string, unknown> & {
  schemaVersion?: number;
  canonicalCommand?: string | null;
};

export function writeJson(stream: NodeJS.WritableStream, payload: unknown): void {
  stream.write(`${JSON.stringify(redactSecrets(payload), null, 2)}\n`);
}

export function writeJsonLine(stream: NodeJS.WritableStream, payload: unknown): void {
  stream.write(`${JSON.stringify(redactSecrets(payload))}\n`);
}

export function writeJsonOk(stream: NodeJS.WritableStream, data: unknown, meta: CliJsonMeta = {}): void {
  writeJson(stream, {
    ok: true,
    data,
    meta,
  });
}

export function writeJsonOkLine(stream: NodeJS.WritableStream, data: unknown, meta: CliJsonMeta = {}): void {
  writeJsonLine(stream, {
    ok: true,
    data,
    meta,
  });
}

export function writeCommandJsonOk(stream: NodeJS.WritableStream, canonicalCommand: string, data: unknown, meta: CliJsonMeta = {}): void {
  const command = resolveClawCliCommand(canonicalCommand);
  writeJsonOk(stream, data, {
    schemaVersion: command?.schemaVersion ?? 1,
    canonicalCommand,
    ...(command?.jsonSchemaId ? { jsonSchemaId: command.jsonSchemaId } : {}),
    ...meta,
  });
}

export function writeCommandJsonOkLine(stream: NodeJS.WritableStream, canonicalCommand: string, data: unknown, meta: CliJsonMeta = {}): void {
  const command = resolveClawCliCommand(canonicalCommand);
  writeJsonOkLine(stream, data, {
    schemaVersion: command?.schemaVersion ?? 1,
    canonicalCommand,
    ...(command?.jsonSchemaId ? { jsonSchemaId: command.jsonSchemaId } : {}),
    ...meta,
  });
}

export function writeCommandJsonError(stream: NodeJS.WritableStream, canonicalCommand: string, error: unknown, meta: CliJsonMeta = {}): void {
  const command = resolveClawCliCommand(canonicalCommand);
  writeJsonError(stream, error, {
    schemaVersion: command?.schemaVersion ?? 1,
    canonicalCommand,
    ...(command?.jsonSchemaId ? { jsonSchemaId: command.jsonSchemaId } : {}),
    ...meta,
  });
}

export function writeJsonError(stream: NodeJS.WritableStream, error: unknown, meta: CliJsonMeta = {}): void {
  const handled = error instanceof CliHandledError
    ? error
    : isHandledCliErrorLike(error)
      ? error
    : new CliHandledError("internal_error", error instanceof Error ? error.message : String(error));
  writeJson(stream, {
    ok: false,
    error: {
      code: handled.code,
      message: handled.message,
    },
    meta,
  });
}

function isHandledCliErrorLike(error: unknown): error is { code: string; message: string } {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && typeof (error as { code?: unknown }).code === "string"
    && "message" in error
    && typeof (error as { message?: unknown }).message === "string";
}

export function writeCliError(stream: NodeJS.WritableStream, error: unknown): void {
  writeJsonError(stream, error);
}

export function cliErrorFromUnknown(error: unknown): CliHandledError {
  return error instanceof CliHandledError
    ? error
    : new CliHandledError("internal_error", error instanceof Error ? error.message : String(error));
}
