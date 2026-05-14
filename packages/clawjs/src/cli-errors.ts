export const CLI_EXIT_OK = 0;
export const CLI_EXIT_FAILURE = 1;
export const CLI_EXIT_DEGRADED = 2;
export const CLI_EXIT_USAGE = 64;

export class CliHandledError extends Error {
  readonly code: string;
  readonly exitCode: number;

  constructor(code: string, message: string, exitCode = CLI_EXIT_FAILURE) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}
