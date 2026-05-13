import { NextRequest, NextResponse } from "next/server";
import * as hub from "@/lib/hub-service";

export async function GET() {
  const spaces = await hub.listSpaces();
  return NextResponse.json(spaces);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await hub.createSpace({
    name: body.name,
    description: body.description,
    icon: body.icon,
    ownerId: body.ownerId ?? "local-user",
    visibility: body.visibility ?? "public",
  });
  return NextResponse.json(result.space, { status: 201 });
}
