import { NextRequest, NextResponse } from "next/server";
import * as hub from "@/lib/hub-service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await params;
  const body = await req.json();
  await hub.markAsRead(channelId, body.agentId ?? "local-user", body.messageId);
  return NextResponse.json({ ok: true });
}
