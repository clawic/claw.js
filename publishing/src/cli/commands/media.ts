import fs from "node:fs";
import path from "node:path";

import type { CliContext } from "../parser.ts";
import { out } from "../parser.ts";
import { currentWorkspaceId } from "./workspaces.ts";

function mimeOf(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".mp4":
      return "video/mp4";
    case ".mp3":
      return "audio/mpeg";
    default:
      return "application/octet-stream";
  }
}

export async function media(ctx: CliContext): Promise<number> {
  const ws = currentWorkspaceId(ctx);
  const [, command, value] = ctx.args.positional;
  if (!command || command === "list") {
    out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/media${ctx.args.flags.mime ? `?mime=${encodeURIComponent(ctx.args.flags.mime)}` : ""}`));
    return 0;
  }
  if (command === "upload") {
    if (!value) { ctx.host.stderr.write("file path required\n"); return 64; }
    const filePath = path.resolve(process.cwd(), value);
    const buffer = fs.readFileSync(filePath);
    out(ctx, await ctx.client.uploadFile(`/v1/workspaces/${ws}/media`, path.basename(filePath), mimeOf(filePath), buffer));
    return 0;
  }
  if (command === "get") {
    out(ctx, await ctx.client.get(`/v1/workspaces/${ws}/media/${value}`));
    return 0;
  }
  ctx.host.stderr.write(`unknown media command: ${command}\n`);
  return 64;
}
