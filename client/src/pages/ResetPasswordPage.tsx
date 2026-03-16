import { useState } from "react";
import { useLocation } from "wouter";
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) { setError("Invalid reset link. Please request a new one."); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords don't match."); return; }

    setLoading(true);
    setError(null);
    try {
      await apiRequest("POST", "/api/auth/reset-password", { token, newPassword });
      setSuccess(true);
    } catch (err: unknown) {
      setError((err as Error)?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="AI Sparky" className="w-16 h-16 rounded-2xl shadow-2xl shadow-primary/30 mb-4 object-cover" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Set new password</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter your new password below</p>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-lg p-6">
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <p className="font-semibold text-foreground">Password updated!</p>
              <p className="text-sm text-muted-foreground">Your password has been successfully changed. You can now sign in.</p>
              <button
                onClick={() => navigate("/login")}
                data-testid="link-go-to-signin"
                className="mt-2 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-all hover:opacity-90"
              >
                Sign in
              </button>
            </div>
          ) : !token ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <XCircle className="w-12 h-12 text-destructive" />
              <p className="font-semibold text-foreground">Invalid link</p>
              <p className="text-sm text-muted-foreground">This password reset link is invalid or has already been used.</p>
              <button
                onClick={() => navigate("/login")}
                className="mt-2 text-sm text-primary hover:underline"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="new-password">
                  New password
                </label>
                <div className="relative">
                  <input
                    id="new-password"
                    type={showPass ? "text" : "password"}
                    autoComplete="new-password"
                    data-testid="input-new-password"
                    placeholder="At least 6 characters"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className={cn(
                      "w-full px-3.5 py-2.5 pr-10 rounded-xl text-sm bg-background border transition-colors outline-none",
                      "placeholder:text-muted-foreground/50 text-foreground",
                      "focus:ring-2 focus:ring-primary/30 focus:border-primary/60 border-border hover:border-border/80"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="confirm-password">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  type={showPass ? "text" : "password"}
                  autoComplete="new-password"
                  data-testid="input-confirm-password"
                  placeholder="Same as above"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className={cn(
                    "w-full px-3.5 py-2.5 rounded-xl text-sm bg-background border transition-colors outline-none",
                    "placeholder:text-muted-foreground/50 text-foreground",
                    "focus:ring-2 focus:ring-primary/30 focus:border-primary/60 border-border hover:border-border/80"
                  )}
                />
              </div>

              {error && (
                <div data-testid="error-reset" className="px-3.5 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                data-testid="button-submit-reset"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Update password
              </button>

              <p className="text-center text-sm text-muted-foreground">
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="text-primary hover:underline"
                >
                  Back to sign in
                </button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
