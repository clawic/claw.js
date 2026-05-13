import { NextRequest, NextResponse } from "next/server";
import * as hub from "@/lib/hub-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const parent = await hub.getMessage(messageId);
  if (!parent) return NextResponse.json({ error: "not found" }, { status: 404 });

  const replies = await hub.listMessages(parent.channelId, {
    threadId: messageId,
    limit: 100,
  });
  return NextResponse.json(replies);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const parent = await hub.getMessage(messageId);
  if (!parent) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const message = await hub.sendMessage({
    channelId: parent.channelId,
    threadId: messageId,
    authorId: body.authorId ?? "local-user",
    authorKind: body.authorKind ?? "human",
    content: body.content,
    contentType: body.contentType,
  });
  return NextResponse.json(message, { status: 201 });
}
