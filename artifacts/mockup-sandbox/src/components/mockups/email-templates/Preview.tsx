import { useState } from "react";

/* ─── Shared helpers ───────────────────────────────────────────────── */

function Wrapper({ bg = "#f0edfb", children }: { bg?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: bg, padding: "40px 16px", minHeight: "100%", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

function Card({
  topGradient,
  bottomGradient = "",
  border = "transparent",
  shadow = "0 4px 32px rgba(0,0,0,0.08)",
  children,
}: {
  topGradient: string;
  bottomGradient?: string;
  border?: string;
  shadow?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: shadow, border: `1px solid ${border}` }}>
      <div style={{ height: 4, background: topGradient }} />
      {children}
      {bottomGradient && <div style={{ height: 4, background: bottomGradient }} />}
    </div>
  );
}

function Header({
  bg,
  borderColor,
  icon,
  eyebrow,
  title,
  subtitle,
  eyebrowColor = "#6d28d9",
}: {
  bg: string;
  borderColor: string;
  icon: string;
  eyebrow?: string;
  title: string;
  subtitle: React.ReactNode;
  eyebrowColor?: string;
}) {
  return (
    <div style={{ background: bg, padding: "44px 44px 36px", textAlign: "center", borderBottom: `1px solid ${borderColor}` }}>
      <div style={{ fontSize: 38, marginBottom: 16, lineHeight: 1 }}>{icon}</div>
      {eyebrow && (
        <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: eyebrowColor }}>
          {eyebrow}
        </p>
      )}
      <h1 style={{ margin: "0 0 12px", fontSize: 26, fontWeight: 800, color: "#111827", letterSpacing: -0.5, lineHeight: 1.2 }}>
        {title}
      </h1>
      <p style={{ margin: 0, color: "#6b7280", fontSize: 15, lineHeight: 1.6 }}>{subtitle}</p>
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "36px 44px 28px" }}>{children}</div>;
}

function Footer({ note, dark = false }: { note?: string; dark?: boolean }) {
  const c = dark ? "rgba(245,240,232,0.2)" : "#9ca3af";
  const border = dark ? "rgba(255,255,255,0.06)" : "#f3f4f6";
  return (
    <div style={{ padding: "18px 44px 28px", borderTop: `1px solid ${border}`, textAlign: "center" }}>
      <p style={{ margin: "0 0 3px", color: c, fontSize: 12 }}>
        {note ?? "You're receiving this email from AI Sparky."}
      </p>
      <p style={{ margin: 0, color: c, fontSize: 12 }}>
        We never train on your conversations. Your privacy is our priority.
      </p>
    </div>
  );
}

function CTAButton({ label, color = "#6d28d9", textColor = "#fff" }: { label: string; color?: string; textColor?: string }) {
  return (
    <div style={{ textAlign: "center", margin: "28px 0 4px" }}>
      <a href="#" onClick={e => e.preventDefault()} style={{
        display: "inline-block",
        background: color,
        color: textColor,
        fontWeight: 700,
        fontSize: 15,
        padding: "14px 44px",
        borderRadius: 100,
        textDecoration: "none",
        letterSpacing: 0.2,
      }}>
        {label}
      </a>
    </div>
  );
}

function InfoBox({ bg, border, children }: { bg: string; border: string; children: React.ReactNode }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 24 }}>
      {children}
    </div>
  );
}

function Divider({ note }: { note: string }) {
  return (
    <p style={{ margin: "22px 0 0", color: "#9ca3af", fontSize: 13, textAlign: "center", lineHeight: 1.5 }}>{note}</p>
  );
}

/* ─── Verification ─────────────────────────────────────────────────── */
function VerificationEmail() {
  return (
    <Wrapper bg="#f0edfb">
      <Card topGradient="linear-gradient(90deg,#7c3aed,#6d28d9,#4f46e5)">
        <Header
          bg="linear-gradient(160deg,#ede9fe 0%,#f5f3ff 60%,#e0e7ff 100%)"
          borderColor="#e5e7ff"
          icon="📬"
          eyebrow="Action required"
          eyebrowColor="#6d28d9"
          title="Verify your email address"
          subtitle={<>One click to activate your <strong>AI Sparky</strong> account</>}
        />
        <Body>
          <p style={{ margin: "0 0 24px", color: "#374151", fontSize: 15, lineHeight: 1.75 }}>
            Hi <strong>Alex</strong> 👋<br /><br />
            Thanks for signing up! Before you start chatting, we just need to confirm this is you. Hit the button below to verify your email.
          </p>
          <InfoBox bg="#faf5ff" border="#ede9fe">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>⏱️</span>
              <p style={{ margin: 0, color: "#5b21b6", fontSize: 13, lineHeight: 1.5 }}>
                This link expires in <strong>24 hours</strong> and works only once. After that, request a new one from the login page.
              </p>
            </div>
          </InfoBox>
          <CTAButton label="Verify my email →" color="#6d28d9" />
          <Divider note="Didn't sign up? You can safely ignore this email — no account will be created." />
        </Body>
        <Footer note="You received this because someone registered with this address at AI Sparky." />
      </Card>
    </Wrapper>
  );
}

/* ─── Welcome ──────────────────────────────────────────────────────── */
function WelcomeEmail() {
  const features = [
    { icon: "💬", title: "Smart Conversations", desc: "Context-aware AI that keeps track of your whole thread" },
    { icon: "⚡", title: "Multiple AI Models", desc: "Fast, Balanced, Creative — pick the right tool for the job" },
    { icon: "📎", title: "File & Image Uploads", desc: "Attach docs and images, drag & drop supported" },
    { icon: "📁", title: "Organized Folders", desc: "Group chats into folders to stay on top of your work" },
  ];

  return (
    <Wrapper bg="#f0edfb">
      <Card topGradient="linear-gradient(90deg,#7c3aed,#6d28d9,#4f46e5)">
        <Header
          bg="linear-gradient(160deg,#ede9fe 0%,#f5f3ff 60%,#e0e7ff 100%)"
          borderColor="#e5e7ff"
          icon="🎉"
          eyebrow="You're in"
          eyebrowColor="#6d28d9"
          title="Welcome to AI Sparky!"
          subtitle={<>Your account is live, <strong>Alex</strong>. Let's see what you can build.</>}
        />
        <Body>
          <p style={{ margin: "0 0 28px", color: "#374151", fontSize: 15, lineHeight: 1.75 }}>
            We're glad you're here. AI Sparky is your personal AI assistant built to help you write faster, think deeper, and get more done.
          </p>

          <div style={{ display: "grid", gap: 10, marginBottom: 28 }}>
            {features.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 14, padding: "14px 16px", background: "#faf5ff", border: "1px solid #ede9fe", borderRadius: 12 }}>
                <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{f.icon}</div>
                <div>
                  <p style={{ margin: "0 0 3px", fontWeight: 700, color: "#1e1b4b", fontSize: 14 }}>{f.title}</p>
                  <p style={{ margin: 0, color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "14px 18px", marginBottom: 28 }}>
            <p style={{ margin: 0, color: "#166534", fontSize: 13, lineHeight: 1.6 }}>
              🔒 <strong>Your privacy is protected.</strong> We never train AI on your conversations. Your data is encrypted and never shared.
            </p>
          </div>

          <CTAButton label="Start your first chat →" color="#6d28d9" />
        </Body>
        <Footer note="You received this because you just created an account on AI Sparky." />
      </Card>
    </Wrapper>
  );
}

/* ─── Forgot Password ──────────────────────────────────────────────── */
function ForgotPasswordEmail() {
  return (
    <Wrapper bg="#fff5f5">
      <Card topGradient="linear-gradient(90deg,#ef4444,#dc2626,#b91c1c)">
        <Header
          bg="linear-gradient(160deg,#fef2f2 0%,#fff5f5 60%,#fef2f2 100%)"
          borderColor="#fecaca"
          icon="🔑"
          eyebrow="Password reset"
          eyebrowColor="#dc2626"
          title="Reset your password"
          subtitle="Click the button below to choose a new password"
        />
        <Body>
          <p style={{ margin: "0 0 22px", color: "#374151", fontSize: 15, lineHeight: 1.75 }}>
            Hi <strong>Alex</strong>,<br /><br />
            We received a request to reset the password on your AI Sparky account. If this was you, click below.
          </p>

          <InfoBox bg="#fff7ed" border="#fed7aa">
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>⏰</span>
              <div>
                <p style={{ margin: "0 0 4px", color: "#92400e", fontWeight: 700, fontSize: 13 }}>Link expires in 15 minutes</p>
                <p style={{ margin: 0, color: "#a16207", fontSize: 13, lineHeight: 1.5 }}>
                  For security, this link can only be used once. Request a new one if it expires.
                </p>
              </div>
            </div>
          </InfoBox>

          <CTAButton label="Reset my password →" color="#dc2626" />

          <Divider note="If you didn't request this, no changes were made. Your current password is still active." />
        </Body>
        <Footer note="You received this because a password reset was requested for your account." />
      </Card>
    </Wrapper>
  );
}

/* ─── Password Changed ─────────────────────────────────────────────── */
function PasswordChangedEmail() {
  return (
    <Wrapper bg="#fff5f5">
      <Card topGradient="linear-gradient(90deg,#ef4444,#dc2626,#b91c1c)">
        <Header
          bg="linear-gradient(160deg,#fef2f2 0%,#fff5f5 60%,#fef2f2 100%)"
          borderColor="#fecaca"
          icon="🛡️"
          eyebrow="Security notice"
          eyebrowColor="#dc2626"
          title="Your password was changed"
          subtitle="This is a confirmation that your account password was updated"
        />
        <Body>
          <p style={{ margin: "0 0 22px", color: "#374151", fontSize: 15, lineHeight: 1.75 }}>
            Hi <strong>Alex</strong>,<br /><br />
            Your AI Sparky password was successfully updated. If you made this change, you're all set — no further action needed.
          </p>

          <InfoBox bg="#fef2f2" border="#fecaca">
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
              <div>
                <p style={{ margin: "0 0 4px", color: "#991b1b", fontWeight: 700, fontSize: 13 }}>Didn't make this change?</p>
                <p style={{ margin: 0, color: "#b91c1c", fontSize: 13, lineHeight: 1.5 }}>
                  Your account may be compromised. Use the forgot-password flow immediately to regain control, then contact your administrator.
                </p>
              </div>
            </div>
          </InfoBox>

          <CTAButton label="Go to AI Sparky →" color="#dc2626" />
        </Body>
        <Footer note="You received this security notice because your account password was changed." />
      </Card>
    </Wrapper>
  );
}

/* ─── Pro Welcome ──────────────────────────────────────────────────── */
function ProWelcomeEmail() {
  const gold = "#c9a84c";
  const goldLight = "#e8c96a";
  const goldDim = "rgba(201,168,76,0.14)";
  const goldBorder = "rgba(201,168,76,0.28)";
  const cream = "#f5f0e8";

  const features = [
    { icon: "∞", label: "Unlimited messages", sub: "No daily cap, ever" },
    { icon: "🧠", label: "All AI models", sub: "Fast, Balanced, Powerful & Creative" },
    { icon: "🌐", label: "Live web search", sub: "Real-time answers from the internet" },
    { icon: "📚", label: "Knowledge Base", sub: "RAG search across all your documents" },
  ];

  return (
    <div style={{ background: "#0c0a14", padding: "40px 16px", minHeight: "100%", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{
          background: "#13111f",
          borderRadius: 20,
          overflow: "hidden",
          border: `1px solid ${goldBorder}`,
          boxShadow: `0 0 80px rgba(201,168,76,0.07), 0 24px 56px rgba(0,0,0,0.7)`,
        }}>
          <div style={{ height: 3, background: `linear-gradient(90deg, #6b4f10, ${goldLight}, ${gold}, ${goldLight}, #6b4f10)` }} />

          {/* Header */}
          <div style={{
            padding: "52px 48px 44px",
            textAlign: "center",
            background: "radial-gradient(ellipse at 50% -20%, rgba(201,168,76,0.13) 0%, transparent 65%)",
            borderBottom: `1px solid ${goldBorder}`,
          }}>
            <div style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 72, height: 72, borderRadius: "50%",
              background: `radial-gradient(circle at 35% 35%, #f0d070, #a07828)`,
              boxShadow: `0 0 40px rgba(201,168,76,0.5), 0 8px 24px rgba(0,0,0,0.5)`,
              fontSize: 32, marginBottom: 24,
            }}>👑</div>
            <p style={{ margin: "0 0 10px", color: gold, fontSize: 11, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" }}>
              Pro Access Activated
            </p>
            <h1 style={{ margin: "0 0 14px", fontSize: 28, fontWeight: 800, color: cream, letterSpacing: -0.5, lineHeight: 1.25 }}>
              Welcome to the top tier, Alex.
            </h1>
            <p style={{ margin: 0, color: `rgba(245,240,232,0.5)`, fontSize: 15, lineHeight: 1.65 }}>
              Every limit is lifted. Every model is unlocked.<br />This is AI Sparky without the guardrails.
            </p>
          </div>

          {/* Features */}
          <div style={{ padding: "36px 48px 16px" }}>
            <p style={{ margin: "0 0 20px", color: "rgba(245,240,232,0.35)", fontSize: 11, fontWeight: 700, letterSpacing: 3.5, textTransform: "uppercase" }}>
              What's unlocked
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {features.map((f, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 16,
                  padding: "15px 18px",
                  background: goldDim, borderRadius: 12, border: `1px solid ${goldBorder}`,
                }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: "rgba(201,168,76,0.08)", border: `1px solid ${goldBorder}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 17,
                  }}>{f.icon}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: "0 0 2px", color: cream, fontSize: 14, fontWeight: 700 }}>{f.label}</p>
                    <p style={{ margin: 0, color: "rgba(245,240,232,0.42)", fontSize: 13 }}>{f.sub}</p>
                  </div>
                  <div style={{ color: gold, fontSize: 15, fontWeight: 700, flexShrink: 0 }}>✓</div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div style={{ padding: "32px 48px 44px", textAlign: "center" }}>
            <a href="#" onClick={e => e.preventDefault()} style={{
              display: "inline-block",
              background: `linear-gradient(135deg, #9b6e1a, ${goldLight}, #9b6e1a)`,
              color: "#1a1200", fontWeight: 800, fontSize: 15,
              padding: "15px 52px", borderRadius: 100,
              textDecoration: "none", letterSpacing: 0.3,
              boxShadow: `0 4px 28px rgba(201,168,76,0.45)`,
            }}>
              Start chatting →
            </a>
          </div>

          <div style={{ padding: "18px 48px 28px", borderTop: `1px solid rgba(255,255,255,0.06)`, textAlign: "center" }}>
            <p style={{ margin: "0 0 3px", color: "rgba(245,240,232,0.18)", fontSize: 12 }}>
              You received this because your account was upgraded to Pro on AI Sparky.
            </p>
            <p style={{ margin: 0, color: "rgba(245,240,232,0.18)", fontSize: 12 }}>
              We never train on your conversations. Your privacy is our priority.
            </p>
          </div>

          <div style={{ height: 3, background: `linear-gradient(90deg, #6b4f10, ${goldLight}, ${gold}, ${goldLight}, #6b4f10)` }} />
        </div>
      </div>
    </div>
  );
}

/* ─── API Access Granted ───────────────────────────────────────────── */
function ApiAccessGrantedEmail() {
  const steps = [
    { n: "1", text: "Go to your API Access page" },
    { n: "2", text: "Generate your personal API key" },
    { n: "3", text: "Add it to your app or integration" },
  ];

  return (
    <Wrapper bg="#f0edfb">
      <Card topGradient="linear-gradient(90deg,#7c3aed,#6d28d9,#4f46e5)">
        <Header
          bg="linear-gradient(160deg,#ede9fe 0%,#f5f3ff 60%,#e0e7ff 100%)"
          borderColor="#e5e7ff"
          icon="🔌"
          eyebrow="Access enabled"
          eyebrowColor="#6d28d9"
          title="Your API access is live"
          subtitle="You can now connect AI Sparky to any app or service"
        />
        <Body>
          <p style={{ margin: "0 0 24px", color: "#374151", fontSize: 15, lineHeight: 1.75 }}>
            Hi <strong>Alex</strong>,<br /><br />
            Your API access has been enabled. Use your API key to integrate AI Sparky into your own apps, automations, and workflows.
          </p>

          <p style={{ margin: "0 0 14px", color: "#374151", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5 }}>
            Get started in 3 steps
          </p>
          <div style={{ display: "grid", gap: 8, marginBottom: 28 }}>
            {steps.map((s) => (
              <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", background: "#faf5ff", border: "1px solid #ede9fe", borderRadius: 11 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%", background: "#6d28d9",
                  color: "#fff", fontWeight: 800, fontSize: 13,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>{s.n}</div>
                <p style={{ margin: 0, color: "#1e1b4b", fontSize: 14, fontWeight: 500 }}>{s.text}</p>
              </div>
            ))}
          </div>

          <CTAButton label="View API Access →" color="#6d28d9" />
          <Divider note="Didn't expect this? Please contact your administrator right away." />
        </Body>
        <Footer />
      </Card>
    </Wrapper>
  );
}

/* ─── API Access Revoked ───────────────────────────────────────────── */
function ApiAccessRevokedEmail() {
  return (
    <Wrapper bg="#f5f5f5">
      <Card topGradient="linear-gradient(90deg,#6b7280,#4b5563,#374151)">
        <Header
          bg="linear-gradient(160deg,#f9fafb 0%,#f3f4f6 60%,#f9fafb 100%)"
          borderColor="#e5e7eb"
          icon="🚫"
          eyebrow="Access removed"
          eyebrowColor="#4b5563"
          title="API access has been disabled"
          subtitle="Your API key is no longer active"
        />
        <Body>
          <p style={{ margin: "0 0 22px", color: "#374151", fontSize: 15, lineHeight: 1.75 }}>
            Hi <strong>Alex</strong>,<br /><br />
            Your API access has been revoked. Any integrations using your existing key will stop working immediately.
          </p>

          <InfoBox bg="#f9fafb" border="#e5e7eb">
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>ℹ️</span>
              <p style={{ margin: 0, color: "#4b5563", fontSize: 13, lineHeight: 1.6 }}>
                If this was done in error or you need access restored, contact your administrator. They can re-enable it from the admin panel.
              </p>
            </div>
          </InfoBox>
        </Body>
        <Footer />
      </Card>
    </Wrapper>
  );
}

/* ─── Test Email ───────────────────────────────────────────────────── */
function TestEmail() {
  const checks = [
    { label: "SMTP connection", status: "Successful" },
    { label: "Authentication", status: "Passed" },
    { label: "Email delivery", status: "Working" },
  ];

  return (
    <Wrapper bg="#f0edfb">
      <Card topGradient="linear-gradient(90deg,#7c3aed,#6d28d9,#4f46e5)">
        <Header
          bg="linear-gradient(160deg,#ede9fe 0%,#f5f3ff 60%,#e0e7ff 100%)"
          borderColor="#e5e7ff"
          icon="🧪"
          eyebrow="Admin · SMTP test"
          eyebrowColor="#6d28d9"
          title="Email configuration working"
          subtitle="Your SMTP settings are correctly configured"
        />
        <Body>
          <p style={{ margin: "0 0 24px", color: "#374151", fontSize: 15, lineHeight: 1.75 }}>
            Hi <strong>Admin</strong>,<br /><br />
            This test was sent from the AI Sparky admin panel to confirm your mail server is set up correctly. All checks passed! 🎉
          </p>

          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "20px 22px", marginBottom: 8 }}>
            {checks.map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: i < checks.length - 1 ? 12 : 0, marginBottom: i < checks.length - 1 ? 12 : 0, borderBottom: i < checks.length - 1 ? "1px solid #d1fae5" : "none" }}>
                <p style={{ margin: 0, color: "#374151", fontSize: 14 }}>{c.label}</p>
                <span style={{ background: "#dcfce7", color: "#15803d", fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 100 }}>
                  ✓ {c.status}
                </span>
              </div>
            ))}
          </div>
        </Body>
        <Footer note="This is a test email sent from the AI Sparky admin panel." />
      </Card>
    </Wrapper>
  );
}

/* ─── Tab shell ────────────────────────────────────────────────────── */
const TABS = [
  { id: "verification", label: "✉️ Verify Email",     Component: VerificationEmail },
  { id: "welcome",      label: "🎉 Welcome",           Component: WelcomeEmail },
  { id: "forgot",       label: "🔑 Reset Password",    Component: ForgotPasswordEmail },
  { id: "changed",      label: "🛡️ Password Changed",  Component: PasswordChangedEmail },
  { id: "pro",          label: "👑 Pro Upgrade",       Component: ProWelcomeEmail },
  { id: "api-granted",  label: "🔌 API Granted",       Component: ApiAccessGrantedEmail },
  { id: "api-revoked",  label: "🚫 API Revoked",       Component: ApiAccessRevokedEmail },
  { id: "test",         label: "🧪 SMTP Test",         Component: TestEmail },
];

export function Preview() {
  const [active, setActive] = useState("verification");
  const { Component } = TABS.find(t => t.id === active)!;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#18151f", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", overflowX: "auto", gap: 4, padding: "10px 12px", background: "#18151f", flexShrink: 0, scrollbarWidth: "none" }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            style={{
              padding: "7px 13px", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
              background: active === t.id ? "#7c3aed" : "rgba(255,255,255,0.07)",
              color: active === t.id ? "#fff" : "rgba(255,255,255,0.5)",
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* Preview */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <Component />
      </div>
    </div>
  );
}
