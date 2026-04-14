import { NextRequest, NextResponse } from "next/server";
import * as hub from "@/lib/hub-service";

export async function POST(req: NextRequest) {
  const body = await req.json();
  await hub.updatePresence(
    body.spaceId,
    body.agentId ?? "local-user",
    body.presence ?? "online",
  );
  return NextResponse.json({ ok: true });
}
