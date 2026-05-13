import { NextResponse } from "next/server";
import { createPortfolio, listPortfolios } from "@/lib/company-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await context.params;
    const portfolios = await listPortfolios(companyId);
    return NextResponse.json({ portfolios });
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
      name?: string;
      description?: string;
      ownerAgentId?: string;
      priority?: "low" | "medium" | "high" | "urgent";
      color?: string;
      status?: "active" | "paused" | "archived";
    };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const portfolio = await createPortfolio({
      companyId,
      name: body.name,
      description: body.description,
      ownerAgentId: body.ownerAgentId,
      priority: body.priority,
      color: body.color,
      status: body.status,
    });
    return NextResponse.json({ portfolio }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
