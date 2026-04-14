import { NextRequest, NextResponse } from "next/server";
import * as hub from "@/lib/hub-service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await params;
  const members = await hub.listMembers(spaceId);
  return NextResponse.json(members);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await params;
  const body = await req.json();
  const member = await hub.joinSpace(spaceId, body.agentId);
  return NextResponse.json(member, { status: 201 });
}
