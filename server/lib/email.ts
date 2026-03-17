import nodemailer from "nodemailer";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/* ─── Encryption helpers (AES-256-GCM) ────────────────────────────────────── */
function getEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET ?? "fallback-insecure-key-change-me";
  return scryptSync(secret, "smtp-salt", 32);
}

export function encryptSmtpPassword(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSmtpPassword(enc: string): string {
  try {
    const [ivHex, tagHex, dataHex] = enc.split(":");
    if (!ivHex || !tagHex || !dataHex) return "";
    const key = getEncryptionKey();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return decipher.update(Buffer.from(dataHex, "hex")).toString("utf8") + decipher.final("utf8");
  } catch {
    return "";
  }
}

/* ─── DB import (lazy to avoid circular deps) ─────────────────────────────── */
let _storage: typeof import("../storage").storage | null = null;
async function getStorage() {
  if (!_storage) {
    const mod = await import("../storage");
    _storage = mod.storage;
  }
  return _storage;
}

/* ─── Transporter (DB config first, env fallback) ─────────────────────────── */
async function getTransporter(): Promise<nodemailer.Transporter | null> {
  // Try DB config
  try {
    const store = await getStorage();
    const cfg = await store.getSmtpConfig();
    if (cfg?.isEnabled && cfg.host && cfg.username && cfg.passwordEnc) {
      const pass = decryptSmtpPassword(cfg.passwordEnc);
      if (pass) {
        return nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          auth: { user: cfg.username, pass },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
        });
      }
    }
  } catch { /* fall through */ }

  // Env fallback
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "465");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
  });
}

async function getFromAddress(): Promise<string> {
  try {
    const store = await getStorage();
    const cfg = await store.getSmtpConfig();
    if (cfg?.isEnabled && cfg.fromEmail) {
      return cfg.fromName ? `"${cfg.fromName}" <${cfg.fromEmail}>` : cfg.fromEmail;
    }
  } catch { /* fall through */ }
  return process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@aisparky.dev";
}

/* ─── Logging helper ───────────────────────────────────────────────────────── */
async function logEmail(recipient: string, subject: string, templateType: string, status: "sent" | "failed", errorMessage?: string) {
  try {
    const store = await getStorage();
    await store.createEmailLog({ recipient, subject, templateType, status, errorMessage });
  } catch { /* never block on log failure */ }
}

/* ─── Core send function with retry ───────────────────────────────────────── */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  templateType = "generic",
  text?: string,
): Promise<boolean> {
  const transporter = await getTransporter();
  if (!transporter) {
    console.log(`[email] SMTP not configured — skipping email to ${to}: ${subject}`);
    await logEmail(to, subject, templateType, "failed", "SMTP not configured");
    return false;
  }

  const from = await getFromAddress();
  const plainText = text ?? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await transporter.sendMail({ from, to, subject, html, text: plainText });
      console.log(`[email] ✓ Sent to ${to}: ${subject} (attempt ${attempt})`);
      await logEmail(to, subject, templateType, "sent");
      return true;
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.error(`[email] ✗ Attempt ${attempt} failed for ${to}: ${msg}`);
      if (attempt === 2) {
        await logEmail(to, subject, templateType, "failed", msg.slice(0, 500));
        return false;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return false;
}

export async function emailConfigured(): Promise<boolean> {
  try {
    const store = await getStorage();
    const cfg = await store.getSmtpConfig();
    if (cfg?.isEnabled && cfg.host && cfg.username && cfg.passwordEnc) return true;
  } catch { /* fall through */ }
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/* ─── Email templates ──────────────────────────────────────────────────────── */

function baseTemplate(accentColor: string, headerBg: string, headerBorder: string, icon: string, title: string, subtitleHtml: string, bodyHtml: string, footerNote?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#f5f3ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;padding:40px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(109,40,217,0.10);">
<tr><td style="height:5px;background:linear-gradient(90deg,${accentColor});"></td></tr>
<tr><td style="background:${headerBg};padding:44px 44px 36px;text-align:center;border-bottom:1px solid ${headerBorder};">
  <div style="display:inline-block;width:68px;height:68px;background:linear-gradient(135deg,${accentColor});border-radius:18px;margin-bottom:20px;box-shadow:0 8px 28px rgba(109,40,217,0.3);line-height:68px;font-size:30px;">${icon}</div>
  <h1 style="margin:0 0 10px;font-size:26px;font-weight:800;color:#1e1b4b;letter-spacing:-0.5px;">${title}</h1>
  <p style="margin:0;color:#5b21b6;font-size:15px;">${subtitleHtml}</p>
</td></tr>
<tr><td style="padding:36px 44px 28px;">${bodyHtml}</td></tr>
<tr><td style="padding:18px 44px 28px;border-top:1px solid #f3f4f6;text-align:center;">
  <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;">${footerNote ?? "You're receiving this email from AI Sparky."}</p>
  <p style="margin:0;color:#9ca3af;font-size:12px;">We never train on your conversations. Your privacy is our priority.</p>
</td></tr>
<tr><td style="height:4px;background:linear-gradient(90deg,${accentColor});"></td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function ctaButton(label: string, url: string, color = "#6d28d9"): string {
  return `<div style="text-align:center;margin:28px 0 8px;">
    <a href="${url}" style="display:inline-block;background:${color};color:#ffffff;font-weight:700;font-size:15px;padding:14px 40px;border-radius:12px;text-decoration:none;box-shadow:0 4px 14px rgba(109,40,217,0.3);">${label}</a>
  </div>`;
}

/* ── Verification email ── */
export function verificationEmail(username: string, verifyUrl: string): string {
  const body = `
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7;">
      Hi <strong>${username}</strong>, thank you for signing up! Please verify your email address to activate your account.
    </p>
    <div style="background:#faf5ff;border:1px solid #ede9fe;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
      <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">This link expires in <strong>24 hours</strong> and can only be used once.</p>
    </div>
    ${ctaButton("Verify my email →", verifyUrl)}
    <p style="margin:24px 0 0;color:#9ca3af;font-size:13px;text-align:center;">
      If you didn't create an account, you can safely ignore this email.
    </p>`;
  return baseTemplate(
    "#7c3aed,#6d28d9,#4f46e5", "linear-gradient(135deg,#ede9fe,#ddd6fe,#e0e7ff)", "#ddd6fe",
    "✉️", "Verify your email", "One quick step to activate your account", body,
    "You received this because you signed up at AI Sparky."
  );
}

/* ── Welcome email ── */
export function welcomeEmail(username: string, appUrl: string): string {
  const body = `
    <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.7;">
      We're glad you're here. AI Sparky is your personal AI assistant — designed to help you write, research, think, and create.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="padding:14px 16px;background:#faf5ff;border:1px solid #ede9fe;border-radius:12px;width:47%;vertical-align:top;">
          <p style="margin:0 0 4px;font-weight:700;color:#1e1b4b;font-size:14px;">💬 Smart Conversations</p>
          <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">Context-aware AI that remembers your thread</p>
        </td>
        <td style="width:16px;"></td>
        <td style="padding:14px 16px;background:#faf5ff;border:1px solid #ede9fe;border-radius:12px;width:47%;vertical-align:top;">
          <p style="margin:0 0 4px;font-weight:700;color:#1e1b4b;font-size:14px;">📁 Organized Folders</p>
          <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">Keep chats tidy with custom folders</p>
        </td>
      </tr>
      <tr><td colspan="3" style="height:12px;"></td></tr>
      <tr>
        <td style="padding:14px 16px;background:#faf5ff;border:1px solid #ede9fe;border-radius:12px;vertical-align:top;">
          <p style="margin:0 0 4px;font-weight:700;color:#1e1b4b;font-size:14px;">📎 File Uploads</p>
          <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">Attach documents — drag &amp; drop supported</p>
        </td>
        <td></td>
        <td style="padding:14px 16px;background:#faf5ff;border:1px solid #ede9fe;border-radius:12px;vertical-align:top;">
          <p style="margin:0 0 4px;font-weight:700;color:#1e1b4b;font-size:14px;">⚡ Multiple AI Models</p>
          <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">Fast, Balanced, Creative, or Powerful</p>
        </td>
      </tr>
    </table>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:28px;">
      <p style="margin:0;color:#166534;font-size:13px;line-height:1.6;">🔒 <strong>Your privacy matters.</strong> We never train AI models on your conversations. Your data is yours — always encrypted, never shared.</p>
    </div>
    ${ctaButton("Start your first chat →", appUrl)}`;
  return baseTemplate(
    "#7c3aed,#6d28d9,#4f46e5", "linear-gradient(135deg,#ede9fe,#ddd6fe,#e0e7ff)", "#ddd6fe",
    "✨", "Welcome to AI Sparky!", `Hi <strong>${username}</strong> — your account is ready 🎉`, body,
    "You received this because you just created an account on AI Sparky."
  );
}

/* ── Password reset email ── */
export function forgotPasswordEmail(username: string, resetUrl: string): string {
  const body = `
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7;">
      Hi <strong>${username}</strong>,<br><br>
      You requested a password reset. Click the button below to set a new password.
    </p>
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0;color:#92400e;font-size:13px;">⏰ This link expires in <strong>15 minutes</strong> and can only be used once.</p>
    </div>
    ${ctaButton("Reset my password →", resetUrl, "#dc2626")}
    <p style="margin:24px 0 0;color:#9ca3af;font-size:13px;text-align:center;">
      If you didn't request a password reset, you can safely ignore this email. Your password won't change.
    </p>`;
  return baseTemplate(
    "#dc2626,#b91c1c,#991b1b", "linear-gradient(135deg,#fef2f2,#fee2e2,#fef2f2)", "#fecaca",
    "🔑", "Reset your password", "A reset link has been sent to your inbox", body,
    "You received this because a password reset was requested for your account."
  );
}

/* ── Password changed confirmation ── */
export function passwordChangedEmail(username: string, appUrl: string): string {
  const body = `
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7;">
      Hi <strong>${username}</strong>,<br><br>
      Your AI Sparky password was successfully changed. If you made this change, no action is needed.
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px 20px;margin-bottom:28px;">
      <p style="margin:0;color:#991b1b;font-size:13px;">⚠️ <strong>Didn't change your password?</strong> Your account may be compromised. Contact your administrator immediately or use the forgot-password flow to regain access.</p>
    </div>
    ${ctaButton("Go to AI Sparky →", appUrl)}`;
  return baseTemplate(
    "#dc2626,#b91c1c,#991b1b", "linear-gradient(135deg,#fef2f2,#fee2e2,#fef2f2)", "#fecaca",
    "🛡️", "Password changed", "Your password was updated successfully", body,
    "You received this security notification because your account password was changed."
  );
}

/* ── API access granted ── */
export function apiAccessGrantedEmail(username: string, baseUrl: string): string {
  const body = `
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7;">
      Hi <strong>${username}</strong>,<br><br>
      Your API access has been enabled. You can now generate and use your API key to call AI Sparky from external apps and integrations.
    </p>
    ${ctaButton("View API Access →", `${baseUrl}/api-access`)}
    <p style="margin:24px 0 0;color:#9ca3af;font-size:13px;text-align:center;">If you did not expect this, please contact your administrator.</p>`;
  return baseTemplate(
    "#7c3aed,#6d28d9,#4f46e5", "linear-gradient(135deg,#ede9fe,#ddd6fe,#e0e7ff)", "#ddd6fe",
    "🔌", "API Access Granted", "Your external API key is now active", body
  );
}

/* ── API access revoked ── */
export function apiAccessRevokedEmail(username: string): string {
  const body = `
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7;">
      Hi <strong>${username}</strong>,<br><br>
      Your API access has been disabled. Your existing API key will no longer work.
    </p>
    <p style="margin:0;color:#6b7280;font-size:14px;text-align:center;">Contact your administrator if you believe this was done in error.</p>`;
  return baseTemplate(
    "#6b7280,#4b5563,#374151", "linear-gradient(135deg,#f9fafb,#f3f4f6,#f9fafb)", "#e5e7eb",
    "🚫", "API Access Revoked", "Your external API key has been deactivated", body
  );
}

/* ── Plan changed ── */
export function planChangedEmail(username: string, plan: string): string {
  if (plan === "pro") return proWelcomeEmail(username);
  const body = `
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7;">
      Hi <strong>${username}</strong>,<br><br>
      Your account has been moved back to the <strong>Free</strong> tier. You still have access to 20 free messages per day with the Fast model.
    </p>
    <p style="margin:0;color:#6b7280;font-size:14px;text-align:center;">Contact your administrator to re-activate Pro access.</p>`;
  return baseTemplate(
    "#6b7280,#4b5563,#374151", "linear-gradient(135deg,#f9fafb,#f3f4f6,#f9fafb)", "#e5e7eb",
    "📋", "Your plan has been updated", "Your account is now on the Free plan", body
  );
}

/* ── Pro welcome ── */
export function proWelcomeEmail(username: string): string {
  const appUrl = process.env.APP_URL ?? "";
  const body = `
    <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.7;">
      You now have full Pro access. Here's everything that's unlocked for you:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="padding:12px 14px;background:#f9fafb;border-radius:10px;width:50%;vertical-align:top;">
          <p style="margin:0 0 4px;font-weight:700;color:#111827;font-size:14px;">∞ Unlimited messages</p>
          <p style="margin:0;color:#6b7280;font-size:13px;">No daily cap, ever</p>
        </td>
        <td style="width:12px;"></td>
        <td style="padding:12px 14px;background:#f9fafb;border-radius:10px;width:50%;vertical-align:top;">
          <p style="margin:0 0 4px;font-weight:700;color:#111827;font-size:14px;">🧠 All AI models</p>
          <p style="margin:0;color:#6b7280;font-size:13px;">Fast, Balanced, Powerful &amp; Creative</p>
        </td>
      </tr>
      <tr><td colspan="3" style="height:10px;"></td></tr>
      <tr>
        <td style="padding:12px 14px;background:#f9fafb;border-radius:10px;vertical-align:top;">
          <p style="margin:0 0 4px;font-weight:700;color:#111827;font-size:14px;">🌐 Web search</p>
          <p style="margin:0;color:#6b7280;font-size:13px;">Real-time internet answers</p>
        </td>
        <td></td>
        <td style="padding:12px 14px;background:#f9fafb;border-radius:10px;vertical-align:top;">
          <p style="margin:0 0 4px;font-weight:700;color:#111827;font-size:14px;">📚 Knowledge Base</p>
          <p style="margin:0;color:#6b7280;font-size:13px;">Full RAG search over your docs</p>
        </td>
      </tr>
    </table>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:28px;">
      <p style="margin:0;color:#166534;font-size:13px;">🔒 <strong>Your privacy matters.</strong> We never train on your conversations. Your data is yours — always encrypted, never shared.</p>
    </div>
    ${ctaButton("Start chatting →", appUrl, "#f59e0b")}`;
  return baseTemplate(
    "#f59e0b,#d97706,#f59e0b", "linear-gradient(135deg,#fffbeb,#fef3c7,#fff7ed)", "#fde68a",
    "👑", "Welcome to Pro!", `Hi <strong>${username}</strong> — your upgrade is active ✨`, body
  );
}

/* ── API limit reached ── */
export function apiLimitReachedEmail(username: string, limitType: "daily" | "monthly", limit: number): string {
  const body = `
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7;">
      Hi <strong>${username}</strong>,<br><br>
      You have reached your ${limitType} API request limit of <strong>${limit} requests</strong>.
    </p>
    <p style="margin:0;color:#6b7280;font-size:14px;text-align:center;">
      Your API key will resume working at the start of the next ${limitType === "daily" ? "day" : "month"}. Contact your administrator to request a higher limit.
    </p>`;
  return baseTemplate(
    "#f59e0b,#d97706,#b45309", "linear-gradient(135deg,#fffbeb,#fef3c7,#fff7ed)", "#fde68a",
    "⚠️", `API ${limitType === "daily" ? "Daily" : "Monthly"} Limit Reached`, "Your request limit has been reached", body
  );
}

/* ── Test email ── */
export function testEmail(toName: string): string {
  const body = `
    <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7;">
      Hi <strong>${toName}</strong>,<br><br>
      This is a test email from your AI Sparky SMTP configuration. If you received this, your email setup is working correctly! 🎉
    </p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;">
      <p style="margin:0;color:#166534;font-size:14px;">✅ SMTP connection: <strong>Successful</strong><br>
      ✅ Authentication: <strong>Passed</strong><br>
      ✅ Email delivery: <strong>Working</strong></p>
    </div>`;
  return baseTemplate(
    "#7c3aed,#6d28d9,#4f46e5", "linear-gradient(135deg,#ede9fe,#ddd6fe,#e0e7ff)", "#ddd6fe",
    "🧪", "SMTP Test Successful", "Your email configuration is working", body,
    "This is a test email sent from the AI Sparky admin panel."
  );
}
