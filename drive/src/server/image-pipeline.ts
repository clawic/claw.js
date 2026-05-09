// Image pipeline: thumbnails, EXIF, OCR, embeddings.
// Filled in Fase 3. The function is exported with a no-op default so app.ts can
// wire it on every upload without conditional branches; real logic is gated by
// `dependenciesReady()` and falls back gracefully when sharp/exifr/CLIP fail.

import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";

import type { DriveStore } from "./db.ts";
import type { DriveEventBus } from "./realtime.ts";
import type {
  DriveExifRecord,
  DriveItemDetail,
  DriveMimeClass,
  DriveRealtimeEvent,
} from "../shared/types.ts";

let _sharp: typeof import("sharp") | null = null;
let _exifr: typeof import("exifr") | null = null;
let _depsLoaded = false;

async function loadDeps(): Promise<void> {
  if (_depsLoaded) return;
  _depsLoaded = true;
  try { _sharp = (await import("sharp")).default ?? (await import("sharp")) as never; } catch { _sharp = null; }
  try { _exifr = await import("exifr"); } catch { _exifr = null; }
}

function emit(bus: DriveEventBus, kind: DriveRealtimeEvent["kind"], itemId: string | null, parentId: string | null, payload: Record<string, unknown> = {}): void {
  bus.emit({
    kind,
    itemId,
    parentId,
    timestamp: new Date().toISOString(),
    payload,
  });
}

export interface ImagePipelineOptions {
  store: DriveStore;
  bus: DriveEventBus;
  /** Absolute path to the data directory (parent of `blobs`). Thumbs go in `<dataDir>/thumbs/`. */
  dataDir: string;
  /** Absolute path to the helper that runs Vision OCR on macOS. Stub if not present. */
  ocrSidecarPath?: string;
  /** Absolute path to the helper that produces CLIP embeddings on macOS. */
  embedSidecarPath?: string;
}

export async function processItemImagePipeline(
  item: DriveItemDetail,
  filePath: string,
  options: ImagePipelineOptions,
): Promise<void> {
  const { store, bus, dataDir, ocrSidecarPath, embedSidecarPath } = options;
  await loadDeps();

  const klass: DriveMimeClass = store.classifyMime(item.mimeType);
  store.setItemMimeClass(item.id, klass);

  if (klass !== "image") return;

  const thumbsDir = path.join(dataDir, "thumbs");
  fs.mkdirSync(thumbsDir, { recursive: true });

  // Thumbnails (256, 512). Skip silently if `sharp` is not installed.
  if (_sharp) {
    for (const size of [256, 512] as const) {
      const outPath = path.join(thumbsDir, `${item.id}-${size}.jpg`);
      try {
        await _sharp(filePath).resize({ width: size, height: size, fit: "inside" }).jpeg({ quality: 80 }).toFile(outPath);
        store.setThumbnail({
          itemId: item.id,
          size,
          path: outPath,
          mimeType: "image/jpeg",
          createdAt: new Date().toISOString(),
        });
        emit(bus, "thumbnail.ready", item.id, item.parentId, { size });
      } catch { /* noop, leave thumb missing */ }
    }
  }

  // EXIF
  if (_exifr) {
    try {
      const raw = await _exifr.parse(filePath, true);
      if (raw && typeof raw === "object") {
        const record: DriveExifRecord = {
          itemId: item.id,
          takenAt: extractDate(raw),
          cameraMake: stringOrNull(raw.Make),
          cameraModel: stringOrNull(raw.Model),
          lensModel: stringOrNull(raw.LensModel ?? raw.Lens),
          iso: numberOrNull(raw.ISO),
          shutterSpeed: stringOrNull(raw.ExposureTime ? formatShutter(raw.ExposureTime) : null),
          aperture: numberOrNull(raw.FNumber),
          focalLength: numberOrNull(raw.FocalLength),
          latitude: numberOrNull(raw.latitude ?? raw.GPSLatitude),
          longitude: numberOrNull(raw.longitude ?? raw.GPSLongitude),
          orientation: numberOrNull(raw.Orientation),
          width: numberOrNull(raw.ExifImageWidth ?? raw.ImageWidth),
          height: numberOrNull(raw.ExifImageHeight ?? raw.ImageHeight),
          raw: raw as Record<string, unknown>,
        };
        store.setExif(record);
        store.appendAuditEvent({
          kind: "exif_extracted",
          itemId: item.id,
          principalKind: "system",
          principalId: "image-pipeline",
          principalName: "image-pipeline",
          metadata: { hasGps: record.latitude !== null },
        });
        emit(bus, "exif.ready", item.id, item.parentId);
      }
    } catch { /* noop */ }
  }

  // OCR (sidecar). Best effort.
  if (ocrSidecarPath && fs.existsSync(ocrSidecarPath)) {
    store.setItemPending(item.id, "ocr", true);
    runSidecar(ocrSidecarPath, [filePath]).then((text) => {
      if (typeof text === "string" && text.trim().length > 0) {
        store.setItemIndexedText(item.id, text);
        store.appendAuditEvent({
          kind: "ocr_completed",
          itemId: item.id,
          principalKind: "system",
          principalId: "ocr-sidecar",
          principalName: "ocr-sidecar",
          metadata: { length: text.length },
        });
        emit(bus, "ocr.ready", item.id, item.parentId, { length: text.length });
      }
    }).finally(() => store.setItemPending(item.id, "ocr", false));
  }

  // Embedding (sidecar). Best effort.
  if (embedSidecarPath && fs.existsSync(embedSidecarPath)) {
    store.setItemPending(item.id, "embedding", true);
    runSidecar(embedSidecarPath, [filePath]).then((stdout) => {
      if (typeof stdout !== "string") return;
      try {
        const parsed = JSON.parse(stdout) as { model: string; vector: number[] };
        if (Array.isArray(parsed.vector) && typeof parsed.model === "string") {
          const vector = Float32Array.from(parsed.vector);
          store.setEmbedding(item.id, parsed.model, vector);
          store.appendAuditEvent({
            kind: "embedding_generated",
            itemId: item.id,
            principalKind: "system",
            principalId: "embed-sidecar",
            principalName: "embed-sidecar",
            metadata: { model: parsed.model, dim: vector.length },
          });
          emit(bus, "embedding.ready", item.id, item.parentId, { model: parsed.model });
        }
      } catch { /* noop */ }
    }).finally(() => store.setItemPending(item.id, "embedding", false));
  }
}

function runSidecar(binary: string, args: string[]): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const proc = spawn(binary, args, { stdio: ["ignore", "pipe", "ignore"] });
    let buffer = "";
    proc.stdout.on("data", (chunk) => { buffer += chunk.toString("utf8"); });
    proc.on("close", (code) => resolve(code === 0 ? buffer : null));
    proc.on("error", () => resolve(null));
  });
}

function extractDate(raw: Record<string, unknown>): string | null {
  const candidate = raw.DateTimeOriginal ?? raw.CreateDate ?? raw.ModifyDate ?? null;
  if (!candidate) return null;
  if (candidate instanceof Date) return candidate.toISOString();
  if (typeof candidate === "string") {
    const d = new Date(candidate.replace(/^(\d{4}):(\d{2}):(\d{2}) /, "$1-$2-$3T"));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = parseFloat(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatShutter(exposureTime: number | string): string {
  if (typeof exposureTime === "string") return exposureTime;
  if (exposureTime >= 1) return `${exposureTime}s`;
  return `1/${Math.round(1 / exposureTime)}s`;
}

// ---------------------------------------------------------------------------
// Cosine similarity for semantic search
// ---------------------------------------------------------------------------

export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function computeQueryEmbedding(query: string, embedSidecarPath: string | undefined): Promise<{ model: string; vector: Float32Array } | null> {
  if (!embedSidecarPath || !fs.existsSync(embedSidecarPath)) return null;
  const stdout = await runSidecar(embedSidecarPath, ["--text", query]);
  if (!stdout) return null;
  try {
    const parsed = JSON.parse(stdout) as { model: string; vector: number[] };
    if (Array.isArray(parsed.vector) && typeof parsed.model === "string") {
      return { model: parsed.model, vector: Float32Array.from(parsed.vector) };
    }
  } catch { /* noop */ }
  return null;
}
