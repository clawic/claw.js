# clawix-relay deployment

This directory contains the canonical assets to self-host a clawix-relay
coordinator + iroh-relay forwarder. The relay is multi-tenant capable but
intended for single-operator deployments by default.

## Goal

A user with a domain name and a Hetzner (or any VPS) account can be up and
running in well under five minutes, with:

- HTTPS terminated by Caddy via Let's Encrypt.
- Magic-link sign-in for owner + invited members.
- Pre-auth keys for headless remote agents.
- iroh-relay forwarding embedded in the same container so iOS/macOS clients
  can fall back to relayed P2P when hole-punching fails.

## Quick start (Hetzner)

1. Create an A/AAAA record pointing your domain at the new server's IP.
2. Generate a JWT secret locally: `openssl rand -base64 48`.
3. Open Hetzner Cloud, create a `cx21` (Ubuntu 22.04 LTS) and paste
   `hetzner-cloud-init.yml` into the **User data** field. Update the
   placeholders in the `write_files: .env` block first.
4. Boot the VM. After ~60s, visit `https://<your-domain>` and sign in with
   the owner email by requesting a magic link.

## Quick start (any VPS / Pi)

```bash
git clone https://github.com/clawix/clawjs.git
cd clawjs/relay
docker build -t clawix-relay:latest .
cd deploy
cp ../../.env.example .env   # edit
docker compose up -d
```

## Day-2

- `docker compose logs -f relay` shows magic links if you keep the console
  driver enabled. Use `RELAY_MAGIC_LINK_DRIVER=resend` or `smtp` for real
  email delivery.
- `docker compose exec relay node dist/cli.js authkey create --label foo` to
  issue a pre-auth key for a headless agent.
- Backups: persist the `relay_data` volume (`/var/lib/clawix-relay/`).

## Ports

| Port | Protocol | Why |
|------|----------|-----|
| 80   | TCP      | Caddy HTTP-01 challenge (redirects to 443) |
| 443  | TCP      | HTTPS API + admin UI |
| 7842 | TCP      | iroh-relay forwarder (relayed P2P fallback) |
| 3478 | UDP      | STUN-style hole punching assistance |
