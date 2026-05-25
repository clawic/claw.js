import fs from "fs";
import http from "http";
import path from "path";

import { CLI_EXIT_OK, CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";
import { writeCommandJsonError, writeCommandJsonOk, writeCommandJsonOkLine } from "./cli-json.ts";
import { currentCliEntryPath, repoRootFromCliPackage } from "./cli-open-state.ts";
import { allOpenSurfaceHostnames, domainIndexHtml, parseClawHostSurface, type OpenSurface } from "./cli-open-surfaces.ts";
import { portIsOpen } from "./cli-process-utils.ts";
import { proxyHttpResponse } from "./cli-http-proxy.ts";
import {
  CLAW_DOMAINS_LABEL,
  buildDomainsPlist,
  buildDomainsProxyScript,
  buildDomainsServiceConfig,
  domainHostsBlock,
  domainsInstallPlan,
  domainsProxyConfigPath,
  domainsProxyScriptPath,
  domainsServiceDir,
  domainsTempPath,
  readDomainsStatus,
  replaceDomainHostsBlock,
  parseDomainsProxyPort,
} from "./cli-domains-config.ts";
import { runPrivilegedScript } from "./cli-domains-privileges.ts";
import type { CliContext } from "./index.ts";

const DOMAINS_SUBCOMMANDS = ["install", "status", "uninstall", "serve"] as const;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export async function runDomainsCli(input: {
  argv: string[];
  positionals: string[];
  flags: Record<string, string>;
  context: CliContext;
  wantsJson: boolean;
  binName: string;
  invokedCommand?: string;
  ensureDomainSurfaceRunning: (surface: OpenSurface, flags: Record<string, string>, workspace: string) => Promise<URL>;
}): Promise<number> {
  const command = input.positionals[1] || "status";
  const dryRun = input.argv.includes("--dry-run");
  const jsonMeta = { subcommand: `domains ${command}`, invokedCommand: input.invokedCommand ?? "domains" };
  if (command === "status") {
    const status = await readDomainsStatus(input.flags, portIsOpen);
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "host", status, jsonMeta);
    else input.context.stdout.write(`installed=${status.installed} proxy=${status.proxyReachable ? "running" : "stopped"}\n`);
    return CLI_EXIT_OK;
  }

  if (command === "install") {
    const plan = domainsInstallPlan(input.flags);
    const plist = buildDomainsPlist(input.flags);
    const serviceConfig = buildDomainsServiceConfig(input.flags, input.context.cwd, { repoRoot: repoRootFromCliPackage(), cliEntryPath: currentCliEntryPath(), nodePath: process.execPath, uid: typeof process.getuid === "function" ? process.getuid() : undefined });
    const proxyScript = buildDomainsProxyScript();
    if (dryRun) {
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "host", { dryRun: true, action: "install", ...plan, hostsBlock: domainHostsBlock(), plist, serviceConfig }, jsonMeta);
      else input.context.stdout.write(`install ${plan.hosts.length} hosts and ${plan.serviceLabel}\n`);
      return CLI_EXIT_OK;
    }
    const currentHosts = fs.existsSync(plan.hostsFile) ? fs.readFileSync(plan.hostsFile, "utf8") : "";
    const nextHosts = replaceDomainHostsBlock(currentHosts, domainHostsBlock());
    if (input.flags["hosts-file"] || input.flags["plist-file"]) {
      fs.mkdirSync(path.dirname(plan.hostsFile), { recursive: true });
      fs.writeFileSync(plan.hostsFile, nextHosts);
      fs.mkdirSync(path.dirname(plan.plistFile), { recursive: true });
      fs.writeFileSync(plan.plistFile, plist);
      fs.mkdirSync(domainsServiceDir(input.flags), { recursive: true });
      fs.writeFileSync(domainsProxyScriptPath(input.flags), proxyScript);
      fs.writeFileSync(domainsProxyConfigPath(input.flags), serviceConfig);
    } else {
      const tempHosts = domainsTempPath(`claw-domains-hosts-${process.pid}`);
      const tempPlist = domainsTempPath(`claw-domains-${process.pid}.plist`);
      const tempProxy = domainsTempPath(`claw-domains-proxy-${process.pid}.mjs`);
      const tempConfig = domainsTempPath(`claw-domains-config-${process.pid}.json`);
      fs.writeFileSync(tempHosts, nextHosts);
      fs.writeFileSync(tempPlist, plist);
      fs.writeFileSync(tempProxy, proxyScript);
      fs.writeFileSync(tempConfig, serviceConfig);
      runPrivilegedScript([
        `cp ${shellQuote(tempHosts)} ${shellQuote(plan.hostsFile)}`,
        `mkdir -p ${shellQuote(domainsServiceDir(input.flags))}`,
        `cp ${shellQuote(tempProxy)} ${shellQuote(domainsProxyScriptPath(input.flags))}`,
        `cp ${shellQuote(tempConfig)} ${shellQuote(domainsProxyConfigPath(input.flags))}`,
        `chown -R root:wheel ${shellQuote(domainsServiceDir(input.flags))}`,
        `chmod 755 ${shellQuote(domainsServiceDir(input.flags))}`,
        `chmod 644 ${shellQuote(domainsProxyScriptPath(input.flags))} ${shellQuote(domainsProxyConfigPath(input.flags))}`,
        `cp ${shellQuote(tempPlist)} ${shellQuote(plan.plistFile)}`,
        `chown root:wheel ${shellQuote(plan.plistFile)}`,
        `chmod 644 ${shellQuote(plan.plistFile)}`,
        `launchctl bootout system/${CLAW_DOMAINS_LABEL} >/dev/null 2>&1 || true`,
        `launchctl bootstrap system ${shellQuote(plan.plistFile)}`,
        `launchctl enable system/${CLAW_DOMAINS_LABEL}`,
        `launchctl kickstart -k system/${CLAW_DOMAINS_LABEL}`,
      ].join("\n"), input.flags);
      fs.rmSync(tempHosts, { force: true });
      fs.rmSync(tempPlist, { force: true });
      fs.rmSync(tempProxy, { force: true });
      fs.rmSync(tempConfig, { force: true });
    }
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "host", { action: "install", ...plan }, jsonMeta);
    else input.context.stdout.write("installed\n");
    return CLI_EXIT_OK;
  }

  if (command === "uninstall") {
    const plan = domainsInstallPlan(input.flags);
    if (dryRun) {
      if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "host", { dryRun: true, action: "uninstall", ...plan }, jsonMeta);
      else input.context.stdout.write(`uninstall ${plan.serviceLabel}\n`);
      return CLI_EXIT_OK;
    }
    const currentHosts = fs.existsSync(plan.hostsFile) ? fs.readFileSync(plan.hostsFile, "utf8") : "";
    const nextHosts = replaceDomainHostsBlock(currentHosts, null);
    if (input.flags["hosts-file"] || input.flags["plist-file"]) {
      fs.mkdirSync(path.dirname(plan.hostsFile), { recursive: true });
      fs.writeFileSync(plan.hostsFile, nextHosts);
      fs.rmSync(plan.plistFile, { force: true });
      fs.rmSync(domainsServiceDir(input.flags), { force: true, recursive: true });
    } else {
      const tempHosts = domainsTempPath(`claw-domains-hosts-${process.pid}`);
      fs.writeFileSync(tempHosts, nextHosts);
      runPrivilegedScript([
        `launchctl bootout system/${CLAW_DOMAINS_LABEL} >/dev/null 2>&1 || true`,
        `cp ${shellQuote(tempHosts)} ${shellQuote(plan.hostsFile)}`,
        `rm -f ${shellQuote(plan.plistFile)}`,
        `rm -rf ${shellQuote(domainsServiceDir(input.flags))}`,
      ].join("\n"), input.flags);
      fs.rmSync(tempHosts, { force: true });
    }
    if (input.wantsJson) writeCommandJsonOk(input.context.stdout, "host", { action: "uninstall", ...plan }, jsonMeta);
    else input.context.stdout.write("uninstalled\n");
    return CLI_EXIT_OK;
  }

  if (command === "serve") {
    const host = input.flags.host || "127.0.0.1";
    const port = parseDomainsProxyPort(input.flags.port);
    const workspace = path.resolve(input.context.cwd, input.flags.workspace ?? ".");
    const server = http.createServer((request, response) => {
      void (async () => {
        const surface = parseClawHostSurface(request.headers.host);
        if (!surface) {
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          response.end(domainIndexHtml());
          return;
        }
        const targetUrl = await input.ensureDomainSurfaceRunning(surface, input.flags, workspace);
        await proxyHttpResponse({ request, response, targetUrl });
      })().catch((error) => {
        response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        response.end(error instanceof Error ? error.message : "Domain proxy failed.");
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => resolve());
    });
    if (input.wantsJson) writeCommandJsonOkLine(input.context.stdout, "host", { url: `http://${host}:${port}`, hosts: allOpenSurfaceHostnames() }, jsonMeta);
    else input.context.stdout.write(`http://${host}:${port}\n`);
    await new Promise<void>((resolve) => {
      const shutdown = () => server.close(() => resolve());
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    });
    return CLI_EXIT_OK;
  }

  if (input.wantsJson) {
    writeCommandJsonError(input.context.stdout, "host", new CliHandledError(
      "unknown_domains_subcommand",
      command ? `Unknown domains subcommand: ${command}.` : "Missing domains subcommand.",
      CLI_EXIT_USAGE,
      {
        location: "cli.domains.subcommand",
        suggestion: "Use one of the registered domains subcommands.",
        safeNextStep: `Run ${input.binName} domains status --json to inspect domains state, or ${input.binName} help domains --json for the domains command surface.`,
        details: {
          received: command ?? null,
          validSubcommands: [...DOMAINS_SUBCOMMANDS],
        },
      },
    ), {
      ...jsonMeta,
      subcommand: command ?? null,
    });
    return CLI_EXIT_USAGE;
  }

  input.context.stderr.write(`Usage: ${input.binName} domains install|status|uninstall|serve\n`);
  return CLI_EXIT_USAGE;
}
