import type { SkillSpec } from "@clawjs/core";

import type { SkillsStore } from "./store.ts";

export interface CompileOptions {
  /** Resolve and inline instance bodies via their template + params. */
  resolveInstances?: boolean;
}

/**
 * Compile a set of skills (by slug) to a single system-prompt fragment.
 * Order:
 *   1. Capsules (high-priority) first, sorted by priority desc, slug asc.
 *   2. Full bodies of skills, in slug order (caller controls ordering by
 *      passing slugs in priority order from resolveActive() if needed).
 *
 * Composite (kind: role) skills expand their `metadata.clawjs.children` into
 * the compile set in the order they declare them.
 */
export function compileSkills(store: SkillsStore, slugs: string[], options: CompileOptions = {}): string {
  const visited = new Set<string>();
  const ordered: SkillSpec[] = [];
  for (const slug of slugs) {
    walk(store, slug, visited, ordered);
  }

  const capsules = ordered
    .map((spec) => {
      const cap = spec.frontmatter.metadata.clawjs.capsule;
      if (!cap) return null;
      return { spec, capsule: cap };
    })
    .filter((entry): entry is { spec: SkillSpec; capsule: NonNullable<SkillSpec["frontmatter"]["metadata"]["clawjs"]["capsule"]> } => !!entry)
    .sort((a, b) => {
      const order = b.capsule.priority - a.capsule.priority;
      if (order !== 0) return order;
      return a.spec.slug.localeCompare(b.spec.slug);
    });

  const lines: string[] = [];
  if (capsules.length > 0) {
    lines.push("# Skill capsules");
    lines.push("");
    for (const { spec, capsule } of capsules) {
      const readWhen = capsule.readWhen?.length ? ` (read when: ${capsule.readWhen.join(", ")})` : "";
      lines.push(`- ${spec.slug}: ${capsule.text}${readWhen}`);
    }
    lines.push("");
  }

  for (const spec of ordered) {
    const body = options.resolveInstances === false
      ? spec.body
      : resolveBody(store, spec);
    if (!body.trim()) continue;
    lines.push(`# ${spec.name}`);
    lines.push("");
    lines.push(body.trim());
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function walk(store: SkillsStore, slug: string, visited: Set<string>, out: SkillSpec[]): void {
  if (visited.has(slug)) return;
  visited.add(slug);
  const spec = store.get(slug);
  if (!spec) return;
  if (spec.kind === "role" && spec.frontmatter.metadata.clawjs.children?.length) {
    for (const child of spec.frontmatter.metadata.clawjs.children) {
      walk(store, child, visited, out);
    }
    // Optionally include the role's own body too:
    if (spec.body.trim()) out.push(spec);
  } else {
    out.push(spec);
  }
}

function resolveBody(store: SkillsStore, spec: SkillSpec): string {
  const inst = spec.frontmatter.metadata.clawjs.instance;
  if (!inst) return spec.body;
  if (inst.frozen) return spec.body;
  const template = store.get(inst.ofTemplate);
  if (!template) return spec.body;
  return interpolate(template.body, inst.params);
}

function interpolate(body: string, params: Record<string, unknown>): string {
  return body.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
    const v = params[key];
    if (v === undefined || v === null) return "";
    return String(v);
  });
}
