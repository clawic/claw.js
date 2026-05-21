import { NextRequest, NextResponse } from "next/server";
import { getRealtimeConnection } from "@/lib/database-client";

export async function GET(req: NextRequest) {
  const connection = await getRealtimeConnection({
    refresh: req.nextUrl.searchParams.get("refresh") === "1",
  });
  return NextResponse.json(connection);
}
