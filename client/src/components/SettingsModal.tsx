import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { X, Save, Lock, Bot, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "prompt" | "account";

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>("prompt");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  const { data: settings } = useQuery<{ systemPrompt: string }>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings", { credentials: "include" }).then((r) => r.json()),
  });

  useEffect(() => {
    if (settings) setSystemPrompt(settings.systemPrompt ?? "");
  }, [settings]);

  const savePromptMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/settings", { systemPrompt }).then((r) => r.json()),
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
            { id: "account" as Tab, label: "Account", icon: Lock },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
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
        <div className="p-6">
          {tab === "prompt" && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Custom System Prompt</p>
                <p className="text-xs text-muted-foreground mb-3">
                  This instruction is prepended to every conversation. Use it to set the AI's persona, tone, or area of expertise.
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  data-testid="input-system-prompt"
                  placeholder='e.g. "You are a concise coding assistant who prefers TypeScript. Always explain your reasoning."'
                  rows={6}
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
