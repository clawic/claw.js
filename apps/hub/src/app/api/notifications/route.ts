import { NextRequest, NextResponse } from "next/server";
import * as hub from "@/lib/hub-service";

export async function GET(req: NextRequest) {
  const recipientId = req.nextUrl.searchParams.get("recipientId") ?? "local-user";
  const unreadOnly = req.nextUrl.searchParams.get("unreadOnly") === "true";
  const notifications = await hub.listNotifications(recipientId, { unreadOnly });
  return NextResponse.json(notifications);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if (body.markAllRead) {
    await hub.markAllNotificationsRead(body.recipientId ?? "local-user");
  } else if (body.id) {
    await hub.markNotificationRead(body.id);
  }
  return NextResponse.json({ ok: true });
}
