import { NextRequest, NextResponse } from "next/server";
import * as hub from "@/lib/hub-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await params;
  const wantCategories = req.nextUrl.searchParams.get("categories") === "true";

  if (wantCategories) {
    const categories = await hub.listCategories(spaceId);
    return NextResponse.json(categories);
  }

  const channels = await hub.listChannels(spaceId);
  return NextResponse.json(channels);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await params;
  const body = await req.json();
  const channel = await hub.createChannel({
    spaceId,
    categoryId: body.categoryId,
    name: body.name,
    kind: body.kind,
    visibility: body.visibility,
    position: body.position,
  });
  return NextResponse.json(channel, { status: 201 });
}
