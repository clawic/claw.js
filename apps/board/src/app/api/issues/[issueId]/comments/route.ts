import { NextResponse } from "next/server";
import {
  createIssueComment,
  getIssue,
  listIssueComments,
} from "@/lib/company-service";
import { LOCAL_BOARD_USER_ID } from "@/lib/company-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, context: { params: Promise<{ issueId: string }> }) {
  try {
    const { issueId } = await context.params;
    const comments = await listIssueComments(issueId);
    return NextResponse.json({ comments });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: { params: Promise<{ issueId: string }> }) {
  try {
    const { issueId } = await context.params;
    const body = (await request.json()) as { body?: string };
    if (!body.body?.trim()) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }
    const issue = await getIssue(issueId);
    if (!issue) return NextResponse.json({ error: "issue_not_found" }, { status: 404 });
    const comment = await createIssueComment({
      companyId: issue.companyId,
      issueId,
      body: body.body,
      authorUserId: LOCAL_BOARD_USER_ID,
    });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
