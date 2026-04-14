import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

import type {
  DriveItemDetail,
  DriveNativeContent,
  DrivePreviewKind,
  DriveUploadContent,
} from "../shared/types.ts";
import type { DriveConverterMode } from "./config.ts";

function commandExists(command: string): boolean {
  try {
    execFileSync("/usr/bin/env", ["sh", "-lc", `command -v ${command}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function readTextSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function normalizeSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

function mimeFromName(name: string): string {
  const extension = path.extname(name).toLowerCase();
  switch (extension) {
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    case ".json":
      return "application/json";
    case ".csv":
      return "text/csv";
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".mp4":
      return "video/mp4";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    default:
      return "application/octet-stream";
  }
}

function previewKindForMime(mimeType: string): DrivePreviewKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType.startsWith("text/")
    || mimeType === "application/json"
  ) return "text";
  if (mimeType.includes("spreadsheet") || mimeType.includes("presentation") || mimeType.includes("wordprocessing")) return "office";
  return "binary";
}

function tryPdfText(filePath: string): string {
  if (commandExists("pdftotext")) {
    const out = path.join(os.tmpdir(), `drive-pdf-${Date.now()}.txt`);
    try {
      execFileSync("pdftotext", [filePath, out], { stdio: "ignore" });
      return readTextSafe(out);
    } catch {
      return "";
    } finally {
      fs.rmSync(out, { force: true });
    }
  }
  return "";
}

function tryStrings(filePath: string): string {
  try {
    return execFileSync("/usr/bin/strings", [filePath], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return "";
  }
}

function summarizeNativeContent(content: DriveNativeContent): string {
  if (content.kind === "doc") {
    return normalizeSnippet(
      content.blocks.map((block) => {
        if (block.type === "table") return (block.cells ?? []).flat().join(" ");
        return block.text ?? "";
      }).join("\n"),
    );
  }
  if (content.kind === "sheet") {
    return normalizeSnippet(content.tabs.flatMap((tab) => [tab.name, ...tab.rows.flat()]).join(" "));
  }
  return normalizeSnippet(content.slides.map((slide) => `${slide.title} ${slide.body} ${slide.notes}`).join(" "));
}

function toCsv(content: DriveNativeContent): string {
  if (content.kind !== "sheet") return summarizeNativeContent(content);
  const [tab] = content.tabs;
  return (tab?.rows ?? []).map((row) => row.map((cell) => JSON.stringify(cell ?? "")).join(",")).join("\n");
}

export class DriveConverterService {
  constructor(private readonly mode: DriveConverterMode) {}

  inferMimeType(name: string, fallback = "application/octet-stream"): string {
    const inferred = mimeFromName(name);
    return inferred === "application/octet-stream" ? fallback : inferred;
  }

  inspectUpload(filePath: string, name: string, mimeType: string): DriveUploadContent {
    const normalizedMime = !mimeType || mimeType === "application/octet-stream"
      ? this.inferMimeType(name, mimeType)
      : mimeType;
    const previewKind = previewKindForMime(normalizedMime);
    let textContent: string | undefined;
    let metadata: Record<string, unknown> | undefined;

    if (previewKind === "text") {
      textContent = readTextSafe(filePath);
    } else if (previewKind === "pdf") {
      textContent = this.mode === "mock" ? `Mock PDF preview for ${name}` : tryPdfText(filePath) || tryStrings(filePath);
      metadata = { format: "pdf" };
    } else if (previewKind === "office") {
      textContent = this.mode === "mock" ? `Mock Office preview for ${name}` : tryStrings(filePath);
      metadata = { format: path.extname(name).slice(1).toLowerCase() || "office" };
    } else if (previewKind === "audio" || previewKind === "video") {
      metadata = { format: normalizedMime, inspectedWith: commandExists("ffprobe") ? "ffprobe" : "basic" };
      textContent = `${previewKind.toUpperCase()} file ${name}`;
    } else if (previewKind === "image") {
      metadata = { format: normalizedMime };
    } else {
      textContent = `Binary file ${name}`;
    }

    return {
      kind: "upload",
      previewKind,
      ...(textContent ? { textContent } : {}),
      ...(metadata ? { metadata } : {}),
    };
  }

  buildPreview(detail: DriveItemDetail): string {
    if (!detail.content) return detail.previewText;
    if (detail.kind === "upload") {
      return normalizeSnippet((detail.content as DriveUploadContent).textContent ?? detail.previewText);
    }
    return summarizeNativeContent(detail.content as DriveNativeContent);
  }

  exportNative(detail: DriveItemDetail, format: string): { fileName: string; mimeType: string; buffer: Buffer } {
    if (!detail.content || detail.kind === "folder" || detail.kind === "upload") {
      throw new Error("Only native Drive items can be exported.");
    }

    const extension = format.toLowerCase();
    const baseName = detail.name.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "untitled";
    const content = detail.content as DriveNativeContent;

    if (detail.kind === "doc") {
      if (extension === "md" || extension === "txt") {
        const text = content.kind === "doc"
          ? content.blocks.map((block) => block.type === "heading" ? `# ${block.text ?? ""}` : block.text ?? "").join("\n\n")
          : this.buildPreview(detail);
        return {
          fileName: `${baseName}.${extension}`,
          mimeType: extension === "md" ? "text/markdown" : "text/plain",
          buffer: Buffer.from(text, "utf8"),
        };
      }
      if (extension === "json") {
        return {
          fileName: `${baseName}.json`,
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(content, null, 2)),
        };
      }
      return this.mockBinaryExport(detail, extension);
    }

    if (detail.kind === "sheet") {
      if (extension === "csv") {
        return {
          fileName: `${baseName}.csv`,
          mimeType: "text/csv",
          buffer: Buffer.from(toCsv(content), "utf8"),
        };
      }
      if (extension === "json") {
        return {
          fileName: `${baseName}.json`,
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(content, null, 2)),
        };
      }
      return this.mockBinaryExport(detail, extension);
    }

    if (extension === "json") {
      return {
        fileName: `${baseName}.json`,
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(content, null, 2)),
      };
    }
    if (extension === "txt") {
      return {
        fileName: `${baseName}.txt`,
        mimeType: "text/plain",
        buffer: Buffer.from(this.buildPreview(detail), "utf8"),
      };
    }
    return this.mockBinaryExport(detail, extension);
  }

  private mockBinaryExport(detail: DriveItemDetail, extension: string) {
    const baseName = detail.name.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "untitled";
    const mimeMap: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
    const buffer = Buffer.from(
      this.mode === "mock"
        ? `Mock ${extension.toUpperCase()} export for ${detail.name}\n${this.buildPreview(detail)}`
        : `${detail.name}\n${this.buildPreview(detail)}`,
      "utf8",
    );
    return {
      fileName: `${baseName}.${extension}`,
      mimeType: mimeMap[extension] ?? "application/octet-stream",
      buffer,
    };
  }
}
