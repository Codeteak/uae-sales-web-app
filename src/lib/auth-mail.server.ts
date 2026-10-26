/**
 * Auth emails via app Gmail SMTP (not Supabase's mailer).
 * Uses service-role generateLink (does not send email) + sendAppEmail.
 *
 * Link lifetime is enforced by Supabase Auth “Email OTP expiry”.
 * Keep AUTH_LINK_EXPIRY_MINUTES in env equal to that dashboard value (default 60).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { appOriginFromEnv } from "@/lib/auth-api.server";
import { DEFAULT_AUTH_LINK_EXPIRY_MINUTES, formatAuthLinkExpiry } from "@/lib/auth-link-expiry";
import { BRAND } from "@/lib/brand";
import { isMailConfigured, sendAppEmail } from "@/lib/mail.server";

/** Matches Supabase Auth Email OTP expiry when AUTH_LINK_EXPIRY_MINUTES is set correctly. */
export function authLinkExpiryMinutes(): number {
  const n = Number(
    (process.env["AUTH_LINK_EXPIRY_MINUTES"] ?? String(DEFAULT_AUTH_LINK_EXPIRY_MINUTES)).trim(),
  );
  if (!Number.isFinite(n) || n < 5) return DEFAULT_AUTH_LINK_EXPIRY_MINUTES;
  if (n > 24 * 60) return 24 * 60;
  return Math.floor(n);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function requireSmtp() {
  if (!isMailConfigured()) {
    throw new Error("SMTP is not configured. Set SMTP_* in env.");
  }
}

function brandedAuthEmail(opts: {
  preview: string;
  heading: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  expiryMinutes: number;
}): { subject: string; text: string; html: string } {
  const exp = formatAuthLinkExpiry(opts.expiryMinutes);
  const origin = appOriginFromEnv();
  const logoUrl = origin ? `${origin}${BRAND.logo}` : "";

  const text = [
    `${BRAND.productName} — ${BRAND.tagline}`,
    "",
    opts.heading,
    "",
    opts.preview,
    "",
    `${opts.ctaLabel}: ${opts.ctaUrl}`,
    "",
    `${exp.detail}. After that, request a new link from the sign-in page.`,
    "",
    `If you did not request this, you can ignore this email.`,
    "",
    `— ${BRAND.productName} UAE sales team`,
    BRAND.poweredBy,
  ].join("\n");

  const logoBlock = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(BRAND.productName)}" width="140" style="display:block;margin:0 auto 20px;max-width:140px;height:auto" />`
    : `<p style="margin:0 0 16px;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;text-align:center">${escapeHtml(BRAND.productName)}</p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" />
<title>${escapeHtml(opts.heading)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
        <tr><td style="background:#0f172a;padding:20px 28px;text-align:center">
          <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.02em">${escapeHtml(BRAND.productName)}</p>
          <p style="margin:6px 0 0;font-size:12px;color:#94a3b8">${escapeHtml(BRAND.tagline)}</p>
        </td></tr>
        <tr><td style="padding:28px">
          ${logoBlock}
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${escapeHtml(opts.heading)}</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#334155">${opts.bodyHtml}</p>
          <p style="margin:0 0 24px;text-align:center">
            <a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:8px">${escapeHtml(opts.ctaLabel)}</a>
          </p>
          <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px">
            <strong>${escapeHtml(exp.detail)}.</strong> Request a new link after it expires.
          </p>
          <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;word-break:break-all">Or paste this URL into your browser:<br />${escapeHtml(opts.ctaUrl)}</p>
        </td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;text-align:center">
          <p style="margin:0;font-size:12px;color:#64748b">${escapeHtml(BRAND.productName)} UAE sales account</p>
          <p style="margin:4px 0 0;font-size:11px;color:#94a3b8">${escapeHtml(BRAND.poweredBy)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: `${opts.heading} — ${BRAND.productName}`, text, html };
}

export type PasswordResetResult =
  | { ok: true }
  | { ok: false; code: "not_found" | "link_failed"; error: string };

/** Password reset — requires an existing Yaadro profile for that email. */
export async function sendPasswordResetEmail(email: string): Promise<PasswordResetResult> {
  requireSmtp();
  const normalized = email.trim().toLowerCase();

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .ilike("email", normalized)
    .maybeSingle();

  if (profileError) {
    console.error("[auth-mail] profile lookup", profileError);
    throw profileError;
  }
  if (!profile) {
    return {
      ok: false,
      code: "not_found",
      error: `No ${BRAND.productName} account found for that email. Check the address or ask an administrator.`,
    };
  }

  const origin = appOriginFromEnv();
  const expiryMinutes = authLinkExpiryMinutes();
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "recovery",
    email: profile.email || normalized,
    options: {
      redirectTo: origin ? `${origin}/reset-password` : undefined,
    },
  });
  if (error) {
    console.warn("[auth-mail] recovery link", error.message);
    if (/not\s*found|unable to find|no user/i.test(error.message)) {
      return {
        ok: false,
        code: "not_found",
        error: `No ${BRAND.productName} account found for that email. Check the address or ask an administrator.`,
      };
    }
    return { ok: false, code: "link_failed", error: "Could not create a reset link. Try again." };
  }
  const link = data.properties?.action_link;
  if (!link) {
    return { ok: false, code: "link_failed", error: "Could not create a reset link. Try again." };
  }

  const exp = formatAuthLinkExpiry(expiryMinutes);
  const mail = brandedAuthEmail({
    preview: `Use this link to choose a new password for your ${BRAND.productName} UAE sales account.`,
    heading: "Reset your password",
    bodyHtml: `We received a request to reset the password for your <strong>${escapeHtml(BRAND.productName)}</strong> sales account (<span style="color:#64748b">${escapeHtml(normalized)}</span>).`,
    ctaLabel: "Reset password",
    ctaUrl: link,
    expiryMinutes,
  });

  await sendAppEmail({
    to: normalized,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  console.info(`[auth-mail] recovery email queued (expires in ${exp.short})`);
  return { ok: true };
}

/** Signup confirmation — creates the Auth user and emails the confirm link. */
export async function registerAndSendConfirmEmail(input: {
  email: string;
  password: string;
  fullName: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  requireSmtp();
  const origin = appOriginFromEnv();
  const expiryMinutes = authLinkExpiryMinutes();
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "signup",
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName },
      redirectTo: origin ? `${origin}/dashboard` : undefined,
    },
  });
  if (error) {
    if (/already|registered|exists/i.test(error.message)) {
      return {
        ok: false,
        error: "If this email can be registered, check your inbox for a confirmation link.",
      };
    }
    return { ok: false, error: error.message };
  }
  const link = data.properties?.action_link;
  if (!link) {
    return { ok: false, error: "Could not create confirmation link" };
  }

  const mail = brandedAuthEmail({
    preview: `Confirm your email to finish joining ${BRAND.productName}.`,
    heading: "Confirm your email",
    bodyHtml: `Hi ${escapeHtml(input.fullName)}, welcome to <strong>${escapeHtml(BRAND.productName)}</strong> — ${escapeHtml(BRAND.tagline)}. Confirm your email to continue. An administrator may still need to approve your account.`,
    ctaLabel: "Confirm email",
    ctaUrl: link,
    expiryMinutes,
  });

  await sendAppEmail({
    to: input.email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
  return { ok: true };
}
