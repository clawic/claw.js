import { NextResponse } from "next/server";
import { resolveIncident } from "@/lib/company-agent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request, context: { params: Promise<{ incidentId: string }> }) {
  try {
    const { incidentId } = await context.params;
    const body = (await request.json()) as { resolution?: string; force?: boolean };
    if (!body.resolution?.trim()) {
      return NextResponse.json({ error: "resolution is required" }, { status: 400 });
    }
    const result = await resolveIncident({
      incidentId,
      resolution: body.resolution,
      force: body.force,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
