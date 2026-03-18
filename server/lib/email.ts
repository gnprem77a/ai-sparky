import nodemailer from "nodemailer";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/* ─── Encryption helpers (AES-256-GCM) ────────────────────────────────────── */
function getEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set — cannot encrypt/decrypt SMTP password.");
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
  return process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "";
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

/* Shared layout helpers */
function wrapper(bg: string, content: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Sparky</title></head>
<body style="margin:0;padding:0;background:${bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:40px 16px;">
<tr><td align="center">${content}</td></tr>
</table></body></html>`;
}

function card(topGradient: string, content: string): string {
  return `<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08);">
<tr><td style="height:4px;background:${topGradient};font-size:0;">&nbsp;</td></tr>
${content}
</table>`;
}

function emailHeader(bg: string, borderColor: string, icon: string, eyebrow: string, eyebrowColor: string, title: string, subtitle: string): string {
  return `<tr><td style="background:${bg};padding:44px 44px 36px;text-align:center;border-bottom:1px solid ${borderColor};">
  <div style="font-size:38px;line-height:1;margin-bottom:16px;">${icon}</div>
  <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${eyebrowColor};">${eyebrow}</p>
  <h1 style="margin:0 0 12px;font-size:26px;font-weight:800;color:#111827;letter-spacing:-0.5px;line-height:1.2;">${title}</h1>
  <p style="margin:0;color:#6b7280;font-size:15px;line-height:1.6;">${subtitle}</p>
</td></tr>`;
}

function emailBody(content: string): string {
  return `<tr><td style="padding:36px 44px 28px;">${content}</td></tr>`;
}

function emailFooter(note?: string): string {
  return `<tr><td style="padding:18px 44px 28px;border-top:1px solid #f3f4f6;text-align:center;">
  <p style="margin:0 0 3px;color:#9ca3af;font-size:12px;">${note ?? "You're receiving this email from AI Sparky."}</p>
  <p style="margin:0;color:#9ca3af;font-size:12px;">We never train on your conversations. Your privacy is our priority.</p>
</td></tr>`;
}

function ctaBtn(label: string, url: string, color = "#6d28d9", textColor = "#ffffff"): string {
  return `<div style="text-align:center;margin:28px 0 4px;">
  <a href="${url}" style="display:inline-block;background:${color};color:${textColor};font-weight:700;font-size:15px;padding:14px 44px;border-radius:100px;text-decoration:none;letter-spacing:0.2px;">${label}</a>
</div>`;
}

function infoBox(bg: string, border: string, icon: string, content: string): string {
  return `<div style="background:${bg};border:1px solid ${border};border-radius:12px;padding:16px 20px;margin-bottom:24px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="width:28px;vertical-align:top;font-size:18px;padding-right:10px;">${icon}</td>
    <td style="vertical-align:top;">${content}</td>
  </tr></table>
</div>`;
}

function featureRow(icon: string, title: string, desc: string): string {
  return `<div style="display:flex;align-items:flex-start;gap:14px;padding:14px 16px;background:#faf5ff;border:1px solid #ede9fe;border-radius:12px;margin-bottom:8px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="width:30px;vertical-align:top;font-size:20px;padding-right:14px;padding-top:2px;">${icon}</td>
    <td style="vertical-align:top;">
      <p style="margin:0 0 3px;font-weight:700;color:#1e1b4b;font-size:14px;">${title}</p>
      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">${desc}</p>
    </td>
  </tr></table>
</div>`;
}

function smallNote(text: string): string {
  return `<p style="margin:22px 0 0;color:#9ca3af;font-size:13px;text-align:center;line-height:1.5;">${text}</p>`;
}


/* ── Verification email ── */
export function verificationEmail(username: string, verifyUrl: string): string {
  const body =
    `<p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.75;">Hi <strong>${username}</strong> 👋<br><br>Thanks for signing up! Before you start chatting, we just need to confirm this is you. Hit the button below to verify your email.</p>` +
    infoBox("#faf5ff", "#ede9fe", "⏱️",
      `<p style="margin:0;color:#5b21b6;font-size:13px;line-height:1.5;">This link expires in <strong>24 hours</strong> and works only once. After that, request a new one from the login page.</p>`) +
    ctaBtn("Verify my email →", verifyUrl) +
    smallNote("Didn't sign up? You can safely ignore this email — no account will be created.");

  return wrapper("#f0edfb", card(
    "linear-gradient(90deg,#7c3aed,#6d28d9,#4f46e5)",
    emailHeader("linear-gradient(160deg,#ede9fe 0%,#f5f3ff 60%,#e0e7ff 100%)", "#e5e7ff",
      "📬", "Action required", "#6d28d9",
      "Verify your email address",
      "One click to activate your AI Sparky account") +
    emailBody(body) +
    emailFooter("You received this because someone registered with this address at AI Sparky.")
  ));
}

/* ── Welcome email ── */
export function welcomeEmail(username: string, appUrl: string): string {
  const features =
    featureRow("💬", "Smart Conversations", "Context-aware AI that keeps track of your whole thread") +
    featureRow("⚡", "Multiple AI Models", "Fast, Balanced, Creative — pick the right tool for the job") +
    featureRow("📎", "File &amp; Image Uploads", "Attach docs and images, drag &amp; drop supported") +
    featureRow("📁", "Organized Folders", "Group chats into folders to stay on top of your work");

  const body =
    `<p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.75;">We're glad you're here. AI Sparky is your personal AI assistant built to help you write faster, think deeper, and get more done.</p>` +
    `<div style="margin-bottom:28px;">${features}</div>` +
    `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:14px 18px;margin-bottom:28px;"><p style="margin:0;color:#166534;font-size:13px;line-height:1.6;">🔒 <strong>Your privacy is protected.</strong> We never train AI on your conversations. Your data is encrypted and never shared.</p></div>` +
    ctaBtn("Start your first chat →", appUrl);

  return wrapper("#f0edfb", card(
    "linear-gradient(90deg,#7c3aed,#6d28d9,#4f46e5)",
    emailHeader("linear-gradient(160deg,#ede9fe 0%,#f5f3ff 60%,#e0e7ff 100%)", "#e5e7ff",
      "🎉", "You're in", "#6d28d9",
      "Welcome to AI Sparky!",
      `Your account is live, <strong>${username}</strong>. Let's see what you can build.`) +
    emailBody(body) +
    emailFooter("You received this because you just created an account on AI Sparky.")
  ));
}

/* ── Forgot password email ── */
export function forgotPasswordEmail(username: string, resetUrl: string): string {
  const body =
    `<p style="margin:0 0 22px;color:#374151;font-size:15px;line-height:1.75;">Hi <strong>${username}</strong>,<br><br>We received a request to reset the password on your AI Sparky account. If this was you, click below.</p>` +
    infoBox("#fff7ed", "#fed7aa", "⏰",
      `<p style="margin:0 0 4px;color:#92400e;font-weight:700;font-size:13px;">Link expires in 15 minutes</p>` +
      `<p style="margin:0;color:#a16207;font-size:13px;line-height:1.5;">For security, this link can only be used once. Request a new one if it expires.</p>`) +
    ctaBtn("Reset my password →", resetUrl, "#dc2626") +
    smallNote("If you didn't request this, no changes were made. Your current password is still active.");

  return wrapper("#fff5f5", card(
    "linear-gradient(90deg,#ef4444,#dc2626,#b91c1c)",
    emailHeader("linear-gradient(160deg,#fef2f2 0%,#fff5f5 60%,#fef2f2 100%)", "#fecaca",
      "🔑", "Password reset", "#dc2626",
      "Reset your password",
      "Click the button below to choose a new password") +
    emailBody(body) +
    emailFooter("You received this because a password reset was requested for your account.")
  ));
}

/* ── Password changed confirmation ── */
export function passwordChangedEmail(username: string, appUrl: string): string {
  const body =
    `<p style="margin:0 0 22px;color:#374151;font-size:15px;line-height:1.75;">Hi <strong>${username}</strong>,<br><br>Your AI Sparky password was successfully updated. If you made this change, you're all set — no further action needed.</p>` +
    infoBox("#fef2f2", "#fecaca", "⚠️",
      `<p style="margin:0 0 4px;color:#991b1b;font-weight:700;font-size:13px;">Didn't make this change?</p>` +
      `<p style="margin:0;color:#b91c1c;font-size:13px;line-height:1.5;">Your account may be compromised. Use the forgot-password flow immediately to regain control, then contact your administrator.</p>`) +
    ctaBtn("Go to AI Sparky →", appUrl, "#dc2626");

  return wrapper("#fff5f5", card(
    "linear-gradient(90deg,#ef4444,#dc2626,#b91c1c)",
    emailHeader("linear-gradient(160deg,#fef2f2 0%,#fff5f5 60%,#fef2f2 100%)", "#fecaca",
      "🛡️", "Security notice", "#dc2626",
      "Your password was changed",
      "This is a confirmation that your account password was updated") +
    emailBody(body) +
    emailFooter("You received this security notice because your account password was changed.")
  ));
}

/* ── API access granted ── */
export function apiAccessGrantedEmail(username: string, baseUrl: string): string {
  const steps =
    `<div style="padding:13px 16px;background:#faf5ff;border:1px solid #ede9fe;border-radius:11px;margin-bottom:8px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="width:30px;vertical-align:middle;"><div style="width:30px;height:30px;border-radius:50%;background:#6d28d9;color:#fff;font-weight:800;font-size:13px;text-align:center;line-height:30px;">1</div></td><td style="padding-left:14px;vertical-align:middle;"><p style="margin:0;color:#1e1b4b;font-size:14px;font-weight:500;">Go to your API Access page</p></td></tr></table></div>` +
    `<div style="padding:13px 16px;background:#faf5ff;border:1px solid #ede9fe;border-radius:11px;margin-bottom:8px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="width:30px;vertical-align:middle;"><div style="width:30px;height:30px;border-radius:50%;background:#6d28d9;color:#fff;font-weight:800;font-size:13px;text-align:center;line-height:30px;">2</div></td><td style="padding-left:14px;vertical-align:middle;"><p style="margin:0;color:#1e1b4b;font-size:14px;font-weight:500;">Generate your personal API key</p></td></tr></table></div>` +
    `<div style="padding:13px 16px;background:#faf5ff;border:1px solid #ede9fe;border-radius:11px;margin-bottom:8px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="width:30px;vertical-align:middle;"><div style="width:30px;height:30px;border-radius:50%;background:#6d28d9;color:#fff;font-weight:800;font-size:13px;text-align:center;line-height:30px;">3</div></td><td style="padding-left:14px;vertical-align:middle;"><p style="margin:0;color:#1e1b4b;font-size:14px;font-weight:500;">Add it to your app or integration</p></td></tr></table></div>`;

  const body =
    `<p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.75;">Hi <strong>${username}</strong>,<br><br>Your API access has been enabled. Use your API key to integrate AI Sparky into your own apps, automations, and workflows.</p>` +
    `<p style="margin:0 0 14px;color:#374151;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">Get started in 3 steps</p>` +
    `<div style="margin-bottom:28px;">${steps}</div>` +
    ctaBtn("View API Access →", `${baseUrl}/api-access`) +
    smallNote("Didn't expect this? Please contact your administrator right away.");

  return wrapper("#f0edfb", card(
    "linear-gradient(90deg,#7c3aed,#6d28d9,#4f46e5)",
    emailHeader("linear-gradient(160deg,#ede9fe 0%,#f5f3ff 60%,#e0e7ff 100%)", "#e5e7ff",
      "🔌", "Access enabled", "#6d28d9",
      "Your API access is live",
      "You can now connect AI Sparky to any app or service") +
    emailBody(body) +
    emailFooter()
  ));
}

/* ── API access revoked ── */
export function apiAccessRevokedEmail(username: string): string {
  const body =
    `<p style="margin:0 0 22px;color:#374151;font-size:15px;line-height:1.75;">Hi <strong>${username}</strong>,<br><br>Your API access has been revoked. Any integrations using your existing key will stop working immediately.</p>` +
    infoBox("#f9fafb", "#e5e7eb", "ℹ️",
      `<p style="margin:0;color:#4b5563;font-size:13px;line-height:1.6;">If this was done in error or you need access restored, contact your administrator. They can re-enable it from the admin panel.</p>`);

  return wrapper("#f5f5f5", card(
    "linear-gradient(90deg,#6b7280,#4b5563,#374151)",
    emailHeader("linear-gradient(160deg,#f9fafb 0%,#f3f4f6 60%,#f9fafb 100%)", "#e5e7eb",
      "🚫", "Access removed", "#4b5563",
      "API access has been disabled",
      "Your API key is no longer active") +
    emailBody(body) +
    emailFooter()
  ));
}

/* ── Plan changed ── */
export function planChangedEmail(username: string, plan: string): string {
  if (plan === "pro") return proWelcomeEmail(username);
  const appUrl = process.env.APP_URL ?? "";

  const body =
    `<p style="margin:0 0 22px;color:#374151;font-size:15px;line-height:1.75;">Hi <strong>${username}</strong>,<br><br>Your account has been moved back to the <strong>Free</strong> tier. You still have access to 20 free messages per day with the Fast model.</p>` +
    infoBox("#f9fafb", "#e5e7eb", "ℹ️",
      `<p style="margin:0;color:#4b5563;font-size:13px;line-height:1.6;">Contact your administrator to re-activate Pro access at any time.</p>`) +
    ctaBtn("Go to AI Sparky →", appUrl, "#4b5563");

  return wrapper("#f5f5f5", card(
    "linear-gradient(90deg,#6b7280,#4b5563,#374151)",
    emailHeader("linear-gradient(160deg,#f9fafb 0%,#f3f4f6 60%,#f9fafb 100%)", "#e5e7eb",
      "📋", "Plan update", "#4b5563",
      "Your plan has been updated",
      "Your account is now on the Free plan") +
    emailBody(body) +
    emailFooter()
  ));
}

/* ── Pro welcome (bespoke dark gold design) ── */
export function proWelcomeEmail(username: string): string {
  const appUrl = process.env.APP_URL ?? "";
  const gold = "#c9a84c";
  const goldLight = "#e8c96a";
  const bar = `linear-gradient(90deg,#6b4f10,${goldLight},${gold},${goldLight},#6b4f10)`;
  const cream = "#f5f0e8";
  const goldBorder = "rgba(201,168,76,0.28)";
  const goldDim = "rgba(201,168,76,0.14)";

  const featureRow = (icon: string, label: string, sub: string) =>
    `<tr><td style="padding-bottom:8px;">` +
    `<table width="100%" cellpadding="0" cellspacing="0" style="background:${goldDim};border:1px solid ${goldBorder};border-radius:12px;padding:0;">` +
    `<tr><td style="padding:15px 18px;">` +
    `<table width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="width:42px;vertical-align:middle;"><div style="width:38px;height:38px;border-radius:10px;background:rgba(201,168,76,0.08);border:1px solid ${goldBorder};text-align:center;line-height:38px;font-size:17px;">${icon}</div></td>` +
    `<td style="padding-left:16px;vertical-align:middle;"><p style="margin:0 0 2px;color:${cream};font-size:14px;font-weight:700;">${label}</p><p style="margin:0;color:rgba(245,240,232,0.42);font-size:13px;">${sub}</p></td>` +
    `<td style="width:24px;text-align:right;vertical-align:middle;color:${gold};font-size:15px;font-weight:700;">✓</td>` +
    `</tr></table>` +
    `</td></tr></table></td></tr>`;

  const features =
    featureRow("∞", "Unlimited messages", "No daily cap, ever") +
    featureRow("🧠", "All AI models", "Fast, Balanced, Powerful &amp; Creative") +
    featureRow("🌐", "Live web search", "Real-time answers from the internet") +
    featureRow("📚", "Knowledge Base", "RAG search across all your documents");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to Pro!</title></head>
<body style="margin:0;padding:0;background:#0c0a14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0c0a14;padding:40px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#13111f;border-radius:20px;overflow:hidden;border:1px solid ${goldBorder};box-shadow:0 0 80px rgba(201,168,76,0.07),0 24px 56px rgba(0,0,0,0.7);">
<tr><td style="height:3px;background:${bar};font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:52px 48px 44px;text-align:center;border-bottom:1px solid ${goldBorder};background:radial-gradient(ellipse at 50% -20%,rgba(201,168,76,0.13) 0%,transparent 65%);">
  <div style="display:inline-block;width:72px;height:72px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#f0d070,#a07828);box-shadow:0 0 40px rgba(201,168,76,0.5),0 8px 24px rgba(0,0,0,0.5);text-align:center;line-height:72px;font-size:32px;margin-bottom:24px;">👑</div>
  <p style="margin:0 0 10px;color:${gold};font-size:11px;font-weight:700;letter-spacing:4px;text-transform:uppercase;">Pro Access Activated</p>
  <h1 style="margin:0 0 14px;font-size:28px;font-weight:800;color:${cream};letter-spacing:-0.5px;line-height:1.25;">Welcome to the top tier, ${username}.</h1>
  <p style="margin:0;color:rgba(245,240,232,0.5);font-size:15px;line-height:1.65;">Every limit is lifted. Every model is unlocked.<br>This is AI Sparky without the guardrails.</p>
</td></tr>
<tr><td style="padding:36px 48px 16px;">
  <p style="margin:0 0 20px;color:rgba(245,240,232,0.35);font-size:11px;font-weight:700;letter-spacing:3.5px;text-transform:uppercase;">What's unlocked</p>
  <table width="100%" cellpadding="0" cellspacing="0"><tbody>${features}</tbody></table>
</td></tr>
<tr><td style="padding:32px 48px 44px;text-align:center;">
  <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#9b6e1a,${goldLight},#9b6e1a);color:#1a1200;font-weight:800;font-size:15px;padding:15px 52px;border-radius:100px;text-decoration:none;letter-spacing:0.3px;box-shadow:0 4px 28px rgba(201,168,76,0.45);">Start chatting →</a>
</td></tr>
<tr><td style="padding:18px 48px 28px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
  <p style="margin:0 0 3px;color:rgba(245,240,232,0.18);font-size:12px;">You received this because your account was upgraded to Pro on AI Sparky.</p>
  <p style="margin:0;color:rgba(245,240,232,0.18);font-size:12px;">We never train on your conversations. Your privacy is our priority.</p>
</td></tr>
<tr><td style="height:3px;background:${bar};font-size:0;">&nbsp;</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/* ── API limit reached ── */
export function apiLimitReachedEmail(username: string, limitType: "daily" | "monthly", limit: number): string {
  const period = limitType === "daily" ? "day" : "month";
  const body =
    `<p style="margin:0 0 22px;color:#374151;font-size:15px;line-height:1.75;">Hi <strong>${username}</strong>,<br><br>You have reached your ${limitType} API request limit of <strong>${limit.toLocaleString()} requests</strong>.</p>` +
    infoBox("#fffbeb", "#fde68a", "⚠️",
      `<p style="margin:0;color:#92400e;font-size:13px;line-height:1.6;">Your API key will resume at the start of the next <strong>${period}</strong>. Contact your administrator to request a higher limit.</p>`);

  return wrapper("#fffbeb", card(
    "linear-gradient(90deg,#f59e0b,#d97706,#b45309)",
    emailHeader("linear-gradient(160deg,#fffbeb 0%,#fef3c7 60%,#fff7ed 100%)", "#fde68a",
      "⚠️", "Usage notice", "#b45309",
      `API ${limitType === "daily" ? "Daily" : "Monthly"} Limit Reached`,
      "Your request limit has been reached") +
    emailBody(body) +
    emailFooter()
  ));
}

/* ── Test email ── */
export function testEmail(toName: string): string {
  const checks =
    `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;">` +
    `<tr><td style="padding:16px 22px 12px;">` +
    `<table width="100%" cellpadding="0" cellspacing="0">` +
    `<tr><td style="padding-bottom:12px;border-bottom:1px solid #d1fae5;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#374151;font-size:14px;">SMTP connection</td><td style="text-align:right;"><span style="background:#dcfce7;color:#15803d;font-size:12px;font-weight:700;padding:3px 10px;border-radius:100px;">✓ Successful</span></td></tr></table></td></tr>` +
    `<tr><td style="padding:12px 0;border-bottom:1px solid #d1fae5;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#374151;font-size:14px;">Authentication</td><td style="text-align:right;"><span style="background:#dcfce7;color:#15803d;font-size:12px;font-weight:700;padding:3px 10px;border-radius:100px;">✓ Passed</span></td></tr></table></td></tr>` +
    `<tr><td style="padding-top:12px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#374151;font-size:14px;">Email delivery</td><td style="text-align:right;"><span style="background:#dcfce7;color:#15803d;font-size:12px;font-weight:700;padding:3px 10px;border-radius:100px;">✓ Working</span></td></tr></table></td></tr>` +
    `</table></td></tr></table>`;

  const body =
    `<p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.75;">Hi <strong>${toName}</strong>,<br><br>This test was sent from the AI Sparky admin panel to confirm your mail server is set up correctly. All checks passed! 🎉</p>` +
    checks;

  return wrapper("#f0edfb", card(
    "linear-gradient(90deg,#7c3aed,#6d28d9,#4f46e5)",
    emailHeader("linear-gradient(160deg,#ede9fe 0%,#f5f3ff 60%,#e0e7ff 100%)", "#e5e7ff",
      "🧪", "Admin · SMTP test", "#6d28d9",
      "Email configuration working",
      "Your SMTP settings are correctly configured") +
    emailBody(body) +
    emailFooter("This is a test email sent from the AI Sparky admin panel.")
  ));
}
