import { NextRequest, NextResponse } from "next/server";
import * as hub from "@/lib/hub-service";

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId") ?? "local-user";
  const channels = await hub.listDmChannels(agentId);
  return NextResponse.json(channels);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const participants: string[] = body.participants ?? [];
  if (participants.length < 2) {
    return NextResponse.json(
      { error: "at least 2 participants required" },
      { status: 400 },
    );
  }
  const channel = await hub.findOrCreateDm(participants);
  return NextResponse.json(channel, { status: 201 });
}
