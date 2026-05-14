import { clawApiPath } from "@clawjs/core";
// HTTP fulfillment endpoints for cloud adapters (Google Home, Alexa).
//
// Both Google and Alexa expect a single public URL that receives
// signed POSTs with the user's voice / app commands. The daemon
// exposes those endpoints here; the user fronts them with their own
// tunnel (Cloudflare Tunnel, ngrok, self-hosted relay) so Google /
// Amazon servers can reach them.
//
// Authentication: each provider supplies a long-lived bearer (the
// OAuth client_secret the user configured in their cloud console).
// We compare against the secret the wizard pasted; rejecting on
// mismatch keeps the endpoint useless to anyone who scrapes the URL.

import type { FastifyInstance, FastifyRequest } from "fastify";

import type { GoogleHomeAdapter } from "./adapters/google-home.ts";
import type { AlexaAdapter } from "./adapters/alexa.ts";

export interface CloudFulfillmentContext {
  googleHome: GoogleHomeAdapter;
  alexa: AlexaAdapter;
}

export function registerCloudFulfillmentRoutes(app: FastifyInstance, context: CloudFulfillmentContext): void {
  app.post(clawApiPath("cloud/google/fulfillment"), async (request, reply) => {
    if (!context.googleHome.authenticate(extractBearer(request))) {
      reply.code(401);
      return { errorCode: "authFailure" };
    }
    const body = (request.body ?? {}) as {
      requestId: string;
      inputs: Array<{ intent: string; payload?: Record<string, unknown> }>;
    };
    return context.googleHome.handleFulfillment(body);
  });

  app.post(clawApiPath("cloud/alexa/fulfillment"), async (request, reply) => {
    if (!context.alexa.authenticate(extractBearer(request))) {
      reply.code(401);
      return {
        event: {
          header: { namespace: "Alexa", name: "ErrorResponse", payloadVersion: "3", messageId: `err-${Date.now()}` },
          payload: { type: "INVALID_AUTHORIZATION_CREDENTIAL", message: "Bearer rejected." },
        },
      };
    }
    const body = (request.body ?? {}) as Parameters<AlexaAdapter["handleFulfillment"]>[0];
    return context.alexa.handleFulfillment(body);
  });
}

function extractBearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization ?? request.headers.Authorization;
  if (typeof header !== "string") return null;
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim() || null;
}
