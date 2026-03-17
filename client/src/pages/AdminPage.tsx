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
  ArrowUp, ArrowDown, Key, Globe, Cpu, Copy, Settings2, Activity, Flag, FlagOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
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
  apiEnabled: boolean;
  email?: string | null;
  apiDailyLimit?: number | null;
  apiMonthlyLimit?: number | null;
  apiWebhookUrl?: string | null;
  apiRateLimitPerMin?: number | null;
  apiBalance?: number | null;
  isFlagged?: boolean;
  flagReason?: string | null;
}

interface FeatureStat {
  feature: string;
  count: number;
  uniqueUsers: number;
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
  bluesminds:         { label: "Bluesminds",         color: "text-violet-400" },
  openai:             { label: "OpenAI",              color: "text-emerald-400" },
  anthropic:          { label: "Anthropic",           color: "text-orange-400" },
  azure:              { label: "Azure",               color: "text-blue-400" },
  gemini:             { label: "Gemini",              color: "text-amber-400" },
  bedrock:            { label: "AWS Bedrock",         color: "text-cyan-400" },
  "openai-compatible":{ label: "OpenAI-Compatible",  color: "text-teal-400" },
  custom:             { label: "Custom",              color: "text-pink-400" },
};

const PROVIDER_TYPE_OPTIONS = [
  { value: "bluesminds",         label: "Bluesminds (default)" },
  { value: "openai",             label: "OpenAI" },
  { value: "anthropic",          label: "Anthropic" },
  { value: "azure",              label: "Azure OpenAI" },
  { value: "gemini",             label: "Google Gemini" },
  { value: "bedrock",            label: "AWS Bedrock" },
  { value: "openai-compatible",  label: "OpenAI-Compatible (3rd party)" },
  { value: "custom",             label: "Custom (fully configurable)" },
];

type TestStatus = { success: boolean; latencyMs: number; message: string; statusCode?: number } | null;

interface ProviderFormData {
  name: string;
  providerType: string;
  apiUrl: string;
  apiKey: string;
  modelName: string;
  headers: string;
  httpMethod: string;
  authStyle: string;
  authHeaderName: string;
  streamMode: string;
  bodyTemplate: string;
  responsePath: string;
  isEnabled: boolean;
  priority: number;
  inputPricePerMillion: string;
  outputPricePerMillion: string;
  maxOutputTokens: string;
}

const EMPTY_FORM: ProviderFormData = {
  name: "", providerType: "openai", apiUrl: "", apiKey: "", modelName: "",
  headers: "", httpMethod: "POST", authStyle: "bearer", authHeaderName: "", streamMode: "none",
  bodyTemplate: "", responsePath: "", isEnabled: true, priority: 100,
  inputPricePerMillion: "", outputPricePerMillion: "", maxOutputTokens: "",
};

const HTTP_METHODS = ["POST", "GET", "PUT", "PATCH", "DELETE"];

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
    modelSuggestions: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "gpt-5.3-chat"],
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
  "openai-compatible": {
    apiUrl: "",
    modelPlaceholder: "model-id",
    modelSuggestions: ["mistral-large-latest", "llama-3.3-70b-instruct", "deepseek-chat", "qwen-max"],
    keyPlaceholder: "API key or Bearer token",
    keyLabel: "API Key",
    keyRequired: false,
    urlLabel: "API Base URL (must include /v1 or similar)",
    urlRequired: true,
    hint: "Any provider with an OpenAI-compatible /chat/completions endpoint. Supports real SSE streaming.",
    hintColor: "text-teal-400",
  },
  custom: {
    apiUrl: "",
    modelPlaceholder: "model-name",
    modelSuggestions: ["gpt-5.3-chat", "Mistral-Large-3", "Cohere-rerank-v4.0-pro", "embed-v-4-0"],
    keyPlaceholder: "Bearer token (optional)",
    keyLabel: "API Key (optional)",
    keyRequired: false,
    urlLabel: "API Endpoint URL",
    urlRequired: true,
    hint: "Fully configurable: custom auth style, body template, response path, and optional OpenAI-SSE streaming.",
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
          httpMethod: (editing as AiProvider & { httpMethod?: string }).httpMethod ?? "POST",
          authStyle: (editing as AiProvider & { authStyle?: string }).authStyle ?? "bearer",
          authHeaderName: (editing as AiProvider & { authHeaderName?: string }).authHeaderName ?? "",
          streamMode: (editing as AiProvider & { streamMode?: string }).streamMode ?? "none",
          bodyTemplate: editing.bodyTemplate ?? "",
          responsePath: editing.responsePath ?? "",
          isEnabled: editing.isEnabled,
          priority: editing.priority,
          inputPricePerMillion: (editing as any).inputPricePerMillion != null ? String((editing as any).inputPricePerMillion) : "",
          outputPricePerMillion: (editing as any).outputPricePerMillion != null ? String((editing as any).outputPricePerMillion) : "",
          maxOutputTokens: (editing as any).maxOutputTokens != null ? String((editing as any).maxOutputTokens) : "",
        }
      : EMPTY_FORM
  );
  const [showAdvanced, setShowAdvanced] = useState(
    editing?.providerType === "custom" || editing?.providerType === "openai-compatible" ||
    !!editing?.bodyTemplate || !!editing?.responsePath
  );
  const [testStatus, setTestStatus] = useState<TestStatus>(null);
  const [testing, setTesting] = useState(false);

  const def = PROVIDER_DEFAULTS[form.providerType] ?? PROVIDER_DEFAULTS.openai;

  const set = (k: keyof ProviderFormData, v: string | boolean | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  const defaultAuthStyle = (type: string): string => {
    if (type === "anthropic") return "x-api-key";
    if (type === "azure") return "bearer";
    if (type === "bedrock" || type === "none") return "none";
    return "bearer";
  };

  const handleTypeChange = (newType: string) => {
    const d = PROVIDER_DEFAULTS[newType] ?? PROVIDER_DEFAULTS.openai;
    setForm((f) => ({
      ...f,
      providerType: newType,
      apiUrl: d.apiUrl,
      modelName: "",
      apiKey: newType === "bedrock" ? "" : f.apiKey,
      authStyle: defaultAuthStyle(newType),
      streamMode: newType === "openai-compatible" ? "openai-sse" : "none",
    }));
    if (newType === "custom" || newType === "openai-compatible") setShowAdvanced(true);
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
        httpMethod: form.httpMethod || "POST",
        authStyle: form.authStyle || "bearer",
        authHeaderName: form.authHeaderName || null,
        streamMode: form.streamMode || "none",
        bodyTemplate: form.bodyTemplate || null,
        responsePath: form.responsePath || null,
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
                data-testid="input-provider-name"
              />
            </Field>
            <Field label="Provider Type">
              <select
                value={form.providerType}
                onChange={(e) => handleTypeChange(e.target.value)}
                className={inputClass}
                data-testid="select-provider-type"
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
                  data-testid="input-provider-model"
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
                  data-testid="input-provider-key"
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
              data-testid="input-provider-url"
            />
          </Field>

          {/* HTTP Method + Priority + Enable */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="HTTP Method">
              <select
                value={form.httpMethod}
                onChange={(e) => set("httpMethod", e.target.value)}
                className={inputClass}
                data-testid="select-provider-method"
              >
                {HTTP_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <input
                type="number"
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
                min={0}
                max={999}
                className={inputClass}
                data-testid="input-provider-priority"
              />
            </Field>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  id="prov-enabled"
                  checked={form.isEnabled}
                  onChange={(e) => set("isEnabled", e.target.checked)}
                  className="rounded"
                  data-testid="checkbox-provider-enabled"
                />
                <span className="text-sm text-muted-foreground">Enabled</span>
              </label>
            </div>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Input Price ($ per 1M tokens)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.inputPricePerMillion}
                onChange={(e) => set("inputPricePerMillion", e.target.value)}
                placeholder="e.g. 0.80"
                className={inputClass}
                data-testid="input-provider-input-price"
              />
            </Field>
            <Field label="Output Price ($ per 1M tokens)">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.outputPricePerMillion}
                onChange={(e) => set("outputPricePerMillion", e.target.value)}
                placeholder="e.g. 4.00"
                className={inputClass}
                data-testid="input-provider-output-price"
              />
            </Field>
          </div>

          {/* Max output tokens override */}
          <Field label="Max Output Tokens (optional — leave blank for platform default)">
            <input
              type="number"
              step="1"
              min="1"
              value={form.maxOutputTokens}
              onChange={(e) => set("maxOutputTokens", e.target.value)}
              placeholder="e.g. 32768"
              className={inputClass}
              data-testid="input-provider-max-output-tokens"
            />
          </Field>

          {/* Advanced */}
          <button
            onClick={() => setShowAdvanced((s) => !s)}
            data-testid="button-toggle-advanced"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showAdvanced && "rotate-180")} />
            Advanced (auth style, streaming, headers, body template)
          </button>

          {showAdvanced && (
            <div className="space-y-3 pt-2 border-t border-border/60">

              {/* Auth style — shown for custom & openai-compatible; read-only hint for built-in types */}
              {(form.providerType === "custom" || form.providerType === "openai-compatible") && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Auth Style">
                    <select
                      value={form.authStyle}
                      onChange={(e) => set("authStyle", e.target.value)}
                      className={inputClass}
                      data-testid="select-provider-auth-style"
                    >
                      <option value="bearer">Bearer token  (Authorization: Bearer …)</option>
                      <option value="x-api-key">x-api-key header</option>
                      <option value="custom-header">Custom header name</option>
                      <option value="none">None (no auth header)</option>
                    </select>
                  </Field>
                  {form.authStyle === "custom-header" && (
                    <Field label="Header Name">
                      <input
                        type="text"
                        value={form.authHeaderName}
                        onChange={(e) => set("authHeaderName", e.target.value)}
                        placeholder="X-Api-Key"
                        className={inputClass}
                        data-testid="input-provider-auth-header-name"
                      />
                    </Field>
                  )}
                </div>
              )}

              {/* Stream mode — only for custom */}
              {form.providerType === "custom" && (
                <Field label="Streaming Mode">
                  <select
                    value={form.streamMode}
                    onChange={(e) => set("streamMode", e.target.value)}
                    className={inputClass}
                    data-testid="select-provider-stream-mode"
                  >
                    <option value="none">None — full JSON response (use Response Path)</option>
                    <option value="openai-sse">OpenAI SSE — server-sent events (delta streaming)</option>
                  </select>
                </Field>
              )}

              <Field label="Extra Headers (JSON)">
                <textarea
                  value={form.headers}
                  onChange={(e) => set("headers", e.target.value)}
                  placeholder='{"X-Custom-Header": "value", "api-key": "your-key"}'
                  rows={2}
                  className={cn(inputClass, "resize-none font-mono text-xs")}
                  data-testid="textarea-provider-headers"
                />
              </Field>

              {/* Body template & response path — only for custom (openai-compatible uses fixed format) */}
              {form.providerType === "custom" && (
                <>
                  <Field label="Body Template — variables: {{prompt}}, {{messages}}, {{model}}, {{systemPrompt}}, {{maxTokens}}, {{stream}}">
                    <textarea
                      value={form.bodyTemplate}
                      onChange={(e) => set("bodyTemplate", e.target.value)}
                      placeholder='{"model": "{{model}}", "prompt": "{{prompt}}", "messages": {{messages}}}'
                      rows={4}
                      className={cn(inputClass, "resize-none font-mono text-xs")}
                      data-testid="textarea-provider-body"
                    />
                  </Field>
                  {form.streamMode !== "openai-sse" && (
                    <Field label="Response Path (dot notation, e.g. choices.0.message.content)">
                      <input
                        type="text"
                        value={form.responsePath}
                        onChange={(e) => set("responsePath", e.target.value)}
                        placeholder="choices.0.message.content"
                        className={inputClass}
                        data-testid="input-provider-response-path"
                      />
                    </Field>
                  )}
                </>
              )}
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
                <div className="font-semibold">
                  {testStatus.success
                    ? "Connected"
                    : (testStatus.statusCode === 401 || testStatus.statusCode === 403)
                      ? "Invalid Key"
                      : "Connection Failed"}
                </div>
                <div className="opacity-80">
                  {testStatus.success
                    ? `Response in ${testStatus.latencyMs}ms`
                    : testStatus.message}
                </div>
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
      headers: data.headers || null, httpMethod: data.httpMethod || "POST",
      authStyle: data.authStyle || "bearer",
      authHeaderName: data.authHeaderName || null,
      streamMode: data.streamMode || "none",
      bodyTemplate: data.bodyTemplate || null,
      responsePath: data.responsePath || null, isEnabled: data.isEnabled,
      priority: typeof data.priority === "number" ? data.priority : parseInt(String(data.priority), 10) || 100,
      inputPricePerMillion: data.inputPricePerMillion !== "" ? parseFloat(data.inputPricePerMillion) : null,
      outputPricePerMillion: data.outputPricePerMillion !== "" ? parseFloat(data.outputPricePerMillion) : null,
      maxOutputTokens: data.maxOutputTokens !== "" ? parseInt(data.maxOutputTokens, 10) : null,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] }); setShowForm(false); setEditingProvider(null); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProviderFormData> }) =>
      apiRequest("PATCH", `/api/admin/providers/${id}`, {
        ...data,
        httpMethod: data.httpMethod || "POST",
        priority: data.priority !== undefined
          ? (typeof data.priority === "number" ? data.priority : parseInt(String(data.priority), 10) || 100)
          : undefined,
        inputPricePerMillion: data.inputPricePerMillion !== undefined
          ? (data.inputPricePerMillion !== "" ? parseFloat(data.inputPricePerMillion as string) : null)
          : undefined,
        outputPricePerMillion: data.outputPricePerMillion !== undefined
          ? (data.outputPricePerMillion !== "" ? parseFloat(data.outputPricePerMillion as string) : null)
          : undefined,
        maxOutputTokens: data.maxOutputTokens !== undefined
          ? (data.maxOutputTokens !== "" ? parseInt(data.maxOutputTokens as string, 10) : null)
          : undefined,
      }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] }); setEditingProvider(null); setShowForm(false); },
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
                          {p.httpMethod && p.httpMethod !== "POST" && (
                            <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">{p.httpMethod}</span>
                          )}
                          <span className="text-muted-foreground/40">Priority {p.priority}</span>
                        </div>
                        {tr && (
                          <div className={cn(
                            "mt-1.5 inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-md",
                            tr.success ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                          )}>
                            {tr.success ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                            {tr.success
                              ? `Connected · ${tr.latencyMs}ms`
                              : (tr.statusCode === 401 || tr.statusCode === 403)
                                ? "Invalid Key"
                                : tr.message}
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
  const [userSort, setUserSort] = useState<"name" | "plan" | "tokens" | "joined">("joined");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionPending, setBulkActionPending] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [generatedKey, setGeneratedKey] = useState<{ userId: string; key: string } | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [apiSettingsOpenId, setApiSettingsOpenId] = useState<string | null>(null);
  const [apiSettingsForms, setApiSettingsForms] = useState<Record<string, { email: string; apiDailyLimit: string; apiMonthlyLimit: string; apiWebhookUrl: string; apiRateLimitPerMin: string }>>({});

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

  const generateApiKeyMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/users/${id}/api-key/generate`).then((r) => r.json()),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setGeneratedKey({ userId: id, key: data.apiKey });
    },
  });

  const revokeApiKeyMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/users/${id}/api-key/revoke`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  const updateApiSettingsMutation = useMutation({
    mutationFn: ({ id, settings }: { id: string; settings: Record<string, string> }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/api-settings`, settings).then((r) => r.json()),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setApiSettingsOpenId(null);
    },
  });

  const { toast } = useToast();
  const [balanceForms, setBalanceForms] = useState<Record<string, string>>({});
  const [adminApiLogsOpenId, setAdminApiLogsOpenId] = useState<string | null>(null);

  const adjustBalanceMutation = useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/balance`, { delta }).then((r) => r.json()),
    onSuccess: (data, { id, delta }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setBalanceForms((prev) => ({ ...prev, [id]: "" }));
      toast({ title: "Balance updated", description: `New balance: $${(data.balance ?? 0).toFixed(2)}` });
    },
    onError: () => toast({ title: "Error", description: "Failed to update balance", variant: "destructive" }),
  });

  const { data: adminApiLogs, isLoading: adminApiLogsLoading } = useQuery<{ logs: any[]; stats: any }>({
    queryKey: ["/api/admin/users", adminApiLogsOpenId, "api-logs"],
    queryFn: () => fetch(`/api/admin/users/${adminApiLogsOpenId}/api-logs`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!adminApiLogsOpenId,
  });

  const { data: featureStats = [] } = useQuery<FeatureStat[]>({
    queryKey: ["/api/admin/stats/features"],
    queryFn: () => fetch("/api/admin/stats/features", { credentials: "include" }).then((r) => r.json()),
    enabled: !!user?.isAdmin,
    refetchInterval: 30000,
  });

  const flagMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiRequest("PATCH", `/api/admin/users/${id}/flag`, { reason }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  const unflagMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/admin/users/${id}/unflag`, {}).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }),
  });

  if (isLoading || !user?.isAdmin) return null;

  const toggleSelectUser = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkSetPlan = async (plan: "free" | "pro") => {
    setBulkActionPending(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          apiRequest("PATCH", `/api/admin/users/${id}/plan`, { plan, expiresAt: null })
        )
      );
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setSelectedIds(new Set());
    } finally {
      setBulkActionPending(false);
    }
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} users? This cannot be undone.`)) return;
    setBulkActionPending(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id => apiRequest("DELETE", `/api/admin/users/${id}`)));
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setSelectedIds(new Set());
    } finally {
      setBulkActionPending(false);
    }
  };

  const totalUsers = users.length;
  const adminCount = users.filter((u) => u.isAdmin).length;
  const proCount = users.filter((u) => u.plan === "pro" && !isExpired(u.planExpiresAt)).length;
  const freeCount = totalUsers - proCount;

  const filteredUsers = users
    .filter(u => u.username.toLowerCase().includes(userSearch.toLowerCase()))
    .sort((a, b) => {
      if (userSort === "name") return a.username.localeCompare(b.username);
      if (userSort === "plan") {
        const pa = a.plan === "pro" && !isExpired(a.planExpiresAt) ? 1 : 0;
        const pb = b.plan === "pro" && !isExpired(b.planExpiresAt) ? 1 : 0;
        return pb - pa;
      }
      if (userSort === "tokens") {
        const ta = tokenStats?.byUser.find(x => x.userId === a.id);
        const tb = tokenStats?.byUser.find(x => x.userId === b.id);
        const tokA = ta ? ta.inputTokens + ta.outputTokens : 0;
        const tokB = tb ? tb.inputTokens + tb.outputTokens : 0;
        return tokB - tokA;
      }
      return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    });

  const selectableUsers = filteredUsers.filter(u => u.id !== user.id);

  const toggleSelectAll = () => {
    if (selectedIds.size === selectableUsers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableUsers.map(u => u.id)));
    }
  };

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
          <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-semibold text-foreground flex-shrink-0">All Users</h2>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="relative flex-1 max-w-sm">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by username..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  data-testid="input-user-search"
                  className="w-full pl-9 pr-4 py-1.5 rounded-lg border border-border bg-muted/20 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <select
                value={userSort}
                onChange={(e) => setUserSort(e.target.value as typeof userSort)}
                data-testid="select-user-sort"
                className="px-3 py-1.5 rounded-lg border border-border bg-muted/20 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer flex-shrink-0"
              >
                <option value="joined">Sort: Newest</option>
                <option value="name">Sort: Name</option>
                <option value="plan">Sort: Plan</option>
                <option value="tokens">Sort: Most tokens</option>
              </select>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors select-none">
                <input
                  type="checkbox"
                  data-testid="checkbox-select-all-users"
                  checked={selectableUsers.length > 0 && selectedIds.size === selectableUsers.length}
                  onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 rounded cursor-pointer accent-primary"
                />
                All
              </label>
              <span className="text-xs text-muted-foreground">{filteredUsers.length} users</span>
            </div>
          </div>

          {/* Bulk action toolbar */}
          {selectedIds.size > 0 && (
            <div className="px-6 py-3 border-b border-border/60 bg-primary/5 flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold text-primary flex-shrink-0">
                {selectedIds.size} selected
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => bulkSetPlan("pro")}
                  disabled={bulkActionPending}
                  data-testid="button-bulk-upgrade-pro"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 border border-amber-500/30 transition-all disabled:opacity-50"
                >
                  {bulkActionPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crown className="w-3 h-3" />}
                  Upgrade to Pro
                </button>
                <button
                  onClick={() => bulkSetPlan("free")}
                  disabled={bulkActionPending}
                  data-testid="button-bulk-downgrade-free"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-border transition-all disabled:opacity-50"
                >
                  <UserCircle className="w-3 h-3" />
                  Downgrade to Free
                </button>
                <button
                  onClick={bulkDelete}
                  disabled={bulkActionPending}
                  data-testid="button-bulk-delete"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/30 transition-all disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete selected
                </button>
              </div>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-clear-selection"
              >
                Clear
              </button>
            </div>
          )}

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
                  <div key={u.id} data-testid={`row-user-${u.id}`} className={cn("px-6 py-4 transition-colors", selectedIds.has(u.id) && "bg-primary/3")}>
                    <div className="flex items-center gap-4">
                      {/* Checkbox (not for self) */}
                      {u.id !== user.id && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(u.id)}
                          onChange={() => toggleSelectUser(u.id)}
                          data-testid={`checkbox-user-${u.id}`}
                          className="w-3.5 h-3.5 rounded cursor-pointer accent-primary flex-shrink-0"
                        />
                      )}
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
        {/* API Keys Section */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border/60 flex items-center gap-3">
            <Key className="w-4 h-4 text-emerald-500" />
            <h2 className="font-semibold text-foreground">API Access</h2>
            <span className="text-xs text-muted-foreground ml-auto">Grant users an API key to call the AI externally</span>
          </div>

          <div className="divide-y divide-border/50">
            {users.map((u) => {
              const isGenerated = generatedKey?.userId === u.id;
              const settingsOpen = apiSettingsOpenId === u.id;
              const settingsForm = apiSettingsForms[u.id] ?? {
                email: u.email ?? "",
                apiDailyLimit: u.apiDailyLimit != null ? String(u.apiDailyLimit) : "",
                apiMonthlyLimit: u.apiMonthlyLimit != null ? String(u.apiMonthlyLimit) : "",
                apiWebhookUrl: u.apiWebhookUrl ?? "",
                apiRateLimitPerMin: u.apiRateLimitPerMin != null ? String(u.apiRateLimitPerMin) : "",
              };
              const setForm = (field: string, value: string) =>
                setApiSettingsForms((prev) => ({ ...prev, [u.id]: { ...settingsForm, [field]: value } }));
              return (
                <div key={u.id} data-testid={`row-api-user-${u.id}`} className="px-6 py-4">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
                      u.isAdmin
                        ? "bg-violet-500/15 text-violet-500"
                        : u.apiEnabled
                          ? "bg-emerald-500/15 text-emerald-500"
                          : "bg-muted text-muted-foreground"
                    )}>
                      {u.username[0].toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-foreground truncate">{u.username}</span>
                        {u.apiEnabled ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/20">
                            <Key className="w-2.5 h-2.5" /> API Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                            No Access
                          </span>
                        )}
                        {u.apiDailyLimit && <span className="text-[10px] text-muted-foreground">{u.apiDailyLimit}/day</span>}
                        {u.apiMonthlyLimit && <span className="text-[10px] text-muted-foreground">{u.apiMonthlyLimit}/mo</span>}
                        {u.apiEnabled && (
                          <span className={cn(
                            "text-[10px] font-mono font-semibold",
                            (u.apiBalance ?? 0) < 5 ? "text-red-500" : (u.apiBalance ?? 0) < 10 ? "text-amber-500" : "text-emerald-500"
                          )} data-testid={`text-balance-${u.id}`}>
                            ${(u.apiBalance ?? 0).toFixed(2)}
                          </span>
                        )}
                      </div>
                      {isGenerated && (
                        <div className="mt-2 flex items-center gap-2">
                          <code className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg truncate max-w-xs">
                            {generatedKey.key}
                          </code>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(generatedKey.key);
                              setCopiedKeyId(u.id);
                              setTimeout(() => setCopiedKeyId(null), 2000);
                            }}
                            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                            data-testid={`button-copy-generated-key-${u.id}`}
                            title="Copy API key"
                          >
                            {copiedKeyId === u.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => setGeneratedKey(null)}
                            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[10px] text-amber-500">Save this key — it won't be shown again</span>
                        </div>
                      )}
                    </div>

                    {u.id !== user.id && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => setApiSettingsOpenId(settingsOpen ? null : u.id)}
                          data-testid={`button-api-settings-${u.id}`}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all",
                            settingsOpen ? "border-blue-500/30 text-blue-500 bg-blue-500/10" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                          )}
                          title="API Settings"
                        >
                          <Settings2 className="w-3.5 h-3.5" />
                          Settings
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Generate${u.apiEnabled ? "/regenerate" : ""} API key for "${u.username}"?`)) {
                              generateApiKeyMutation.mutate(u.id);
                            }
                          }}
                          disabled={generateApiKeyMutation.isPending}
                          data-testid={`button-generate-key-${u.id}`}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 transition-all"
                        >
                          <Key className="w-3.5 h-3.5" />
                          {u.apiEnabled ? "Regenerate" : "Generate Key"}
                        </button>
                        {u.apiEnabled && (
                          <button
                            onClick={() => {
                              if (confirm(`Revoke API access for "${u.username}"?`)) {
                                revokeApiKeyMutation.mutate(u.id);
                                if (generatedKey?.userId === u.id) setGeneratedKey(null);
                              }
                            }}
                            disabled={revokeApiKeyMutation.isPending}
                            data-testid={`button-revoke-key-${u.id}`}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-destructive/30 text-destructive hover:bg-destructive/10 transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                            Revoke
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Settings Panel */}
                  {settingsOpen && (
                    <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">API Settings for {u.username}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Notification Email</label>
                          <input
                            type="email"
                            value={settingsForm.email}
                            onChange={(e) => setForm("email", e.target.value)}
                            placeholder="user@example.com"
                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                            data-testid={`input-api-email-${u.id}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Rate Limit (req/min)</label>
                          <input
                            type="number"
                            min="1"
                            value={settingsForm.apiRateLimitPerMin}
                            onChange={(e) => setForm("apiRateLimitPerMin", e.target.value)}
                            placeholder="e.g. 10 (blank = unlimited)"
                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                            data-testid={`input-rate-limit-${u.id}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Daily Call Limit</label>
                          <input
                            type="number"
                            min="1"
                            value={settingsForm.apiDailyLimit}
                            onChange={(e) => setForm("apiDailyLimit", e.target.value)}
                            placeholder="e.g. 100 (blank = unlimited)"
                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                            data-testid={`input-daily-limit-${u.id}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Monthly Call Limit</label>
                          <input
                            type="number"
                            min="1"
                            value={settingsForm.apiMonthlyLimit}
                            onChange={(e) => setForm("apiMonthlyLimit", e.target.value)}
                            placeholder="e.g. 1000 (blank = unlimited)"
                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                            data-testid={`input-monthly-limit-${u.id}`}
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-xs text-muted-foreground">Webhook URL (receives event notifications)</label>
                          <input
                            type="url"
                            value={settingsForm.apiWebhookUrl}
                            onChange={(e) => setForm("apiWebhookUrl", e.target.value)}
                            placeholder="https://your-server.com/webhook"
                            className="w-full px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                            data-testid={`input-webhook-url-${u.id}`}
                          />
                        </div>
                      </div>
                      {/* Balance management */}
                      <div className="pt-2 border-t border-border/40 space-y-2">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Balance Management</span>
                          <span className={cn("text-xs font-mono font-bold ml-auto", (u.apiBalance ?? 0) < 5 ? "text-red-500" : (u.apiBalance ?? 0) < 10 ? "text-amber-500" : "text-emerald-500")}>
                            ${(u.apiBalance ?? 0).toFixed(2)} current
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={balanceForms[u.id] ?? ""}
                            onChange={(e) => setBalanceForms((prev) => ({ ...prev, [u.id]: e.target.value }))}
                            placeholder="e.g. +10.00 or -5.00"
                            className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-muted/30 text-xs text-foreground font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
                            data-testid={`input-balance-${u.id}`}
                          />
                          <button
                            onClick={() => {
                              const delta = parseFloat(balanceForms[u.id] ?? "");
                              if (isNaN(delta)) return;
                              adjustBalanceMutation.mutate({ id: u.id, delta });
                            }}
                            disabled={adjustBalanceMutation.isPending}
                            data-testid={`button-adjust-balance-${u.id}`}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-primary/30 text-primary hover:bg-primary/10 transition-all whitespace-nowrap disabled:opacity-50"
                          >
                            {adjustBalanceMutation.isPending ? "..." : "Apply"}
                          </button>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          {[5, 10, 25, 30, 50].map((amt) => (
                            <button
                              key={amt}
                              onClick={() => adjustBalanceMutation.mutate({ id: u.id, delta: amt })}
                              disabled={adjustBalanceMutation.isPending}
                              data-testid={`button-add-${amt}-${u.id}`}
                              className="px-2 py-1 rounded text-[10px] font-medium border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 transition-all"
                            >
                              +${amt}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setAdminApiLogsOpenId(adminApiLogsOpenId === u.id ? null : u.id)}
                          data-testid={`button-view-api-logs-${u.id}`}
                          className="text-[11px] text-primary hover:underline flex items-center gap-1"
                        >
                          <Activity className="w-3 h-3" />
                          {adminApiLogsOpenId === u.id ? "Hide API logs" : "View API logs"}
                        </button>
                        {adminApiLogsOpenId === u.id && (
                          <div className="rounded-xl border border-border bg-muted/20 overflow-hidden max-h-64 overflow-y-auto">
                            {adminApiLogsLoading ? (
                              <div className="p-4 text-xs text-muted-foreground text-center">Loading...</div>
                            ) : !adminApiLogs?.logs?.length ? (
                              <div className="p-4 text-xs text-muted-foreground text-center">No API calls yet.</div>
                            ) : (
                              <>
                                {adminApiLogs.stats && (
                                  <div className="px-4 py-2 border-b border-border/50 grid grid-cols-3 gap-2 text-[10px]">
                                    <span className="text-muted-foreground">Today: <strong className="text-foreground">${(adminApiLogs.stats.todaySpent ?? 0).toFixed(4)}</strong></span>
                                    <span className="text-muted-foreground">Month: <strong className="text-foreground">${(adminApiLogs.stats.monthSpent ?? 0).toFixed(4)}</strong></span>
                                    <span className="text-muted-foreground">Total: <strong className="text-foreground">${(adminApiLogs.stats.totalSpent ?? 0).toFixed(4)}</strong></span>
                                  </div>
                                )}
                                {adminApiLogs.logs.slice(0, 20).map((log: any) => (
                                  <div key={log.id} className="px-4 py-2 border-b border-border/30 text-[10px]" data-testid={`row-admin-api-log-${log.id}`}>
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-1.5">
                                        <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", log.success !== false ? "bg-emerald-500" : "bg-red-500")} title={log.success !== false ? "Success" : "Failed"} />
                                        {log.modelUsed && <span className="text-primary font-semibold">{log.modelUsed}</span>}
                                        {log.endpoint && <span className="font-mono text-muted-foreground">{log.endpoint}</span>}
                                      </div>
                                      <div className="text-right space-y-0.5">
                                        <p className="text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</p>
                                        {log.costDeducted != null && (
                                          <p className="font-mono font-bold text-foreground">${log.costDeducted.toFixed(6)}</p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex gap-3 mt-0.5 text-muted-foreground font-mono">
                                      <span>In: {log.inputTokens} tok {log.inputCost != null && <span className="text-foreground/70">(${log.inputCost.toFixed(6)})</span>}</span>
                                      <span>Out: {log.outputTokens} tok {log.outputCost != null && <span className="text-foreground/70">(${log.outputCost.toFixed(6)})</span>}</span>
                                    </div>
                                  </div>
                                ))}
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={() => setApiSettingsOpenId(null)}
                          className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-muted/50 transition-all"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => updateApiSettingsMutation.mutate({ id: u.id, settings: settingsForm })}
                          disabled={updateApiSettingsMutation.isPending}
                          data-testid={`button-save-api-settings-${u.id}`}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
                        >
                          {updateApiSettingsMutation.isPending ? "Saving..." : "Save Settings"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Feature Activity ── */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden" data-testid="section-feature-activity">
          <div className="px-6 py-4 border-b border-border/60 flex items-center gap-3">
            <Activity className="w-4 h-4 text-sky-500" />
            <h2 className="font-semibold text-foreground">Feature Activity</h2>
            <span className="ml-auto text-xs text-muted-foreground">{featureStats.length} features tracked</span>
          </div>
          {featureStats.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              No activity yet — events are recorded as users interact with the platform.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {featureStats.map((stat) => {
                const totalEvents = featureStats.reduce((s, f) => s + f.count, 0);
                const pct = totalEvents > 0 ? Math.round((stat.count / totalEvents) * 100) : 0;
                const label = stat.feature.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                return (
                  <div key={stat.feature} className="flex items-center gap-4 px-6 py-3" data-testid={`row-feature-${stat.feature}`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-sky-500/70 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
                      <span className="tabular-nums"><strong className="text-foreground">{stat.count.toLocaleString()}</strong> events</span>
                      <span className="tabular-nums"><strong className="text-foreground">{stat.uniqueUsers}</strong> users</span>
                      <span className="tabular-nums w-10 text-right text-muted-foreground/60">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Abuse / Flagged Users ── */}
        {(() => {
          const flaggedUsers = users.filter(u => u.isFlagged);
          return (
            <div className="rounded-2xl border border-destructive/30 bg-card overflow-hidden" data-testid="section-flagged-users">
              <div className="px-6 py-4 border-b border-destructive/20 flex items-center gap-3">
                <Flag className="w-4 h-4 text-destructive" />
                <h2 className="font-semibold text-foreground">Flagged Users</h2>
                {flaggedUsers.length > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-destructive/15 text-destructive text-[11px] font-bold">
                    {flaggedUsers.length}
                  </span>
                )}
              </div>
              {flaggedUsers.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                  No flagged users — the system automatically flags accounts that exhaust their free daily limit in under 30 minutes.
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {flaggedUsers.map((u) => (
                    <div key={u.id} className="flex items-center gap-4 px-6 py-3.5" data-testid={`row-flagged-${u.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{u.username}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{u.flagReason || "Flagged"}</p>
                      </div>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                        {u.plan}
                      </span>
                      <button
                        onClick={() => unflagMutation.mutate(u.id)}
                        disabled={unflagMutation.isPending}
                        data-testid={`button-unflag-${u.id}`}
                        title="Clear flag"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-muted/50 transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        <FlagOff className="w-3 h-3" />
                        Unflag
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

      </main>
    </div>
  );
}
