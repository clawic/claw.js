import { NextResponse } from "next/server";
import { createOperationalIncident, listOperationalIncidents } from "@/lib/company-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await context.params;
    const operationalIncidents = await listOperationalIncidents(companyId);
    return NextResponse.json({ operationalIncidents });
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
      checkId?: string;
      title?: string;
      status?: "open" | "investigating" | "mitigated" | "resolved" | "cancelled";
      severity?: "sev1" | "sev2" | "sev3" | "sev4";
      startedAt?: string;
      ownerAgentId?: string;
      summary?: string;
      resolution?: string;
      linkedIssueId?: string;
      metadata?: Record<string, unknown>;
    };
    if (!body.title?.trim() || !body.severity) {
      return NextResponse.json({ error: "title and severity are required" }, { status: 400 });
    }
    const operationalIncident = await createOperationalIncident({
      companyId,
      portfolioItemId: body.portfolioItemId,
      projectId: body.projectId,
      checkId: body.checkId,
      title: body.title,
      status: body.status,
      severity: body.severity,
      startedAt: body.startedAt,
      ownerAgentId: body.ownerAgentId,
      summary: body.summary,
      resolution: body.resolution,
      linkedIssueId: body.linkedIssueId,
      metadata: body.metadata,
    });
    return NextResponse.json({ operationalIncident }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
