// Minimal but tolerant YAML reader for SKILL.md frontmatter.
//
// Supports:
//  - Block-style mappings (key: value, key: <newline> indented sub-mapping).
//  - Block-style sequences ("- value" or "- key: value" then more keys).
//  - Inline flow scalars: strings (quoted/unquoted), integers, floats, true/false, null.
//  - Inline arrays [a, b, c] and inline mappings {a: 1, b: 2}.
//  - Multi-line literal/folded scalars (|, >).
//  - Comments starting with #.
//
// Not supported (intentional, not needed for SKILL.md): anchors, aliases,
// tags, complex keys, multi-document streams.
//
// Errors are thrown with line numbers for diagnostics.

type Scalar = string | number | boolean | null;
type YamlValue = Scalar | YamlValue[] | { [key: string]: YamlValue };

interface Line {
  raw: string;
  text: string;       // raw without trailing comment, trimmed right
  indent: number;
  lineNo: number;     // 1-based
}

function stripComment(text: string): string {
  // Strip "# ..." comments, but not inside quoted strings.
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "#" && !inSingle && !inDouble && (i === 0 || /\s/.test(text[i - 1]))) {
      return text.slice(0, i);
    }
  }
  return text;
}

function tokenizeLines(input: string): Line[] {
  const out: Line[] = [];
  const rawLines = input.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const stripped = stripComment(raw).replace(/\s+$/, "");
    if (!stripped.trim()) continue;
    const indent = stripped.length - stripped.replace(/^\s+/, "").length;
    out.push({ raw, text: stripped, indent, lineNo: i + 1 });
  }
  return out;
}

function parseScalar(token: string): Scalar {
  const t = token.trim();
  if (t === "" || t === "~" || t.toLowerCase() === "null") return null;
  if (t.toLowerCase() === "true") return true;
  if (t.toLowerCase() === "false") return false;
  if (/^-?\d+$/.test(t)) {
    const n = Number(t);
    return Number.isSafeInteger(n) ? n : t;
  }
  if (/^-?(\d+\.\d+|\.\d+|\d+\.)([eE][+-]?\d+)?$/.test(t)) {
    return Number(t);
  }
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return unquote(t);
  }
  return t;
}

function unquote(t: string): string {
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t) as string;
    } catch {
      return t.slice(1, -1);
    }
  }
  if (t.startsWith("'") && t.endsWith("'")) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

function parseFlowScalar(input: string): YamlValue {
  const t = input.trim();
  if (t === "") return null;
  if (t.startsWith("[")) return parseFlowSeq(t);
  if (t.startsWith("{")) return parseFlowMap(t);
  return parseScalar(t);
}

function splitFlow(inner: string): string[] {
  const out: string[] = [];
  let depthSquare = 0;
  let depthCurly = 0;
  let inSingle = false;
  let inDouble = false;
  let buf = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === "[") depthSquare++;
      else if (ch === "]") depthSquare--;
      else if (ch === "{") depthCurly++;
      else if (ch === "}") depthCurly--;
      else if (ch === "," && depthSquare === 0 && depthCurly === 0) {
        out.push(buf);
        buf = "";
        continue;
      }
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function parseFlowSeq(t: string): YamlValue[] {
  if (!t.endsWith("]")) throw new Error(`Unterminated flow sequence: ${t}`);
  const inner = t.slice(1, -1).trim();
  if (!inner) return [];
  return splitFlow(inner).map((entry) => parseFlowScalar(entry));
}

function parseFlowMap(t: string): { [key: string]: YamlValue } {
  if (!t.endsWith("}")) throw new Error(`Unterminated flow mapping: ${t}`);
  const inner = t.slice(1, -1).trim();
  if (!inner) return {};
  const out: { [key: string]: YamlValue } = {};
  for (const pair of splitFlow(inner)) {
    const idx = pair.indexOf(":");
    if (idx < 0) {
      out[pair.trim()] = null;
      continue;
    }
    const key = unquote(pair.slice(0, idx).trim());
    const val = pair.slice(idx + 1);
    out[key] = parseFlowScalar(val);
  }
  return out;
}

function parseBlockScalar(lines: Line[], cursor: { i: number }, baseIndent: number, style: "|" | ">"): string {
  const buf: string[] = [];
  let blockIndent: number | null = null;
  while (cursor.i < lines.length) {
    const line = lines[cursor.i];
    if (line.indent <= baseIndent && line.text.trim() !== "") break;
    if (blockIndent === null) blockIndent = line.indent;
    const content = line.raw.replace(/\s+$/, "").slice(blockIndent);
    buf.push(content);
    cursor.i++;
  }
  if (style === "|") return `${buf.join("\n")}\n`;
  // folded: collapse single newlines, keep blank-line separators.
  let out = "";
  let prevBlank = true;
  for (const part of buf) {
    if (part.trim() === "") {
      out += "\n";
      prevBlank = true;
    } else {
      out += (prevBlank || out === "" ? "" : " ") + part;
      prevBlank = false;
    }
  }
  return `${out}\n`;
}

function parseBlock(lines: Line[], cursor: { i: number }, indent: number): YamlValue {
  if (cursor.i >= lines.length) return null;
  const first = lines[cursor.i];
  if (first.text.trim().startsWith("- ") || first.text.trim() === "-") {
    return parseBlockSequence(lines, cursor, indent);
  }
  return parseBlockMapping(lines, cursor, indent);
}

function parseBlockSequence(lines: Line[], cursor: { i: number }, indent: number): YamlValue[] {
  const out: YamlValue[] = [];
  while (cursor.i < lines.length) {
    const line = lines[cursor.i];
    if (line.indent < indent) break;
    if (line.indent > indent) throw new Error(`Unexpected indentation at line ${line.lineNo}`);
    const stripped = line.text.slice(line.indent);
    if (!stripped.startsWith("-")) break;
    const after = stripped.slice(1);
    if (after === "" || after.startsWith(" ")) {
      const valuePart = after.trim();
      cursor.i++;
      if (valuePart === "") {
        // Nested block expected at deeper indent
        out.push(parseBlock(lines, cursor, indent + 2));
        continue;
      }
      // Could be inline scalar/flow OR an inline "key: value" starting a sub-mapping.
      const colonIdx = findKeyColon(valuePart);
      if (colonIdx >= 0) {
        const key = valuePart.slice(0, colonIdx).trim();
        const rest = valuePart.slice(colonIdx + 1).trim();
        const subIndent = indent + 2;
        const subMap: { [k: string]: YamlValue } = {};
        if (rest === "") {
          subMap[unquote(key)] = parseBlock(lines, cursor, subIndent);
        } else {
          subMap[unquote(key)] = parseInlineValue(rest, lines, cursor, subIndent);
        }
        // Continue collecting more keys at subIndent
        while (cursor.i < lines.length) {
          const nl = lines[cursor.i];
          if (nl.indent !== subIndent) break;
          const nstripped = nl.text.slice(nl.indent);
          if (nstripped.startsWith("- ") || nstripped === "-") break;
          const nColon = findKeyColon(nstripped);
          if (nColon < 0) break;
          const k2 = nstripped.slice(0, nColon).trim();
          const v2 = nstripped.slice(nColon + 1).trim();
          cursor.i++;
          if (v2 === "") {
            subMap[unquote(k2)] = parseBlock(lines, cursor, subIndent + 2);
          } else {
            subMap[unquote(k2)] = parseInlineValue(v2, lines, cursor, subIndent + 2);
          }
        }
        out.push(subMap);
      } else {
        out.push(parseFlowScalar(valuePart));
      }
    } else {
      throw new Error(`Malformed sequence entry at line ${line.lineNo}`);
    }
  }
  return out;
}

function findKeyColon(s: string): number {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ":" && !inSingle && !inDouble) {
      const next = s[i + 1];
      if (next === undefined || next === " " || next === "\t") return i;
    }
  }
  return -1;
}

function parseInlineValue(value: string, lines: Line[], cursor: { i: number }, childIndent: number): YamlValue {
  const v = value.trim();
  if (v === "|" || v === ">" || v === "|-" || v === ">-" || v === "|+" || v === ">+") {
    const style = v.startsWith(">") ? ">" : "|";
    return parseBlockScalar(lines, cursor, childIndent - 2, style);
  }
  return parseFlowScalar(v);
}

function parseBlockMapping(lines: Line[], cursor: { i: number }, indent: number): { [key: string]: YamlValue } {
  const out: { [key: string]: YamlValue } = {};
  while (cursor.i < lines.length) {
    const line = lines[cursor.i];
    if (line.indent < indent) break;
    if (line.indent > indent) throw new Error(`Unexpected indentation at line ${line.lineNo}`);
    const stripped = line.text.slice(line.indent);
    if (stripped.startsWith("- ") || stripped === "-") break;
    const colonIdx = findKeyColon(stripped);
    if (colonIdx < 0) {
      throw new Error(`Expected mapping key at line ${line.lineNo}: ${stripped}`);
    }
    const key = unquote(stripped.slice(0, colonIdx).trim());
    const rest = stripped.slice(colonIdx + 1).trim();
    cursor.i++;
    if (rest === "") {
      // Nested block. Determine child indent from next non-empty line.
      if (cursor.i < lines.length) {
        const next = lines[cursor.i];
        if (next.indent > indent) {
          out[key] = parseBlock(lines, cursor, next.indent);
          continue;
        }
      }
      out[key] = null;
    } else {
      out[key] = parseInlineValue(rest, lines, cursor, indent + 2);
    }
  }
  return out;
}

export function parseYaml(input: string): YamlValue {
  const lines = tokenizeLines(input);
  if (lines.length === 0) return null;
  const cursor = { i: 0 };
  const baseIndent = lines[0].indent;
  return parseBlock(lines, cursor, baseIndent);
}

export interface FrontmatterParseResult {
  frontmatter: Record<string, unknown> | null;
  body: string;
}

export function splitFrontmatter(content: string): FrontmatterParseResult {
  const normalized = content.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { frontmatter: null, body: normalized };
  }
  const rest = normalized.slice(4);
  const endMatch = rest.match(/^---\s*$/m);
  if (!endMatch) {
    return { frontmatter: null, body: normalized };
  }
  const endIdx = endMatch.index ?? -1;
  if (endIdx < 0) return { frontmatter: null, body: normalized };
  const yamlBlock = rest.slice(0, endIdx);
  const body = rest.slice(endIdx + endMatch[0].length).replace(/^\n/, "");
  let frontmatter: Record<string, unknown> | null = null;
  const parsed = parseYaml(yamlBlock);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    frontmatter = parsed as Record<string, unknown>;
  }
  return { frontmatter, body };
}
