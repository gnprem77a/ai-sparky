import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { X, Save, Lock, Bot, Eye, EyeOff, Palette, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "prompt" | "appearance" | "account";

interface Settings {
  systemPrompt: string;
  fontSize: string;
  assistantName: string;
  activePromptId: string | null;
}

interface SavedPrompt {
  id: string;
  title: string;
  content: string;
}

interface Props {
  onClose: () => void;
}

const FONT_SIZES = [
  { value: "compact", label: "Compact", desc: "Smaller text, more content visible" },
  { value: "normal", label: "Normal", desc: "Default reading size" },
  { value: "large", label: "Large", desc: "Easier to read, more spacious" },
];

export function SettingsModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("prompt");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [fontSize, setFontSize] = useState("normal");
  const [assistantName, setAssistantName] = useState("Assistant");
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings", { credentials: "include" }).then((r) => r.json()),
  });

  const { data: prompts = [] } = useQuery<SavedPrompt[]>({
    queryKey: ["/api/prompts"],
    queryFn: () => fetch("/api/prompts", { credentials: "include" }).then((r) => r.json()),
  });

  useEffect(() => {
    if (settings) {
      setSystemPrompt(settings.systemPrompt ?? "");
      setFontSize(settings.fontSize ?? "normal");
      setAssistantName(settings.assistantName ?? "Assistant");
      setActivePromptId(settings.activePromptId ?? null);
    }
  }, [settings]);

  const savePromptMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/settings", { systemPrompt }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings"] }),
  });

  const saveAppearanceMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/settings", { fontSize, assistantName, activePromptId }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings"] }),
  });

  const changePasswordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      apiRequest("POST", "/api/auth/change-password", { currentPassword, newPassword }).then(async (r) => {
        if (!r.ok) { const d = await r.json(); throw new Error(d.error || "Failed"); }
        return r.json();
      }),
    onSuccess: () => {
      setPwSuccess(true);
      setPwError("");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPwSuccess(false), 3000);
    },
    onError: (e: Error) => setPwError(e.message),
  });

  const handleChangePassword = () => {
    setPwError("");
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwError("All fields are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setPwError("New password must be at least 6 characters.");
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
          <h2 className="font-semibold text-foreground">Settings</h2>
          <button onClick={onClose} data-testid="button-settings-close" className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/60">
          {([
            { id: "prompt" as Tab, label: "System Prompt", icon: Bot },
            { id: "appearance" as Tab, label: "Appearance", icon: Palette },
            { id: "account" as Tab, label: "Account", icon: Lock },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {tab === "prompt" && (
            <div className="space-y-4">
              {/* Active prompt selector */}
              {prompts.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-1 flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-primary" />
                    Active Prompt
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Select a saved prompt to use as your active system prompt.
                  </p>
                  <div className="space-y-1.5">
                    <label className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all",
                      activePromptId === null ? "border-primary/50 bg-primary/5" : "border-border hover:border-border/80 hover:bg-muted/30"
                    )}>
                      <input type="radio" name="activePrompt" checked={activePromptId === null} onChange={() => setActivePromptId(null)} className="accent-primary" />
                      <div>
                        <p className="text-xs font-medium text-foreground">None (use text prompt below)</p>
                      </div>
                    </label>
                    {prompts.map((p) => (
                      <label key={p.id} className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all",
                        activePromptId === p.id ? "border-primary/50 bg-primary/5" : "border-border hover:border-border/80 hover:bg-muted/30"
                      )}>
                        <input type="radio" name="activePrompt" checked={activePromptId === p.id} onChange={() => setActivePromptId(p.id)} className="accent-primary" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{p.title || "Untitled"}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{p.content.slice(0, 60)}{p.content.length > 60 ? "…" : ""}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className={cn(prompts.length > 0 && "opacity-60 pointer-events-none" && activePromptId !== null && "opacity-60 pointer-events-none")}>
                <p className="text-sm font-medium text-foreground mb-1">Custom System Prompt</p>
                <p className="text-xs text-muted-foreground mb-3">
                  This instruction is prepended to every conversation. Use it to set the AI's persona, tone, or area of expertise.
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  data-testid="input-system-prompt"
                  placeholder='e.g. "You are a concise coding assistant who prefers TypeScript. Always explain your reasoning."'
                  rows={5}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none custom-scrollbar"
                />
                <p className="text-xs text-muted-foreground mt-1.5">{systemPrompt.length} characters</p>
              </div>

              <div className="flex items-center gap-3">
                {savePromptMutation.isSuccess && (
                  <span className="text-xs text-emerald-500 font-medium">Saved!</span>
                )}
                <button
                  onClick={() => savePromptMutation.mutate()}
                  disabled={savePromptMutation.isPending}
                  data-testid="button-save-prompt"
                  className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savePromptMutation.isPending ? "Saving…" : "Save Prompt"}
                </button>
              </div>
            </div>
          )}

          {tab === "appearance" && (
            <div className="space-y-6">
              {/* Font size */}
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Chat Font Size</p>
                <p className="text-xs text-muted-foreground mb-3">Controls the text size in the chat area.</p>
                <div className="space-y-2">
                  {FONT_SIZES.map((fs) => (
                    <label key={fs.value} className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all",
                      fontSize === fs.value ? "border-primary/50 bg-primary/5" : "border-border hover:border-border/80 hover:bg-muted/30"
                    )}>
                      <input
                        type="radio"
                        name="fontSize"
                        value={fs.value}
                        checked={fontSize === fs.value}
                        onChange={() => setFontSize(fs.value)}
                        data-testid={`radio-font-${fs.value}`}
                        className="accent-primary"
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground">{fs.label}</p>
                        <p className="text-xs text-muted-foreground">{fs.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* AI Name */}
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Assistant Name</p>
                <p className="text-xs text-muted-foreground mb-3">Personalize what you call your AI assistant.</p>
                <input
                  type="text"
                  value={assistantName}
                  onChange={(e) => setAssistantName(e.target.value)}
                  data-testid="input-assistant-name"
                  placeholder="Assistant"
                  maxLength={30}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="flex items-center gap-3">
                {saveAppearanceMutation.isSuccess && (
                  <span className="text-xs text-emerald-500 font-medium">Saved!</span>
                )}
                <button
                  onClick={() => saveAppearanceMutation.mutate()}
                  disabled={saveAppearanceMutation.isPending}
                  data-testid="button-save-appearance"
                  className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saveAppearanceMutation.isPending ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          )}

          {tab === "account" && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Change Password</p>
                <p className="text-xs text-muted-foreground mb-4">Choose a strong password with at least 6 characters.</p>
              </div>
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    data-testid="input-current-password"
                    className="w-full px-3 py-2.5 pr-10 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button type="button" onClick={() => setShowCurrent((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    data-testid="input-new-password"
                    className="w-full px-3 py-2.5 pr-10 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button type="button" onClick={() => setShowNew((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  data-testid="input-confirm-password"
                  onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              {pwError && <p className="text-xs text-destructive">{pwError}</p>}
              {pwSuccess && <p className="text-xs text-emerald-500 font-medium">Password updated successfully!</p>}
              <button
                onClick={handleChangePassword}
                disabled={changePasswordMutation.isPending}
                data-testid="button-change-password"
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <Lock className="w-3.5 h-3.5" />
                {changePasswordMutation.isPending ? "Saving…" : "Update Password"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
