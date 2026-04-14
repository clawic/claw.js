import { NextRequest, NextResponse } from "next/server";

import { mutateNotifyDashboard } from "@/lib/notify-server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const payload = await mutateNotifyDashboard(body as Record<string, unknown>);
  return NextResponse.json(payload);
}
