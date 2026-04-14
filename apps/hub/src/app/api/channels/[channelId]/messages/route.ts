import { NextRequest, NextResponse } from "next/server";
import * as hub from "@/lib/hub-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await params;
  const limit = Number(req.nextUrl.searchParams.get("limit")) || 50;
  const offset = Number(req.nextUrl.searchParams.get("offset")) || 0;
  const messages = await hub.listMessages(channelId, { limit, offset });
  return NextResponse.json(messages);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await params;
  const body = await req.json();
  const message = await hub.sendMessage({
    channelId,
    authorId: body.authorId ?? "local-user",
    authorKind: body.authorKind ?? "human",
    content: body.content,
    contentType: body.contentType,
    replyToId: body.replyToId,
    attachments: body.attachments,
  });
  return NextResponse.json(message, { status: 201 });
}
