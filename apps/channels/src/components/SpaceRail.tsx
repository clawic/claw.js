"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, MessageCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHub } from "@/context/HubContext";
import { cn, initials } from "@/lib/utils";
import type { Space } from "@/lib/hub-types";

export function SpaceRail() {
  const { selectedSpaceId, setSelectedSpaceId, setSelectedChannelId } = useHub();

  const { data: spaces = [] } = useQuery<Space[]>({
    queryKey: ["hub_spaces"],
    queryFn: () => fetch("/api/spaces").then((r) => r.json()),
  });

  return (
    <div
      className="flex h-full w-[72px] shrink-0 flex-col items-center gap-2 overflow-y-auto py-3"
      style={{ backgroundColor: "var(--rail-bg)" }}
    >
      {/* DMs button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => {
              setSelectedSpaceId(null);
              setSelectedChannelId(null);
            }}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-[24px] transition-all duration-200 hover:rounded-[16px]",
              selectedSpaceId === null
                ? "rounded-[16px] bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground",
            )}
          >
            <MessageCircle className="h-5 w-5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Direct Messages</TooltipContent>
      </Tooltip>

      <div className="mx-auto h-[2px] w-8 rounded-full bg-border" />

      {/* Space icons */}
      {spaces.map((space) => (
        <Tooltip key={space.id}>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                setSelectedSpaceId(space.id);
                setSelectedChannelId(null);
              }}
              className={cn(
                "relative flex h-12 w-12 items-center justify-center rounded-[24px] text-sm font-semibold transition-all duration-200 hover:rounded-[16px]",
                selectedSpaceId === space.id
                  ? "rounded-[16px] bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground",
              )}
            >
              {selectedSpaceId === space.id && (
                <div className="absolute left-[-16px] h-10 w-1 rounded-r-full bg-foreground" />
              )}
              {space.icon || initials(space.name)}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{space.name}</TooltipContent>
        </Tooltip>
      ))}

      <div className="mx-auto h-[2px] w-8 rounded-full bg-border" />

      {/* Add space button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => {
              const name = prompt("Space name:");
              if (!name?.trim()) return;
              fetch("/api/spaces", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name: name.trim() }),
              }).then(() => {
                // Refetch handled by real-time
              });
            }}
            className="flex h-12 w-12 items-center justify-center rounded-[24px] bg-muted text-success transition-all duration-200 hover:rounded-[16px] hover:bg-success hover:text-white"
          >
            <Plus className="h-5 w-5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Create a Space</TooltipContent>
      </Tooltip>
    </div>
  );
}
