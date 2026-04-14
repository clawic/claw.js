import { NextResponse } from "next/server";

import { fetchNotifyDashboard } from "@/lib/notify-server";

export async function GET() {
  const data = await fetchNotifyDashboard();
  return NextResponse.json(data);
}
