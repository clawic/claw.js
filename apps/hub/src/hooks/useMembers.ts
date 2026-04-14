"use client";

import { useQuery } from "@tanstack/react-query";
import type { Member } from "@/lib/hub-types";

export function useMembers(spaceId: string | null) {
  return useQuery<Member[]>({
    queryKey: ["hub_members", spaceId],
    queryFn: () =>
      fetch(`/api/spaces/${spaceId}/members`).then((r) => r.json()),
    enabled: !!spaceId,
  });
}
