import { NextResponse } from "next/server";
import { createAgent, listAgents } from "@/lib/company-service";
import { requestHire } from "@/lib/company-agent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, context: { params: Promise<{ companyId: string }> }) {
  try {
    const { companyId } = await context.params;
    const agents = await listAgents(companyId);
    return NextResponse.json({ agents });
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
      role?: string;
      title?: string;
      capabilities?: string;
      reportsTo?: string;
      icon?: string;
    };
    if (!body.name?.trim() || !body.role?.trim() || !body.title?.trim()) {
      return NextResponse.json({ error: "name, role and title are required" }, { status: 400 });
    }
    const agent = await createAgent({
      companyId,
      name: body.name,
      role: body.role,
      title: body.title,
      capabilities: body.capabilities,
      reportsTo: body.reportsTo,
      icon: body.icon,
    });
    const hire = await requestHire({
      companyId,
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      title: agent.title,
      capabilities: agent.capabilities,
      reportsTo: agent.reportsTo,
      icon: agent.icon,
    });
    return NextResponse.json({ agent, ...hire }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
