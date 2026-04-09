import { NextResponse } from "next/server";
import {
  deleteCompany,
  getCompany,
  listAgents,
  listApprovals,
  listGoals,
  listIssues,
  listProjects,
  listRuns,
  updateCompany,
} from "@/lib/company-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await context.params;
    const company = await getCompany(companyId);
    if (!company) return NextResponse.json({ error: "company_not_found" }, { status: 404 });
    const [agents, issues, approvals, goals, projects, runs] = await Promise.all([
      listAgents(companyId),
      listIssues(companyId),
      listApprovals(companyId),
      listGoals(companyId),
      listProjects(companyId),
      listRuns(companyId),
    ]);
    return NextResponse.json({ company, agents, issues, approvals, goals, projects, runs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const updated = await updateCompany(companyId, body);
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await context.params;
    await deleteCompany(companyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
