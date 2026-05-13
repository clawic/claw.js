"use client";

import { useQuery } from "@tanstack/react-query";
import type { Channel, Category } from "@/lib/hub-types";

export function useChannels(spaceId: string | null) {
  return useQuery<Channel[]>({
    queryKey: ["hub_channels", spaceId],
    queryFn: () => fetch(`/api/spaces/${spaceId}/channels`).then((r) => r.json()),
    enabled: !!spaceId,
  });
}

export function useCategories(spaceId: string | null) {
  return useQuery<Category[]>({
    queryKey: ["hub_categories", spaceId],
    queryFn: () =>
      fetch(`/api/spaces/${spaceId}/channels?categories=true`).then((r) => r.json()),
    enabled: !!spaceId,
  });
}
