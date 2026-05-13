"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useHub } from "@/context/HubContext";
import { PresenceIndicator } from "./PresenceIndicator";
import { initials } from "@/lib/utils";
import type { Member } from "@/lib/hub-types";

export function MemberSidebar() {
  const { selectedSpaceId } = useHub();

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ["hub_members", selectedSpaceId],
    queryFn: () =>
      fetch(`/api/spaces/${selectedSpaceId}/members`).then((r) => r.json()),
    enabled: !!selectedSpaceId,
  });

  if (!selectedSpaceId) return null;

  const online = members.filter(
    (m) => m.presence === "online" || m.presence === "idle" || m.presence === "busy",
  );
  const offline = members.filter(
    (m) => !m.presence || m.presence === "offline",
  );

  return (
    <div
      className="hidden h-full w-60 shrink-0 flex-col border-l border-border lg:flex"
      style={{ backgroundColor: "var(--members-bg)" }}
    >
      <div className="flex-1 overflow-y-auto px-2 py-4">
        {online.length > 0 && (
          <MemberGroup label={`Online - ${online.length}`} members={online} />
        )}
        {offline.length > 0 && (
          <MemberGroup label={`Offline - ${offline.length}`} members={offline} />
        )}
        {members.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            No members yet.
          </p>
        )}
      </div>
    </div>
  );
}

function MemberGroup({
  label,
  members,
}: {
  label: string;
  members: Member[];
}) {
  return (
    <div className="mb-4">
      <h3 className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      {members.map((member) => (
        <div
          key={member.id}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
        >
          <div className="relative">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
              {initials(member.displayName || member.agentId)}
            </div>
            <PresenceIndicator
              status={member.presence ?? "offline"}
              className="absolute -bottom-0.5 -right-0.5"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {member.displayName || member.agentId}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
