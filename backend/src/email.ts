import { allowedOrigins } from "@/http";
import { log } from "@/log";

/**
 * Transactional email (verification and password-reset links) over HTTPS, so it also works on hosts
 * that block SMTP ports, such as Render's free plan. Set one of:
 *   RESEND_API_KEY  (resend.com)   or   BREVO_API_KEY  (brevo.com)
 * plus MAIL_FROM, e.g. "Free ATS Resume <no-reply@freeatsresume.in>". Without a key, outside
 * production the message is written to the server log instead, so the flows can be tried locally.
 */

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function emailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY?.trim() || process.env.BREVO_API_KEY?.trim());
}

/** The public website address used in links (APP_URL, or the first FRONTEND_ORIGIN). */
export function appUrl(): string {
  return (process.env.APP_URL?.trim() || allowedOrigins()[0] || "http://localhost:3000").replace(/\/+$/, "");
}

function sender(): { name: string; email: string; raw: string } {
  const raw = process.env.MAIL_FROM?.trim() || "Free ATS Resume <onboarding@resend.dev>";
  const m = /^(.*?)\s*<([^>]+)>$/.exec(raw);
  return m ? { name: m[1].replace(/^"|"$/g, "") || "Free ATS Resume", email: m[2], raw } : { name: "Free ATS Resume", email: raw, raw };
}

/** Sends one email. Returns false (and logs why) instead of throwing, so callers can stay vague to users. */
export async function sendEmail(mail: Mail): Promise<boolean> {
  const resend = process.env.RESEND_API_KEY?.trim();
  const brevo = process.env.BREVO_API_KEY?.trim();
  if (!resend && !brevo) {
    if (process.env.NODE_ENV !== "production") {
      // Development only: lets the links be followed without an email service.
      log.info("email_dev_outbox", { to: mail.to, subject: mail.subject, text: mail.text });
      return true;
    }
    log.warn("email_not_configured", { subject: mail.subject });
    return false;
  }
  const from = sender();
  try {
    const res = resend
      ? await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: from.raw, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
          signal: AbortSignal.timeout(15_000),
        })
      : await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": brevo!, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ sender: { name: from.name, email: from.email }, to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text, htmlContent: mail.html }),
          signal: AbortSignal.timeout(15_000),
        });
    if (!res.ok) {
      log.error("email_send_failed", { provider: resend ? "resend" : "brevo", status: res.status, body: (await res.text().catch(() => "")).slice(0, 300) });
      return false;
    }
    log.info("email_sent", { provider: resend ? "resend" : "brevo", subject: mail.subject });
    return true;
  } catch (e) {
    log.error("email_send_failed", { provider: resend ? "resend" : "brevo", err: e });
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A plain, single-button email that renders well in Gmail and Outlook. */
export function linkEmail(opts: { to: string; subject: string; heading: string; body: string; button: string; link: string; footnote: string }): Mail {
  const html = `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #e2e8f0;border-radius:14px">
<tr><td style="padding:28px 28px 8px"><div style="font-size:15px;font-weight:700;color:#4f46e5">Free ATS Resume Builder</div>
<h1 style="font-size:20px;margin:16px 0 8px">${esc(opts.heading)}</h1>
<p style="font-size:14px;line-height:1.6;color:#334155;margin:0 0 20px">${esc(opts.body)}</p>
<a href="${esc(opts.link)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:9px">${esc(opts.button)}</a>
<p style="font-size:12px;line-height:1.6;color:#64748b;margin:20px 0 0">Or paste this link into your browser:<br><span style="word-break:break-all">${esc(opts.link)}</span></p>
<p style="font-size:12px;line-height:1.6;color:#64748b;margin:16px 0 24px">${esc(opts.footnote)}</p></td></tr></table></td></tr></table></body></html>`;
  const text = `${opts.heading}\n\n${opts.body}\n\n${opts.button}: ${opts.link}\n\n${opts.footnote}\n`;
  return { to: opts.to, subject: opts.subject, text, html };
}
