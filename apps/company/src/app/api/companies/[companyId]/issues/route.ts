import { NextResponse } from "next/server";
import { createIssue, listIssues } from "@/lib/company-service";
import { LOCAL_BOARD_USER_ID } from "@/lib/company-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await context.params;
    const issues = await listIssues(companyId);
    return NextResponse.json({ issues });
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
      title?: string;
      description?: string;
      priority?: "low" | "medium" | "high" | "urgent";
      assigneeAgentId?: string;
      projectId?: string;
      portfolioId?: string;
      portfolioItemId?: string;
      goalId?: string;
      parentId?: string;
      workType?: "feature" | "bug" | "ops" | "support" | "research" | "launch" | "maintenance";
      sourceDomain?: "strategy" | "execution" | "operations" | "feedback";
      autonomous?: boolean;
      approvalState?: "not_required" | "pending" | "approved" | "rejected";
      dueAt?: string;
    };
    if (!body.title?.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    const issue = await createIssue({
      companyId,
      title: body.title,
      description: body.description,
      priority: body.priority,
      assigneeAgentId: body.assigneeAgentId,
      projectId: body.projectId,
      portfolioId: body.portfolioId,
      portfolioItemId: body.portfolioItemId,
      goalId: body.goalId,
      parentId: body.parentId,
      createdByUserId: LOCAL_BOARD_USER_ID,
      workType: body.workType,
      sourceDomain: body.sourceDomain,
      autonomous: body.autonomous,
      approvalState: body.approvalState,
      dueAt: body.dueAt,
    });
    return NextResponse.json({ issue }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
