import { NextResponse } from "next/server";

import { bootstrapNotifyDemo } from "@/lib/notify-server";

export async function POST() {
  const config = await bootstrapNotifyDemo();
  return NextResponse.json({
    ok: true,
    tenantId: config.tenantId,
    userId: config.userId,
  });
}
