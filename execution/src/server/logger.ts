export class ExecutionPlaneLogger {
  info(message: string, fields: Record<string, unknown> = {}): void {
    console.log(JSON.stringify({ level: "info", message, ...fields }));
  }

  error(message: string, fields: Record<string, unknown> = {}): void {
    console.error(JSON.stringify({ level: "error", message, ...fields }));
  }
}
