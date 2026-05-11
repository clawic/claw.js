import { setTimeout as delay } from "node:timers/promises";

import type { RelayConfig } from "../config.ts";
import type { RelayDatabase } from "../db.ts";
import type { RelayLogger } from "../logger.ts";

export interface MagicLinkConfig {
  enabled: boolean;
  fromAddress: string;
  driver: "console" | "smtp" | "resend";
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
  };
  resendApiKey?: string;
  ttlSec: number;
  defaultTenantId: string;
  loginUrlTemplate: string;
}

export function loadMagicLinkConfig(config: RelayConfig): MagicLinkConfig {
  const driverEnv = (process.env.RELAY_MAGIC_LINK_DRIVER ?? "console").toLowerCase();
  const driver: MagicLinkConfig["driver"] =
    driverEnv === "smtp" || driverEnv === "resend" || driverEnv === "console"
      ? driverEnv
      : "console";
  return {
    enabled: process.env.RELAY_MAGIC_LINK_DISABLE !== "1",
    fromAddress: process.env.RELAY_MAGIC_LINK_FROM ?? "relay@localhost",
    driver,
    ttlSec: Number(process.env.RELAY_MAGIC_LINK_TTL_SEC ?? "900"),
    defaultTenantId: process.env.RELAY_MAGIC_LINK_TENANT_ID ?? "demo-tenant",
    loginUrlTemplate:
      process.env.RELAY_MAGIC_LINK_URL_TEMPLATE ??
      `${config.publicBaseUrl.replace(/\/$/, "")}/v1/auth/magic-link/callback?token={{token}}`,
    smtp: process.env.RELAY_SMTP_HOST
      ? {
          host: process.env.RELAY_SMTP_HOST,
          port: Number(process.env.RELAY_SMTP_PORT ?? "587"),
          secure: process.env.RELAY_SMTP_SECURE === "1",
          ...(process.env.RELAY_SMTP_USER ? { user: process.env.RELAY_SMTP_USER } : {}),
          ...(process.env.RELAY_SMTP_PASSWORD ? { password: process.env.RELAY_SMTP_PASSWORD } : {}),
        }
      : undefined,
    resendApiKey: process.env.RELAY_RESEND_API_KEY,
  };
}

export interface MagicLinkRequest {
  email: string;
  tenantId?: string;
  purpose?: "sign-in" | "device-register";
  deviceLabel?: string;
  platform?: string;
}

export class MagicLinkService {
  constructor(
    private readonly db: RelayDatabase,
    private readonly logger: RelayLogger,
    private readonly config: MagicLinkConfig,
  ) {}

  async issue(request: MagicLinkRequest): Promise<{ delivered: boolean; reason?: string }> {
    if (!this.config.enabled) {
      return { delivered: false, reason: "magic_link_disabled" };
    }
    const tenantId = request.tenantId ?? this.config.defaultTenantId;
    const purpose = request.purpose ?? "sign-in";
    const token = this.db.createMagicLinkToken({
      email: request.email,
      tenantId,
      purpose,
      deviceLabel: request.deviceLabel,
      platform: request.platform,
      ttlSec: this.config.ttlSec,
    });
    const url = this.config.loginUrlTemplate.replace("{{token}}", encodeURIComponent(token.token));
    return this.deliver(request.email, url);
  }

  consume(token: string): {
    email: string;
    tenantId: string;
    purpose: "sign-in" | "device-register";
    deviceLabel: string | null;
    platform: string | null;
  } | null {
    return this.db.consumeMagicLinkToken(token);
  }

  private async deliver(email: string, url: string): Promise<{ delivered: boolean; reason?: string }> {
    if (this.config.driver === "console") {
      this.logger.info(`[magic-link] ${email} -> ${url}`);
      return { delivered: true };
    }
    if (this.config.driver === "resend") {
      if (!this.config.resendApiKey) {
        this.logger.warn("[magic-link] driver=resend but RELAY_RESEND_API_KEY missing; falling back to console");
        this.logger.info(`[magic-link] ${email} -> ${url}`);
        return { delivered: true, reason: "fallback_console" };
      }
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.config.resendApiKey}`,
          },
          body: JSON.stringify({
            from: this.config.fromAddress,
            to: email,
            subject: "Sign in to clawjs relay",
            html: renderMagicLinkBody(url),
          }),
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          this.logger.warn(`[magic-link] resend failed status=${response.status} body=${text}`);
          return { delivered: false, reason: "resend_failed" };
        }
        return { delivered: true };
      } catch (error) {
        this.logger.warn(`[magic-link] resend error: ${error instanceof Error ? error.message : String(error)}`);
        return { delivered: false, reason: "resend_error" };
      }
    }
    if (this.config.driver === "smtp") {
      const result = await trySmtpDelivery(this.config, email, url, this.logger);
      return result;
    }
    return { delivered: false, reason: "no_driver" };
  }
}

function renderMagicLinkBody(url: string): string {
  return `<p>Click the link below to sign in to your relay account.</p>
<p><a href="${url}">Sign in to relay</a></p>
<p>The link expires in 15 minutes. If you did not request this email, ignore it.</p>`;
}

async function trySmtpDelivery(
  config: MagicLinkConfig,
  email: string,
  url: string,
  logger: RelayLogger,
): Promise<{ delivered: boolean; reason?: string }> {
  const smtp = config.smtp;
  if (!smtp) {
    logger.warn("[magic-link] driver=smtp but RELAY_SMTP_HOST missing; falling back to console");
    logger.info(`[magic-link] ${email} -> ${url}`);
    return { delivered: true, reason: "fallback_console" };
  }
  try {
    const nodemailerModule = await import("nodemailer").catch(() => null);
    if (!nodemailerModule) {
      logger.warn("[magic-link] nodemailer not installed; install `nodemailer` for SMTP delivery");
      logger.info(`[magic-link] ${email} -> ${url}`);
      return { delivered: true, reason: "fallback_console" };
    }
    const nodemailer = (nodemailerModule as { default?: typeof import("nodemailer"); createTransport?: unknown });
    const createTransport = (nodemailer.default ?? nodemailer).createTransport as (opts: unknown) => {
      sendMail: (opts: unknown) => Promise<unknown>;
    };
    const transport = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      ...(smtp.user || smtp.password
        ? { auth: { user: smtp.user ?? "", pass: smtp.password ?? "" } }
        : {}),
    });
    await transport.sendMail({
      from: config.fromAddress,
      to: email,
      subject: "Sign in to clawjs relay",
      html: renderMagicLinkBody(url),
    });
    await delay(0);
    return { delivered: true };
  } catch (error) {
    logger.warn(`[magic-link] smtp error: ${error instanceof Error ? error.message : String(error)}`);
    return { delivered: false, reason: "smtp_error" };
  }
}
