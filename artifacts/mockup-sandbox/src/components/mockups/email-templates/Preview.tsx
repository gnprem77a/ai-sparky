import { useState } from "react";

const ACCENT_PURPLE = "#7c3aed,#6d28d9,#4f46e5";
const HEADER_PURPLE = "linear-gradient(135deg,#ede9fe,#ddd6fe,#e0e7ff)";
const BORDER_PURPLE = "#ddd6fe";

const ACCENT_RED = "#dc2626,#b91c1c,#991b1b";
const HEADER_RED = "linear-gradient(135deg,#fef2f2,#fee2e2,#fef2f2)";
const BORDER_RED = "#fecaca";

const ACCENT_GOLD = "#f59e0b,#d97706,#f59e0b";
const HEADER_GOLD = "linear-gradient(135deg,#fffbeb,#fef3c7,#fff7ed)";
const BORDER_GOLD = "#fde68a";

const ACCENT_GRAY = "#6b7280,#4b5563,#374151";
const HEADER_GRAY = "linear-gradient(135deg,#f9fafb,#f3f4f6,#f9fafb)";
const BORDER_GRAY = "#e5e7eb";

function ctaButton(label: string, color = "#6d28d9") {
  return (
    <div style={{ textAlign: "center", margin: "28px 0 8px" }}>
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        style={{
          display: "inline-block",
          background: color,
          color: "#fff",
          fontWeight: 700,
          fontSize: 15,
          padding: "14px 40px",
          borderRadius: 12,
          textDecoration: "none",
          boxShadow: "0 4px 14px rgba(109,40,217,0.3)",
        }}
      >
        {label}
      </a>
    </div>
  );
}

function EmailShell({
  accent,
  headerBg,
  headerBorder,
  icon,
  title,
  subtitle,
  footer,
  children,
}: {
  accent: string;
  headerBg: string;
  headerBorder: string;
  icon: string;
  title: string;
  subtitle: React.ReactNode;
  footer?: string;
  children: React.ReactNode;
}) {
  const gradientBar = `linear-gradient(90deg,${accent})`;
  return (
    <div
      style={{
        background: "#f5f3ff",
        padding: "40px 16px",
        minHeight: "100%",
      }}
    >
      <table
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        style={{ maxWidth: 560, margin: "0 auto" }}
      >
        <tbody>
          <tr>
            <td>
              <div
                style={{
                  background: "#fff",
                  borderRadius: 20,
                  overflow: "hidden",
                  boxShadow: "0 4px 24px rgba(109,40,217,0.10)",
                }}
              >
                {/* Top bar */}
                <div style={{ height: 5, background: gradientBar }} />
                {/* Header */}
                <div
                  style={{
                    background: headerBg,
                    padding: "44px 44px 36px",
                    textAlign: "center",
                    borderBottom: `1px solid ${headerBorder}`,
                  }}
                >
                  <div
                    style={{
                      display: "inline-block",
                      width: 68,
                      height: 68,
                      background: `linear-gradient(135deg,${accent})`,
                      borderRadius: 18,
                      marginBottom: 20,
                      boxShadow: "0 8px 28px rgba(109,40,217,0.3)",
                      lineHeight: "68px",
                      fontSize: 30,
                      textAlign: "center",
                    }}
                  >
                    {icon}
                  </div>
                  <h1
                    style={{
                      margin: "0 0 10px",
                      fontSize: 26,
                      fontWeight: 800,
                      color: "#1e1b4b",
                      letterSpacing: -0.5,
                    }}
                  >
                    {title}
                  </h1>
                  <p style={{ margin: 0, color: "#5b21b6", fontSize: 15 }}>
                    {subtitle}
                  </p>
                </div>
                {/* Body */}
                <div style={{ padding: "36px 44px 28px" }}>{children}</div>
                {/* Footer */}
                <div
                  style={{
                    padding: "18px 44px 28px",
                    borderTop: "1px solid #f3f4f6",
                    textAlign: "center",
                  }}
                >
                  <p style={{ margin: "0 0 4px", color: "#9ca3af", fontSize: 12 }}>
                    {footer ?? "You're receiving this email from AI Sparky."}
                  </p>
                  <p style={{ margin: 0, color: "#9ca3af", fontSize: 12 }}>
                    We never train on your conversations. Your privacy is our priority.
                  </p>
                </div>
                {/* Bottom bar */}
                <div style={{ height: 4, background: gradientBar }} />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function VerificationEmail() {
  return (
    <EmailShell
      accent={ACCENT_PURPLE}
      headerBg={HEADER_PURPLE}
      headerBorder={BORDER_PURPLE}
      icon="✉️"
      title="Verify your email"
      subtitle="One quick step to activate your account"
      footer="You received this because you signed up at AI Sparky."
    >
      <p style={{ margin: "0 0 24px", color: "#374151", fontSize: 15, lineHeight: 1.7 }}>
        Hi <strong>Alex</strong>, thank you for signing up! Please verify your email address to activate your account.
      </p>
      <div
        style={{
          background: "#faf5ff",
          border: "1px solid #ede9fe",
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
          textAlign: "center",
        }}
      >
        <p style={{ margin: "0 0 8px", color: "#6b7280", fontSize: 13 }}>
          This link expires in <strong>24 hours</strong> and can only be used once.
        </p>
      </div>
      {ctaButton("Verify my email →")}
      <p style={{ margin: "24px 0 0", color: "#9ca3af", fontSize: 13, textAlign: "center" }}>
        If you didn't create an account, you can safely ignore this email.
      </p>
    </EmailShell>
  );
}

function WelcomeEmail() {
  return (
    <EmailShell
      accent={ACCENT_PURPLE}
      headerBg={HEADER_PURPLE}
      headerBorder={BORDER_PURPLE}
      icon="✨"
      title="Welcome to AI Sparky!"
      subtitle={<>Hi <strong>Alex</strong> — your account is ready 🎉</>}
      footer="You received this because you just created an account on AI Sparky."
    >
      <p style={{ margin: "0 0 28px", color: "#374151", fontSize: 15, lineHeight: 1.7 }}>
        We're glad you're here. AI Sparky is your personal AI assistant — designed to help you write, research, think, and create.
      </p>
      <table width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: 28 }}>
        <tbody>
          <tr>
            <td style={{ padding: "14px 16px", background: "#faf5ff", border: "1px solid #ede9fe", borderRadius: 12, width: "47%", verticalAlign: "top" }}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#1e1b4b", fontSize: 14 }}>💬 Smart Conversations</p>
              <p style={{ margin: 0, color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>Context-aware AI that remembers your thread</p>
            </td>
            <td style={{ width: 16 }} />
            <td style={{ padding: "14px 16px", background: "#faf5ff", border: "1px solid #ede9fe", borderRadius: 12, width: "47%", verticalAlign: "top" }}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#1e1b4b", fontSize: 14 }}>📁 Organized Folders</p>
              <p style={{ margin: 0, color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>Keep chats tidy with custom folders</p>
            </td>
          </tr>
          <tr><td colSpan={3} style={{ height: 12 }} /></tr>
          <tr>
            <td style={{ padding: "14px 16px", background: "#faf5ff", border: "1px solid #ede9fe", borderRadius: 12, verticalAlign: "top" }}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#1e1b4b", fontSize: 14 }}>📎 File Uploads</p>
              <p style={{ margin: 0, color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>Attach documents — drag &amp; drop supported</p>
            </td>
            <td />
            <td style={{ padding: "14px 16px", background: "#faf5ff", border: "1px solid #ede9fe", borderRadius: 12, verticalAlign: "top" }}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#1e1b4b", fontSize: 14 }}>⚡ Multiple AI Models</p>
              <p style={{ margin: 0, color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>Fast, Balanced, Creative, or Powerful</p>
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "16px 20px", marginBottom: 28 }}>
        <p style={{ margin: 0, color: "#166534", fontSize: 13, lineHeight: 1.6 }}>
          🔒 <strong>Your privacy matters.</strong> We never train AI models on your conversations. Your data is yours — always encrypted, never shared.
        </p>
      </div>
      {ctaButton("Start your first chat →")}
    </EmailShell>
  );
}

function ForgotPasswordEmail() {
  return (
    <EmailShell
      accent={ACCENT_RED}
      headerBg={HEADER_RED}
      headerBorder={BORDER_RED}
      icon="🔑"
      title="Reset your password"
      subtitle="A reset link has been sent to your inbox"
      footer="You received this because a password reset was requested for your account."
    >
      <p style={{ margin: "0 0 20px", color: "#374151", fontSize: 15, lineHeight: 1.7 }}>
        Hi <strong>Alex</strong>,<br /><br />
        You requested a password reset. Click the button below to set a new password.
      </p>
      <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, padding: "16px 20px", marginBottom: 24 }}>
        <p style={{ margin: 0, color: "#92400e", fontSize: 13 }}>
          ⏰ This link expires in <strong>15 minutes</strong> and can only be used once.
        </p>
      </div>
      {ctaButton("Reset my password →", "#dc2626")}
      <p style={{ margin: "24px 0 0", color: "#9ca3af", fontSize: 13, textAlign: "center" }}>
        If you didn't request a password reset, you can safely ignore this email. Your password won't change.
      </p>
    </EmailShell>
  );
}

function PasswordChangedEmail() {
  return (
    <EmailShell
      accent={ACCENT_RED}
      headerBg={HEADER_RED}
      headerBorder={BORDER_RED}
      icon="🛡️"
      title="Password changed"
      subtitle="Your password was updated successfully"
      footer="You received this security notification because your account password was changed."
    >
      <p style={{ margin: "0 0 20px", color: "#374151", fontSize: 15, lineHeight: 1.7 }}>
        Hi <strong>Alex</strong>,<br /><br />
        Your AI Sparky password was successfully changed. If you made this change, no action is needed.
      </p>
      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "16px 20px", marginBottom: 28 }}>
        <p style={{ margin: 0, color: "#991b1b", fontSize: 13 }}>
          ⚠️ <strong>Didn't change your password?</strong> Your account may be compromised. Contact your administrator immediately or use the forgot-password flow to regain access.
        </p>
      </div>
      {ctaButton("Go to AI Sparky →", "#dc2626")}
    </EmailShell>
  );
}

function ProWelcomeEmail() {
  const gold = "#c9a84c";
  const goldLight = "#e8c96a";
  const goldDim = "rgba(201,168,76,0.15)";
  const goldBorder = "rgba(201,168,76,0.3)";

  const features = [
    { icon: "∞", label: "Unlimited messages", sub: "No daily cap, ever" },
    { icon: "🧠", label: "All AI models", sub: "Fast, Balanced, Powerful & Creative" },
    { icon: "🌐", label: "Live web search", sub: "Real-time answers from the internet" },
    { icon: "📚", label: "Knowledge Base", sub: "RAG search across your documents" },
  ];

  return (
    <div style={{ background: "#0c0a14", padding: "40px 16px", minHeight: "100%" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {/* Card */}
        <div style={{
          background: "#13111f",
          borderRadius: 20,
          overflow: "hidden",
          border: `1px solid ${goldBorder}`,
          boxShadow: `0 0 60px rgba(201,168,76,0.08), 0 24px 48px rgba(0,0,0,0.6)`,
        }}>
          {/* Gold top bar */}
          <div style={{ height: 3, background: `linear-gradient(90deg, #8b6914, ${goldLight}, #c9a84c, ${goldLight}, #8b6914)` }} />

          {/* Header */}
          <div style={{
            padding: "52px 48px 40px",
            textAlign: "center",
            background: "radial-gradient(ellipse at 50% -10%, rgba(201,168,76,0.12) 0%, transparent 65%)",
            borderBottom: `1px solid ${goldBorder}`,
          }}>
            {/* Crown */}
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: `radial-gradient(circle at 35% 35%, #e8c96a, #a0722a)`,
              boxShadow: `0 0 32px rgba(201,168,76,0.45), 0 8px 24px rgba(0,0,0,0.5)`,
              fontSize: 32,
              marginBottom: 24,
            }}>
              👑
            </div>
            <p style={{ margin: "0 0 8px", color: gold, fontSize: 11, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" }}>
              Pro Access Activated
            </p>
            <h1 style={{
              margin: "0 0 14px",
              fontSize: 30,
              fontWeight: 800,
              color: "#f5f0e8",
              letterSpacing: -0.5,
              lineHeight: 1.2,
            }}>
              Welcome to the top tier, Alex.
            </h1>
            <p style={{ margin: 0, color: "rgba(245,240,232,0.5)", fontSize: 15, lineHeight: 1.6 }}>
              Every limit is lifted. Every model is unlocked.<br />This is AI Sparky without the guardrails.
            </p>
          </div>

          {/* Body */}
          <div style={{ padding: "36px 48px 12px" }}>
            <p style={{ margin: "0 0 24px", color: "rgba(245,240,232,0.4)", fontSize: 12, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
              What's unlocked
            </p>
            {features.map((f, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "16px 20px",
                marginBottom: 8,
                background: goldDim,
                borderRadius: 12,
                border: `1px solid ${goldBorder}`,
              }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "rgba(201,168,76,0.1)",
                  border: `1px solid ${goldBorder}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  flexShrink: 0,
                  lineHeight: 1,
                }}>
                  {f.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: "0 0 2px", color: "#f5f0e8", fontSize: 14, fontWeight: 700 }}>{f.label}</p>
                  <p style={{ margin: 0, color: "rgba(245,240,232,0.45)", fontSize: 13 }}>{f.sub}</p>
                </div>
                <div style={{ color: gold, fontSize: 16, flexShrink: 0 }}>✓</div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{ padding: "28px 48px 40px", textAlign: "center" }}>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              style={{
                display: "inline-block",
                background: `linear-gradient(135deg, #a07830, ${goldLight}, #a07830)`,
                color: "#1a1200",
                fontWeight: 800,
                fontSize: 15,
                padding: "15px 48px",
                borderRadius: 12,
                textDecoration: "none",
                letterSpacing: 0.3,
                boxShadow: `0 4px 24px rgba(201,168,76,0.4)`,
              }}
            >
              Start chatting →
            </a>
          </div>

          {/* Footer */}
          <div style={{
            padding: "18px 48px 28px",
            borderTop: `1px solid rgba(201,168,76,0.1)`,
            textAlign: "center",
          }}>
            <p style={{ margin: "0 0 4px", color: "rgba(245,240,232,0.2)", fontSize: 12 }}>
              You received this because your account was upgraded to Pro.
            </p>
            <p style={{ margin: 0, color: "rgba(245,240,232,0.2)", fontSize: 12 }}>
              We never train on your conversations. Your privacy is our priority.
            </p>
          </div>

          {/* Gold bottom bar */}
          <div style={{ height: 3, background: `linear-gradient(90deg, #8b6914, ${goldLight}, #c9a84c, ${goldLight}, #8b6914)` }} />
        </div>
      </div>
    </div>
  );
}

function ApiAccessGrantedEmail() {
  return (
    <EmailShell
      accent={ACCENT_PURPLE}
      headerBg={HEADER_PURPLE}
      headerBorder={BORDER_PURPLE}
      icon="🔌"
      title="API Access Granted"
      subtitle="Your external API key is now active"
    >
      <p style={{ margin: "0 0 20px", color: "#374151", fontSize: 15, lineHeight: 1.7 }}>
        Hi <strong>Alex</strong>,<br /><br />
        Your API access has been enabled. You can now generate and use your API key to call AI Sparky from external apps and integrations.
      </p>
      {ctaButton("View API Access →")}
      <p style={{ margin: "24px 0 0", color: "#9ca3af", fontSize: 13, textAlign: "center" }}>
        If you did not expect this, please contact your administrator.
      </p>
    </EmailShell>
  );
}

function ApiAccessRevokedEmail() {
  return (
    <EmailShell
      accent={ACCENT_GRAY}
      headerBg={HEADER_GRAY}
      headerBorder={BORDER_GRAY}
      icon="🚫"
      title="API Access Revoked"
      subtitle="Your external API key has been deactivated"
    >
      <p style={{ margin: "0 0 20px", color: "#374151", fontSize: 15, lineHeight: 1.7 }}>
        Hi <strong>Alex</strong>,<br /><br />
        Your API access has been disabled. Your existing API key will no longer work.
      </p>
      <p style={{ margin: 0, color: "#6b7280", fontSize: 14, textAlign: "center" }}>
        Contact your administrator if you believe this was done in error.
      </p>
    </EmailShell>
  );
}

function TestEmail() {
  return (
    <EmailShell
      accent={ACCENT_PURPLE}
      headerBg={HEADER_PURPLE}
      headerBorder={BORDER_PURPLE}
      icon="🧪"
      title="SMTP Test Successful"
      subtitle="Your email configuration is working"
      footer="This is a test email sent from the AI Sparky admin panel."
    >
      <p style={{ margin: "0 0 20px", color: "#374151", fontSize: 15, lineHeight: 1.7 }}>
        Hi <strong>Admin</strong>,<br /><br />
        This is a test email from your AI Sparky SMTP configuration. If you received this, your email setup is working correctly! 🎉
      </p>
      <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "16px 20px" }}>
        <p style={{ margin: 0, color: "#166534", fontSize: 14 }}>
          ✅ SMTP connection: <strong>Successful</strong><br />
          ✅ Authentication: <strong>Passed</strong><br />
          ✅ Email delivery: <strong>Working</strong>
        </p>
      </div>
    </EmailShell>
  );
}

const TABS = [
  { id: "verification", label: "✉️ Verify Email", Component: VerificationEmail },
  { id: "welcome",      label: "✨ Welcome",      Component: WelcomeEmail },
  { id: "forgot",       label: "🔑 Reset Password", Component: ForgotPasswordEmail },
  { id: "changed",      label: "🛡️ Password Changed", Component: PasswordChangedEmail },
  { id: "pro",          label: "👑 Pro Upgrade",  Component: ProWelcomeEmail },
  { id: "api-granted",  label: "🔌 API Granted",  Component: ApiAccessGrantedEmail },
  { id: "api-revoked",  label: "🚫 API Revoked",  Component: ApiAccessRevokedEmail },
  { id: "test",         label: "🧪 Test Email",   Component: TestEmail },
];

export function Preview() {
  const [active, setActive] = useState("verification");
  const tab = TABS.find((t) => t.id === active)!;
  const { Component } = tab;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", background: "#1e1b4b" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", overflowX: "auto", gap: 4, padding: "10px 12px", background: "#1e1b4b", flexShrink: 0, scrollbarWidth: "none" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
              background: active === t.id ? "#7c3aed" : "rgba(255,255,255,0.08)",
              color: active === t.id ? "#fff" : "rgba(255,255,255,0.6)",
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Email preview */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <Component />
      </div>
    </div>
  );
}
