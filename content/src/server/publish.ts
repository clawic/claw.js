import { ContentError } from "../shared/errors.ts";
import type {
  ContentAssetRef,
  ContentCapabilityMap,
  ContentDestination,
  ContentDestinationKind,
  ContentEntry,
  ContentFormat,
  ContentPublicationRun,
  ContentVariant,
} from "../shared/types.ts";

function baseCapabilities(overrides: Partial<ContentCapabilityMap>): ContentCapabilityMap {
  return {
    supportsImmediatePublish: true,
    supportsScheduling: true,
    supportsText: true,
    supportsImages: false,
    supportsVideo: false,
    supportsThread: false,
    supportsLinkCard: false,
    supportsRichBlocks: false,
    maxTextLength: 5000,
    maxAssetCount: 0,
    requiresApprovalByDefault: false,
    ...overrides,
  };
}

export function defaultCapabilityMap(kind: ContentDestinationKind): ContentCapabilityMap {
  switch (kind) {
    case "website_page":
      return baseCapabilities({
        supportsImages: true,
        supportsVideo: true,
        supportsLinkCard: true,
        supportsRichBlocks: true,
        maxTextLength: 20000,
        maxAssetCount: 12,
      });
    case "blog_post":
      return baseCapabilities({
        supportsImages: true,
        supportsVideo: true,
        supportsLinkCard: true,
        supportsRichBlocks: true,
        maxTextLength: 30000,
        maxAssetCount: 24,
      });
    case "webhook":
      return baseCapabilities({
        supportsImages: true,
        supportsVideo: true,
        supportsThread: true,
        supportsLinkCard: true,
        supportsRichBlocks: true,
        maxTextLength: 50000,
        maxAssetCount: 32,
      });
    case "linkedin_post":
      return baseCapabilities({
        supportsImages: true,
        supportsLinkCard: true,
        maxTextLength: 3000,
        maxAssetCount: 9,
        requiresApprovalByDefault: true,
      });
    case "bluesky_post":
      return baseCapabilities({
        supportsImages: true,
        supportsThread: true,
        supportsLinkCard: true,
        maxTextLength: 300,
        maxAssetCount: 4,
      });
    case "mastodon_post":
      return baseCapabilities({
        supportsImages: true,
        supportsVideo: true,
        supportsThread: true,
        supportsLinkCard: true,
        maxTextLength: 500,
        maxAssetCount: 4,
      });
  }
}

export function buildGeneratedVariant(input: {
  entry: ContentEntry;
  destination: ContentDestination;
  assets: ContentAssetRef[];
}): Pick<ContentVariant, "format" | "title" | "body" | "mediaPlan" | "publishConfig"> {
  const { entry, destination, assets } = input;
  const capabilityMap = destination.capabilityMap;
  const preferredFormat: ContentFormat = capabilityMap.supportsRichBlocks ? entry.canonicalFormat : "plain_text";
  const bodyBase = entry.summary?.trim()
    ? `${entry.title}\n\n${entry.summary}\n\n${entry.canonicalBody}`
    : `${entry.title}\n\n${entry.canonicalBody}`;
  let body = bodyBase.replace(/\n{3,}/g, "\n\n").trim();
  if (body.length > capabilityMap.maxTextLength) {
    body = `${body.slice(0, Math.max(0, capabilityMap.maxTextLength - 1)).trimEnd()}…`;
  }
  const assetSlice = assets.slice(0, capabilityMap.maxAssetCount);
  return {
    format: preferredFormat,
    title: entry.title,
    body,
    mediaPlan: {
      assetIds: assetSlice.map((asset) => asset.id),
      assetKinds: assetSlice.map((asset) => asset.assetKind),
    },
    publishConfig: {
      destinationKind: destination.kind,
      previewMode: destination.kind,
    },
  };
}

export function validateVariant(input: {
  variant: Pick<ContentVariant, "body" | "format">;
  destination: ContentDestination;
  assets: ContentAssetRef[];
}): string[] {
  const errors: string[] = [];
  const { variant, destination, assets } = input;
  const capabilities = destination.capabilityMap;
  if (!capabilities.supportsText && variant.body.trim()) {
    errors.push("Destination does not support text content.");
  }
  if (variant.body.length > capabilities.maxTextLength) {
    errors.push(`Body exceeds maxTextLength (${capabilities.maxTextLength}).`);
  }
  if (assets.length > capabilities.maxAssetCount) {
    errors.push(`Asset count exceeds maxAssetCount (${capabilities.maxAssetCount}).`);
  }
  const hasImage = assets.some((asset) => asset.assetKind === "image");
  const hasVideo = assets.some((asset) => asset.assetKind === "video");
  if (hasImage && !capabilities.supportsImages) {
    errors.push("Destination does not support images.");
  }
  if (hasVideo && !capabilities.supportsVideo) {
    errors.push("Destination does not support video.");
  }
  if (variant.format === "rich_text" && !capabilities.supportsRichBlocks) {
    errors.push("Destination does not support rich blocks.");
  }
  return errors;
}

export function approvalRequired(input: {
  destination: ContentDestination;
  assets: ContentAssetRef[];
  scheduledAt: string | null;
}): boolean {
  const { destination, assets, scheduledAt } = input;
  if (destination.publishPolicy === "manual") return true;
  if (destination.publishPolicy === "autopublish") return false;
  if (destination.capabilityMap.requiresApprovalByDefault) return true;
  if (destination.conditionalRules.requireApprovalWithAssets && assets.length > 0) return true;
  if (destination.conditionalRules.requireApprovalWhenScheduled && Boolean(scheduledAt)) return true;
  return false;
}

export async function publishVariant(input: {
  planId: string;
  entry: ContentEntry;
  variant: ContentVariant;
  destination: ContentDestination;
  assets: ContentAssetRef[];
  attemptNumber: number;
}): Promise<Pick<ContentPublicationRun, "externalId" | "providerMessage">> {
  const { destination, variant, assets, attemptNumber, entry, planId } = input;
  if (destination.status !== "active") {
    throw new ContentError("Destination is not active.", 409, "destination_inactive");
  }
  if (!destination.secretRef && destination.kind !== "website_page" && destination.kind !== "blog_post" && destination.kind !== "webhook") {
    throw new ContentError("Destination secretRef is required for this adapter.", 409, "destination_secret_missing");
  }
  if (destination.kind === "webhook") {
    return {
      externalId: `webhook_${planId}_${attemptNumber}`,
      providerMessage: `Webhook payload prepared with ${assets.length} assets.`,
    };
  }
  return {
    externalId: `${destination.kind}_${variant.id}_${attemptNumber}`,
    providerMessage: `${entry.title} published to ${destination.name}.`,
  };
}
