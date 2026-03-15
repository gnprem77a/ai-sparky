import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Crown, Shield, User, Lock, Palette, MessageSquare,
  Eye, EyeOff, Check, Save, LogOut, ChevronRight, Zap, Calendar,
  Hash, Bot, Type, Key, Sun, Moon, Brain, Plus, Trash2,
  Bell, Download, AlertTriangle, Sparkles, BarChart2, TrendingUp,
} from "lucide-react";

interface Settings {
  systemPrompt: string;
  fontSize: string;
  assistantName: string;
  activePromptId: string | null;
  personaAvatarLetter: string;
  personaPersonality: string;
  notifyBroadcast: boolean;
  notifyWeeklyDigest: boolean;
  notifySecurityAlerts: boolean;
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

interface Memory {
  id: string;
  content: string;
  createdAt: string;
}

interface UserStats {
  conversations: number;
  messages: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

const FONT_SIZES = [
  { value: "compact", label: "Compact", desc: "Smaller text" },
  { value: "normal",  label: "Normal",  desc: "Default" },
  { value: "large",   label: "Large",   desc: "Easier to read" },
];

function HeroCanvas({ isPro }: { isPro: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const initAndAnimate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width = W;
    canvas.height = H;

    const COUNT = 38;
    const PRIMARY_COLOR = isPro ? "220,160,40" : "124,90,240";

    type Particle = { x: number; y: number; vx: number; vy: number; r: number; opacity: number };
    const particles: Particle[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      r: Math.random() * 2.2 + 1,
      opacity: Math.random() * 0.5 + 0.3,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = 110;
          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.25;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${PRIMARY_COLOR},${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${PRIMARY_COLOR},${p.opacity})`;
        ctx.fill();

        // Move
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
  }, [isPro]);

  useEffect(() => {
    initAndAnimate();
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [initAndAnimate]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ display: "block" }}
    />
  );
}

function SectionCard({ icon, title, children, id }: { icon: React.ReactNode; title: string; children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="rounded-2xl border border-border/50 bg-card/60 overflow-hidden scroll-mt-4">
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
  const { theme, toggleTheme } = useTheme();
  const [, navigate] = useLocation();

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
  }, []);

  const [fontSize, setFontSize]         = useState("normal");
  const [assistantName, setAssistantName] = useState("Assistant");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const [appearanceSaved, setAppearanceSaved] = useState(false);
  const [promptSaved, setPromptSaved]     = useState(false);

  const [personaAvatarLetter, setPersonaAvatarLetter] = useState("A");
  const [personaPersonality, setPersonaPersonality] = useState("");
  const [personaSaved, setPersonaSaved] = useState(false);

  const [notifyBroadcast, setNotifyBroadcast] = useState(true);
  const [notifyWeeklyDigest, setNotifyWeeklyDigest] = useState(false);
  const [notifySecurityAlerts, setNotifySecurityAlerts] = useState(true);
  const [notifSaved, setNotifSaved] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
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

  const { data: memories = [] } = useQuery<Memory[]>({
    queryKey: ["/api/memories"],
  });

  const { data: myStats } = useQuery<UserStats>({
    queryKey: ["/api/stats/me"],
  });

  const [newMemory, setNewMemory] = useState("");

  const addMemoryMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", "/api/memories", { content }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memories"] });
      setNewMemory("");
    },
  });

  const deleteMemoryMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/memories/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/memories"] }),
  });

  useEffect(() => {
    if (settings) {
      setFontSize(settings.fontSize ?? "normal");
      setAssistantName(settings.assistantName ?? "Assistant");
      setSystemPrompt(settings.systemPrompt ?? "");
      setActivePromptId(settings.activePromptId ?? null);
      setPersonaAvatarLetter(settings.personaAvatarLetter ?? "A");
      setPersonaPersonality(settings.personaPersonality ?? "");
      setNotifyBroadcast(settings.notifyBroadcast ?? true);
      setNotifyWeeklyDigest(settings.notifyWeeklyDigest ?? false);
      setNotifySecurityAlerts(settings.notifySecurityAlerts ?? true);
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

  const handleSavePersona = () => {
    const letter = personaAvatarLetter.trim().slice(0, 1).toUpperCase() || "A";
    setPersonaAvatarLetter(letter);
    settingsMutation.mutate({ personaAvatarLetter: letter, personaPersonality });
    setPersonaSaved(true);
    setTimeout(() => setPersonaSaved(false), 2000);
  };

  const handleSaveNotifications = () => {
    settingsMutation.mutate({ notifyBroadcast, notifyWeeklyDigest, notifySecurityAlerts });
    setNotifSaved(true);
    setTimeout(() => setNotifSaved(false), 2000);
  };

  const handleDeleteAccount = async () => {
    if (deleteInput !== user?.username) return;
    setIsDeleting(true);
    try {
      await apiRequest("DELETE", "/api/auth/me");
      logout.mutate();
      window.location.href = "/";
    } catch {
      setIsDeleting(false);
    }
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
            Back
          </button>
          <span className="text-border/60">·</span>
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn(
              "w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0",
              isPro ? "bg-amber-500/20 text-amber-400" : "bg-primary/20 text-primary"
            )}>
              {avatarLetter}
            </div>
            <span className="text-sm font-medium text-foreground truncate">{user.username}</span>
            {isPro && <span className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20"><Crown className="w-2.5 h-2.5" /> Pro</span>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {[
              { label: "Plan", href: "#plan" },
              { label: "Appearance", href: "#appearance" },
              { label: "Security", href: "#security" },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => { e.preventDefault(); document.getElementById(item.href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                className="hidden md:inline-flex text-xs text-muted-foreground/60 hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted/40"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">

        {/* ── Hero ── */}
        <div className="rounded-2xl border border-border/50 bg-card/60 overflow-hidden">
          {/* Animated banner */}
          <div className="relative h-32 overflow-hidden bg-gradient-to-br from-primary/8 via-violet-500/5 to-indigo-500/8">
            <HeroCanvas isPro={isPro} />
            {/* Soft vignette fade at bottom so avatar overlaps cleanly */}
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card/80 to-transparent pointer-events-none" />
          </div>
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

            {/* Quick stats row */}
            <div className="flex flex-wrap gap-3 pt-1 mt-1 border-t border-border/30">
              {[
                { label: "Conversations", value: myStats?.conversations ?? "—", icon: <MessageSquare className="w-3.5 h-3.5 text-blue-400" /> },
                { label: "Messages", value: myStats?.messages ?? "—", icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> },
                { label: "Tokens used", value: myStats ? (myStats.totalTokens).toLocaleString() : "—", icon: <Zap className="w-3.5 h-3.5 text-yellow-400" /> },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-1.5 text-sm">
                  {s.icon}
                  <span className="font-semibold text-foreground tabular-nums">{s.value}</span>
                  <span className="text-muted-foreground/50 text-xs">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Section Quick Nav ── */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
          {[
            { label: "Plan & Usage", href: "plan", icon: "⚡" },
            { label: "Appearance", href: "appearance", icon: "🎨" },
            { label: "AI Persona", href: "persona", icon: "🤖" },
            { label: "Prompts", href: "prompts", icon: "💬" },
            { label: "Memory", href: "memory", icon: "🧠" },
            { label: "Security", href: "security", icon: "🔒" },
            { label: "Notifications", href: "notifications", icon: "🔔" },
          ].map((item) => (
            <button
              key={item.href}
              onClick={() => document.getElementById(item.href)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/40 bg-card/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all whitespace-nowrap"
            >
              <span>{item.icon}</span> {item.label}
            </button>
          ))}
        </div>

        {/* ── Plan & Usage ── */}
        <SectionCard id="plan" icon={<Zap className="w-4 h-4" />} title="Plan & Usage">
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

            <div className="border-t border-border/30 pt-4 space-y-3">
              <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">Usage Summary</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Conversations", value: myStats?.conversations ?? 0, icon: <MessageSquare className="w-3.5 h-3.5 text-blue-400" /> },
                  { label: "Messages Sent", value: myStats?.messages ?? 0, icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> },
                  { label: "Input Tokens", value: (myStats?.inputTokens ?? 0).toLocaleString(), icon: <Zap className="w-3.5 h-3.5 text-yellow-400" /> },
                  { label: "Output Tokens", value: (myStats?.outputTokens ?? 0).toLocaleString(), icon: <Sparkles className="w-3.5 h-3.5 text-violet-400" /> },
                ].map((stat) => (
                  <div key={stat.label} className="flex flex-col gap-1 px-3.5 py-2.5 rounded-xl border border-border/40 bg-muted/20">
                    <div className="flex items-center gap-1.5">{stat.icon}<span className="text-[10px] text-muted-foreground/60 font-medium">{stat.label}</span></div>
                    <span className="text-lg font-bold text-foreground tabular-nums">{stat.value}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-border/40 bg-muted/20">
                <div className="flex items-center gap-1.5">
                  <BarChart2 className="w-3.5 h-3.5 text-primary/60" />
                  <span className="text-xs text-muted-foreground/70 font-medium">Total Tokens Used</span>
                </div>
                <span className="text-sm font-bold text-foreground tabular-nums">{(myStats?.totalTokens ?? 0).toLocaleString()}</span>
              </div>
              <a
                href="/analytics"
                data-testid="link-view-full-analytics"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors"
              >
                <BarChart2 className="w-4 h-4" /> View Full Analytics <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </SectionCard>

        {/* ── Appearance ── */}
        <SectionCard id="appearance" icon={<Palette className="w-4 h-4" />} title="Appearance">
          <div className="space-y-5">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3">
                {theme === "dark" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />} Mode
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => { if (theme !== "light") toggleTheme(); }}
                  data-testid="button-theme-light"
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all",
                    theme === "light"
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  <Sun className="w-4 h-4" /> Light
                </button>
                <button
                  onClick={() => { if (theme !== "dark") toggleTheme(); }}
                  data-testid="button-theme-dark"
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all",
                    theme === "dark"
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  <Moon className="w-4 h-4" /> Dark
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-3">
                <Palette className="w-3.5 h-3.5" /> Color Theme
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
        <SectionCard id="prompts" icon={<MessageSquare className="w-4 h-4" />} title="System Prompt">
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

        {/* ── Memory ── */}
        <SectionCard id="memory" icon={<Brain className="w-4 h-4" />} title="Memory">
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground/70 leading-relaxed">
              Facts saved here are automatically included in every conversation so the AI remembers important details about you.
            </p>

            {memories.length > 0 && (
              <div className="space-y-2">
                {memories.map((m) => (
                  <div key={m.id} className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border border-border/50 bg-muted/20 group">
                    <Brain className="w-3.5 h-3.5 text-pink-400 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-foreground/80 flex-1 leading-relaxed">{m.content}</span>
                    <button
                      onClick={() => deleteMemoryMutation.mutate(m.id)}
                      disabled={deleteMemoryMutation.isPending}
                      data-testid={`button-delete-memory-${m.id}`}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-destructive transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {memories.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground/50 py-2">
                <Brain className="w-3.5 h-3.5" /> No memories saved yet.
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={newMemory}
                onChange={(e) => setNewMemory(e.target.value)}
                placeholder="e.g. I prefer concise answers, I work in Python…"
                data-testid="input-new-memory"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newMemory.trim()) {
                    addMemoryMutation.mutate(newMemory.trim());
                  }
                }}
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-border/50 bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
              />
              <button
                onClick={() => { if (newMemory.trim()) addMemoryMutation.mutate(newMemory.trim()); }}
                disabled={addMemoryMutation.isPending || !newMemory.trim()}
                data-testid="button-add-memory"
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
          </div>
        </SectionCard>

        {/* ── Security ── */}
        <SectionCard id="security" icon={<Lock className="w-4 h-4" />} title="Security">
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

        {/* ── Custom AI Persona ── */}
        <SectionCard id="persona" icon={<Sparkles className="w-4 h-4" />} title="AI Persona">
          <div className="space-y-5">
            <p className="text-xs text-muted-foreground/60 leading-relaxed">
              Give your AI assistant a custom identity. The avatar letter appears as its profile icon in chat, and the personality description shapes how it speaks to you.
            </p>

            <div className="flex items-center gap-5">
              <div className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0 select-none",
                "bg-gradient-to-br from-primary/80 to-violet-500/80 text-white shadow-lg"
              )}>
                {personaAvatarLetter || "A"}
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avatar Letter</label>
                <input
                  type="text"
                  value={personaAvatarLetter}
                  onChange={(e) => setPersonaAvatarLetter(e.target.value.slice(0, 1).toUpperCase())}
                  placeholder="A"
                  maxLength={1}
                  data-testid="input-persona-avatar-letter"
                  className="w-16 text-center px-3 py-2 rounded-xl border border-border/50 bg-muted/30 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all uppercase"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Bot className="w-3.5 h-3.5" /> Personality / Tone
              </label>
              <textarea
                value={personaPersonality}
                onChange={(e) => setPersonaPersonality(e.target.value)}
                placeholder="e.g. Concise and technical. Always include code examples. Use bullet points."
                maxLength={300}
                rows={3}
                data-testid="input-persona-personality"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border/50 bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none transition-all"
              />
              <p className="text-[11px] text-muted-foreground/50 mt-1">{personaPersonality.length}/300 · Added as context to every message.</p>
            </div>

            <button
              onClick={handleSavePersona}
              data-testid="button-save-persona"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all"
            >
              {personaSaved ? <><Check className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Persona</>}
            </button>
          </div>
        </SectionCard>

        {/* ── Notification Preferences ── */}
        <SectionCard id="notifications" icon={<Bell className="w-4 h-4" />} title="Notifications">
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground/60 leading-relaxed">
              Choose which email notifications you receive. (Requires your email to be set in account settings.)
            </p>
            {[
              { label: "System announcements", desc: "Important platform updates and broadcasts from the team", value: notifyBroadcast, set: setNotifyBroadcast, testId: "toggle-notify-broadcast" },
              { label: "Weekly digest", desc: "A summary of your usage, top conversations, and token stats", value: notifyWeeklyDigest, set: setNotifyWeeklyDigest, testId: "toggle-notify-digest" },
              { label: "Security alerts", desc: "Notifications about logins from new devices or password changes", value: notifySecurityAlerts, set: setNotifySecurityAlerts, testId: "toggle-notify-security" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-4 py-2 border-b border-border/30 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">{item.desc}</p>
                </div>
                <button
                  onClick={() => item.set(!item.value)}
                  data-testid={item.testId}
                  className={cn(
                    "relative w-10 h-6 rounded-full transition-colors flex-shrink-0",
                    item.value ? "bg-primary" : "bg-muted-foreground/20"
                  )}
                >
                  <span className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all",
                    item.value ? "left-5" : "left-1"
                  )} />
                </button>
              </div>
            ))}

            <button
              onClick={handleSaveNotifications}
              data-testid="button-save-notifications"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all"
            >
              {notifSaved ? <><Check className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Preferences</>}
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

        {/* ── Data & Account Deletion ── */}
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-4 border-b border-destructive/20">
            <AlertTriangle className="w-4 h-4 text-destructive/70" />
            <h2 className="font-semibold text-sm text-foreground">Data & Account</h2>
          </div>
          <div className="p-5 space-y-5">
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Export your data</p>
              <p className="text-xs text-muted-foreground/60 mb-3">Download all your conversations and messages as a JSON file.</p>
              <a
                href="/api/data/export"
                download
                data-testid="button-export-data"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border/50 text-sm font-medium text-foreground hover:bg-muted/40 transition-colors"
              >
                <Download className="w-4 h-4" /> Download Export
              </a>
            </div>

            <div className="border-t border-destructive/15 pt-5">
              <p className="text-sm font-medium text-foreground mb-1">Delete account</p>
              <p className="text-xs text-muted-foreground/60 mb-3">
                Permanently deletes your account and all conversations. This cannot be undone.
              </p>
              {!deleteConfirm ? (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  data-testid="button-delete-account-start"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Delete my account
                </button>
              ) : (
                <div className="space-y-3 p-4 rounded-xl bg-destructive/8 border border-destructive/20">
                  <p className="text-sm text-destructive font-medium flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> This will permanently delete everything.
                  </p>
                  <p className="text-xs text-muted-foreground">Type your username <span className="font-mono font-bold text-foreground">{user.username}</span> to confirm:</p>
                  <input
                    type="text"
                    value={deleteInput}
                    onChange={(e) => setDeleteInput(e.target.value)}
                    placeholder={user.username}
                    data-testid="input-delete-confirm"
                    className="w-full px-3 py-2 rounded-lg border border-destructive/30 bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-destructive/30"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleteInput !== user.username || isDeleting}
                      data-testid="button-delete-account-confirm"
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-40 transition-all hover:opacity-90"
                    >
                      {isDeleting ? "Deleting…" : "Yes, delete my account"}
                    </button>
                    <button
                      onClick={() => { setDeleteConfirm(false); setDeleteInput(""); }}
                      data-testid="button-delete-account-cancel"
                      className="px-4 py-2 rounded-lg border border-border/50 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}
