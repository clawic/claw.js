import { runIssue } from "@/lib/company-agent";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Streams the agent reply for an issue using Server-Sent Events. Each chunk
 * is emitted as `data: {"delta":"..."}` and the stream ends with a final
 * `data: {"done":true,"comment":...,"run":...}` frame.
 */
export async function POST(_request: Request, context: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await context.params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      try {
        send({ phase: "started" });
        const result = await runIssue({
          issueId,
          onDelta: (delta) => send({ delta }),
        });
        send({ done: true, comment: result.comment, run: result.run });
      } catch (error) {
        send({
          done: true,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
