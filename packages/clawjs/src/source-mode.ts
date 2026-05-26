import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const SOURCE_MODE_MANIFEST = "claw.source.json";
export const SOURCE_MODE_TRUST_LABEL = "source";

export interface SourcePackageInfo {
  name: string;
  version: string | null;
  packageDir: string;
  relativePath: string;
  dependencyNames: string[];
}

export interface SourceModeStatus {
  active: boolean;
  trustLabel: typeof SOURCE_MODE_TRUST_LABEL;
  sourceRoot: string | null;
  sourceRootSource: "flag" | "env" | "manifest" | "checkout" | "none";
  branch: string | null;
  commit: string | null;
  packageMap: Record<string, SourcePackageInfo>;
  packageCount: number;
}

interface ResolveSourceModeInput {
  cwd: string;
  sourceRoot?: string;
  requested?: boolean;
  allowCheckout?: boolean;
}

interface PackageJsonLike {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const INTERNAL_PACKAGE_PREFIX = "@clawjs/";
const DEPENDENCY_SECTIONS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;

export function resolveSourceModeStatus(input: ResolveSourceModeInput): SourceModeStatus {
  const allowCheckout = input.allowCheckout ?? true;
  const explicitRoot = input.sourceRoot ? expandHome(input.sourceRoot) : null;
  const envRoot = process.env.CLAWJS_SOURCE_ROOT ? expandHome(process.env.CLAWJS_SOURCE_ROOT) : null;
  const manifestRoot = findSourceManifestRoot(input.cwd);
  const checkoutRoot = allowCheckout ? findSourceCheckoutRoot(input.cwd) : null;
  const sourceRoot = explicitRoot ?? envRoot ?? manifestRoot ?? checkoutRoot;
  const sourceRootSource = explicitRoot ? "flag"
    : envRoot ? "env"
      : manifestRoot ? "manifest"
        : checkoutRoot ? "checkout"
          : "none";

  if (!sourceRoot) {
    if (input.requested) {
      throw new Error("Source mode needs --source-root PATH, CLAWJS_SOURCE_ROOT, a claw.source.json manifest, or a ClawJS checkout.");
    }
    return {
      active: false,
      trustLabel: SOURCE_MODE_TRUST_LABEL,
      sourceRoot: null,
      sourceRootSource,
      branch: null,
      commit: null,
      packageMap: {},
      packageCount: 0,
    };
  }

  const resolvedRoot = path.resolve(sourceRoot);
  assertSourceRoot(resolvedRoot);
  const packageMap = buildSourcePackageMap(resolvedRoot);
  return {
    active: true,
    trustLabel: SOURCE_MODE_TRUST_LABEL,
    sourceRoot: resolvedRoot,
    sourceRootSource,
    branch: gitOutput(resolvedRoot, ["branch", "--show-current"]),
    commit: gitOutput(resolvedRoot, ["rev-parse", "HEAD"]),
    packageMap,
    packageCount: Object.keys(packageMap).length,
  };
}

export function sourceModeRequested(argv: string[], flags: Record<string, string>): boolean {
  return argv.some((token) => token === "--source" || token === "--source-root" || token.startsWith("--source-root="))
    || flags["source-root"] !== undefined
    || Boolean(process.env.CLAWJS_SOURCE_ROOT);
}

export function applySourceModeToProject(projectRoot: string, status: SourceModeStatus): { applied: boolean; packageNames: string[] } {
  if (!status.active || !status.sourceRoot) return { applied: false, packageNames: [] };
  const packageJsonPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    writeSourceManifest(projectRoot, status, []);
    writeNpmrc(projectRoot);
    return { applied: true, packageNames: [] };
  }

  const packageJson = readJson<PackageJsonLike>(packageJsonPath);
  const directInternalPackages = collectPackageJsonInternalDependencies(packageJson);
  const closure = collectSourcePackageClosure(status, directInternalPackages);

  for (const packageName of closure) {
    const existingSection = findDependencySection(packageJson, packageName);
    const targetSection = existingSection ?? "dependencies";
    const section = ensureDependencySection(packageJson, targetSection);
    section[packageName] = sourceDependencySpec(status, packageName);
  }

  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
  writeNpmrc(projectRoot);
  writeSourceManifest(projectRoot, status, closure);
  return { applied: true, packageNames: closure };
}

export function collectSourcePackageClosure(status: SourceModeStatus, packageNames: string[]): string[] {
  const result = new Set<string>();
  const pending = packageNames.filter((packageName) => packageName.startsWith(INTERNAL_PACKAGE_PREFIX));
  while (pending.length > 0) {
    const packageName = pending.shift()!;
    if (result.has(packageName)) continue;
    const info = status.packageMap[packageName];
    if (!info) {
      throw new Error(`Source mode cannot resolve internal package ${packageName} from ${status.sourceRoot ?? "unknown source root"}.`);
    }
    result.add(packageName);
    for (const dependencyName of info.dependencyNames) {
      if (!result.has(dependencyName)) pending.push(dependencyName);
    }
  }
  return [...result].sort((left, right) => left.localeCompare(right));
}

export function buildSourceInstallCommand(status: SourceModeStatus, packageNames: string[], packageManager = "npm"): string | null {
  if (!status.active) return null;
  const closure = collectSourcePackageClosure(status, packageNames);
  if (closure.length === 0) return null;
  return [
    packageManager,
    "install",
    "--install-links",
    ...closure.map((packageName) => shellQuote(sourceDependencySpec(status, packageName))),
  ].join(" ");
}

export function sourceDependencySpec(status: SourceModeStatus, packageName: string): string {
  const info = status.packageMap[packageName];
  if (!info) {
    throw new Error(`Source mode cannot resolve internal package ${packageName}.`);
  }
  return pathToFileURL(info.packageDir).href;
}

function buildSourcePackageMap(sourceRoot: string): Record<string, SourcePackageInfo> {
  const packagesDir = path.join(sourceRoot, "packages");
  const packageMap: Record<string, SourcePackageInfo> = {};
  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageDir = path.join(packagesDir, entry.name);
    const packageJsonPath = path.join(packageDir, "package.json");
    if (!fs.existsSync(packageJsonPath)) continue;
    const packageJson = readJson<PackageJsonLike>(packageJsonPath);
    if (!packageJson.name || !isSourceManagedPackage(packageJson.name)) continue;
    packageMap[packageJson.name] = {
      name: packageJson.name,
      version: packageJson.version ?? null,
      packageDir,
      relativePath: path.relative(sourceRoot, packageDir),
      dependencyNames: internalDependencyNames(packageJson),
    };
  }
  return Object.fromEntries(Object.entries(packageMap).sort(([left], [right]) => left.localeCompare(right)));
}

function isSourceManagedPackage(packageName: string): boolean {
  return packageName.startsWith(INTERNAL_PACKAGE_PREFIX)
    || packageName.startsWith("create-claw-")
    || packageName === "eslint-config-claw";
}

function internalDependencyNames(packageJson: PackageJsonLike): string[] {
  const names = new Set<string>();
  for (const sectionName of DEPENDENCY_SECTIONS) {
    for (const dependencyName of Object.keys(packageJson[sectionName] ?? {})) {
      if (dependencyName.startsWith(INTERNAL_PACKAGE_PREFIX)) names.add(dependencyName);
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

function collectPackageJsonInternalDependencies(packageJson: PackageJsonLike): string[] {
  const names = new Set<string>();
  for (const sectionName of DEPENDENCY_SECTIONS) {
    for (const dependencyName of Object.keys(packageJson[sectionName] ?? {})) {
      if (dependencyName.startsWith(INTERNAL_PACKAGE_PREFIX)) names.add(dependencyName);
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

function findDependencySection(packageJson: PackageJsonLike, packageName: string): typeof DEPENDENCY_SECTIONS[number] | null {
  for (const sectionName of DEPENDENCY_SECTIONS) {
    if (packageJson[sectionName]?.[packageName] !== undefined) return sectionName;
  }
  return null;
}

function ensureDependencySection(packageJson: PackageJsonLike, sectionName: typeof DEPENDENCY_SECTIONS[number]): Record<string, string> {
  const current = packageJson[sectionName];
  if (current && typeof current === "object" && !Array.isArray(current)) return current;
  const created: Record<string, string> = {};
  packageJson[sectionName] = created;
  return created;
}

function writeNpmrc(projectRoot: string): void {
  const npmrcPath = path.join(projectRoot, ".npmrc");
  const existing = fs.existsSync(npmrcPath) ? fs.readFileSync(npmrcPath, "utf8") : "";
  const lines = existing.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("install-links="));
  lines.push("install-links=true");
  fs.writeFileSync(npmrcPath, `${lines.join("\n")}\n`);
}

function writeSourceManifest(projectRoot: string, status: SourceModeStatus, packageNames: string[]): void {
  const manifestPath = path.join(projectRoot, SOURCE_MODE_MANIFEST);
  const packageMap = Object.fromEntries(packageNames.map((packageName) => {
    const info = status.packageMap[packageName];
    return [packageName, {
      version: info.version,
      relativePath: info.relativePath,
      dependencyNames: info.dependencyNames,
    }];
  }));
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    trustLabel: SOURCE_MODE_TRUST_LABEL,
    sourceRoot: status.sourceRoot,
    sourceRootSource: status.sourceRootSource,
    branch: status.branch,
    commit: status.commit,
    packageMap,
  }, null, 2)}\n`);
}

function findSourceManifestRoot(startDir: string): string | null {
  const manifestPath = findUp(startDir, SOURCE_MODE_MANIFEST);
  if (!manifestPath) return null;
  try {
    const manifest = readJson<{ sourceRoot?: string }>(manifestPath);
    return manifest.sourceRoot ? expandHome(manifest.sourceRoot) : null;
  } catch {
    return null;
  }
}

function findSourceCheckoutRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    const cliPackageJsonPath = path.join(current, "packages", "clawjs", "package.json");
    if (fs.existsSync(packageJsonPath) && fs.existsSync(cliPackageJsonPath)) {
      try {
        const packageJson = readJson<PackageJsonLike>(packageJsonPath);
        const cliPackageJson = readJson<PackageJsonLike>(cliPackageJsonPath);
        if (packageJson.name === "@clawjs/monorepo" && cliPackageJson.name === "@clawjs/cli") return current;
      } catch {
        // Continue walking up when a nearby package file is malformed.
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function findUp(startDir: string, fileName: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, fileName);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function assertSourceRoot(sourceRoot: string): void {
  const rootPackageJson = path.join(sourceRoot, "package.json");
  const cliPackageJson = path.join(sourceRoot, "packages", "clawjs", "package.json");
  if (!fs.existsSync(rootPackageJson) || !fs.existsSync(cliPackageJson)) {
    throw new Error(`Source root is not a ClawJS checkout: ${sourceRoot}`);
  }
  const packageJson = readJson<PackageJsonLike>(rootPackageJson);
  const cliPackage = readJson<PackageJsonLike>(cliPackageJson);
  if (packageJson.name !== "@clawjs/monorepo" || cliPackage.name !== "@clawjs/cli") {
    throw new Error(`Source root is not a ClawJS checkout: ${sourceRoot}`);
  }
}

function gitOutput(cwd: string, args: string[]): string | null {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function readJson<TValue>(filePath: string): TValue {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as TValue;
}

function expandHome(value: string): string {
  if (value === "~") return process.env.HOME ?? value;
  if (value.startsWith("~/")) return path.join(process.env.HOME ?? "~", value.slice(2));
  return value;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}
