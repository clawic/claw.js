import { NextResponse } from "next/server";
import { createFeedbackItem, listFeedbackItems } from "@/lib/company-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await context.params;
    const feedbackItems = await listFeedbackItems(companyId);
    return NextResponse.json({ feedbackItems });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await context.params;
    const body = (await request.json()) as {
      portfolioItemId?: string;
      projectId?: string;
      title?: string;
      body?: string;
      status?: "new" | "triaged" | "planned" | "closed" | "ignored";
      priority?: "low" | "medium" | "high" | "urgent";
      sourceType?: "review" | "support" | "interview" | "sales" | "ops" | "internal" | "import" | "other";
      sourceLabel?: string;
      customerName?: string;
      customerSegment?: string;
      sentiment?: "positive" | "neutral" | "negative" | "mixed";
      receivedAt?: string;
      ownerAgentId?: string;
      linkedIssueId?: string;
      metadata?: Record<string, unknown>;
    };
    if (!body.title?.trim() || !body.body?.trim() || !body.sourceType) {
      return NextResponse.json({ error: "title, body, and sourceType are required" }, { status: 400 });
    }
    const feedback = await createFeedbackItem({
      companyId,
      portfolioItemId: body.portfolioItemId,
      projectId: body.projectId,
      title: body.title,
      body: body.body,
      status: body.status,
      priority: body.priority,
      sourceType: body.sourceType,
      sourceLabel: body.sourceLabel,
      customerName: body.customerName,
      customerSegment: body.customerSegment,
      sentiment: body.sentiment,
      receivedAt: body.receivedAt,
      ownerAgentId: body.ownerAgentId,
      linkedIssueId: body.linkedIssueId,
      metadata: body.metadata,
    });
    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
