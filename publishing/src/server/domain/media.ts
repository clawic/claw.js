import fs from "node:fs";
import path from "node:path";

import type { DB } from "../db/index.ts";
import { jsonParse, jsonStringify, now } from "../db/index.ts";
import { prefixedId } from "../../shared/ids.ts";

export interface MediaRow {
  id: string;
  workspace_id: string;
  name: string;
  mime_type: string;
  size: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  disk: "local" | "s3" | "drive";
  path: string;
  data: Record<string, unknown>;
  alt_text: string | null;
  transcript: string | null;
  conversions: Array<{ name: string; mime_type: string; path: string; size: number }>;
  source: string;
  source_ref: string | null;
  size_total: number;
  created_at: number;
}

export class MediaService {
  constructor(private readonly db: DB, private readonly mediaDir: string) {
    fs.mkdirSync(this.mediaDir, { recursive: true });
  }

  upload(workspaceId: string, input: {
    name: string;
    mimeType: string;
    body: Buffer;
    altText?: string;
  }): MediaRow {
    const id = prefixedId("med");
    const ext = path.extname(input.name) || mimeToExt(input.mimeType);
    const subdir = path.join(this.mediaDir, workspaceId);
    fs.mkdirSync(subdir, { recursive: true });
    const filePath = path.join(subdir, `${id}${ext}`);
    fs.writeFileSync(filePath, input.body);
    const created = now();
    this.db
      .prepare(
        `INSERT INTO media (id, workspace_id, name, mime_type, size, disk, path, alt_text, source, size_total, created_at)
         VALUES (?, ?, ?, ?, ?, 'local', ?, ?, 'upload', ?, ?)`,
      )
      .run(
        id,
        workspaceId,
        input.name,
        input.mimeType,
        input.body.length,
        filePath,
        input.altText ?? null,
        input.body.length,
        created,
      );
    return this.get(workspaceId, id)!;
  }

  list(workspaceId: string, mimePrefix?: string): MediaRow[] {
    let sql = `SELECT * FROM media WHERE workspace_id = ? AND deleted_at IS NULL`;
    const params: unknown[] = [workspaceId];
    if (mimePrefix) {
      sql += ` AND mime_type LIKE ?`;
      params.push(`${mimePrefix.replace(/\*/, "")}%`);
    }
    sql += ` ORDER BY created_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.map(rowToMedia);
  }

  get(workspaceId: string, id: string): MediaRow | null {
    const row = this.db
      .prepare(`SELECT * FROM media WHERE workspace_id = ? AND id = ?`)
      .get(workspaceId, id) as Record<string, unknown> | undefined;
    return row ? rowToMedia(row) : null;
  }

  recordConversion(id: string, conversion: { name: string; mime_type: string; path: string; size: number }): void {
    const cur = this.db.prepare(`SELECT conversions, size_total FROM media WHERE id = ?`).get(id) as { conversions: string; size_total: number };
    const list = jsonParse<Array<{ name: string; mime_type: string; path: string; size: number }>>(cur.conversions, []);
    list.push(conversion);
    this.db
      .prepare(`UPDATE media SET conversions = ?, size_total = ? WHERE id = ?`)
      .run(jsonStringify(list), Number(cur.size_total) + conversion.size, id);
  }

  delete(workspaceId: string, id: string): void {
    this.db.prepare(`UPDATE media SET deleted_at = ? WHERE workspace_id = ? AND id = ?`).run(now(), workspaceId, id);
  }
}

function rowToMedia(row: Record<string, unknown>): MediaRow {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    name: String(row.name),
    mime_type: String(row.mime_type),
    size: Number(row.size),
    width: (row.width as number) ?? null,
    height: (row.height as number) ?? null,
    duration_ms: (row.duration_ms as number) ?? null,
    disk: (row.disk as MediaRow["disk"]) ?? "local",
    path: String(row.path),
    data: jsonParse<Record<string, unknown>>(row.data as string, {}),
    alt_text: (row.alt_text as string) ?? null,
    transcript: (row.transcript as string) ?? null,
    conversions: jsonParse(row.conversions as string, []),
    source: String(row.source),
    source_ref: (row.source_ref as string) ?? null,
    size_total: Number(row.size_total),
    created_at: Number(row.created_at),
  };
}

function mimeToExt(mime: string): string {
  if (mime.startsWith("image/jpeg")) return ".jpg";
  if (mime.startsWith("image/png")) return ".png";
  if (mime.startsWith("image/webp")) return ".webp";
  if (mime.startsWith("image/gif")) return ".gif";
  if (mime.startsWith("video/mp4")) return ".mp4";
  if (mime.startsWith("audio/mpeg")) return ".mp3";
  return "";
}
