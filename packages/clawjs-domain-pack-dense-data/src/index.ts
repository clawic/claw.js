export async function runProfessionalRecordsCli(input: unknown): Promise<number | null> {
  const command = await import("../../clawjs/src/cli-dense-data-command.ts");
  return command.runProfessionalRecordsCli(input as never);
}
