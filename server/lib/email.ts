import nodemailer from "nodemailer";

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    console.log(`[email] SMTP not configured — skipping email to ${to}: ${subject}`);
    return false;
  }
  try {
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;
    await transporter.sendMail({ from, to, subject, html });
    console.log(`[email] Sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
    console.error(`[email] Failed to send to ${to}:`, err);
    return false;
  }
}

export function emailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function apiAccessGrantedEmail(username: string, baseUrl: string): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
      <h2 style="margin:0 0 8px;color:#111;">API Access Granted</h2>
      <p style="color:#555;">Hi <strong>${username}</strong>,</p>
      <p style="color:#555;">Your API access has been enabled. You can now generate and use your API key to call the AI from external apps.</p>
      <p style="margin:24px 0;">
        <a href="${baseUrl}/api-access" style="background:#6d28d9;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View API Access Page</a>
      </p>
      <p style="color:#888;font-size:13px;">If you did not expect this, please contact your administrator.</p>
    </div>
  `;
}

export function apiAccessRevokedEmail(username: string): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
      <h2 style="margin:0 0 8px;color:#111;">API Access Revoked</h2>
      <p style="color:#555;">Hi <strong>${username}</strong>,</p>
      <p style="color:#555;">Your API access has been disabled. Your existing API key will no longer work.</p>
      <p style="color:#888;font-size:13px;">Contact your administrator if you believe this was done in error.</p>
    </div>
  `;
}

export function planChangedEmail(username: string, plan: string): string {
  const isPro = plan === "pro";
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
      <h2 style="margin:0 0 8px;color:#111;">Your plan has been updated</h2>
      <p style="color:#555;">Hi <strong>${username}</strong>,</p>
      <p style="color:#555;">Your plan has been changed to <strong>${isPro ? "Pro ✨" : "Free"}</strong>.</p>
      ${isPro ? `<p style="color:#555;">You now have access to all Pro models and features. Enjoy!</p>` : `<p style="color:#555;">Your account has been moved back to the free tier.</p>`}
      <p style="color:#888;font-size:13px;">Contact your administrator if you have questions.</p>
    </div>
  `;
}

export function apiLimitReachedEmail(username: string, limitType: "daily" | "monthly", limit: number): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
      <h2 style="margin:0 0 8px;color:#111;">API ${limitType === "daily" ? "Daily" : "Monthly"} Limit Reached</h2>
      <p style="color:#555;">Hi <strong>${username}</strong>,</p>
      <p style="color:#555;">You have reached your ${limitType} API request limit of <strong>${limit} requests</strong>.</p>
      <p style="color:#555;">Your API key will resume working at the start of the next ${limitType === "daily" ? "day" : "month"}. Contact your administrator to request a higher limit.</p>
    </div>
  `;
}
