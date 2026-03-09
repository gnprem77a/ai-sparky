import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Crown, Shield, User, Lock, Palette, MessageSquare,
  Eye, EyeOff, Check, Save, LogOut, ChevronRight, Zap, Calendar,
  Hash, Bot, Type, Key,
} from "lucide-react";

interface Settings {
  systemPrompt: string;
  fontSize: string;
  assistantName: string;
  activePromptId: string | null;
}

interface UsageData {
  count: number;
  limit: number;
  isPro: boolean;
  date: string;
}

interface SavedPrompt {
  id: string;
  title: string;
  content: string;
}

const FONT_SIZES = [
  { value: "compact", label: "Compact", desc: "Smaller text" },
  { value: "normal",  label: "Normal",  desc: "Default" },
  { value: "large",   label: "Large",   desc: "Easier to read" },
];

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border/40 bg-muted/20">
        <span className="text-primary/70">{icon}</span>
        <h2 className="font-semibold text-sm text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  const [fontSize, setFontSize]         = useState("normal");
  const [assistantName, setAssistantName] = useState("Assistant");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const [appearanceSaved, setAppearanceSaved] = useState(false);
  const [promptSaved, setPromptSaved]     = useState(false);
  const [themeColor, setThemeColor] = useState(() => localStorage.getItem("theme-color") || "default");

  const themes = [
    { name: "default", color: "bg-[#7c3aed]" },
    { name: "ocean", color: "bg-[#0ea5e9]" },
    { name: "sunset", color: "bg-[#f97316]" },
    { name: "forest", color: "bg-[#22c55e]" },
    { name: "midnight", color: "bg-[#3b82f6]" },
  ];

  const handleThemeChange = (name: string) => {
    themes.forEach(t => {
      document.documentElement.classList.remove(`theme-${t.name}`);
    });
    if (name !== "default") {
      document.documentElement.classList.add(`theme-${name}`);
    }
    setThemeColor(name);
    localStorage.setItem("theme-color", name);
  };

  const [currentPw, setCurrentPw]   = useState("");
  const [newPw, setNewPw]           = useState("");
  const [confirmPw, setConfirmPw]   = useState("");
  const [showCurr, setShowCurr]     = useState(false);
  const [showNew, setShowNew]       = useState(false);
  const [pwError, setPwError]       = useState("");
  const [pwSuccess, setPwSuccess]   = useState(false);

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const { data: usage } = useQuery<UsageData>({
    queryKey: ["/api/settings/usage"],
  });

  const { data: prompts = [] } = useQuery<SavedPrompt[]>({
    queryKey: ["/api/prompts"],
  });

  useEffect(() => {
    if (settings) {
      setFontSize(settings.fontSize ?? "normal");
      setAssistantName(settings.assistantName ?? "Assistant");
      setSystemPrompt(settings.systemPrompt ?? "");
      setActivePromptId(settings.activePromptId ?? null);
    }
  }, [settings]);

  const settingsMutation = useMutation({
    mutationFn: (data: Partial<Settings>) =>
      apiRequest("PATCH", "/api/settings", data).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings"] }),
  });

  const handleSaveAppearance = () => {
    settingsMutation.mutate({ fontSize, assistantName });
    setAppearanceSaved(true);
    setTimeout(() => setAppearanceSaved(false), 2000);
  };

  const handleSavePrompt = () => {
    settingsMutation.mutate({ systemPrompt, activePromptId });
    setPromptSaved(true);
    setTimeout(() => setPromptSaved(false), 2000);
  };

  const handleChangePassword = async () => {
    setPwError("");
    setPwSuccess(false);
    if (!currentPw || !newPw || !confirmPw) { setPwError("All fields are required."); return; }
    if (newPw.length < 6) { setPwError("New password must be at least 6 characters."); return; }
    if (newPw !== confirmPw) { setPwError("New passwords do not match."); return; }
    try {
      const res = await apiRequest("POST", "/api/auth/change-password", {
        currentPassword: currentPw,
        newPassword: newPw,
      });
      if (!res.ok) {
        const err = await res.json();
        setPwError(err.error ?? "Failed to change password.");
        return;
      }
      setPwSuccess(true);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setTimeout(() => setPwSuccess(false), 3000);
    } catch {
      setPwError("Something went wrong.");
    }
  };

  const isPro = usage?.isPro ?? user?.plan === "pro";
  const usagePercent = usage ? Math.min((usage.count / usage.limit) * 100, 100) : 0;

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  const proExpiry = user?.planExpiresAt
    ? new Date(user.planExpiresAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
    : null;

  if (!user) return null;

  const avatarLetter = user.username[0].toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top nav */}
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/90 backdrop-blur-md">
        <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => navigate("/")}
            data-testid="button-back-to-chat"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Chat
          </button>
          <span className="text-border/60">·</span>
          <span className="text-sm font-medium text-foreground">Profile</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* ── Hero ── */}
        <div className="rounded-2xl border border-border/50 bg-card/60 overflow-hidden">
          <div className="h-24 bg-gradient-to-br from-primary/20 via-violet-500/10 to-transparent" />
          <div className="px-6 pb-6 -mt-10">
            <div className={cn(
              "w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold shadow-xl border-4 border-background",
              isPro ? "bg-amber-500/20 text-amber-400" : "bg-gradient-to-br from-primary to-violet-500 text-white"
            )}>
              {avatarLetter}
            </div>

            <div className="mt-3 flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold tracking-tight" data-testid="text-profile-username">
                  {user.username}
                </h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {user.isAdmin && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-500/15 text-violet-400 border border-violet-500/20">
                      <Shield className="w-3 h-3" /> Admin
                    </span>
                  )}
                  <span className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                    isPro
                      ? "bg-amber-500/15 text-amber-400 border-amber-500/25"
                      : "bg-muted text-muted-foreground border-border/50"
                  )}>
                    {isPro ? <Crown className="w-3 h-3" /> : <User className="w-3 h-3" />}
                    {isPro ? "Pro Plan" : "Free Plan"}
                  </span>
                  {memberSince && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60">
                      <Calendar className="w-3 h-3" /> Member since {memberSince}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => { logout.mutate(); navigate("/"); }}
                data-testid="button-sign-out"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/50 text-sm text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          </div>
        </div>

        {/* ── Plan & Usage ── */}
        <SectionCard icon={<Zap className="w-4 h-4" />} title="Plan & Usage">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {isPro ? "Pro Plan" : "Free Plan"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isPro
                    ? proExpiry ? `Expires ${proExpiry}` : "Active — no expiry"
                    : "Upgrade to Pro for unlimited messages and all models"}
                </p>
              </div>
              {!isPro && (
                <span className="text-xs text-primary font-medium flex items-center gap-1">
                  <ChevronRight className="w-3.5 h-3.5" />
                  Ask admin to upgrade
                </span>
              )}
            </div>

            {usage && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">
                    Daily messages
                  </span>
                  <span className={cn(
                    "text-xs font-semibold tabular-nums",
                    usage.count >= usage.limit ? "text-destructive" : "text-foreground"
                  )}>
                    {usage.count} / {usage.limit}
                  </span>
                </div>
                <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      usage.count >= usage.limit ? "bg-destructive" : "bg-primary/70"
                    )}
                    style={{ width: `${usagePercent}%` }}
                    data-testid="bar-usage"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground/50 mt-1">
                  Resets daily at midnight
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
                <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-1">Models</p>
                <p className="text-sm font-semibold text-foreground">
                  {isPro ? "All models" : "Fast only"}
                </p>
              </div>
              <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
                <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-1">Messages / day</p>
                <p className="text-sm font-semibold text-foreground">
                  {isPro ? "Unlimited" : `${usage?.limit ?? 20}`}
                </p>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* ── Appearance ── */}
        <SectionCard icon={<Palette className="w-4 h-4" />} title="Appearance">
          <div className="space-y-5">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3">
                <Palette className="w-3.5 h-3.5" /> Theme
              </label>
              <div className="flex flex-wrap gap-3">
                {themes.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => handleThemeChange(t.name)}
                    data-testid={`button-theme-${t.name}`}
                    title={t.name.charAt(0).toUpperCase() + t.name.slice(1)}
                    className={cn(
                      "w-10 h-10 rounded-full border-2 transition-all flex items-center justify-center hover-elevate active-elevate-2",
                      t.color,
                      themeColor === t.name ? "border-foreground scale-110" : "border-transparent opacity-70 hover:opacity-100"
                    )}
                  >
                    {themeColor === t.name && <Check className="w-5 h-5 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3">
                <Type className="w-3.5 h-3.5" /> Font Size
              </label>
              <div className="grid grid-cols-3 gap-2">
                {FONT_SIZES.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFontSize(opt.value)}
                    data-testid={`button-font-${opt.value}`}
                    className={cn(
                      "flex flex-col items-center gap-1 px-3 py-3 rounded-xl border text-sm font-medium transition-all",
                      fontSize === opt.value
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground"
                    )}
                  >
                    <span className={cn(
                      "font-semibold",
                      opt.value === "compact" ? "text-xs" : opt.value === "large" ? "text-base" : "text-sm"
                    )}>Aa</span>
                    <span className="text-[11px]">{opt.label}</span>
                    <span className="text-[10px] opacity-60">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Bot className="w-3.5 h-3.5" /> AI Assistant Name
              </label>
              <input
                type="text"
                value={assistantName}
                onChange={(e) => setAssistantName(e.target.value)}
                placeholder="Assistant"
                maxLength={32}
                data-testid="input-assistant-name"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border/50 bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
              />
              <p className="text-[11px] text-muted-foreground/50 mt-1.5">
                This name appears above every AI response in chat.
              </p>
            </div>

            <button
              onClick={handleSaveAppearance}
              data-testid="button-save-appearance"
              disabled={settingsMutation.isPending}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all",
                appearanceSaved
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              )}
            >
              {appearanceSaved ? <><Check className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Appearance</>}
            </button>
          </div>
        </SectionCard>

        {/* ── System Prompt ── */}
        <SectionCard icon={<MessageSquare className="w-4 h-4" />} title="System Prompt">
          <div className="space-y-4">
            {prompts.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <Hash className="w-3.5 h-3.5" /> Active Saved Prompt
                </label>
                <select
                  value={activePromptId ?? ""}
                  onChange={(e) => setActivePromptId(e.target.value || null)}
                  data-testid="select-active-prompt"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border/50 bg-muted/30 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer"
                >
                  <option value="">— None (use custom prompt below) —</option>
                  {prompts.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                Custom System Prompt
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are a helpful AI assistant. Add any instructions you want the AI to always follow…"
                rows={4}
                data-testid="input-system-prompt"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border/50 bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 resize-none leading-relaxed transition-all"
              />
              <p className="text-[11px] text-muted-foreground/50 mt-1.5">
                These instructions are prepended to every conversation.
              </p>
            </div>

            <button
              onClick={handleSavePrompt}
              data-testid="button-save-prompt"
              disabled={settingsMutation.isPending}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all",
                promptSaved
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                  : "bg-primary text-primary-foreground hover:opacity-90"
              )}
            >
              {promptSaved ? <><Check className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Prompt</>}
            </button>
          </div>
        </SectionCard>

        {/* ── Security ── */}
        <SectionCard icon={<Lock className="w-4 h-4" />} title="Security">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Key className="w-3.5 h-3.5" /> Change Password
              </label>

              <div className="space-y-2.5">
                <div className="relative">
                  <input
                    type={showCurr ? "text" : "password"}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="Current password"
                    data-testid="input-current-password"
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-border/50 bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  />
                  <button onClick={() => setShowCurr(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                    {showCurr ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="New password (min 6 chars)"
                    data-testid="input-new-password"
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-border/50 bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  />
                  <button onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="Confirm new password"
                  data-testid="input-confirm-password"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border/50 bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
                />
              </div>

              {pwError && (
                <p className="mt-2 text-xs text-destructive bg-destructive/8 border border-destructive/20 rounded-lg px-3 py-2">
                  {pwError}
                </p>
              )}
              {pwSuccess && (
                <p className="mt-2 text-xs text-emerald-400 bg-emerald-500/8 border border-emerald-500/20 rounded-lg px-3 py-2 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Password changed successfully!
                </p>
              )}
            </div>

            <button
              onClick={handleChangePassword}
              data-testid="button-change-password"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all"
            >
              <Lock className="w-4 h-4" /> Update Password
            </button>
          </div>
        </SectionCard>

        {/* ── Account info ── */}
        <div className="rounded-2xl border border-border/40 bg-muted/10 px-5 py-4 space-y-2.5">
          <h3 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider">Account Info</h3>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-muted-foreground/60">User ID</span>
            <span className="font-mono text-xs text-foreground/50 truncate">{user.id}</span>
            <span className="text-muted-foreground/60">Username</span>
            <span className="font-medium text-foreground/80">{user.username}</span>
            <span className="text-muted-foreground/60">Role</span>
            <span className="font-medium text-foreground/80">{user.isAdmin ? "Administrator" : "User"}</span>
            {memberSince && (
              <>
                <span className="text-muted-foreground/60">Member since</span>
                <span className="font-medium text-foreground/80">{memberSince}</span>
              </>
            )}
          </div>
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}
