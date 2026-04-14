import { NextRequest, NextResponse } from "next/server";
import * as hub from "@/lib/hub-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const reactions = await hub.listReactions(messageId);
  return NextResponse.json(reactions);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const body = await req.json();
  const reaction = await hub.addReaction(
    messageId,
    body.agentId ?? "local-user",
    body.emoji,
  );
  return NextResponse.json(reaction, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const body = await req.json();
  await hub.removeReaction(
    messageId,
    body.agentId ?? "local-user",
    body.emoji,
  );
  return new NextResponse(null, { status: 204 });
}
