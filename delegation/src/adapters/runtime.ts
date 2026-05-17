import type { AgentWorker, DelegationNode } from "../shared/types.ts";

export interface RuntimeAdapterRunContext {
  node: DelegationNode;
  worker: AgentWorker;
}

export interface RuntimeAdapterRunResult {
  status: "succeeded" | "failed";
  output: Record<string, unknown>;
  errorMessage?: string;
}

interface RuntimeAdapter {
  name: string;
  canRun(node: DelegationNode, worker: AgentWorker): boolean;
  startRun(context: RuntimeAdapterRunContext): Promise<RuntimeAdapterRunResult>;
  streamEvent(event: Record<string, unknown>): Promise<void>;
  cancelRun(runId: string): Promise<void>;
  summarizeChildResults(parentNode: DelegationNode, childNodes: DelegationNode[]): Promise<Record<string, unknown>>;
}

export class DeterministicRuntimeAdapter implements RuntimeAdapter {
  readonly name = "deterministic";

  canRun(node: DelegationNode, worker: AgentWorker): boolean {
    return node.adapter === this.name && worker.adapter === this.name;
  }

  async startRun(context: RuntimeAdapterRunContext): Promise<RuntimeAdapterRunResult> {
    const plan = context.node.input.deterministic;
    if (plan && typeof plan === "object" && "fail" in plan) {
      return {
        status: "failed",
        output: { adapter: this.name },
        errorMessage: String((plan as Record<string, unknown>).fail || "deterministic failure"),
      };
    }
    return {
      status: "succeeded",
      output: {
        adapter: this.name,
        nodeId: context.node.id,
        result: (plan && typeof plan === "object" && "result" in plan)
          ? (plan as Record<string, unknown>).result
          : context.node.objective,
      },
    };
  }

  async streamEvent(_event: Record<string, unknown>): Promise<void> {
  }

  async cancelRun(_runId: string): Promise<void> {
  }

  async summarizeChildResults(parentNode: DelegationNode, childNodes: DelegationNode[]): Promise<Record<string, unknown>> {
    return {
      continuationOf: parentNode.id,
      childResults: childNodes.map((node) => ({
        id: node.id,
        title: node.title,
        status: node.status,
        result: node.result,
        errorMessage: node.errorMessage,
      })),
    };
  }
}
