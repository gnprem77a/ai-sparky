import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Loader2, ArrowLeft, Mail, CheckCircle2, RefreshCw, AtSign, Check, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

const loginSchema = z.object({
  email: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});
type LoginData = z.infer<typeof loginSchema>;

const registerSchema = z.object({
  username: z.string()
    .min(3, "At least 3 characters")
    .max(20, "20 characters max")
    .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, underscores"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "At least 6 characters"),
});
type RegisterData = z.infer<typeof registerSchema>;

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

  /* ── username availability check ── */
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [usernameMsg, setUsernameMsg] = useState<string>("");
  const usernameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── post-register "check your email" state ── */
  const [pendingVerification, setPendingVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  /* ── unverified login state ── */
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  /* ── standalone resend-verification mode ── */
  const [resendMode, setResendMode] = useState(false);
  const [resendModeEmail, setResendModeEmail] = useState("");
  const [resendModeLoading, setResendModeLoading] = useState(false);
  const [resendModeSent, setResendModeSent] = useState(false);
  const [resendModeError, setResendModeError] = useState<string | null>(null);

  const handleResendMode = async () => {
    if (!resendModeEmail.trim()) return;
    setResendModeLoading(true);
    setResendModeError(null);
    setResendModeSent(false);
    try {
      const res = await fetch("/api/auth/resend-verification-public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendModeEmail.trim().toLowerCase() }),
        credentials: "include",
      });
      if (res.ok) {
        setResendModeSent(true);
      } else {
        const d = await res.json();
        setResendModeError(d.error ?? "Failed to send. Please try again.");
      }
    } catch {
      setResendModeError("Something went wrong. Please try again.");
    } finally {
      setResendModeLoading(false);
    }
  };

  const { login, register } = useAuth();
  const [, navigate] = useLocation();

  const isLogin = tab === "login";

  const loginForm = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<RegisterData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", email: "", password: "" },
  });

  const forgotForm = useForm<ForgotData>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const { t } = useLanguage();

  const loginServerError = (login.error as Error)?.message;
  const registerServerError = (register.error as Error)?.message;
  const serverError = isLogin ? loginServerError : registerServerError;
  const isUnverifiedError = !!serverError && serverError.toLowerCase().includes("verify your email");

  /* ── username debounced availability check ── */
  const checkUsername = (value: string) => {
    if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current);
    const trimmed = value.trim();
    if (!trimmed || trimmed.length < 3) {
      setUsernameStatus("idle");
      setUsernameMsg("");
      return;
    }
    setUsernameStatus("checking");
    usernameTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/check-username?username=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        if (data.available) {
          setUsernameStatus("available");
          setUsernameMsg("Username is available");
        } else {
          setUsernameStatus("taken");
          setUsernameMsg(data.reason ?? "Username is already taken");
        }
      } catch {
        setUsernameStatus("idle");
      }
    }, 400);
  };

  useEffect(() => {
    return () => { if (usernameTimerRef.current) clearTimeout(usernameTimerRef.current); };
  }, []);

  const onLoginSubmit = async (data: LoginData) => {
    setUnverifiedEmail(null);
    try {
      await login.mutateAsync(data);
      navigate("/");
    } catch (err) {
      const msg = (err as Error)?.message ?? "";
      if (msg.toLowerCase().includes("verify your email")) {
        setUnverifiedEmail(data.email);
      }
    }
  };

  const onRegisterSubmit = async (data: RegisterData) => {
    if (usernameStatus === "taken") return;
    try {
      const result = await register.mutateAsync(data);
      if (result?.pendingVerification) {
        setPendingEmail(data.email);
        setPendingVerification(true);
      } else {
        navigate("/");
      }
    } catch {
      // error shown from serverError
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
    loginForm.reset();
    registerForm.reset();
    login.reset();
    register.reset();
    setForgotMode(false);
    setForgotSent(false);
    setPendingVerification(false);
    setUnverifiedEmail(null);
    setResendSent(false);
    setResendError(null);
    setResendMode(false);
    setResendModeSent(false);
    setResendModeError(null);
    setResendModeEmail("");
    setUsernameStatus("idle");
    setUsernameMsg("");
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative overflow-hidden">
      {/* Premium ambient glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-primary/6 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[350px] h-[300px] bg-violet-600/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="w-full max-w-sm relative z-10">

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
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-2xl bg-primary/25 blur-2xl scale-150 pointer-events-none" />
            <img src="/logo.png" alt="AI Sparky" className="relative w-16 h-16 rounded-2xl shadow-2xl shadow-primary/40 object-cover ring-1 ring-white/10" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {forgotMode ? "Reset password" : isLogin ? t("auth.login") : t("auth.register")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {resendMode ? "We'll send you a new verification link" : forgotMode ? "We'll send you a link to reset your password" : t("auth.tagline")}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border/70 bg-card shadow-xl shadow-black/30 p-6 ring-1 ring-white/[0.04]">

          {resendMode ? (
            resendModeSent ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500" />
                <p className="font-semibold text-foreground">Verification email sent</p>
                <p className="text-sm text-muted-foreground">
                  If an unverified account with that email exists, we've sent a new verification link. Check your inbox (and spam folder).
                </p>
                <button
                  onClick={() => { setResendMode(false); setResendModeSent(false); setResendModeEmail(""); }}
                  className="mt-2 text-sm text-primary hover:underline font-medium"
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="resend-email">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                    <input
                      id="resend-email"
                      type="email"
                      autoComplete="email"
                      data-testid="input-resend-email"
                      placeholder="you@example.com"
                      value={resendModeEmail}
                      onChange={(e) => setResendModeEmail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleResendMode(); } }}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-sm bg-background border border-border hover:border-border/80 transition-colors outline-none placeholder:text-muted-foreground/50 text-foreground focus:ring-2 focus:ring-primary/30 focus:border-primary/60"
                    />
                  </div>
                </div>

                {resendModeError && (
                  <div className="px-3.5 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                    {resendModeError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleResendMode}
                  disabled={resendModeLoading || !resendModeEmail.trim()}
                  data-testid="button-submit-resend-mode"
                  className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {resendModeLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Send verification link
                </button>

                <button
                  type="button"
                  onClick={() => { setResendMode(false); setResendModeError(null); setResendModeEmail(""); }}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Back to sign in
                </button>
              </div>
            )
          ) : forgotMode ? (
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

              {/* LOGIN FORM */}
              {isLogin && (
                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="login-email">
                      Email or username
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                      <input
                        id="login-email"
                        type="text"
                        autoComplete="username"
                        data-testid="input-email"
                        placeholder="you@example.com or username"
                        {...loginForm.register("email")}
                        className={cn(
                          "w-full pl-9 pr-3.5 py-2.5 rounded-xl text-sm bg-background border transition-colors outline-none",
                          "placeholder:text-muted-foreground/50 text-foreground",
                          "focus:ring-2 focus:ring-primary/30 focus:border-primary/60",
                          loginForm.formState.errors.email
                            ? "border-destructive/60"
                            : "border-border hover:border-border/80"
                        )}
                      />
                    </div>
                    {loginForm.formState.errors.email && (
                      <p className="text-xs text-destructive mt-1">{loginForm.formState.errors.email.message}</p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-foreground" htmlFor="login-password">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => { setForgotMode(true); setForgotSent(false); setForgotError(null); forgotForm.reset(); }}
                        data-testid="link-forgot-password"
                        className="text-xs text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="login-password"
                        type={showPass ? "text" : "password"}
                        autoComplete="current-password"
                        data-testid="input-password"
                        placeholder="••••••••"
                        {...loginForm.register("password")}
                        className={cn(
                          "w-full px-3.5 py-2.5 pr-10 rounded-xl text-sm bg-background border transition-colors outline-none",
                          "placeholder:text-muted-foreground/50 text-foreground",
                          "focus:ring-2 focus:ring-primary/30 focus:border-primary/60",
                          loginForm.formState.errors.password
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
                    {loginForm.formState.errors.password && (
                      <p className="text-xs text-destructive mt-1">{loginForm.formState.errors.password.message}</p>
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
                    disabled={login.isPending}
                    className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {login.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t("auth.loginBtn")}
                  </button>
                </form>
              )}

              {/* REGISTER FORM */}
              {!isLogin && (
                <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                  {/* Username */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="reg-username">
                      Username
                    </label>
                    <div className="relative">
                      <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                      <input
                        id="reg-username"
                        type="text"
                        autoComplete="username"
                        data-testid="input-username"
                        placeholder="yourname"
                        {...registerForm.register("username", {
                          onChange: (e) => checkUsername(e.target.value),
                        })}
                        className={cn(
                          "w-full pl-9 pr-9 py-2.5 rounded-xl text-sm bg-background border transition-colors outline-none",
                          "placeholder:text-muted-foreground/50 text-foreground",
                          "focus:ring-2 focus:ring-primary/30 focus:border-primary/60",
                          usernameStatus === "taken" || registerForm.formState.errors.username
                            ? "border-destructive/60"
                            : usernameStatus === "available"
                            ? "border-green-500/60"
                            : "border-border hover:border-border/80"
                        )}
                      />
                      {/* Status icon */}
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {usernameStatus === "checking" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/60" />}
                        {usernameStatus === "available" && <Check className="w-4 h-4 text-green-500" />}
                        {usernameStatus === "taken" && <X className="w-4 h-4 text-destructive" />}
                      </div>
                    </div>
                    {registerForm.formState.errors.username && (
                      <p className="text-xs text-destructive mt-1">{registerForm.formState.errors.username.message}</p>
                    )}
                    {!registerForm.formState.errors.username && usernameStatus === "available" && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">{usernameMsg}</p>
                    )}
                    {!registerForm.formState.errors.username && usernameStatus === "taken" && (
                      <p className="text-xs text-destructive mt-1">{usernameMsg} — choose a different one</p>
                    )}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="reg-email">
                      Email address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                      <input
                        id="reg-email"
                        type="email"
                        autoComplete="email"
                        data-testid="input-email"
                        placeholder="you@example.com"
                        {...registerForm.register("email")}
                        className={cn(
                          "w-full pl-9 pr-3.5 py-2.5 rounded-xl text-sm bg-background border transition-colors outline-none",
                          "placeholder:text-muted-foreground/50 text-foreground",
                          "focus:ring-2 focus:ring-primary/30 focus:border-primary/60",
                          registerForm.formState.errors.email
                            ? "border-destructive/60"
                            : "border-border hover:border-border/80"
                        )}
                      />
                    </div>
                    {registerForm.formState.errors.email && (
                      <p className="text-xs text-destructive mt-1">{registerForm.formState.errors.email.message}</p>
                    )}
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="reg-password">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="reg-password"
                        type={showPass ? "text" : "password"}
                        autoComplete="new-password"
                        data-testid="input-password"
                        placeholder="••••••••"
                        {...registerForm.register("password")}
                        className={cn(
                          "w-full px-3.5 py-2.5 pr-10 rounded-xl text-sm bg-background border transition-colors outline-none",
                          "placeholder:text-muted-foreground/50 text-foreground",
                          "focus:ring-2 focus:ring-primary/30 focus:border-primary/60",
                          registerForm.formState.errors.password
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
                    {registerForm.formState.errors.password && (
                      <p className="text-xs text-destructive mt-1">{registerForm.formState.errors.password.message}</p>
                    )}
                  </div>

                  {registerServerError && (
                    <div data-testid="error-auth" className="rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3.5 py-2.5">
                      {registerServerError}
                    </div>
                  )}

                  <button
                    type="submit"
                    data-testid="button-submit-auth"
                    disabled={register.isPending || usernameStatus === "taken" || usernameStatus === "checking"}
                    className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {register.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    {t("auth.registerBtn")}
                  </button>
                </form>
              )}

              {/* Switch link */}
              <p className="text-center text-sm text-muted-foreground mt-5">
                {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                <button
                  onClick={() => switchTab(isLogin ? "register" : "login")}
                  data-testid="link-switch-tab"
                  className="text-primary font-medium hover:underline"
                >
                  {isLogin ? "Sign up" : "Sign in"}
                </button>
              </p>

              {/* Resend verification link — only shown on login tab */}
              {isLogin && (
                <p className="text-center text-xs text-muted-foreground/70 mt-2">
                  Didn't verify your email?{" "}
                  <button
                    type="button"
                    onClick={() => { setResendMode(true); setResendModeError(null); setResendModeSent(false); }}
                    data-testid="link-resend-verification"
                    className="text-muted-foreground hover:text-foreground underline transition-colors"
                  >
                    Resend verification link
                  </button>
                </p>
              )}

              {/* Legal links */}
              {!isLogin && (
                <p className="text-center text-xs text-muted-foreground/60 mt-4 leading-relaxed">
                  By creating an account you agree to our{" "}
                  <a href="/terms" className="underline hover:text-muted-foreground">Terms of Service</a>
                  {" "}and{" "}
                  <a href="/privacy" className="underline hover:text-muted-foreground">Privacy Policy</a>.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
