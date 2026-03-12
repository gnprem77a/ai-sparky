import type React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import {
  Shield, Trash2, UserCheck, UserX, ArrowLeft,
  Users, ShieldCheck, Crown, UserCircle, Calendar,
  ChevronDown, X, Check, Zap, DollarSign, ArrowDownUp, Megaphone, Send, Search as SearchIcon,
  Server, Plus, Edit2, PlayCircle, ChevronUp, Power, PowerOff, Loader2, CheckCircle2, AlertCircle,
  ArrowUp, ArrowDown, Key, Globe, Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type Broadcast, type AiProvider } from "@shared/schema";

interface TokenStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  byUser: { userId: string; username: string; inputTokens: number; outputTokens: number }[];
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function estimateCost(inputTokens: number, outputTokens: number): string {
  const costUsd = (inputTokens / 1000) * 0.003 + (outputTokens / 1000) * 0.015;
  if (costUsd < 0.001) return "< $0.001";
  if (costUsd < 1) return `$${costUsd.toFixed(3)}`;
  return `$${costUsd.toFixed(2)}`;
}

interface AdminUser {
  id: string;
  username: string;
  isAdmin: boolean;
  plan: "free" | "pro";
  planExpiresAt: string | null;
  createdAt: string;
}

type Duration = "1w" | "1m" | "1y" | "permanent" | "custom";

const DURATION_OPTIONS: { value: Duration; label: string }[] = [
  { value: "1w", label: "1 Week" },
  { value: "1m", label: "1 Month" },
  { value: "1y", label: "1 Year" },
  { value: "permanent", label: "Permanent" },
  { value: "custom", label: "Custom date" },
];

function computeExpiry(duration: Duration, customDate: string): Date | null {
  const now = new Date();
  if (duration === "1w") return new Date(now.getTime() + 7 * 86400000);
  if (duration === "1m") { const d = new Date(now); d.setMonth(d.getMonth() + 1); return d; }
  if (duration === "1y") { const d = new Date(now); d.setFullYear(d.getFullYear() + 1); return d; }
  if (duration === "permanent") return null;
  if (duration === "custom" && customDate) return new Date(customDate);
  return null;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function PlanBadge({ plan, expiresAt }: { plan: string; expiresAt: string | null }) {
  const expired = plan === "pro" && isExpired(expiresAt);
  if (plan === "pro" && !expired) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/25">
        <Crown className="w-2.5 h-2.5" /> Pro
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground ring-1 ring-border">
      <UserCircle className="w-2.5 h-2.5" /> Free
    </span>
  );
}

function PlanManager({ user, currentUserId, onClose }: { user: AdminUser; currentUserId: string; onClose: () => void }) {
  const [selectedPlan, setSelectedPlan] = useState<"free" | "pro">(user.plan);
  const [duration, setDuration] = useState<Duration>("1m");
  const [customDate, setCustomDate] = useState("");

  const planMutation = useMutation({
    mutationFn: ({ plan, expiresAt }: { plan: "free" | "pro"; expiresAt: string | null }) =>
      apiRequest("PATCH", `/api/admin/users/${user.id}/plan`, { plan, expiresAt }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      onClose();
    },
  });

  const handleApply = () => {
    if (selectedPlan === "free") {
      planMutation.mutate({ plan: "free", expiresAt: null });
    } else {
      const expiry = computeExpiry(duration, customDate);
      planMutation.mutate({ plan: "pro", expiresAt: expiry ? expiry.toISOString() : null });
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-border bg-background p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Manage Plan</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Plan selector */}
      <div className="flex rounded-lg bg-muted p-1 gap-1">
        {(["free", "pro"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setSelectedPlan(p)}
            className={cn(
              "flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5",
              selectedPlan === p
                ? p === "pro"
                  ? "bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30"
                  : "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {p === "pro" ? <Crown className="w-3 h-3" /> : <UserCircle className="w-3 h-3" />}
            {p === "pro" ? "Pro" : "Free"}
          </button>
        ))}
      </div>

      {/* Duration (only for Pro) */}
      {selectedPlan === "pro" && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground font-medium">Duration</p>
          <div className="grid grid-cols-2 gap-1.5">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDuration(opt.value)}
                className={cn(
                  "py-1.5 px-2 rounded-lg text-xs font-medium border transition-all text-left flex items-center gap-1.5",
                  duration === opt.value
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                )}
              >
                {duration === opt.value && <Check className="w-3 h-3 flex-shrink-0" />}
                {opt.label}
              </button>
            ))}
          </div>

          {duration === "custom" && (
            <div>
              <input
                type="date"
                value={customDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}

          {duration !== "custom" && (
            <p className="text-[11px] text-muted-foreground">
              Expires:{" "}
              <span className="font-semibold text-foreground">
                {duration === "permanent" ? "Never" : formatDate(computeExpiry(duration, "")?.toISOString() ?? null)}
              </span>
            </p>
          )}
        </div>
      )}

      {planMutation.isError && (
        <p className="text-xs text-destructive">{(planMutation.error as Error).message}</p>
      )}

      <button
        onClick={handleApply}
        disabled={planMutation.isPending || (selectedPlan === "pro" && duration === "custom" && !customDate)}
        data-testid={`button-apply-plan-${user.id}`}
        className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {planMutation.isPending ? "Saving…" : "Apply Plan"}
      </button>
    </div>
  );
}

/* ─── Provider Types ─── */
const PROVIDER_TYPE_META: Record<string, { label: string; color: string }> = {
  bluesminds: { label: "Bluesminds", color: "text-violet-400" },
  openai:     { label: "OpenAI",     color: "text-emerald-400" },
  anthropic:  { label: "Anthropic",  color: "text-orange-400" },
  azure:      { label: "Azure",      color: "text-blue-400" },
  gemini:     { label: "Gemini",     color: "text-amber-400" },
  bedrock:    { label: "AWS Bedrock",color: "text-cyan-400" },
  custom:     { label: "Custom",     color: "text-pink-400" },
};

const PROVIDER_TYPE_OPTIONS = [
  { value: "bluesminds", label: "Bluesminds (default)" },
  { value: "openai",     label: "OpenAI" },
  { value: "anthropic",  label: "Anthropic" },
  { value: "azure",      label: "Azure OpenAI" },
  { value: "gemini",     label: "Google Gemini" },
  { value: "bedrock",    label: "AWS Bedrock" },
  { value: "custom",     label: "Custom Provider" },
];

type TestStatus = { success: boolean; latencyMs: number; message: string } | null;

interface ProviderFormData {
  name: string;
  providerType: string;
  apiUrl: string;
  apiKey: string;
  modelName: string;
  headers: string;
  bodyTemplate: string;
  responsePath: string;
  isEnabled: boolean;
}

const EMPTY_FORM: ProviderFormData = {
  name: "", providerType: "openai", apiUrl: "", apiKey: "", modelName: "",
  headers: "", bodyTemplate: "", responsePath: "", isEnabled: true,
};

/* Per-provider defaults applied when the type changes */
const PROVIDER_DEFAULTS: Record<string, {
  apiUrl: string;
  modelPlaceholder: string;
  modelSuggestions: string[];
  keyPlaceholder: string;
  keyLabel: string;
  keyRequired: boolean;
  urlLabel: string;
  urlRequired: boolean;
  hint: string;
  hintColor: string;
}> = {
  bluesminds: {
    apiUrl: "https://api.bluesminds.com/v1",
    modelPlaceholder: "claude-sonnet-4-6",
    modelSuggestions: ["claude-sonnet-4-6", "claude-haiku-4-5"],
    keyPlaceholder: "Your Bluesminds API key",
    keyLabel: "API Key",
    keyRequired: true,
    urlLabel: "API Base URL",
    urlRequired: false,
    hint: "OpenAI-compatible endpoint. Uses your BLUESMINDS_API_KEY env var if left blank.",
    hintColor: "text-violet-400",
  },
  openai: {
    apiUrl: "https://api.openai.com/v1",
    modelPlaceholder: "gpt-4o",
    modelSuggestions: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    keyPlaceholder: "sk-...",
    keyLabel: "API Key",
    keyRequired: true,
    urlLabel: "API Base URL",
    urlRequired: false,
    hint: "Standard OpenAI API. Get your key from platform.openai.com.",
    hintColor: "text-emerald-400",
  },
  anthropic: {
    apiUrl: "https://api.anthropic.com",
    modelPlaceholder: "claude-sonnet-4-5",
    modelSuggestions: [
      "claude-sonnet-4-5",
      "claude-haiku-4-5",
      "claude-opus-4-5",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
    ],
    keyPlaceholder: "sk-ant-...",
    keyLabel: "API Key",
    keyRequired: true,
    urlLabel: "API Base URL",
    urlRequired: false,
    hint: "Anthropic direct API. Get your key from console.anthropic.com.",
    hintColor: "text-orange-400",
  },
  azure: {
    apiUrl: "https://<resource>.openai.azure.com/openai/deployments/<deployment>",
    modelPlaceholder: "gpt-4o  (your deployment name)",
    modelSuggestions: ["gpt-4o", "gpt-4", "gpt-35-turbo"],
    keyPlaceholder: "Azure OpenAI API key",
    keyLabel: "API Key",
    keyRequired: true,
    urlLabel: "Azure Endpoint (with deployment path)",
    urlRequired: true,
    hint: "URL format: https://<resource>.openai.azure.com/openai/deployments/<deployment-name>",
    hintColor: "text-blue-400",
  },
  gemini: {
    apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    modelPlaceholder: "gemini-1.5-pro",
    modelSuggestions: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash-exp"],
    keyPlaceholder: "Google AI Studio API key",
    keyLabel: "API Key",
    keyRequired: true,
    urlLabel: "API Base URL",
    urlRequired: false,
    hint: "Uses Gemini's OpenAI-compatible endpoint. Get key from aistudio.google.com.",
    hintColor: "text-amber-400",
  },
  bedrock: {
    apiUrl: "",
    modelPlaceholder: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    modelSuggestions: [
      "anthropic.claude-3-5-sonnet-20241022-v2:0",
      "anthropic.claude-3-haiku-20240307-v1:0",
      "anthropic.claude-3-opus-20240229-v1:0",
      "meta.llama3-70b-instruct-v1:0",
    ],
    keyPlaceholder: "Not needed — uses AWS env vars",
    keyLabel: "API Key (not required)",
    keyRequired: false,
    urlLabel: "Custom Bedrock endpoint (optional)",
    urlRequired: false,
    hint: "Uses AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION env vars. No API key needed here.",
    hintColor: "text-cyan-400",
  },
  custom: {
    apiUrl: "",
    modelPlaceholder: "model-name",
    modelSuggestions: [],
    keyPlaceholder: "Bearer token (optional)",
    keyLabel: "API Key (optional)",
    keyRequired: false,
    urlLabel: "API Endpoint URL",
    urlRequired: true,
    hint: "POST request with configurable body. Use Advanced to set body template and response path.",
    hintColor: "text-pink-400",
  },
};

function ProviderFormModal({
  editing,
  onClose,
  onSave,
}: {
  editing: AiProvider | null;
  onClose: () => void;
  onSave: (data: ProviderFormData, id?: string) => void;
}) {
  const [form, setForm] = useState<ProviderFormData>(
    editing
      ? {
          name: editing.name,
          providerType: editing.providerType,
          apiUrl: editing.apiUrl ?? "",
          apiKey: editing.apiKey ?? "",
          modelName: editing.modelName,
          headers: editing.headers ?? "",
          bodyTemplate: editing.bodyTemplate ?? "",
          responsePath: editing.responsePath ?? "",
          isEnabled: editing.isEnabled,
        }
      : EMPTY_FORM
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>(null);
  const [testing, setTesting] = useState(false);

  const def = PROVIDER_DEFAULTS[form.providerType] ?? PROVIDER_DEFAULTS.openai;

  const set = (k: keyof ProviderFormData, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleTypeChange = (newType: string) => {
    const d = PROVIDER_DEFAULTS[newType] ?? PROVIDER_DEFAULTS.openai;
    setForm((f) => ({
      ...f,
      providerType: newType,
      apiUrl: d.apiUrl,
      modelName: "",
      apiKey: newType === "bedrock" ? "" : f.apiKey,
    }));
    setTestStatus(null);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestStatus(null);
    try {
      const res = await apiRequest("POST", "/api/admin/providers/test-config", {
        providerType: form.providerType,
        apiUrl: form.apiUrl || null,
        apiKey: form.apiKey || null,
        modelName: form.modelName,
        headers: form.headers || null,
      });
      const data = await res.json();
      setTestStatus(data);
    } catch {
      setTestStatus({ success: false, latencyMs: 0, message: "Request failed" });
    } finally {
      setTesting(false);
    }
  };

  const Field = ({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) => (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {label}{required && <span className="text-destructive ml-1">*</span>}
      </label>
      {children}
    </div>
  );

  const inputClass = "w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            <span className="font-semibold text-foreground text-sm">
              {editing ? "Edit Provider" : "Add AI Provider"}
            </span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Provider type selector */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Display Name" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={`My ${PROVIDER_TYPE_META[form.providerType]?.label ?? "AI"} Provider`}
                className={inputClass}
              />
            </Field>
            <Field label="Provider Type">
              <select
                value={form.providerType}
                onChange={(e) => handleTypeChange(e.target.value)}
                className={inputClass}
              >
                {PROVIDER_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* Provider hint bar */}
          <div className={cn("flex items-start gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/60 text-[11px]", def.hintColor)}>
            <Globe className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-70" />
            <span>{def.hint}</span>
          </div>

          {/* Model + API Key */}
          <div className={cn("gap-3", form.providerType === "bedrock" ? "flex flex-col" : "grid grid-cols-2")}>
            <Field label="Model Name" required>
              <div className="space-y-1">
                <input
                  type="text"
                  value={form.modelName}
                  onChange={(e) => set("modelName", e.target.value)}
                  placeholder={def.modelPlaceholder}
                  className={inputClass}
                />
                {def.modelSuggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {def.modelSuggestions.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => set("modelName", m)}
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-mono border transition-all",
                          form.modelName === m
                            ? "bg-primary/15 border-primary/40 text-primary"
                            : "bg-muted/50 border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Field>

            {form.providerType !== "bedrock" && (
              <Field label={def.keyLabel} required={def.keyRequired}>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => set("apiKey", e.target.value)}
                  placeholder={def.keyPlaceholder}
                  className={inputClass}
                />
              </Field>
            )}

            {form.providerType === "bedrock" && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-cyan-500/8 border border-cyan-500/20 text-[11px] text-cyan-400">
                <Key className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>No API key needed. Bedrock authenticates using <strong>AWS_ACCESS_KEY_ID</strong>, <strong>AWS_SECRET_ACCESS_KEY</strong>, and <strong>AWS_REGION</strong> environment variables.</span>
              </div>
            )}
          </div>

          {/* API URL */}
          <Field label={def.urlLabel} required={def.urlRequired}>
            <input
              type="text"
              value={form.apiUrl}
              onChange={(e) => set("apiUrl", e.target.value)}
              placeholder={def.apiUrl || "https://your-api-endpoint.com/v1"}
              className={cn(inputClass, "font-mono text-xs")}
            />
          </Field>

          {/* Enable toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="prov-enabled"
              checked={form.isEnabled}
              onChange={(e) => set("isEnabled", e.target.checked)}
              className="rounded"
            />
            <label htmlFor="prov-enabled" className="text-sm text-muted-foreground">Enable this provider</label>
          </div>

          {/* Advanced */}
          <button
            onClick={() => setShowAdvanced((s) => !s)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showAdvanced && "rotate-180")} />
            Advanced (custom headers, body template, response path)
          </button>

          {showAdvanced && (
            <div className="space-y-3 pt-2 border-t border-border/60">
              <Field label="Extra Headers (JSON)">
                <textarea
                  value={form.headers}
                  onChange={(e) => set("headers", e.target.value)}
                  placeholder='{"X-Custom-Header": "value"}'
                  rows={2}
                  className={cn(inputClass, "resize-none font-mono text-xs")}
                />
              </Field>
              <Field label="Body Template ({{model}}, {{messages}}, {{maxTokens}})">
                <textarea
                  value={form.bodyTemplate}
                  onChange={(e) => set("bodyTemplate", e.target.value)}
                  placeholder='{"model": "{{model}}", "prompt": "{{lastMessage}}"}'
                  rows={3}
                  className={cn(inputClass, "resize-none font-mono text-xs")}
                />
              </Field>
              <Field label="Response Path (dot notation)">
                <input
                  type="text"
                  value={form.responsePath}
                  onChange={(e) => set("responsePath", e.target.value)}
                  placeholder="choices.0.message.content"
                  className={inputClass}
                />
              </Field>
            </div>
          )}

          {/* Test result */}
          {testStatus && (
            <div className={cn(
              "flex items-start gap-2 p-3 rounded-lg text-xs",
              testStatus.success ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border border-red-500/20 text-red-400"
            )}>
              {testStatus.success ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
              <div>
                <div className="font-semibold">{testStatus.success ? "Connected successfully" : "Connection failed"}</div>
                <div className="opacity-80">{testStatus.message}{testStatus.latencyMs > 0 && ` · ${testStatus.latencyMs}ms`}</div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center gap-2 justify-between">
          <button
            onClick={handleTest}
            disabled={testing || !form.modelName}
            data-testid="button-test-provider"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all disabled:opacity-40"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            Test Connection
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(form, editing?.id)}
              disabled={!form.name || !form.modelName}
              data-testid="button-save-provider"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-40"
            >
              <Check className="w-3.5 h-3.5" />
              {editing ? "Update" : "Add Provider"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProvidersSection() {
  const [showForm, setShowForm] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AiProvider | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestStatus>>({});

  const { data: providers = [], isLoading } = useQuery<AiProvider[]>({
    queryKey: ["/api/admin/providers"],
  });

  const createMutation = useMutation({
    mutationFn: (data: ProviderFormData) => apiRequest("POST", "/api/admin/providers", {
      name: data.name, providerType: data.providerType,
      apiUrl: data.apiUrl || null, apiKey: data.apiKey || null, modelName: data.modelName,
      headers: data.headers || null, bodyTemplate: data.bodyTemplate || null,
      responsePath: data.responsePath || null, isEnabled: data.isEnabled, priority: 100,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] }); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProviderFormData> }) =>
      apiRequest("PATCH", `/api/admin/providers/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] }); setEditingProvider(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/providers/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      apiRequest("PATCH", `/api/admin/providers/${id}`, { isEnabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] }),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => apiRequest("POST", "/api/admin/providers/reorder", { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] }),
  });

  const handleSave = (form: ProviderFormData, id?: string) => {
    if (id) updateMutation.mutate({ id, data: form });
    else createMutation.mutate(form);
  };

  const handleMove = (id: string, dir: "up" | "down") => {
    const sorted = [...providers].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex((p) => p.id === id);
    if ((dir === "up" && idx === 0) || (dir === "down" && idx === sorted.length - 1)) return;
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    [sorted[idx], sorted[swapIdx]] = [sorted[swapIdx], sorted[idx]];
    reorderMutation.mutate(sorted.map((p) => p.id));
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await apiRequest("POST", `/api/admin/providers/${id}/test`);
      const data = await res.json();
      setTestResults((r) => ({ ...r, [id]: data }));
    } catch {
      setTestResults((r) => ({ ...r, [id]: { success: false, latencyMs: 0, message: "Request failed" } }));
    } finally {
      setTestingId(null);
    }
  };

  const sorted = [...providers].sort((a, b) => a.priority - b.priority);

  return (
    <>
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">AI Providers</h2>
            <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{providers.length}</span>
          </div>
          <button
            onClick={() => { setEditingProvider(null); setShowForm(true); }}
            data-testid="button-add-provider"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Add Provider
          </button>
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className="py-8 flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading providers…
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-2">
                  No custom providers added — only the built-in fallback is active.
                </p>
              )}

              {sorted.map((p, idx) => {
                const meta = PROVIDER_TYPE_META[p.providerType] ?? { label: p.providerType, color: "text-foreground" };
                const tr = testResults[p.id];
                return (
                  <div
                    key={p.id}
                    data-testid={`card-provider-${p.id}`}
                    className={cn(
                      "rounded-xl border p-4 transition-all",
                      p.isEnabled ? "border-border bg-background/50" : "border-border/40 bg-background/20 opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => handleMove(p.id, "up")} disabled={idx === 0} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25 transition-colors">
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleMove(p.id, "down")} disabled={idx === sorted.length - 1} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25 transition-colors">
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Cpu className={cn("w-4 h-4", meta.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground truncate">{p.name}</span>
                          <span className={cn("text-[10px] font-semibold uppercase tracking-wider", meta.color)}>{meta.label}</span>
                          {!p.isEnabled && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Disabled</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><Cpu className="w-3 h-3" />{p.modelName || "—"}</span>
                          {p.apiUrl && <span className="flex items-center gap-1 truncate max-w-[200px]"><Globe className="w-3 h-3" />{p.apiUrl}</span>}
                          {p.apiKey && <span className="flex items-center gap-1"><Key className="w-3 h-3" />••••••</span>}
                          <span className="text-muted-foreground/40">Priority {p.priority}</span>
                        </div>
                        {tr && (
                          <div className={cn(
                            "mt-1.5 inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-md",
                            tr.success ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                          )}>
                            {tr.success ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                            {tr.success ? `OK · ${tr.latencyMs}ms` : tr.message}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => handleTest(p.id)} disabled={testingId === p.id} data-testid={`button-test-provider-${p.id}`} title="Test connection" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all disabled:opacity-40">
                          {testingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => toggleMutation.mutate({ id: p.id, isEnabled: !p.isEnabled })} data-testid={`button-toggle-provider-${p.id}`} title={p.isEnabled ? "Disable" : "Enable"} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
                          {p.isEnabled ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => { setEditingProvider(p); setShowForm(true); }} data-testid={`button-edit-provider-${p.id}`} title="Edit" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { if (confirm(`Delete provider "${p.name}"?`)) deleteMutation.mutate(p.id); }} data-testid={`button-delete-provider-${p.id}`} title="Delete" className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Built-in fallback — always shown, read-only */}
              <div className="rounded-xl border border-dashed border-violet-500/30 bg-violet-500/5 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-6 flex-shrink-0" />
                  <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                    <Cpu className="w-4 h-4 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">Bluesminds (Built-in Fallback)</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400">Bluesminds</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-semibold">
                        {sorted.filter(p => p.isEnabled).length === 0 ? "● Active" : "Standby"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><Cpu className="w-3 h-3" />claude-sonnet-4-6 / claude-haiku-4-5</span>
                      <span className="flex items-center gap-1"><Globe className="w-3 h-3" />api.bluesminds.com/v1</span>
                      <span className="flex items-center gap-1"><Key className="w-3 h-3" />BLUESMINDS_API_KEY (env)</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 mt-1">
                      Always available as last resort. Cannot be removed.
                      {sorted.filter(p => p.isEnabled).length > 0 && " Only used if all custom providers above fail."}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-[11px] text-muted-foreground/40 italic">read-only</div>
                </div>
              </div>
            </div>
          )}

          {!isLoading && sorted.length > 0 && (
            <div className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground">
              <Server className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 opacity-50" />
              <span>Providers are tried in <strong className="text-foreground">priority order</strong> (top → bottom). Lower priority number = tried first.</span>
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <ProviderFormModal
          editing={editingProvider}
          onClose={() => { setShowForm(false); setEditingProvider(null); }}
          onSave={handleSave}
        />
      )}
    </>
  );
}

export default function AdminPage() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");

  const broadcastMutation = useMutation({
    mutationFn: (message: string) =>
      apiRequest("POST", "/api/admin/broadcast", { message }).then((r) => r.json()),
    onSuccess: () => {
      setBroadcastMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/broadcasts"] });
    },
  });

  const { data: broadcasts = [] } = useQuery<Broadcast[]>({
    queryKey: ["/api/admin/broadcasts"],
    queryFn: () => fetch("/api/admin/broadcasts", { credentials: "include" }).then((r) => r.json()),
    enabled: !!user?.isAdmin,
  });

  useEffect(() => {
    if (!isLoading && (!user || !user.isAdmin)) navigate("/");
  }, [user, isLoading]);

  const { data: users = [], isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
    queryFn: () => fetch("/api/admin/users", { credentials: "include" }).then((r) => r.json()),
    enabled: !!user?.isAdmin,
  });

  const { data: tokenStats } = useQuery<TokenStats>({
    queryKey: ["/api/admin/stats/tokens"],
    queryFn: () => fetch("/api/admin/stats/tokens", { credentials: "include" }).then((r) => r.json()),
    enabled: !!user?.isAdmin,
  });

  const toggleAdminMutation = useMutation({
    mutationFn: ({ id, isAdmin }: { id: string; isAdmin: boolean }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/admin`, { isAdmin }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  if (isLoading || !user?.isAdmin) return null;

  const totalUsers = users.length;
  const adminCount = users.filter((u) => u.isAdmin).length;
  const proCount = users.filter((u) => u.plan === "pro" && !isExpired(u.planExpiresAt)).length;
  const freeCount = totalUsers - proCount;

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(userSearch.toLowerCase())
  );

  const stats = [
    { label: "Total Users", value: totalUsers, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Pro Users", value: proCount, icon: Crown, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Free Users", value: freeCount, icon: UserCircle, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Admins", value: adminCount, icon: ShieldCheck, color: "text-violet-500", bg: "bg-violet-500/10" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            data-testid="button-back-home"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Chat
          </button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="font-semibold text-foreground text-sm">Admin Dashboard</span>
          </div>
          <div className="ml-auto text-xs text-muted-foreground">
            Signed in as <span className="font-semibold text-foreground">{user.username}</span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
              <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", stat.bg)}>
                <stat.icon className={cn("w-4.5 h-4.5", stat.color)} style={{ width: 18, height: 18 }} />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{stat.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium leading-tight">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Broadcast Message Section */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">System Broadcast</h2>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex gap-2">
              <textarea
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
                placeholder="Type a broadcast message to all users..."
                className="flex-1 min-h-[80px] rounded-xl border border-border bg-muted/20 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => broadcastMutation.mutate(broadcastMessage)}
                disabled={!broadcastMessage.trim() || broadcastMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {broadcastMutation.isPending ? "Sending..." : "Send Broadcast"}
              </button>
            </div>

            {broadcasts.length > 0 && (
              <div className="mt-6 space-y-2">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Recent Broadcasts</p>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                  {broadcasts.slice(0, 5).map((b) => (
                    <div key={b.id} className="p-3 rounded-lg border border-border bg-muted/10 text-xs">
                      <div className="flex justify-between items-start mb-1">
                        <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase", b.isActive ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground")}>
                          {b.isActive ? "Active" : "Inactive"}
                        </span>
                        <span className="text-muted-foreground">{formatDate(b.createdAt.toString())}</span>
                      </div>
                      <p className="text-foreground">{b.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI Providers Section */}
        <ProvidersSection />

        {/* Token Usage Section */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">Token Usage</h2>
            </div>
            <span className="text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
              ≈ Sonnet pricing — estimate only
            </span>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-3 gap-4 mb-0">
              {/* Input tokens */}
              <div className="rounded-xl border border-border/50 bg-muted/20 p-4" data-testid="stat-input-tokens">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <ArrowDownUp className="w-3.5 h-3.5 text-blue-500" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">Input Tokens</span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {tokenStats ? fmtTokens(tokenStats.totalInputTokens) : "—"}
                </p>
              </div>
              {/* Output tokens */}
              <div className="rounded-xl border border-border/50 bg-muted/20 p-4" data-testid="stat-output-tokens">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <Zap className="w-3.5 h-3.5 text-violet-500" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">Output Tokens</span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {tokenStats ? fmtTokens(tokenStats.totalOutputTokens) : "—"}
                </p>
              </div>
              {/* Estimated cost */}
              <div className="rounded-xl border border-border/50 bg-muted/20 p-4" data-testid="stat-estimated-cost">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">Est. Cost</span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {tokenStats ? estimateCost(tokenStats.totalInputTokens, tokenStats.totalOutputTokens) : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Plan Features Reference */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            {
              title: "Free Plan",
              icon: UserCircle,
              color: "text-muted-foreground",
              ring: "ring-border",
              bg: "bg-card",
              features: [
                "Limited messages per day (coming soon)",
                "Access to Fast model only (coming soon)",
                "Standard response speed",
                "Basic file attachments",
              ],
            },
            {
              title: "Pro Plan",
              icon: Crown,
              color: "text-amber-500",
              ring: "ring-amber-500/30",
              bg: "bg-amber-500/5",
              features: [
                "Unlimited messages",
                "Access to all models (Auto, Powerful, Creative)",
                "Priority response speed",
                "Advanced file & image attachments",
              ],
            },
          ].map((tier) => (
            <div key={tier.title} className={cn("rounded-2xl border p-4 ring-1", tier.bg, tier.ring)}>
              <div className="flex items-center gap-2 mb-3">
                <tier.icon className={cn("w-4 h-4", tier.color)} />
                <span className={cn("font-semibold text-sm", tier.color)}>{tier.title}</span>
                {tier.title === "Pro Plan" && (
                  <span className="ml-auto text-[10px] font-bold text-amber-500 bg-amber-500/15 px-1.5 py-0.5 rounded-full">PREMIUM</span>
                )}
              </div>
              <ul className="space-y-1.5">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Check className={cn("w-3 h-3 mt-0.5 flex-shrink-0", tier.color)} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Users table */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between gap-4">
            <h2 className="font-semibold text-foreground flex-shrink-0">All Users</h2>
            <div className="relative flex-1 max-w-sm">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by username..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-border bg-muted/20 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <span className="text-xs text-muted-foreground flex-shrink-0">{filteredUsers.length} users</span>
          </div>

          {usersLoading ? (
            <div className="flex items-center justify-center py-16 gap-2">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">No users found.</div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredUsers.map((u) => {
                const expired = u.plan === "pro" && isExpired(u.planExpiresAt);
                const activePlan = u.plan === "pro" && !expired ? "pro" : "free";
                return (
                  <div key={u.id} data-testid={`row-user-${u.id}`} className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",
                        u.isAdmin
                          ? "bg-violet-500/15 text-violet-500 ring-1 ring-violet-500/30"
                          : activePlan === "pro"
                            ? "bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30"
                            : "bg-muted text-muted-foreground"
                      )}>
                        {u.username[0].toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground text-sm truncate">{u.username}</span>
                          {u.isAdmin && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-500/15 text-violet-500 ring-1 ring-violet-500/20">
                              <Shield className="w-2.5 h-2.5" /> Admin
                            </span>
                          )}
                          <PlanBadge plan={activePlan} expiresAt={u.planExpiresAt} />
                          {u.id === user.id && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary">You</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Joined {formatDate(u.createdAt)}
                          </span>
                          {u.plan === "pro" && (
                            <span className={cn(
                              "text-[11px] flex items-center gap-1",
                              expired ? "text-destructive/70" : "text-muted-foreground"
                            )}>
                              <Crown className="w-3 h-3" />
                              {expired
                                ? "Pro expired " + formatDate(u.planExpiresAt)
                                : u.planExpiresAt
                                  ? "Pro until " + formatDate(u.planExpiresAt)
                                  : "Pro — no expiry"}
                            </span>
                          )}
                          {(() => {
                            const ut = tokenStats?.byUser.find((b) => b.userId === u.id);
                            if (!ut || (ut.inputTokens === 0 && ut.outputTokens === 0)) return null;
                            return (
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Zap className="w-3 h-3 text-primary/60" />
                                {fmtTokens(ut.inputTokens + ut.outputTokens)} tokens
                                <span className="text-muted-foreground/50">
                                  ({estimateCost(ut.inputTokens, ut.outputTokens)})
                                </span>
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Action buttons */}
                      {u.id !== user.id && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => setOpenPlanId(openPlanId === u.id ? null : u.id)}
                            data-testid={`button-manage-plan-${u.id}`}
                            className={cn(
                              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all",
                              openPlanId === u.id
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                            )}
                          >
                            <Crown className="w-3.5 h-3.5" />
                            Plan
                            <ChevronDown className={cn("w-3 h-3 transition-transform", openPlanId === u.id && "rotate-180")} />
                          </button>
                          <button
                            onClick={() => toggleAdminMutation.mutate({ id: u.id, isAdmin: !u.isAdmin })}
                            disabled={toggleAdminMutation.isPending}
                            data-testid={`button-toggle-admin-${u.id}`}
                            title={u.isAdmin ? "Remove admin" : "Make admin"}
                            className={cn(
                              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all",
                              u.isAdmin
                                ? "border-orange-500/30 text-orange-500 hover:bg-orange-500/10"
                                : "border-violet-500/30 text-violet-500 hover:bg-violet-500/10"
                            )}
                          >
                            {u.isAdmin ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                            {u.isAdmin ? "Demote" : "Admin"}
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete user "${u.username}"? This cannot be undone.`)) {
                                deleteMutation.mutate(u.id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-user-${u.id}`}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-destructive/30 text-destructive hover:bg-destructive/10 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Plan manager inline */}
                    {openPlanId === u.id && (
                      <PlanManager
                        user={u}
                        currentUserId={user.id}
                        onClose={() => setOpenPlanId(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
