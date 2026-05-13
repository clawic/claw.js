import { NextResponse } from "next/server";
import {
  createFeedbackItem,
  createImportBatch,
  createMetricSnapshot,
  createOperationalCheck,
  createOperationalIncident,
  listImportBatches,
  updateImportBatch,
} from "@/lib/company-service";
import { LOCAL_BOARD_USER_ID } from "@/lib/company-types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await context.params;
    const imports = await listImportBatches(companyId);
    return NextResponse.json({ imports });
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
      type?: "feedback" | "metrics" | "checks" | "incidents" | "mixed";
      sourceLabel?: string;
      summary?: string;
      items?: Array<Record<string, unknown>>;
    };
    if (!body.type) {
      return NextResponse.json({ error: "type is required" }, { status: 400 });
    }
    const batch = await createImportBatch({
      companyId,
      type: body.type,
      sourceLabel: body.sourceLabel,
      summary: body.summary,
      createdByUserId: LOCAL_BOARD_USER_ID,
      counts: { received: body.items?.length ?? 0 },
    });

    const items = body.items ?? [];
    for (const item of items) {
      if (body.type === "metrics" || body.type === "mixed") {
        if (typeof item.metricKey === "string" && typeof item.metricLabel === "string" && typeof item.value === "number") {
          await createMetricSnapshot({
            companyId,
            metricKey: item.metricKey,
            metricLabel: item.metricLabel,
            value: item.value,
            direction: (item.direction as "up_good" | "down_good" | "neutral") ?? "neutral",
            capturedAt: typeof item.capturedAt === "string" ? item.capturedAt : new Date().toISOString(),
            sourceType: "import",
            unit: typeof item.unit === "string" ? item.unit : undefined,
            period: typeof item.period === "string" ? item.period : undefined,
            portfolioId: typeof item.portfolioId === "string" ? item.portfolioId : undefined,
            portfolioItemId: typeof item.portfolioItemId === "string" ? item.portfolioItemId : undefined,
            projectId: typeof item.projectId === "string" ? item.projectId : undefined,
            metadata: typeof item.metadata === "object" && item.metadata ? item.metadata as Record<string, unknown> : undefined,
          });
        }
      }
      if (body.type === "feedback" || body.type === "mixed") {
        if (typeof item.title === "string" && typeof item.body === "string") {
          await createFeedbackItem({
            companyId,
            title: item.title,
            body: item.body,
            sourceType: (item.sourceType as "review" | "support" | "interview" | "sales" | "ops" | "internal" | "import" | "other") ?? "import",
            status: (item.status as "new" | "triaged" | "planned" | "closed" | "ignored") ?? "new",
            priority: (item.priority as "low" | "medium" | "high" | "urgent") ?? "medium",
            receivedAt: typeof item.receivedAt === "string" ? item.receivedAt : new Date().toISOString(),
            portfolioItemId: typeof item.portfolioItemId === "string" ? item.portfolioItemId : undefined,
            projectId: typeof item.projectId === "string" ? item.projectId : undefined,
            sourceLabel: typeof item.sourceLabel === "string" ? item.sourceLabel : body.sourceLabel,
            metadata: typeof item.metadata === "object" && item.metadata ? item.metadata as Record<string, unknown> : undefined,
          });
        }
      }
      if (body.type === "checks" || body.type === "mixed") {
        if (typeof item.name === "string" && typeof item.domain === "string" && typeof item.status === "string" && typeof item.severity === "string") {
          await createOperationalCheck({
            companyId,
            name: item.name,
            domain: item.domain as "availability" | "quality" | "delivery" | "compliance" | "support" | "growth" | "custom",
            status: item.status as "ok" | "degraded" | "failed" | "unknown",
            severity: item.severity as "info" | "warning" | "critical",
            sourceType: "import",
            portfolioItemId: typeof item.portfolioItemId === "string" ? item.portfolioItemId : undefined,
            projectId: typeof item.projectId === "string" ? item.projectId : undefined,
            detail: typeof item.detail === "string" ? item.detail : undefined,
            lastObservedAt: typeof item.lastObservedAt === "string" ? item.lastObservedAt : undefined,
            metadata: typeof item.metadata === "object" && item.metadata ? item.metadata as Record<string, unknown> : undefined,
          });
        }
      }
      if (body.type === "incidents" || body.type === "mixed") {
        if (typeof item.title === "string" && typeof item.severity === "string") {
          await createOperationalIncident({
            companyId,
            title: item.title,
            severity: item.severity as "sev1" | "sev2" | "sev3" | "sev4",
            status: (item.status as "open" | "investigating" | "mitigated" | "resolved" | "cancelled") ?? "open",
            startedAt: typeof item.startedAt === "string" ? item.startedAt : new Date().toISOString(),
            portfolioItemId: typeof item.portfolioItemId === "string" ? item.portfolioItemId : undefined,
            projectId: typeof item.projectId === "string" ? item.projectId : undefined,
            summary: typeof item.summary === "string" ? item.summary : undefined,
            resolution: typeof item.resolution === "string" ? item.resolution : undefined,
            metadata: typeof item.metadata === "object" && item.metadata ? item.metadata as Record<string, unknown> : undefined,
          });
        }
      }
    }

    const completed = await updateImportBatch(batch.id, {
      status: "completed",
      finishedAt: new Date().toISOString(),
      counts: { received: items.length, imported: items.length },
    });

    return NextResponse.json({ importBatch: completed }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
