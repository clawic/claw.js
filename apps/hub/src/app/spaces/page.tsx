"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useHub } from "@/context/HubContext";
import { initials } from "@/lib/utils";
import type { Space } from "@/lib/hub-types";

export default function SpacesPage() {
  const { setSelectedSpaceId, setSelectedChannelId } = useHub();

  const { data: spaces = [] } = useQuery<Space[]>({
    queryKey: ["hub_spaces"],
    queryFn: () => fetch("/api/spaces").then((r) => r.json()),
  });

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-bold">Spaces</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Browse and join communication spaces.
      </p>

      <div className="mt-8 grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-3">
        {spaces.map((space) => (
          <button
            key={space.id}
            onClick={() => {
              setSelectedSpaceId(space.id);
              setSelectedChannelId(null);
            }}
            className="flex flex-col items-center gap-2 rounded-lg border border-border p-6 hover:bg-muted/50"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/20 text-xl font-bold text-primary">
              {space.icon || initials(space.name)}
            </div>
            <span className="text-sm font-semibold">{space.name}</span>
            {space.description && (
              <span className="text-center text-xs text-muted-foreground">
                {space.description}
              </span>
            )}
          </button>
        ))}

        <button
          onClick={() => {
            const name = prompt("Space name:");
            if (!name?.trim()) return;
            fetch("/api/spaces", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name: name.trim() }),
            });
          }}
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-muted-foreground hover:border-success hover:text-success"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <Plus className="h-8 w-8" />
          </div>
          <span className="text-sm font-semibold">Create Space</span>
        </button>
      </div>
    </div>
  );
}
