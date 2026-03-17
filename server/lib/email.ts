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
  if (plan === "pro") return proWelcomeEmail(username);
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
      <h2 style="margin:0 0 8px;color:#111;">Your plan has been updated</h2>
      <p style="color:#555;">Hi <strong>${username}</strong>,</p>
      <p style="color:#555;">Your account has been moved back to the free tier.</p>
      <p style="color:#555;">You still have access to 20 free messages per day with the Fast model. Contact your administrator to re-activate Pro.</p>
      <p style="color:#888;font-size:13px;">Contact your administrator if you have questions.</p>
    </div>
  `;
}

export function proWelcomeEmail(username: string): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:580px;margin:0 auto;background:#ffffff;">
      <!-- Gold header bar -->
      <div style="height:4px;background:linear-gradient(90deg,#f59e0b,#d97706,#f59e0b);border-radius:4px 4px 0 0;"></div>

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#fffbeb 0%,#fef3c7 50%,#fff7ed 100%);padding:40px 40px 32px;text-align:center;border-bottom:1px solid #fde68a;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:16px;margin-bottom:16px;box-shadow:0 8px 24px rgba(245,158,11,0.3);">
          <span style="font-size:28px;">👑</span>
        </div>
        <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#111827;letter-spacing:-0.5px;">Welcome to Pro!</h1>
        <p style="margin:0;color:#92400e;font-size:16px;">Hi <strong>${username}</strong> — your upgrade is active ✨</p>
      </div>

      <!-- Body -->
      <div style="padding:36px 40px;">
        <p style="color:#374151;font-size:15px;margin:0 0 28px;line-height:1.6;">
          You now have full Pro access. Here's everything that's unlocked for you:
        </p>

        <!-- Features grid -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">
          <tr>
            <td style="padding:12px 14px;background:#f9fafb;border-radius:10px;width:50%;vertical-align:top;">
              <p style="margin:0 0 4px;font-weight:700;color:#111827;font-size:14px;">∞ Unlimited messages</p>
              <p style="margin:0;color:#6b7280;font-size:13px;">No daily cap, ever</p>
            </td>
            <td style="width:12px;"></td>
            <td style="padding:12px 14px;background:#f9fafb;border-radius:10px;width:50%;vertical-align:top;">
              <p style="margin:0 0 4px;font-weight:700;color:#111827;font-size:14px;">🧠 All AI models</p>
              <p style="margin:0;color:#6b7280;font-size:13px;">Fast, Balanced, Powerful & Creative</p>
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

        <!-- Privacy box -->
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:28px;">
          <p style="margin:0;color:#166534;font-size:13px;">
            🔒 <strong>Your privacy matters.</strong> We never train on your conversations. Your data is yours — always encrypted, never shared.
          </p>
        </div>

        <!-- CTA -->
        <div style="text-align:center;margin-bottom:28px;">
          <a href="${process.env.APP_URL || ''}"
            style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#ffffff;font-weight:700;font-size:15px;padding:14px 36px;border-radius:12px;text-decoration:none;box-shadow:0 4px 14px rgba(245,158,11,0.35);">
            Start chatting →
          </a>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:20px 40px;border-top:1px solid #f3f4f6;text-align:center;">
        <p style="margin:0;color:#9ca3af;font-size:12px;">
          Questions? Contact your administrator. &nbsp;·&nbsp; We never train on your conversations.
        </p>
      </div>
    </div>
  `;
}

export function welcomeEmail(username: string, appUrl: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#f5f3ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;padding:40px 16px;">
        <tr><td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(109,40,217,0.10);">

            <!-- Purple top bar -->
            <tr>
              <td style="height:5px;background:linear-gradient(90deg,#7c3aed,#6d28d9,#4f46e5);"></td>
            </tr>

            <!-- Header -->
            <tr>
              <td style="background:linear-gradient(135deg,#ede9fe 0%,#ddd6fe 50%,#e0e7ff 100%);padding:44px 44px 36px;text-align:center;border-bottom:1px solid #ddd6fe;">
                <div style="display:inline-block;width:72px;height:72px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border-radius:20px;margin-bottom:20px;box-shadow:0 8px 28px rgba(109,40,217,0.35);line-height:72px;font-size:32px;">✨</div>
                <h1 style="margin:0 0 10px;font-size:30px;font-weight:800;color:#1e1b4b;letter-spacing:-0.5px;">Welcome to AI Sparky!</h1>
                <p style="margin:0;color:#5b21b6;font-size:16px;">Hi <strong>${username}</strong> — your account is ready 🎉</p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:40px 44px 32px;">
                <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.7;">
                  We're glad you're here. AI Sparky is your personal AI assistant — designed to help you write, research, think, and create. Here's what's waiting for you:
                </p>

                <!-- Features -->
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                  <tr>
                    <td style="padding:14px 16px;background:#faf5ff;border:1px solid #ede9fe;border-radius:12px;width:47%;vertical-align:top;">
                      <p style="margin:0 0 4px;font-weight:700;color:#1e1b4b;font-size:14px;">💬 Smart Conversations</p>
                      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">Context-aware AI that remembers your conversation thread</p>
                    </td>
                    <td style="width:16px;"></td>
                    <td style="padding:14px 16px;background:#faf5ff;border:1px solid #ede9fe;border-radius:12px;width:47%;vertical-align:top;">
                      <p style="margin:0 0 4px;font-weight:700;color:#1e1b4b;font-size:14px;">📁 Organize by Folders</p>
                      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">Keep your chats tidy with folders and custom names</p>
                    </td>
                  </tr>
                  <tr><td colspan="3" style="height:12px;"></td></tr>
                  <tr>
                    <td style="padding:14px 16px;background:#faf5ff;border:1px solid #ede9fe;border-radius:12px;vertical-align:top;">
                      <p style="margin:0 0 4px;font-weight:700;color:#1e1b4b;font-size:14px;">📎 File Uploads</p>
                      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">Attach documents and images — drag &amp; drop supported</p>
                    </td>
                    <td></td>
                    <td style="padding:14px 16px;background:#faf5ff;border:1px solid #ede9fe;border-radius:12px;vertical-align:top;">
                      <p style="margin:0 0 4px;font-weight:700;color:#1e1b4b;font-size:14px;">⚡ Multiple AI Models</p>
                      <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">Choose Fast, Balanced, Creative or Powerful</p>
                    </td>
                  </tr>
                </table>

                <!-- Privacy note -->
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px 20px;margin-bottom:32px;">
                  <p style="margin:0;color:#166534;font-size:13px;line-height:1.6;">
                    🔒 <strong>Your privacy is our priority.</strong> We never train AI models on your conversations. Your data is yours — always encrypted, never shared.
                  </p>
                </div>

                <!-- CTA Button -->
                <div style="text-align:center;margin-bottom:8px;">
                  <a href="${appUrl}"
                    style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#ffffff;font-weight:700;font-size:16px;padding:15px 44px;border-radius:14px;text-decoration:none;box-shadow:0 4px 16px rgba(109,40,217,0.35);letter-spacing:0.2px;">
                    Start your first chat →
                  </a>
                </div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:20px 44px 28px;border-top:1px solid #f3f4f6;text-align:center;">
                <p style="margin:0 0 6px;color:#9ca3af;font-size:12px;">
                  You're receiving this because you just created an account on AI Sparky.
                </p>
                <p style="margin:0;color:#9ca3af;font-size:12px;">
                  Questions? Just reply to this email — we're happy to help.
                </p>
              </td>
            </tr>

            <!-- Bottom purple bar -->
            <tr>
              <td style="height:4px;background:linear-gradient(90deg,#4f46e5,#6d28d9,#7c3aed);"></td>
            </tr>

          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;
}

export function forgotPasswordEmail(username: string, resetUrl: string): string {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
      <h2 style="margin:0 0 8px;color:#111;">Reset your password</h2>
      <p style="color:#555;">Hi <strong>${username}</strong>,</p>
      <p style="color:#555;">You requested a password reset. Click the button below to set a new password. This link expires in 1 hour.</p>
      <p style="margin:24px 0;">
        <a href="${resetUrl}" style="background:#6d28d9;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Reset Password</a>
      </p>
      <p style="color:#888;font-size:13px;">If you did not request a password reset, you can safely ignore this email.</p>
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
