# syntax=docker/dockerfile:1.6
# clawix-relay container: Fastify coordinator + iroh-relay forwarder.
# Builds the UI and server, then runs from a slim Node image with the
# iroh-relay binary copied in from its public release.

FROM node:20-bookworm-slim AS builder
WORKDIR /workspace

COPY package.json package-lock.json* ./
COPY ui/package.json ui/package-lock.json* ./ui/
RUN npm install --workspaces=false --no-audit --no-fund \
  && npm --prefix ui install --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl tini \
  && rm -rf /var/lib/apt/lists/*

# Pull a recent iroh-relay binary. Override IROH_RELAY_URL at build time
# to pin a specific version; default tracks the latest release.
ARG IROH_RELAY_URL=https://github.com/n0-computer/iroh/releases/latest/download/iroh-relay-linux-x86_64.tar.gz
ARG TARGETARCH=amd64
RUN set -eux; \
  case "$TARGETARCH" in \
    arm64) URL="${IROH_RELAY_URL//x86_64/aarch64}";; \
    *) URL="$IROH_RELAY_URL";; \
  esac; \
  curl -L --fail "$URL" -o /tmp/iroh-relay.tgz; \
  tar -xzf /tmp/iroh-relay.tgz -C /usr/local/bin --strip-components=1 iroh-relay 2>/dev/null \
    || tar -xzf /tmp/iroh-relay.tgz -C /usr/local/bin iroh-relay 2>/dev/null \
    || cp /tmp/iroh-relay /usr/local/bin/iroh-relay 2>/dev/null \
    || true; \
  chmod +x /usr/local/bin/iroh-relay || true; \
  rm -f /tmp/iroh-relay.tgz

COPY --from=builder /workspace/package.json /workspace/package-lock.json* ./
COPY --from=builder /workspace/dist ./dist
COPY --from=builder /workspace/ui/dist ./ui/dist
COPY --from=builder /workspace/node_modules ./node_modules

ENV PORT=4410 \
    RELAY_HOST=0.0.0.0 \
    RELAY_DB_PATH=/var/lib/clawix-relay/relay.sqlite \
    RELAY_IROH_RELAY_BIN=/usr/local/bin/iroh-relay
RUN mkdir -p /var/lib/clawix-relay

EXPOSE 4410
EXPOSE 3478/udp
EXPOSE 7842

HEALTHCHECK --interval=30s --timeout=5s --retries=5 \
  CMD curl -fsS http://127.0.0.1:4410/v1/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server.js"]
