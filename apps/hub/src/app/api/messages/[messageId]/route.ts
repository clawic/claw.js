import { NextRequest, NextResponse } from "next/server";
import * as hub from "@/lib/hub-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const message = await hub.getMessage(messageId);
  if (!message) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(message);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const body = await req.json();
  const message = await hub.editMessage(messageId, body.content);
  return NextResponse.json(message);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  await hub.deleteMessage(messageId);
  return new NextResponse(null, { status: 204 });
}
