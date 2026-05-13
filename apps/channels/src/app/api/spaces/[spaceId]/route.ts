import { NextRequest, NextResponse } from "next/server";
import * as hub from "@/lib/hub-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await params;
  const space = await hub.getSpace(spaceId);
  if (!space) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(space);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await params;
  const body = await req.json();
  const space = await hub.updateSpace(spaceId, body);
  return NextResponse.json(space);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await params;
  await hub.deleteSpace(spaceId);
  return new NextResponse(null, { status: 204 });
}
