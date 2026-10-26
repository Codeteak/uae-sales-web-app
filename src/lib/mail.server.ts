/**
 * Server-only Gmail/SMTP mailer for Yaadro.
 * Load only from server handlers:
 *   const { sendAppEmail, isMailConfigured } = await import("@/lib/mail.server");
 *
 * Auth emails (signup confirm, password reset) are sent by Supabase Auth —
 * configure the same SMTP values in Supabase → Authentication → SMTP Settings.
 */
import nodemailer from "nodemailer";

export type AppEmail = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function isMailConfigured(): boolean {
  return !!(env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS") && env("SMTP_FROM"));
}

function smtpPort(): number {
  const n = Number(env("SMTP_PORT") || "587");
  return Number.isFinite(n) && n > 0 ? n : 587;
}

function createTransport() {
  if (!isMailConfigured()) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in env.",
    );
  }
  const port = smtpPort();
  const secure = env("SMTP_SECURE") === "true" || port === 465;
  return nodemailer.createTransport({
    host: env("SMTP_HOST"),
    port,
    secure,
    auth: {
      user: env("SMTP_USER"),
      pass: env("SMTP_PASS"),
    },
  });
}

/** Send an application email (CRM notices, admin tests, etc.). */
export async function sendAppEmail(message: AppEmail): Promise<{ messageId: string }> {
  const transport = createTransport();
  const info = await transport.sendMail({
    from: env("SMTP_FROM"),
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: message.replyTo || env("SMTP_REPLY_TO") || undefined,
  });
  return { messageId: info.messageId };
}

/** Verify SMTP credentials (throws on failure). */
export async function verifySmtpConnection(): Promise<void> {
  const transport = createTransport();
  await transport.verify();
}
