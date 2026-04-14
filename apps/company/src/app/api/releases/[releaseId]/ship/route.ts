import { NextResponse } from "next/server";
import { shipRelease } from "@/lib/company-agent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(_request: Request, context: { params: Promise<{ releaseId: string }> }) {
  try {
    const { releaseId } = await context.params;
    const release = await shipRelease(releaseId);
    return NextResponse.json({ release });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
