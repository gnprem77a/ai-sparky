import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import {
  Key, Copy, RefreshCw, Eye, EyeOff, CheckCircle2, ArrowLeft,
  Terminal, Globe, BarChart2, Clock, ChevronRight, Webhook, Save,
  Zap, AlertCircle, CheckCheck, DollarSign, TrendingDown, Lock, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ApiKeyData {
  apiKey: string;
  apiEnabled: boolean;
  dailyUsed: number;
  dailyLimit: number | null;
  monthlyUsed: number;
  monthlyLimit: number | null;
  rateLimitPerMin: number | null;
  webhookUrl: string | null;
  balance: number;
  totalSpent: number;
  todaySpent: number;
  monthSpent: number;
  byModel: Record<string, { calls: number; spent: number }>;
}

interface ApiLog {
  id: string;
  userId: string;
  messages: string;
  response: string | null;
  inputTokens: number;
  outputTokens: number;
  modelUsed: string | null;
  endpoint: string | null;
  costDeducted: number | null;
  createdAt: string;
}

const MODEL_LABELS: Record<string, string> = {
  powerful: "Claude Opus 4.6",
  fast: "Claude Haiku",
  creative: "GPT-5.3",
  balanced: "Mistral Large 3",
};

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  powerful: { input: 5.00, output: 25.00 },
  fast: { input: 0.80, output: 4.00 },
  creative: { input: 2.00, output: 8.00 },
  balanced: { input: 1.00, output: 3.00 },
};

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/40">
        <span className="text-xs font-mono text-muted-foreground">{language}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid={`button-copy-code-${language}`}
        >
          {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-4 text-xs font-mono text-foreground overflow-x-auto whitespace-pre leading-relaxed">{code}</pre>
    </div>
  );
}

function BalanceBar({ balance, low = false }: { balance: number; low?: boolean }) {
  return (
    <div className={cn(
      "rounded-2xl border p-5 flex items-center gap-4",
      balance <= 0 ? "border-red-500/30 bg-red-500/5" :
      low ? "border-amber-500/30 bg-amber-500/5" :
      "border-emerald-500/30 bg-emerald-500/5"
    )} data-testid="card-balance">
      <div className={cn(
        "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
        balance <= 0 ? "bg-red-500/15" : low ? "bg-amber-500/15" : "bg-emerald-500/15"
      )}>
        <DollarSign className={cn("w-6 h-6", balance <= 0 ? "text-red-500" : low ? "text-amber-500" : "text-emerald-500")} />
      </div>
      <div className="flex-1">
        <p className="text-xs text-muted-foreground font-medium mb-0.5">Available Balance</p>
        <p className={cn("text-2xl font-bold tabular-nums", balance <= 0 ? "text-red-500" : low ? "text-amber-500" : "text-emerald-500")} data-testid="text-balance">
          ${balance.toFixed(2)}
        </p>
        {balance <= 0 && <p className="text-xs text-red-400 mt-0.5">API calls are blocked. Contact admin to add balance.</p>}
        {balance > 0 && low && <p className="text-xs text-amber-400 mt-0.5">Low balance warning — consider contacting admin to top up.</p>}
      </div>
    </div>
  );
}

export default function ApiAccessPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [revealed, setRevealed] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "pricing" | "webhooks" | "docs">("overview");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSaved, setWebhookSaved] = useState(false);

  const isPro = user?.plan === "pro";

  const { data, isLoading } = useQuery<ApiKeyData>({
    queryKey: ["/api/me/api-key"],
    enabled: !!user && !!user.apiEnabled,
    retry: false,
  });

  const { data: history, isLoading: historyLoading } = useQuery<ApiLog[]>({
    queryKey: ["/api/me/api-history"],
    enabled: !!user && !!user.apiEnabled && activeTab === "history",
    retry: false,
  });

  useEffect(() => {
    if (data?.webhookUrl) setWebhookUrl(data.webhookUrl);
  }, [data?.webhookUrl]);

  const regenerateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/me/api-key/regenerate").then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/api-key"] });
      setRevealed(true);
    },
  });

  const webhookMutation = useMutation({
    mutationFn: (url: string) => apiRequest("PATCH", "/api/me/webhook", { webhookUrl: url }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/api-key"] });
      setWebhookSaved(true);
      setTimeout(() => setWebhookSaved(false), 2500);
    },
  });

  const requestAccessMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/me/api-access/request").then((r) => r.json()),
    onSuccess: (data) => {
      if (data.already) {
        toast({ title: "Already requested", description: "Your request is already being reviewed." });
      } else {
        toast({ title: "Request sent!", description: "Admin has been notified. You'll get access once they approve." });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Could not send request. Try again.", variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex gap-1">
          {[0, 150, 300].map((d) => (
            <span key={d} className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${d}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!user) { navigate("/auth"); return null; }

  /* ── Free user: locked view ── */
  if (!isPro) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">API Access</h1>
            <p className="text-muted-foreground text-sm leading-relaxed mt-2">
              API access is a Pro feature. Upgrade to Pro to request access and start building with AI Sparky.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-left space-y-2.5 text-sm">
            {[
              "Chat completions with all models",
              "Web search & file/vision input",
              "Knowledge base access",
              "Streaming (SSE) support",
              "Webhook notifications",
              "Dollar balance — pay only for what you use",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2.5 text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>{f}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all"
              data-testid="button-upgrade-pro"
            >
              Upgrade to Pro
            </button>
            <button onClick={() => navigate("/")} className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="button-go-home">
              Back to Chat
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Pro user, API not yet enabled ── */
  if (!user.apiEnabled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto">
            <Key className="w-8 h-8 text-violet-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Request API Access</h1>
            <p className="text-muted-foreground text-sm leading-relaxed mt-2">
              You're on Pro! API access is manually enabled by the admin. Request it below and you'll be notified once approved.
            </p>
          </div>
          <button
            onClick={() => requestAccessMutation.mutate()}
            disabled={requestAccessMutation.isPending || requestAccessMutation.isSuccess}
            className={cn(
              "inline-flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-sm font-semibold transition-all",
              requestAccessMutation.isSuccess
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                : "bg-primary text-primary-foreground hover:opacity-90"
            )}
            data-testid="button-request-access"
          >
            {requestAccessMutation.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : requestAccessMutation.isSuccess ? (
              <><CheckCircle2 className="w-4 h-4" /> Request Sent!</>
            ) : (
              <><Send className="w-4 h-4" /> Request API Access</>
            )}
          </button>
          <button onClick={() => navigate("/")} className="text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="button-go-home">
            Back to Chat
          </button>
        </div>
      </div>
    );
  }

  /* ── Pro user with API access ── */
  const baseUrl = window.location.origin;
  const apiKey = data?.apiKey ?? "";
  const maskedKey = apiKey ? apiKey.slice(0, 12) + "•".repeat(Math.max(0, apiKey.length - 16)) + apiKey.slice(-4) : "Loading...";
  const balance = data?.balance ?? 0;
  const balanceLow = balance > 0 && balance < 5;

  const curlExample = `curl -X POST ${baseUrl}/api/v1/chat \\
  -H "Authorization: Bearer ${apiKey || "<your-api-key>"}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hello!", "model": "balanced"}'`;

  const curlStreamExample = `curl -X POST ${baseUrl}/api/v1/chat \\
  -H "Authorization: Bearer ${apiKey || "<your-api-key>"}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Write a short story", "model": "powerful", "stream": true}'`;

  const pythonExample = `import requests

API_KEY = "${apiKey || "<your-api-key>"}"
BASE_URL = "${baseUrl}/api/v1/chat"

response = requests.post(
    BASE_URL,
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "message": "Hello!",
        "model": "balanced",        # powerful | fast | creative | balanced
        "systemPrompt": "You are a helpful assistant."
    }
)
data = response.json()
print(data["content"])
print("Balance remaining:", response.headers["X-Balance-Remaining"])`;

  const jsExample = `const response = await fetch("${baseUrl}/api/v1/chat", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${apiKey || "<your-api-key>"}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    message: "Hello!",
    model: "balanced",   // powerful | fast | creative | balanced
    systemPrompt: "You are a helpful assistant."
  })
});
const data = await response.json();
console.log(data.content);
console.log("Balance:", response.headers.get("X-Balance-Remaining"));`;

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: BarChart2 },
    { id: "history" as const, label: "Call History", icon: Clock },
    { id: "pricing" as const, label: "Pricing", icon: DollarSign },
    { id: "webhooks" as const, label: "Webhooks", icon: Webhook },
    { id: "docs" as const, label: "Docs", icon: Terminal },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Key className="w-6 h-6 text-primary" /> API Access
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Build with AI Sparky from your own applications</p>
          </div>
        </div>

        {/* Balance card */}
        {isLoading ? (
          <div className="h-24 rounded-2xl bg-muted/40 animate-pulse" />
        ) : (
          <BalanceBar balance={balance} low={balanceLow} />
        )}

        {/* API Key Card */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" /> Your API Key
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-500 font-semibold ring-1 ring-green-500/20">Active</span>
          </div>

          {isLoading ? (
            <div className="h-12 rounded-lg bg-muted/40 animate-pulse" />
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/40 border border-border font-mono text-sm text-foreground overflow-hidden">
                <span className="flex-1 truncate" data-testid="text-api-key">{revealed ? apiKey : maskedKey}</span>
              </div>
              <button onClick={() => setRevealed(!revealed)} title={revealed ? "Hide" : "Reveal"} className="p-3 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex-shrink-0" data-testid="button-toggle-reveal">
                {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                onClick={() => { if (!apiKey) return; navigator.clipboard.writeText(apiKey); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 2000); }}
                className={cn("p-3 rounded-xl border transition-all flex-shrink-0", keyCopied ? "border-green-500/30 bg-green-500/10 text-green-500" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50")}
                data-testid="button-copy-key"
              >
                {keyCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/8 border border-amber-500/15 text-amber-600 dark:text-amber-400 text-xs">
            <span className="font-semibold flex-shrink-0">⚠</span>
            <span>Keep your API key secret. Never share it or commit it to source control.</span>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => { if (confirm("Regenerate your API key? The old key will stop working immediately.")) regenerateMutation.mutate(); }}
              disabled={regenerateMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
              data-testid="button-regenerate-key"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", regenerateMutation.isPending && "animate-spin")} />
              {regenerateMutation.isPending ? "Regenerating..." : "Regenerate Key"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-muted/50 border border-border overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`tab-${tab.id}`}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap min-w-fit",
                activeTab === tab.id ? "bg-background text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Spending summary */}
            {!isLoading && (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Today", value: data?.todaySpent ?? 0 },
                  { label: "This Month", value: data?.monthSpent ?? 0 },
                  { label: "All Time", value: data?.totalSpent ?? 0 },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl border border-border bg-card p-4 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1.5">{label}</p>
                    <p className="text-lg font-bold tabular-nums text-foreground" data-testid={`text-spent-${label.toLowerCase().replace(" ", "-")}`}>
                      ${value.toFixed(4)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Model usage breakdown */}
            {!isLoading && data?.byModel && Object.keys(data.byModel).length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-primary" /> Spending by Model
                </h2>
                <div className="space-y-3">
                  {Object.entries(data.byModel).map(([model, stats]) => (
                    <div key={model} className="flex items-center justify-between text-sm" data-testid={`row-model-${model}`}>
                      <div>
                        <span className="font-medium text-foreground">{MODEL_LABELS[model] ?? model}</span>
                        <span className="text-xs text-muted-foreground ml-2">({stats.calls} calls)</span>
                      </div>
                      <span className="font-mono text-foreground tabular-nums">${stats.spent.toFixed(6)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Limits & Endpoint */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" /> Limits & Endpoint
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-muted/30 border border-border">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Rate Limit</p>
                  <p className="text-sm font-bold text-foreground">30 / min</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Daily Calls</p>
                  <p className="text-sm font-bold text-foreground" data-testid="text-daily-limit">
                    {data?.dailyLimit != null ? `${data.dailyUsed} / ${data.dailyLimit.toLocaleString()}` : `${data?.dailyUsed ?? 0} used`}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Monthly Calls</p>
                  <p className="text-sm font-bold text-foreground" data-testid="text-monthly-limit">
                    {data?.monthlyLimit != null ? `${data.monthlyUsed} / ${data.monthlyLimit.toLocaleString()}` : `${data?.monthlyUsed ?? 0} used`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/40 border border-border font-mono text-sm">
                <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-500/15 text-blue-500">POST</span>
                <span className="text-foreground truncate" data-testid="text-endpoint">{baseUrl}/api/v1/chat</span>
                <button onClick={() => navigator.clipboard.writeText(`${baseUrl}/api/v1/chat`)} className="ml-auto text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" data-testid="button-copy-endpoint">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <button onClick={() => setActiveTab("docs")} className="flex items-center gap-1 text-xs text-primary hover:underline" data-testid="button-view-docs">
                View code examples <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="space-y-4">
            {/* Summary */}
            {!historyLoading && history && history.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Today Spent</p>
                  <p className="text-base font-bold tabular-nums text-foreground">${(data?.todaySpent ?? 0).toFixed(4)}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Month Spent</p>
                  <p className="text-base font-bold tabular-nums text-foreground">${(data?.monthSpent ?? 0).toFixed(4)}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Remaining</p>
                  <p className="text-base font-bold tabular-nums text-emerald-500">${(data?.balance ?? 0).toFixed(2)}</p>
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-6 py-4 border-b border-border/60 flex items-center gap-3">
                <Clock className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-foreground">Balance History</h2>
                <span className="text-xs text-muted-foreground ml-auto">Last 50 calls</span>
              </div>

              {historyLoading ? (
                <div className="p-6 space-y-3">
                  {[...Array(5)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />)}
                </div>
              ) : !history || history.length === 0 ? (
                <div className="p-12 text-center">
                  <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No API calls yet. Make your first request to see history here.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {history.map((log) => {
                    let preview = "";
                    try {
                      const msgs = JSON.parse(log.messages);
                      const last = msgs[msgs.length - 1];
                      preview = last?.content?.slice(0, 80) ?? "";
                    } catch {
                      preview = log.messages.slice(0, 80);
                    }
                    return (
                      <div key={log.id} data-testid={`row-api-log-${log.id}`} className="px-6 py-4 hover:bg-muted/20 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {log.modelUsed && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                                  {MODEL_LABELS[log.modelUsed] ?? log.modelUsed}
                                </span>
                              )}
                              {log.endpoint && (
                                <span className="text-[10px] font-mono text-muted-foreground">{log.endpoint}</span>
                              )}
                            </div>
                            <p className="text-xs text-foreground truncate font-mono">{preview || "(no content)"}</p>
                          </div>
                          <div className="flex-shrink-0 text-right space-y-1">
                            <p className="text-[10px] text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</p>
                            <p className="text-[10px] font-mono text-muted-foreground">
                              ↑{log.inputTokens} ↓{log.outputTokens} tok
                            </p>
                            {log.costDeducted != null && (
                              <p className="text-[11px] font-bold font-mono text-foreground" data-testid={`text-cost-${log.id}`}>
                                -${log.costDeducted.toFixed(6)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pricing Tab */}
        {activeTab === "pricing" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-primary" /> Model Pricing
              </h2>
              <p className="text-xs text-muted-foreground">Balance is deducted per request based on actual token usage. Embed and Rerank are free.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 text-xs font-semibold text-muted-foreground">Model</th>
                      <th className="text-left py-2 text-xs font-semibold text-muted-foreground">Slug</th>
                      <th className="text-right py-2 text-xs font-semibold text-muted-foreground">Input / 1M tok</th>
                      <th className="text-right py-2 text-xs font-semibold text-muted-foreground">Output / 1M tok</th>
                      <th className="text-right py-2 text-xs font-semibold text-muted-foreground">Max Output</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {[
                      { slug: "powerful", label: "Claude Opus 4.6", maxTok: "32,000" },
                      { slug: "fast", label: "Claude Haiku", maxTok: "4,096" },
                      { slug: "creative", label: "GPT-5.3", maxTok: "8,192" },
                      { slug: "balanced", label: "Mistral Large 3", maxTok: "8,192" },
                    ].map(({ slug, label, maxTok }) => {
                      const p = MODEL_PRICING[slug];
                      return (
                        <tr key={slug} className="hover:bg-muted/20 transition-colors" data-testid={`row-pricing-${slug}`}>
                          <td className="py-3 font-medium text-foreground">{label}</td>
                          <td className="py-3 font-mono text-xs text-primary">{slug}</td>
                          <td className="py-3 text-right tabular-nums text-foreground">${p.input.toFixed(2)}</td>
                          <td className="py-3 text-right tabular-nums text-foreground">${p.output.toFixed(2)}</td>
                          <td className="py-3 text-right tabular-nums text-muted-foreground">{maxTok}</td>
                        </tr>
                      );
                    })}
                    {[
                      { label: "Embed v4.0", slug: "embed" },
                      { label: "Cohere Rerank", slug: "rerank" },
                    ].map(({ label, slug }) => (
                      <tr key={slug} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 font-medium text-foreground">{label}</td>
                        <td className="py-3 font-mono text-xs text-muted-foreground">{slug}</td>
                        <td className="py-3 text-right text-emerald-500 font-semibold text-xs" colSpan={3}>FREE</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/8 border border-blue-500/15 text-blue-400 text-xs">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>Balance never expires. API calls are blocked when balance reaches $0.00. Contact admin to add funds.</span>
              </div>
            </div>
          </div>
        )}

        {/* Webhooks Tab */}
        {activeTab === "webhooks" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Webhook className="w-4 h-4 text-primary" /> Webhook Endpoint
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Set a URL on your server. AI Sparky will POST to it after each API event.
              </p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://your-server.com/webhook"
                  data-testid="input-webhook-url"
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-border/60 bg-muted/30 text-sm text-foreground font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                />
                <button
                  onClick={() => webhookMutation.mutate(webhookUrl)}
                  disabled={webhookMutation.isPending}
                  data-testid="button-save-webhook"
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex-shrink-0",
                    webhookSaved ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" : "bg-primary text-primary-foreground hover:opacity-90"
                  )}
                >
                  {webhookSaved ? <><CheckCheck className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save</>}
                </button>
              </div>
              {webhookUrl && (
                <button onClick={() => { setWebhookUrl(""); webhookMutation.mutate(""); }} className="text-xs text-destructive/70 hover:text-destructive transition-colors" data-testid="button-clear-webhook">
                  Remove webhook
                </button>
              )}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/8 border border-blue-500/15 text-blue-400 text-xs">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>Your server must respond with 2xx within 5 seconds. Webhooks fire asynchronously.</span>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Events
              </h2>
              <div className="space-y-2">
                {[
                  { event: "api.message.sent", desc: "After every successful API call. Includes tokens, model, and cost.", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
                  { event: "api.rate_limited", desc: "When a request is rejected for exceeding 30 req/min.", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
                  { event: "api.limit.daily", desc: "When the daily call limit is reached.", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
                  { event: "api.limit.monthly", desc: "When the monthly call limit is reached.", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
                  { event: "api.access.granted", desc: "When admin enables API access.", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
                ].map(({ event, desc, color }) => (
                  <div key={event} className={cn("p-3 rounded-lg border text-xs space-y-0.5", color)}>
                    <code className="font-mono font-semibold">{event}</code>
                    <p className="opacity-80">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Docs Tab */}
        {activeTab === "docs" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" /> Request Body
              </h2>
              <div className="space-y-2 text-xs">
                {[
                  { field: "message", type: "string", desc: "Single user message (alternative to messages array)" },
                  { field: "messages", type: "array", desc: "Array of {role, content} objects for multi-turn" },
                  { field: "model", type: "string", desc: "Model slug: powerful | fast | creative | balanced" },
                  { field: "systemPrompt", type: "string?", desc: "Optional system instruction" },
                  { field: "stream", type: "boolean?", desc: "Enable SSE streaming (default: false)" },
                  { field: "maxTokens", type: "number?", desc: "Override max output tokens (capped per model)" },
                ].map(({ field, type, desc }) => (
                  <div key={field} className="flex gap-3 py-1.5 border-b border-border/40 last:border-0">
                    <code className="font-mono text-primary w-28 flex-shrink-0">{field}</code>
                    <code className="text-muted-foreground w-16 flex-shrink-0">{type}</code>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" /> Response Headers
              </h2>
              <div className="space-y-2 text-xs">
                {[
                  { header: "X-Balance-Remaining", desc: "Your remaining balance (e.g. $28.45)" },
                  { header: "X-Balance-Used", desc: "Cost of this request (e.g. $0.000125)" },
                  { header: "X-Tokens-Input", desc: "Input tokens consumed" },
                  { header: "X-Tokens-Output", desc: "Output tokens generated" },
                  { header: "X-Rate-Limit-Remaining", desc: "Requests left in current minute window" },
                  { header: "X-Rate-Limit-Reset", desc: "Unix timestamp when rate limit resets" },
                ].map(({ header, desc }) => (
                  <div key={header} className="flex gap-3 py-1.5 border-b border-border/40 last:border-0">
                    <code className="font-mono text-primary w-48 flex-shrink-0 text-[11px]">{header}</code>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2 px-1">
                <Terminal className="w-4 h-4 text-primary" /> Examples
              </h2>
              <CodeBlock code={curlExample} language="curl — basic" />
              <CodeBlock code={curlStreamExample} language="curl — streaming" />
              <CodeBlock code={pythonExample} language="python" />
              <CodeBlock code={jsExample} language="javascript" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
