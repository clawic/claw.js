import type { ImageOperation, ImageProvenance, ImageType } from "@clawjs/claw";

export function parseImageOperation(value: string | undefined): ImageOperation | undefined {
  if (value === "create" || value === "edit" || value === "import") {
    return value;
  }
  return undefined;
}

export function parseImageType(value: string | undefined): ImageType | undefined {
  if (
    value === "logo"
    || value === "icon"
    || value === "illustration"
    || value === "photo"
    || value === "mockup"
    || value === "diagram"
    || value === "texture"
    || value === "screenshot"
    || value === "avatar"
    || value === "other"
  ) {
    return value;
  }
  return undefined;
}

export function parseImageProvenance(value: string | undefined): ImageProvenance | undefined {
  if (
    value === "generated-by-system"
    || value === "imported-codex"
    || value === "imported-chatgpt"
    || value === "imported-manual"
    || value === "command-backend"
    || value === "custom"
  ) {
    return value;
  }
  return undefined;
}
