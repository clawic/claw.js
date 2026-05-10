import { readFile } from "node:fs/promises";

import { SshClientError } from "./errors.ts";
import type { SftpClient, SshClient, SshSession } from "./ssh-client.ts";

export interface InstallBridgeInput {
  hostId: string;
  localBinaryPath: string;
  remotePath?: string;
  systemdUnitName?: string;
  port?: number;
  httpPort?: number;
  installSystemd?: boolean;
}

export interface InstallBridgeResult {
  uploadedBytes: number;
  remotePath: string;
  systemdUnitInstalled: boolean;
}

/**
 * Push the clawjs-bridged Linux binary to a host via SFTP and (optionally) wire
 * it up as a systemd --user unit. Used the first time a Linux server peers
 * with the mesh: after install, the host can talk the native bridge protocol
 * instead of relying on SSH for every job.
 */
export async function installBridgeOverSsh(
  client: SshClient,
  input: InstallBridgeInput,
): Promise<InstallBridgeResult> {
  const session = await client.open(input.hostId);
  const remotePath = input.remotePath ?? "/usr/local/bin/clawjs-bridged";
  const sftp = await session.sftp();
  try {
    const bytes = await readFile(input.localBinaryPath);
    await sftp.writeFile(remotePath, bytes);
    await sftp.chmod(remotePath, 0o755);
    let systemdUnitInstalled = false;
    if (input.installSystemd !== false) {
      systemdUnitInstalled = await installSystemdUnit(session, sftp, {
        unitName: input.systemdUnitName ?? "clawjs-bridged",
        binaryPath: remotePath,
        port: input.port ?? 7778,
        httpPort: input.httpPort ?? 7779,
      });
    }
    return {
      uploadedBytes: bytes.byteLength,
      remotePath,
      systemdUnitInstalled,
    };
  } finally {
    await sftp.close();
  }
}

interface SystemdUnitInput {
  unitName: string;
  binaryPath: string;
  port: number;
  httpPort: number;
}

async function installSystemdUnit(
  session: SshSession,
  sftp: SftpClient,
  input: SystemdUnitInput,
): Promise<boolean> {
  const homeExec = await session.exec({ command: "printf %s \"$HOME\"" });
  if (homeExec.exitCode !== 0) {
    throw new SshClientError(
      "systemd-home",
      `could not resolve $HOME: ${homeExec.stderr.toString()}`,
      session.hostId,
    );
  }
  const home = homeExec.stdout.toString("utf8").trim();
  const unitDir = `${home}/.config/systemd/user`;
  await session.exec({ command: `mkdir -p ${shellQuote(unitDir)}` });
  const unitPath = `${unitDir}/${input.unitName}.service`;
  const unit = renderSystemdUnit(input);
  await sftp.writeFile(unitPath, unit);
  const reload = await session.exec({
    command: "systemctl --user daemon-reload",
  });
  if (reload.exitCode !== 0) return false;
  const enable = await session.exec({
    command: `systemctl --user enable --now ${shellQuote(input.unitName)}.service`,
  });
  return enable.exitCode === 0;
}

function renderSystemdUnit(input: SystemdUnitInput): string {
  return [
    "[Unit]",
    "Description=Claw Mesh Bridge (clawjs-bridged)",
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    `ExecStart=${input.binaryPath}`,
    `Environment=CLAWJS_BRIDGE_PORT=${input.port}`,
    `Environment=CLAWJS_BRIDGE_HTTP_PORT=${input.httpPort}`,
    "Restart=on-failure",
    "RestartSec=5",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
