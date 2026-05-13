import { NextResponse } from "next/server";
import { createCompany, listCompanies } from "@/lib/company-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const companies = await listCompanies();
    return NextResponse.json({ companies });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      brandColor?: string;
      requireBoardApprovalForNewAgents?: boolean;
    };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const result = await createCompany({
      name: body.name,
      description: body.description,
      brandColor: body.brandColor,
      requireBoardApprovalForNewAgents: body.requireBoardApprovalForNewAgents,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
