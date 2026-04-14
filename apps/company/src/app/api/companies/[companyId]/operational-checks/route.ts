import { NextResponse } from "next/server";
import { createOperationalCheck, listOperationalChecks } from "@/lib/company-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await context.params;
    const operationalChecks = await listOperationalChecks(companyId);
    return NextResponse.json({ operationalChecks });
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
    const body = await request.json() as Record<string, unknown> & {
      name?: string;
      domain?: "availability" | "quality" | "delivery" | "compliance" | "support" | "growth" | "custom";
      status?: "ok" | "degraded" | "failed" | "unknown";
      severity?: "info" | "warning" | "critical";
      sourceType?: "manual" | "import" | "monitor" | "derived";
    };
    if (!body.name || !body.domain || !body.status || !body.severity || !body.sourceType) {
      return NextResponse.json({ error: "name, domain, status, severity, and sourceType are required" }, { status: 400 });
    }
    const operationalCheck = await createOperationalCheck({
      companyId,
      name: String(body.name),
      domain: body.domain,
      status: body.status,
      severity: body.severity,
      sourceType: body.sourceType,
      portfolioItemId: typeof body.portfolioItemId === "string" ? body.portfolioItemId : undefined,
      projectId: typeof body.projectId === "string" ? body.projectId : undefined,
      lastObservedAt: typeof body.lastObservedAt === "string" ? body.lastObservedAt : undefined,
      detail: typeof body.detail === "string" ? body.detail : undefined,
      metricValue: typeof body.metricValue === "number" ? body.metricValue : undefined,
      metricUnit: typeof body.metricUnit === "string" ? body.metricUnit : undefined,
      ownerAgentId: typeof body.ownerAgentId === "string" ? body.ownerAgentId : undefined,
      metadata: typeof body.metadata === "object" && body.metadata ? body.metadata as Record<string, unknown> : undefined,
    });
    return NextResponse.json({ operationalCheck }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
