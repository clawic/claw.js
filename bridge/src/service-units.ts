export interface ServiceUnitSpec {
  unitName: string;
  binaryPath: string;
  args?: string[];
  env?: Record<string, string>;
  workingDirectory?: string;
  description?: string;
  user?: string;
}

export function renderSystemdUnit(
  spec: ServiceUnitSpec,
): string {
  const argv = [spec.binaryPath, ...(spec.args ?? [])]
    .map(shellQuote)
    .join(" ");
  const lines: string[] = [
    "[Unit]",
    `Description=${spec.description ?? "Claw Mesh Bridge (clawjs-bridged)"}`,
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    `ExecStart=${argv}`,
  ];
  if (spec.workingDirectory) {
    lines.push(`WorkingDirectory=${spec.workingDirectory}`);
  }
  for (const [k, v] of Object.entries(spec.env ?? {})) {
    lines.push(`Environment=${k}=${escapeSystemdEnv(v)}`);
  }
  if (spec.user) lines.push(`User=${spec.user}`);
  lines.push(
    "Restart=on-failure",
    "RestartSec=5",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  );
  return lines.join("\n");
}

export interface LaunchdRenderOptions {
  label?: string;
  runAtLoad?: boolean;
  keepAlive?: boolean;
  stdoutLogPath?: string;
  stderrLogPath?: string;
}

export function renderLaunchdPlist(
  spec: ServiceUnitSpec,
  opts: LaunchdRenderOptions = {},
): string {
  const label = opts.label ?? `com.clawjs.bridged.${spec.unitName}`;
  const argv = [spec.binaryPath, ...(spec.args ?? [])];
  const envEntries = Object.entries(spec.env ?? {});
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${escapeXml(label)}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    ...argv.map((a) => `    <string>${escapeXml(a)}</string>`),
    "  </array>",
    "  <key>RunAtLoad</key>",
    `  <${opts.runAtLoad === false ? "false" : "true"}/>`,
    "  <key>KeepAlive</key>",
    `  <${opts.keepAlive === false ? "false" : "true"}/>`,
  ];
  if (spec.workingDirectory) {
    lines.push(
      "  <key>WorkingDirectory</key>",
      `  <string>${escapeXml(spec.workingDirectory)}</string>`,
    );
  }
  if (envEntries.length > 0) {
    lines.push("  <key>EnvironmentVariables</key>", "  <dict>");
    for (const [k, v] of envEntries) {
      lines.push(
        `    <key>${escapeXml(k)}</key>`,
        `    <string>${escapeXml(v)}</string>`,
      );
    }
    lines.push("  </dict>");
  }
  if (opts.stdoutLogPath) {
    lines.push(
      "  <key>StandardOutPath</key>",
      `  <string>${escapeXml(opts.stdoutLogPath)}</string>`,
    );
  }
  if (opts.stderrLogPath) {
    lines.push(
      "  <key>StandardErrorPath</key>",
      `  <string>${escapeXml(opts.stderrLogPath)}</string>`,
    );
  }
  lines.push("</dict>", "</plist>", "");
  return lines.join("\n");
}

export interface BridgeUnitOptions {
  binaryPath: string;
  bridgePort?: number;
  httpPort?: number;
  bindAddress?: string;
  bridgeName?: string;
  version?: string;
  extraEnv?: Record<string, string>;
}

export function buildBridgeServiceSpec(
  opts: BridgeUnitOptions,
): ServiceUnitSpec {
  const env: Record<string, string> = { ...opts.extraEnv };
  if (opts.bridgePort) env.CLAWJS_BRIDGE_PORT = String(opts.bridgePort);
  if (opts.httpPort) env.CLAWJS_BRIDGE_HTTP_PORT = String(opts.httpPort);
  if (opts.bindAddress) env.CLAWJS_BRIDGE_BIND = opts.bindAddress;
  if (opts.bridgeName) env.CLAWJS_BRIDGE_NAME = opts.bridgeName;
  if (opts.version) env.CLAWJS_BRIDGE_VERSION = opts.version;
  return {
    unitName: "clawjs-bridged",
    binaryPath: opts.binaryPath,
    description: "Claw Mesh Bridge (clawjs-bridged)",
    env,
  };
}

export interface PlatformTarget {
  os: "darwin" | "linux" | "windows";
  arch: "x64" | "arm64";
}

export const SUPPORTED_TARGETS: PlatformTarget[] = [
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "linux", arch: "x64" },
  { os: "linux", arch: "arm64" },
  { os: "windows", arch: "x64" },
];

export function tarballName(
  target: PlatformTarget,
  version: string,
): string {
  return `clawjs-bridged-${target.os}-${target.arch}-${version}.tar.gz`;
}

export function detectCurrentTarget(): PlatformTarget {
  const os = process.platform;
  const arch = process.arch;
  if (os === "darwin" && (arch === "arm64" || arch === "x64")) {
    return { os: "darwin", arch };
  }
  if (os === "linux" && (arch === "arm64" || arch === "x64")) {
    return { os: "linux", arch };
  }
  if (os === "win32" && arch === "x64") {
    return { os: "windows", arch: "x64" };
  }
  throw new Error(`unsupported host platform: ${os}-${arch}`);
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeSystemdEnv(value: string): string {
  return value.replace(/[\\\n"$]/g, (c) => `\\${c}`);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
