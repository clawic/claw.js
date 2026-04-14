import { NextResponse } from "next/server";
import { buildCompanyDetail } from "@/lib/company-summary";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(_request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await context.params;
    const detail = await buildCompanyDetail(companyId);
    return NextResponse.json({ summary: detail.summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
