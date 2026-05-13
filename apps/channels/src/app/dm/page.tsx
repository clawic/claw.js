"use client";

import { EmptyState } from "@/components/EmptyState";

export default function DmPage() {
  return (
    <EmptyState
      icon="dm"
      title="Your Direct Messages"
      description="Select a conversation from the sidebar or start a new one."
    />
  );
}
