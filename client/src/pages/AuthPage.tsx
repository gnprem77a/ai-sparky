import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const schema = z.object({
  username: z.string().min(3, "At least 3 characters").max(32, "At most 32 characters"),
  password: z.string().min(6, "At least 6 characters"),
});
type FormData = z.infer<typeof schema>;

export default function AuthPage() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [showPass, setShowPass] = useState(false);
  const { login, register } = useAuth();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  const isLogin = tab === "login";
  const mutation = isLogin ? login : register;
  const serverError = (mutation.error as Error)?.message;

  const onSubmit = async (data: FormData) => {
    try {
      await mutation.mutateAsync(data);
    } catch {
      // error displayed via serverError
    }
  };

  const switchTab = (t: "login" | "register") => {
    setTab(t);
    form.reset();
    mutation.reset();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary via-violet-500 to-blue-500 flex items-center justify-center shadow-2xl shadow-primary/25 mb-4">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="white" opacity="0.35"/>
              <path d="M8 8h2.5l1.5 4 1.5-4H16l-2.5 8H11L8 8z" fill="white"/>
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {isLogin ? "Welcome back" : "Create account"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLogin ? "Sign in to continue" : "Get started for free"}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card shadow-lg p-6">

          {/* Tabs */}
          <div className="flex rounded-xl bg-muted p-1 mb-6">
            {(["login", "register"] as const).map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                data-testid={`tab-${t}`}
                className={cn(
                  "flex-1 py-1.5 text-sm font-medium rounded-lg transition-all duration-150",
                  tab === t
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "login" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                data-testid="input-username"
                placeholder="your_username"
                {...form.register("username")}
                className={cn(
                  "w-full px-3.5 py-2.5 rounded-xl text-sm bg-background border transition-colors outline-none",
                  "placeholder:text-muted-foreground/50 text-foreground",
                  "focus:ring-2 focus:ring-primary/30 focus:border-primary/60",
                  form.formState.errors.username
                    ? "border-destructive/60"
                    : "border-border hover:border-border/80"
                )}
              />
              {form.formState.errors.username && (
                <p className="text-xs text-destructive mt-1">{form.formState.errors.username.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5" htmlFor="password">
                Password
              </label>
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
              <div data-testid="error-auth" className="px-3.5 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {serverError}
              </div>
            )}

            <button
              type="submit"
              data-testid="button-submit-auth"
              disabled={mutation.isPending}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLogin ? "Sign in" : "Create account"}
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
        </div>
      </div>
    </div>
  );
}
