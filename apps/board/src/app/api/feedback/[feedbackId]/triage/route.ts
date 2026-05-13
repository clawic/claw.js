import { NextResponse } from "next/server";
import { triageFeedback } from "@/lib/company-agent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request, context: { params: Promise<{ feedbackId: string }> }) {
  try {
    const { feedbackId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      actorAgentId?: string;
      createIssueFromFeedback?: boolean;
    };
    const result = await triageFeedback({
      feedbackId,
      actorAgentId: body.actorAgentId,
      createIssueFromFeedback: body.createIssueFromFeedback,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
