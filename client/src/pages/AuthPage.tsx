import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Loader2, ArrowLeft, Mail, CheckCircle2, RefreshCw } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

const schema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "At least 6 characters"),
});
type FormData = z.infer<typeof schema>;

const forgotSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});
type ForgotData = z.infer<typeof forgotSchema>;

export default function AuthPage() {
  const initialTab = (): "login" | "register" => {
    const p = new URLSearchParams(window.location.search).get("tab");
    return p === "register" ? "register" : "login";
  };
  const [tab, setTab] = useState<"login" | "register">(initialTab);
  const [showPass, setShowPass] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);

  /* ── post-register "check your email" state ── */
  const [pendingVerification, setPendingVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  /* ── unverified login state ── */
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  const { login, register } = useAuth();
  const [, navigate] = useLocation();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const forgotForm = useForm<ForgotData>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const { t } = useLanguage();
  const isLogin = tab === "login";
  const mutation = isLogin ? login : register;
  const serverError = (mutation.error as Error)?.message;

  const isUnverifiedError = !!serverError && serverError.toLowerCase().includes("verify your email");

  const onSubmit = async (data: FormData) => {
    setUnverifiedEmail(null);
    try {
      const result = await mutation.mutateAsync(data);
      if (!isLogin && result?.pendingVerification) {
        setPendingEmail(data.email);
        setPendingVerification(true);
      } else {
        navigate("/");
      }
    } catch {
      if (isLogin) {
        const msg = (mutation.error as Error)?.message ?? "";
        if (msg.toLowerCase().includes("verify your email")) {
          setUnverifiedEmail(data.email);
        }
      }
    }
  };

  const handleResend = async (email: string) => {
    setResendLoading(true);
    setResendError(null);
    setResendSent(false);
    try {
      const res = await fetch("/api/auth/resend-verification-public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
      });
      if (res.ok) {
        setResendSent(true);
      } else {
        const d = await res.json();
        setResendError(d.error ?? "Failed to resend. Please try again.");
      }
    } catch {
      setResendError("Something went wrong. Please try again.");
    } finally {
      setResendLoading(false);
    }
  };

  const onForgotSubmit = async (data: ForgotData) => {
    setForgotLoading(true);
    setForgotError(null);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email: data.email });
      setForgotSent(true);
    } catch (err: unknown) {
      setForgotError((err as Error)?.message ?? "Something went wrong. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  };

  const switchTab = (t: "login" | "register") => {
    setTab(t);
    form.reset();
    mutation.reset();
    setForgotMode(false);
    setForgotSent(false);
    setPendingVerification(false);
    setUnverifiedEmail(null);
    setResendSent(false);
    setResendError(null);
  };

  /* ── "Check your email" screen (shown after successful register) ── */
  if (pendingVerification) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Check your email</h1>
            <p className="text-sm text-muted-foreground mt-1 text-center">One more step to activate your account</p>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-lg p-6 text-center space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              We sent a verification link to{" "}
              <span className="font-medium text-foreground">{pendingEmail}</span>.
              Click the link in the email to activate your account.
            </p>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
              Check your spam/junk folder if you don't see it within a minute.
            </div>

            {resendSent ? (
              <div className="flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                Verification email resent!
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Didn't receive it?</p>
                <button
                  onClick={() => handleResend(pendingEmail)}
                  disabled={resendLoading}
                  data-testid="button-resend-verification"
                  className="flex items-center justify-center gap-1.5 mx-auto text-sm text-primary hover:underline font-medium disabled:opacity-60"
                >
                  {resendLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Resend verification email
                </button>
                {resendError && <p className="text-xs text-destructive">{resendError}</p>}
              </div>
            )}

            <button
              onClick={() => switchTab("login")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              data-testid="link-back-to-login"
            >
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">

        {/* Back link */}
        <button
          onClick={() => forgotMode ? (setForgotMode(false), setForgotSent(false)) : navigate("/")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6 group"
          data-testid="link-back-to-home"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
          {forgotMode ? "Back to sign in" : "Back to home"}
        </button>

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="AI Sparky" className="w-16 h-16 rounded-2xl shadow-2xl shadow-primary/30 mb-4 object-cover" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {forgotMode ? "Reset password" : isLogin ? t("auth.login") : t("auth.register")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {forgotMode ? "We'll send you a link to reset your password" : t("auth.tagline")}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card shadow-lg p-6">

          {forgotMode ? (
            forgotSent ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
                <p className="font-semibold text-foreground">Check your email</p>
                <p className="text-sm text-muted-foreground">
                  If an account with that email exists, we've sent a password reset link. It expires in 15 minutes.
                </p>
                <button
                  onClick={() => { setForgotMode(false); setForgotSent(false); }}
                  className="mt-2 text-sm text-primary hover:underline font-medium"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={forgotForm.handleSubmit(onForgotSubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="forgot-email">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                    <input
                      id="forgot-email"
                      type="email"
                      autoComplete="email"
                      data-testid="input-forgot-email"
                      placeholder="you@example.com"
                      {...forgotForm.register("email")}
                      className={cn(
                        "w-full pl-9 pr-3.5 py-2.5 rounded-xl text-sm bg-background border transition-colors outline-none",
                        "placeholder:text-muted-foreground/50 text-foreground",
                        "focus:ring-2 focus:ring-primary/30 focus:border-primary/60",
                        forgotForm.formState.errors.email
                          ? "border-destructive/60"
                          : "border-border hover:border-border/80"
                      )}
                    />
                  </div>
                  {forgotForm.formState.errors.email && (
                    <p className="text-xs text-destructive mt-1">{forgotForm.formState.errors.email.message}</p>
                  )}
                </div>

                {forgotError && (
                  <div className="px-3.5 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                    {forgotError}
                  </div>
                )}

                <button
                  type="submit"
                  data-testid="button-submit-forgot"
                  disabled={forgotLoading}
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {forgotLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Send reset link
                </button>
              </form>
            )
          ) : (
            <>
              {/* Tabs */}
              <div className="flex rounded-xl bg-muted p-1 mb-6">
                {(["login", "register"] as const).map((tabKey) => (
                  <button
                    key={tabKey}
                    onClick={() => switchTab(tabKey)}
                    data-testid={`tab-${tabKey}`}
                    className={cn(
                      "flex-1 py-1.5 text-sm font-medium rounded-lg transition-all duration-150",
                      tab === tabKey
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tabKey === "login" ? t("auth.login") : t("auth.register")}
                  </button>
                ))}
              </div>

              {/* Form */}
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="email">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      data-testid="input-email"
                      placeholder="you@example.com"
                      {...form.register("email")}
                      className={cn(
                        "w-full pl-9 pr-3.5 py-2.5 rounded-xl text-sm bg-background border transition-colors outline-none",
                        "placeholder:text-muted-foreground/50 text-foreground",
                        "focus:ring-2 focus:ring-primary/30 focus:border-primary/60",
                        form.formState.errors.email
                          ? "border-destructive/60"
                          : "border-border hover:border-border/80"
                      )}
                    />
                  </div>
                  {form.formState.errors.email && (
                    <p className="text-xs text-destructive mt-1">{form.formState.errors.email.message}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-foreground" htmlFor="password">
                      Password
                    </label>
                    {isLogin && (
                      <button
                        type="button"
                        onClick={() => { setForgotMode(true); setForgotSent(false); setForgotError(null); forgotForm.reset(); }}
                        data-testid="link-forgot-password"
                        className="text-xs text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPass ? "text" : "password"}
                      autoComplete={isLogin ? "current-password" : "new-password"}
                      data-testid="input-password"
                      placeholder="••••••••"
                      {...form.register("password")}
                      className={cn(
                        "w-full px-3.5 py-2.5 pr-10 rounded-xl text-sm bg-background border transition-colors outline-none",
                        "placeholder:text-muted-foreground/50 text-foreground",
                        "focus:ring-2 focus:ring-primary/30 focus:border-primary/60",
                        form.formState.errors.password
                          ? "border-destructive/60"
                          : "border-border hover:border-border/80"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.formState.errors.password && (
                    <p className="text-xs text-destructive mt-1">{form.formState.errors.password.message}</p>
                  )}
                </div>

                {serverError && (
                  <div data-testid="error-auth" className="rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm overflow-hidden">
                    <div className="px-3.5 py-2.5">{serverError}</div>
                    {isUnverifiedError && unverifiedEmail && (
                      <div className="px-3.5 pb-2.5 border-t border-destructive/10 pt-2">
                        {resendSent ? (
                          <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Verification email resent — check your inbox.
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleResend(unverifiedEmail)}
                            disabled={resendLoading}
                            data-testid="button-resend-from-login"
                            className="flex items-center gap-1.5 text-xs font-medium text-destructive/80 hover:text-destructive underline disabled:opacity-60"
                          >
                            {resendLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            Resend verification email
                          </button>
                        )}
                        {resendError && <p className="text-xs mt-1 text-destructive/70">{resendError}</p>}
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  data-testid="button-submit-auth"
                  disabled={mutation.isPending}
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isLogin ? t("auth.loginBtn") : t("auth.registerBtn")}
                </button>
              </form>

              {/* Switch link */}
              <p className="text-center text-sm text-muted-foreground mt-5">
                {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                <button
                  onClick={() => switchTab(isLogin ? "register" : "login")}
                  className="text-primary hover:underline font-medium"
                >
                  {isLogin ? "Sign up" : "Sign in"}
                </button>
              </p>

              {/* Legal links */}
              <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-border/40">
                {[
                  { label: "About", href: "/about" },
                  { label: "Privacy", href: "/privacy" },
                  { label: "Terms", href: "/terms" },
                  { label: "Contact", href: "/contact" },
                ].map(({ label, href }) => (
                  <a
                    key={href}
                    href={href}
                    className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  >
                    {label}
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
