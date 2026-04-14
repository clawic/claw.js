import { NextResponse } from "next/server";
import { createRelease, listReleases } from "@/lib/company-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await context.params;
    const releases = await listReleases(companyId);
    return NextResponse.json({ releases });
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
      name?: string;
      status?: "planned" | "in_progress" | "blocked" | "released" | "cancelled";
      releaseType?: "launch" | "update" | "experiment" | "maintenance" | "internal";
      plannedAt?: string;
      summary?: string;
      ownerAgentId?: string;
      notes?: string;
      metadata?: Record<string, unknown>;
    };
    if (!body.name?.trim() || !body.releaseType) {
      return NextResponse.json({ error: "name and releaseType are required" }, { status: 400 });
    }
    const release = await createRelease({
      companyId,
      portfolioItemId: body.portfolioItemId,
      projectId: body.projectId,
      name: body.name,
      status: body.status,
      releaseType: body.releaseType,
      plannedAt: body.plannedAt,
      summary: body.summary,
      ownerAgentId: body.ownerAgentId,
      notes: body.notes,
      metadata: body.metadata,
    });
    return NextResponse.json({ release }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
