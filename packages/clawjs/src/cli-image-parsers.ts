import type { ImageOperation, ImageProvenance, ImageType } from "@clawjs/claw";

import { CLI_EXIT_USAGE, CliHandledError } from "./cli-errors.ts";

const IMAGE_OPERATIONS = ["create", "edit", "import"] as const;
const IMAGE_TYPES = [
  "logo",
  "icon",
  "illustration",
  "photo",
  "mockup",
  "diagram",
  "texture",
  "screenshot",
  "avatar",
  "other",
] as const;
const IMAGE_PROVENANCES = [
  "generated-by-system",
  "imported-codex",
  "imported-chatgpt",
  "imported-manual",
  "command-backend",
  "custom",
] as const;

export function parseImageOperation(value: string | undefined): ImageOperation | undefined {
  if (value === undefined) return undefined;
  if ((IMAGE_OPERATIONS as readonly string[]).includes(value)) {
    return value as ImageOperation;
  }
  throw new CliHandledError("invalid_image_operation", `--operation must be one of: ${IMAGE_OPERATIONS.join(", ")}.`, CLI_EXIT_USAGE, {
    location: "cli.image.operation",
  });
}

export function parseImageType(value: string | undefined): ImageType | undefined {
  if (value === undefined) return undefined;
  if ((IMAGE_TYPES as readonly string[]).includes(value)) {
    return value as ImageType;
  }
  throw new CliHandledError("invalid_image_type", `--type must be one of: ${IMAGE_TYPES.join(", ")}.`, CLI_EXIT_USAGE, {
    location: "cli.image.type",
  });
}

export function parseImageProvenance(value: string | undefined): ImageProvenance | undefined {
  if (value === undefined) return undefined;
  if ((IMAGE_PROVENANCES as readonly string[]).includes(value)) {
    return value as ImageProvenance;
  }
  throw new CliHandledError("invalid_image_provenance", `--provenance must be one of: ${IMAGE_PROVENANCES.join(", ")}.`, CLI_EXIT_USAGE, {
    location: "cli.image.provenance",
  });
}
