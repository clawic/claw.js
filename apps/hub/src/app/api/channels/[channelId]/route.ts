import { NextRequest, NextResponse } from "next/server";
import * as hub from "@/lib/hub-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await params;
  const channel = await hub.getChannel(channelId);
  if (!channel) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(channel);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await params;
  const body = await req.json();
  const channel = await hub.updateChannel(channelId, body);
  return NextResponse.json(channel);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await params;
  await hub.deleteChannel(channelId);
  return new NextResponse(null, { status: 204 });
}
