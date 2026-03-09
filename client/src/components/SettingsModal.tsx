import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  X, Save, Lock, Bot, Eye, EyeOff, Palette, Zap, Brain, SlidersHorizontal,
  Keyboard, Database, Check, Trash2, Download, AlertTriangle, Command, Globe,
  Sun, Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MODELS, type ModelId } from "@/components/ModelSelector";
import { useLanguage, LANGUAGES } from "@/lib/i18n";
import { useTheme } from "@/hooks/use-theme";

type Tab = "prompt" | "memory" | "behavior" | "shortcuts" | "data" | "appearance" | "account";

interface Settings {
  systemPrompt: string;
  fontSize: string;
  assistantName: string;
  activePromptId: string | null;
  defaultModel: string;
  autoScroll: boolean;
  autoTitle: boolean;
  showTokenUsage: boolean;
  customInstructions: string;
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

const SHORTCUTS = [
  { keys: ["Ctrl", "K"], mac: ["⌘", "K"], label: "New conversation" },
  { keys: ["Ctrl", "F"], mac: ["⌘", "F"], label: "Search in conversation" },
  { keys: ["Escape"], mac: ["Esc"], label: "Close search / close modal" },
  { keys: ["Enter"], mac: ["Return"], label: "Send message" },
  { keys: ["Shift", "Enter"], mac: ["⇧", "Return"], label: "New line in message" },
];

const COLOR_THEMES = [
  { id: "default", label: "Default", color: "#6d47e8", cls: "" },
  { id: "ocean", label: "Ocean", color: "#0891b2", cls: "theme-ocean" },
  { id: "sunset", label: "Sunset", color: "#f97316", cls: "theme-sunset" },
  { id: "forest", label: "Forest", color: "#22c55e", cls: "theme-forest" },
  { id: "midnight", label: "Midnight", color: "#3b82f6", cls: "theme-midnight" },
  { id: "rose", label: "Rose", color: "#e11d48", cls: "theme-rose" },
  { id: "hacker", label: "Hacker", color: "#22c55e", cls: "theme-hacker" },
];

function Toggle({ checked, onChange, testId }: { checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0",
        checked ? "bg-primary" : "bg-muted-foreground/30"
      )}
      style={{ height: "22px", width: "40px" }}
    >
      <span className={cn(
        "absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform",
        checked ? "translate-x-[18px]" : "translate-x-0"
      )} />
    </button>
  );
}

export function SettingsModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("prompt");
  const { lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const [colorTheme, setColorTheme] = useState<string>(() =>
    localStorage.getItem("color-theme") || "default"
  );

  const applyColorTheme = (id: string) => {
    const all = COLOR_THEMES.map((t) => t.cls).filter(Boolean);
    document.documentElement.classList.remove(...all);
    const found = COLOR_THEMES.find((t) => t.id === id);
    if (found?.cls) document.documentElement.classList.add(found.cls);
    localStorage.setItem("color-theme", id);
    setColorTheme(id);
  };

  const [systemPrompt, setSystemPrompt] = useState("");
  const [fontSize, setFontSize] = useState("normal");
  const [assistantName, setAssistantName] = useState("Assistant");
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const [defaultModel, setDefaultModel] = useState<ModelId>("auto");
  const [autoScroll, setAutoScroll] = useState(true);
  const [autoTitle, setAutoTitle] = useState(true);
  const [showTokenUsage, setShowTokenUsage] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  const [clearConfirm, setClearConfirm] = useState(false);
  const [isMac] = useState(() => navigator.platform.toUpperCase().includes("MAC"));

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
      setDefaultModel((settings.defaultModel as ModelId) ?? "auto");
      setAutoScroll(settings.autoScroll ?? true);
      setAutoTitle(settings.autoTitle ?? true);
      setShowTokenUsage(settings.showTokenUsage ?? false);
      setCustomInstructions(settings.customInstructions ?? "");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data: Partial<Settings>) =>
      apiRequest("PATCH", "/api/settings", data).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings"] }),
  });

  const changePasswordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      apiRequest("POST", "/api/auth/change-password", { currentPassword, newPassword }).then(async (r) => {
        if (!r.ok) { const d = await r.json(); throw new Error(d.error || "Failed"); }
        return r.json();
      }),
    onSuccess: () => {
      setPwSuccess(true); setPwError("");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setTimeout(() => setPwSuccess(false), 3000);
    },
    onError: (e: Error) => setPwError(e.message),
  });

  const clearAllMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/data/conversations").then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setClearConfirm(false);
      onClose();
    },
  });

  const [newMemory, setNewMemory] = useState("");
  interface MemoryItem { id: string; content: string; createdAt: string; }
  const { data: memories = [] } = useQuery<MemoryItem[]>({
    queryKey: ["/api/memories"],
    queryFn: () => fetch("/api/memories", { credentials: "include" }).then((r) => r.json()),
  });
  const createMemoryMutation = useMutation({
    mutationFn: (content: string) => apiRequest("POST", "/api/memories", { content }).then((r) => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/memories"] }); setNewMemory(""); },
  });
  const deleteMemoryMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/memories/${id}`).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/memories"] }),
  });

  const handleChangePassword = () => {
    setPwError("");
    if (!currentPassword || !newPassword || !confirmPassword) { setPwError("All fields are required."); return; }
    if (newPassword !== confirmPassword) { setPwError("New passwords do not match."); return; }
    if (newPassword.length < 6) { setPwError("Password must be at least 6 characters."); return; }
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  const TABS: { id: Tab; label: string; icon: typeof Bot }[] = [
    { id: "prompt", label: "Prompt", icon: Bot },
    { id: "memory", label: "Memory", icon: Brain },
    { id: "behavior", label: "Behavior", icon: SlidersHorizontal },
    { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
    { id: "data", label: "Data", icon: Database },
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "account", label: "Account", icon: Lock },
  ];

  const activeTab = TABS.find((t) => t.id === tab);
  const ActiveTabIcon = activeTab?.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-2xl h-[80vh] max-h-[700px] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">

        {/* Left nav */}
        <div className="w-52 flex-shrink-0 border-r border-border/40 flex flex-col py-4 px-2 gap-0.5 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 pb-3">Settings</p>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              data-testid={`tab-settings-${id}`}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left w-full",
                tab === id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </button>
          ))}
        </div>

        {/* Right content area */}
        <div className="flex flex-col flex-1 min-w-0">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 flex-shrink-0">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              {ActiveTabIcon && <ActiveTabIcon className="w-4 h-4 text-primary" />}
              {activeTab?.label}
            </h2>
            <button onClick={onClose} data-testid="button-settings-close" className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

          {/* ── Prompt ── */}
          {tab === "prompt" && (
            <div className="space-y-4">
              {prompts.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-foreground mb-1 flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-primary" /> Active Prompt
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">Select a saved prompt as your active system prompt.</p>
                  <div className="space-y-1.5">
                    <label className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all", activePromptId === null ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/30")}>
                      <input type="radio" name="activePrompt" checked={activePromptId === null} onChange={() => setActivePromptId(null)} className="accent-primary" />
                      <p className="text-xs font-medium text-foreground">None (use custom prompt below)</p>
                    </label>
                    {prompts.map((p) => (
                      <label key={p.id} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all", activePromptId === p.id ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/30")}>
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
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Custom System Prompt</p>
                <p className="text-xs text-muted-foreground mb-3">Sets the AI's role, tone, or persona for every conversation.</p>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  data-testid="input-system-prompt"
                  placeholder='e.g. "You are a concise coding assistant who prefers TypeScript."'
                  rows={5}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none custom-scrollbar"
                />
                <p className="text-xs text-muted-foreground mt-1">{systemPrompt.length} characters</p>
              </div>
              <div className="flex items-center gap-3">
                {saveMutation.isSuccess && <span className="text-xs text-emerald-500 font-medium">Saved!</span>}
                <button
                  onClick={() => saveMutation.mutate({ systemPrompt, activePromptId })}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-prompt"
                  className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saveMutation.isPending ? "Saving…" : "Save Prompt"}
                </button>
              </div>
            </div>
          )}

          {/* ── Memory ── */}
          {tab === "memory" && (
            <div className="space-y-6">
              {/* Per-fact Memories */}
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Remembered Facts</p>
                <p className="text-xs text-muted-foreground mb-3">
                  These facts are silently injected into every conversation so Claude always remembers them.
                </p>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newMemory}
                    onChange={(e) => setNewMemory(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && newMemory.trim()) createMemoryMutation.mutate(newMemory.trim()); }}
                    placeholder="Add a fact, e.g. I prefer TypeScript over JavaScript"
                    data-testid="input-new-memory"
                    className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    onClick={() => { if (newMemory.trim()) createMemoryMutation.mutate(newMemory.trim()); }}
                    disabled={!newMemory.trim() || createMemoryMutation.isPending}
                    data-testid="button-add-memory"
                    className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    Add
                  </button>
                </div>
                {memories.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 italic py-4 text-center">No memories yet. Add facts above.</p>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
                    {memories.map((mem) => (
                      <div
                        key={mem.id}
                        data-testid={`memory-item-${mem.id}`}
                        className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-border/40 bg-muted/20 group"
                      >
                        <span className="flex-1 text-xs text-foreground/80 leading-relaxed">{mem.content}</span>
                        <button
                          onClick={() => deleteMemoryMutation.mutate(mem.id)}
                          data-testid={`button-delete-memory-${mem.id}`}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">{memories.length} fact{memories.length !== 1 ? "s" : ""} stored</p>
              </div>

              {/* Custom Instructions */}
              <div className="border-t border-border/30 pt-5">
                <p className="text-sm font-medium text-foreground mb-1">Custom Instructions</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Additional free-form instructions added to every conversation.
                </p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {[
                    "I'm a software engineer. Assume technical knowledge.",
                    "Always be concise and direct. Avoid filler words.",
                    "I prefer code examples over lengthy explanations.",
                    "Always explain your reasoning step by step.",
                  ].map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setCustomInstructions((c) => c ? c + "\n" + ex : ex)}
                      className="text-left text-xs px-3 py-2 rounded-lg border border-border/50 bg-muted/20 text-muted-foreground hover:text-foreground hover:border-border transition-all"
                    >
                      + {ex}
                    </button>
                  ))}
                </div>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  data-testid="input-custom-instructions"
                  placeholder="e.g. I'm a software engineer. Always be concise. Prefer TypeScript over JavaScript."
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none custom-scrollbar"
                />
                <div className="flex items-center gap-3 mt-3">
                  {saveMutation.isSuccess && <span className="text-xs text-emerald-500 font-medium">Saved!</span>}
                  <button
                    onClick={() => saveMutation.mutate({ customInstructions })}
                    disabled={saveMutation.isPending}
                    data-testid="button-save-memory"
                    className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saveMutation.isPending ? "Saving…" : "Save Instructions"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Behavior ── */}
          {tab === "behavior" && (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Default Model</p>
                <p className="text-xs text-muted-foreground mb-3">Used when starting a new conversation.</p>
                <div className="space-y-2">
                  {MODELS.map((m) => (
                    <label key={m.id} className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all",
                      defaultModel === m.id ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/30"
                    )}>
                      <input type="radio" name="defaultModel" checked={defaultModel === m.id} onChange={() => setDefaultModel(m.id)} className="accent-primary" data-testid={`radio-model-${m.id}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{m.friendlyName}</p>
                          {m.id === "auto" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">Recommended</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">{m.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Chat Behavior</p>
                {[
                  { key: "autoScroll" as const, label: "Auto-scroll to new messages", desc: "Automatically scroll to the bottom as responses arrive", value: autoScroll, onChange: setAutoScroll, testId: "toggle-auto-scroll" },
                  { key: "autoTitle" as const, label: "Auto-generate conversation titles", desc: "Generate a title from the first message automatically", value: autoTitle, onChange: setAutoTitle, testId: "toggle-auto-title" },
                  { key: "showTokenUsage" as const, label: "Show token usage per message", desc: "Display input/output token counts below each AI response", value: showTokenUsage, onChange: setShowTokenUsage, testId: "toggle-token-usage" },
                ].map(({ label, desc, value, onChange, testId }) => (
                  <div key={testId} className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-border/50 bg-muted/10">
                    <div>
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                    <Toggle checked={value} onChange={onChange} testId={testId} />
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                {saveMutation.isSuccess && <span className="text-xs text-emerald-500 font-medium">Saved!</span>}
                <button
                  onClick={() => saveMutation.mutate({ defaultModel, autoScroll, autoTitle, showTokenUsage })}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-behavior"
                  className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saveMutation.isPending ? "Saving…" : "Save Behavior"}
                </button>
              </div>
            </div>
          )}

          {/* ── Shortcuts ── */}
          {tab === "shortcuts" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Keyboard shortcuts available throughout the app.</p>
              <div className="space-y-2">
                {SHORTCUTS.map(({ keys, mac, label }) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3 rounded-xl border border-border/50 bg-muted/10">
                    <span className="text-sm text-foreground">{label}</span>
                    <div className="flex items-center gap-1">
                      {(isMac ? mac : keys).map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-muted-foreground/50 text-xs">+</span>}
                          <kbd className="px-2 py-0.5 rounded border border-border bg-muted text-xs font-mono text-foreground shadow-sm">{k}</kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/15">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Command className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  On Mac, <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-xs font-mono">⌘</kbd> replaces <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-xs font-mono">Ctrl</kbd> for all shortcuts.
                </p>
              </div>
            </div>
          )}

          {/* ── Data ── */}
          {tab === "data" && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl border border-border/50 bg-muted/10 space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Export All Conversations</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Download all your conversations as a JSON file.</p>
                </div>
                <a
                  href="/api/data/export"
                  download
                  data-testid="button-export-all"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export JSON
                </a>
              </div>

              <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                    Clear All Chat History
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Permanently delete all your conversations. This cannot be undone.</p>
                </div>
                {!clearConfirm ? (
                  <button
                    onClick={() => setClearConfirm(true)}
                    data-testid="button-clear-history"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-destructive/50 text-destructive text-sm font-semibold hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear All History
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-destructive font-medium">Are you sure? This is permanent.</p>
                    <button
                      onClick={() => clearAllMutation.mutate()}
                      disabled={clearAllMutation.isPending}
                      data-testid="button-confirm-clear"
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                    >
                      <Check className="w-3 h-3" />
                      {clearAllMutation.isPending ? "Deleting…" : "Yes, delete all"}
                    </button>
                    <button onClick={() => setClearConfirm(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Appearance ── */}
          {tab === "appearance" && (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Color Mode</p>
                <p className="text-xs text-muted-foreground mb-3">Switch between light and dark interface.</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => { if (theme !== "light") toggleTheme(); }}
                    data-testid="button-theme-light"
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all",
                      theme === "light" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/30"
                    )}
                  >
                    <Sun className="w-4 h-4" /> Light
                  </button>
                  <button
                    onClick={() => { if (theme !== "dark") toggleTheme(); }}
                    data-testid="button-theme-dark"
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all",
                      theme === "dark" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/30"
                    )}
                  >
                    <Moon className="w-4 h-4" /> Dark
                  </button>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground mb-1">Accent Color</p>
                <p className="text-xs text-muted-foreground mb-3">Choose a color theme for buttons and highlights.</p>
                <div className="grid grid-cols-4 gap-2">
                  {COLOR_THEMES.map((ct) => (
                    <button
                      key={ct.id}
                      onClick={() => applyColorTheme(ct.id)}
                      data-testid={`button-theme-${ct.id}`}
                      className={cn(
                        "flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl border text-xs font-medium transition-all",
                        colorTheme === ct.id ? "border-primary bg-primary/8" : "border-border hover:bg-muted/30"
                      )}
                    >
                      <span
                        className="w-6 h-6 rounded-full border-2 border-white/20 shadow-sm"
                        style={{ background: ct.color }}
                      />
                      <span className={cn("text-[11px]", colorTheme === ct.id ? "text-primary font-semibold" : "text-muted-foreground")}>
                        {ct.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-foreground mb-1">Chat Font Size</p>
                <p className="text-xs text-muted-foreground mb-3">Controls the text size in the chat area.</p>
                <div className="space-y-2">
                  {FONT_SIZES.map((fs) => (
                    <label key={fs.value} className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all",
                      fontSize === fs.value ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/30"
                    )}>
                      <input type="radio" name="fontSize" value={fs.value} checked={fontSize === fs.value} onChange={() => setFontSize(fs.value)} data-testid={`radio-font-${fs.value}`} className="accent-primary" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{fs.label}</p>
                        <p className="text-xs text-muted-foreground">{fs.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Assistant Name</p>
                <p className="text-xs text-muted-foreground mb-3">Personalize what you call your AI.</p>
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
              <div>
                <p className="text-sm font-medium text-foreground mb-1 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" /> Interface Language
                </p>
                <p className="text-xs text-muted-foreground mb-3">Choose the language for all UI text.</p>
                <div className="grid grid-cols-2 gap-2">
                  {LANGUAGES.map((l) => (
                    <label key={l.code} data-testid={`radio-lang-${l.code}`} className={cn(
                      "flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all",
                      lang === l.code ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/30"
                    )}>
                      <input type="radio" name="language" checked={lang === l.code} onChange={() => setLang(l.code)} className="accent-primary" />
                      <span className="text-lg leading-none">{l.flag}</span>
                      <span className="text-sm font-medium text-foreground">{l.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {saveMutation.isSuccess && <span className="text-xs text-emerald-500 font-medium">Saved!</span>}
                <button
                  onClick={() => saveMutation.mutate({ fontSize, assistantName })}
                  disabled={saveMutation.isPending}
                  data-testid="button-save-appearance"
                  className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saveMutation.isPending ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          )}

          {/* ── Account ── */}
          {tab === "account" && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Change Password</p>
                <p className="text-xs text-muted-foreground mb-4">Choose a strong password with at least 6 characters.</p>
              </div>
              <div className="space-y-3">
                <div className="relative">
                  <input type={showCurrent ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" data-testid="input-current-password" className="w-full px-3 py-2.5 pr-10 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  <button type="button" onClick={() => setShowCurrent((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="relative">
                  <input type={showNew ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" data-testid="input-new-password" className="w-full px-3 py-2.5 pr-10 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  <button type="button" onClick={() => setShowNew((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" data-testid="input-confirm-password" onKeyDown={(e) => e.key === "Enter" && handleChangePassword()} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              {pwError && <p className="text-xs text-destructive">{pwError}</p>}
              {pwSuccess && <p className="text-xs text-emerald-500 font-medium">Password updated successfully!</p>}
              <button onClick={handleChangePassword} disabled={changePasswordMutation.isPending} data-testid="button-change-password" className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                <Lock className="w-3.5 h-3.5" />
                {changePasswordMutation.isPending ? "Saving…" : "Update Password"}
              </button>
            </div>
          )}

          </div>
        </div>
      </div>
    </div>
  );
}
