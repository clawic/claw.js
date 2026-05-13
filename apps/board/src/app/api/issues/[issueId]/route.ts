import { NextResponse } from "next/server";
import { getIssue, listIssueComments, updateIssue } from "@/lib/company-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, context: { params: Promise<{ issueId: string }> }) {
  try {
    const { issueId } = await context.params;
    const issue = await getIssue(issueId);
    if (!issue) return NextResponse.json({ error: "issue_not_found" }, { status: 404 });
    const comments = await listIssueComments(issueId);
    return NextResponse.json({ issue, comments });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ issueId: string }> }) {
  try {
    const { issueId } = await context.params;
    const patch = (await request.json()) as Record<string, unknown>;
    const updated = await updateIssue(issueId, patch);
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
