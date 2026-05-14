import type { FastifyReply, FastifyRequest } from "fastify";

export function requireFreshHostReauth(
  req: FastifyRequest,
  reply: FastifyReply,
  requireSignedHost: (req: FastifyRequest, reply: FastifyReply) => boolean,
): boolean {
  if (!requireSignedHost(req, reply)) return false;
  const body = (req.body ?? {}) as { reauthSatisfied?: boolean };
  if (body.reauthSatisfied === true) return true;
  void reply.code(403).send({ error: "fresh reauthentication required" });
  return false;
}
