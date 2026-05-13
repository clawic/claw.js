import { NextResponse } from "next/server";
import { decideApproval } from "@/lib/company-agent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request, context: { params: Promise<{ approvalId: string }> }) {
  try {
    const { approvalId } = await context.params;
    const body = (await request.json()) as { decision?: "approved" | "rejected" };
    if (body.decision !== "approved" && body.decision !== "rejected") {
      return NextResponse.json({ error: "decision must be approved or rejected" }, { status: 400 });
    }
    const approval = await decideApproval(approvalId, body.decision);
    return NextResponse.json({ approval });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
