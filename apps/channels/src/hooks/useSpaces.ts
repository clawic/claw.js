"use client";

import { useQuery } from "@tanstack/react-query";
import type { Space } from "@/lib/hub-types";

export function useSpaces() {
  return useQuery<Space[]>({
    queryKey: ["hub_spaces"],
    queryFn: () => fetch("/api/spaces").then((r) => r.json()),
  });
}
