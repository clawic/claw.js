import { NextResponse } from "next/server";
import { createPortfolioItem, listPortfolioItems } from "@/lib/company-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await context.params;
    const portfolioItems = await listPortfolioItems(companyId);
    return NextResponse.json({ portfolioItems });
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
      portfolioId?: string;
      name?: string;
      itemType?: "app" | "web" | "saas" | "client" | "brand" | "store" | "service" | "internal" | "other";
      status?: "active" | "paused" | "at_risk" | "archived";
      lifecycleStage?: "idea" | "validating" | "building" | "launched" | "scaling" | "sustaining" | "sunset";
      description?: string;
      ownerAgentId?: string;
      healthStatus?: "green" | "yellow" | "red" | "unknown";
      priority?: "low" | "medium" | "high" | "urgent";
      targetDate?: string;
      tags?: string[];
      sourceSystem?: string;
      metadata?: Record<string, unknown>;
    };
    if (!body.portfolioId || !body.name?.trim() || !body.itemType) {
      return NextResponse.json({ error: "portfolioId, name, and itemType are required" }, { status: 400 });
    }
    const portfolioItem = await createPortfolioItem({
      companyId,
      portfolioId: body.portfolioId,
      name: body.name,
      itemType: body.itemType,
      status: body.status,
      lifecycleStage: body.lifecycleStage,
      description: body.description,
      ownerAgentId: body.ownerAgentId,
      healthStatus: body.healthStatus,
      priority: body.priority,
      targetDate: body.targetDate,
      tags: body.tags,
      sourceSystem: body.sourceSystem,
      metadata: body.metadata,
    });
    return NextResponse.json({ portfolioItem }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
