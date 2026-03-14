import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import {
  Key, Copy, RefreshCw, Eye, EyeOff, CheckCircle2, ArrowLeft,
  Terminal, Globe, BarChart2, Clock, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiKeyData {
  apiKey: string;
  apiEnabled: boolean;
  dailyUsed: number;
  dailyLimit: number | null;
  monthlyUsed: number;
  monthlyLimit: number | null;
  rateLimitPerMin: number | null;
  webhookUrl: string | null;
}

interface ApiLog {
  id: string;
  userId: string;
  messages: string;
  response: string | null;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
}

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

function UsageBar({ used, limit, label, color }: { used: number; limit: number | null; label: string; color: string }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const near = pct >= 80;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium">{label}</span>
        <span className={cn("font-semibold tabular-nums", near ? "text-amber-500" : "text-foreground")}>
          {used.toLocaleString()}{limit ? ` / ${limit.toLocaleString()}` : " calls"}
        </span>
      </div>
      {limit ? (
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", near ? "bg-amber-500" : color)}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground">No limit set</div>
      )}
    </div>
  );
}

export default function ApiAccessPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [revealed, setRevealed] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "docs">("overview");

  const { data, isLoading } = useQuery<ApiKeyData>({
    queryKey: ["/api/me/api-key"],
    enabled: !!user && user.apiEnabled,
    retry: false,
  });

  const { data: history, isLoading: historyLoading } = useQuery<ApiLog[]>({
    queryKey: ["/api/me/api-history"],
    enabled: !!user && user.apiEnabled && activeTab === "history",
    retry: false,
  });

  const regenerateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/me/api-key/regenerate").then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/api-key"] });
      setRevealed(true);
    },
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    );
  }

  if (!user) { navigate("/auth"); return null; }

  if (!user.apiEnabled) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <Key className="w-8 h-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">API Access Not Enabled</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            API access is granted by your administrator. Contact your admin to request access.
          </p>
          <button onClick={() => navigate("/")} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors" data-testid="button-go-home">
            <ArrowLeft className="w-4 h-4" /> Back to Chat
          </button>
        </div>
      </div>
    );
  }

  const baseUrl = window.location.origin;
  const apiKey = data?.apiKey ?? "";
  const maskedKey = apiKey ? apiKey.slice(0, 8) + "•".repeat(Math.max(0, apiKey.length - 12)) + apiKey.slice(-4) : "Loading...";

  const curlExample = `curl -X POST ${baseUrl}/api/v1/chat \\
  -H "Authorization: Bearer ${apiKey || "<your-api-key>"}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hello! What is the capital of France?"}'`;

  const curlStreamExample = `curl -X POST ${baseUrl}/api/v1/chat \\
  -H "Authorization: Bearer ${apiKey || "<your-api-key>"}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Write a short story", "stream": true}'`;

  const pythonExample = `import requests

API_KEY = "${apiKey || "<your-api-key>"}"
BASE_URL = "${baseUrl}/api/v1/chat"

response = requests.post(
    BASE_URL,
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "message": "Hello!",
        "systemPrompt": "You are a helpful assistant."
    }
)
print(response.json()["content"])`;

  const jsExample = `const response = await fetch("${baseUrl}/api/v1/chat", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${apiKey || "<your-api-key>"}",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ message: "Hello!", systemPrompt: "You are a helpful assistant." })
});
const data = await response.json();
console.log(data.content);`;

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: BarChart2 },
    { id: "history" as const, label: "Call History", icon: Clock },
    { id: "docs" as const, label: "Docs & Examples", icon: Terminal },
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
            <p className="text-sm text-muted-foreground mt-0.5">Use your API key to access the AI from external apps</p>
          </div>
        </div>

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
              <button onClick={() => setRevealed(!revealed)} title={revealed ? "Hide key" : "Reveal key"} className="p-3 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex-shrink-0" data-testid="button-toggle-reveal">
                {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                onClick={() => { if (!apiKey) return; navigator.clipboard.writeText(apiKey); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 2000); }}
                title="Copy key"
                className={cn("p-3 rounded-xl border transition-all flex-shrink-0", keyCopied ? "border-green-500/30 bg-green-500/10 text-green-500" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50")}
                data-testid="button-copy-key"
              >
                {keyCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/8 border border-amber-500/15 text-amber-600 dark:text-amber-400 text-xs">
            <span className="font-semibold flex-shrink-0">⚠</span>
            <span>Keep your API key secret. Do not share it publicly or commit it to source control.</span>
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
        <div className="flex gap-1 p-1 rounded-xl bg-muted/50 border border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`tab-${tab.id}`}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all",
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
            {/* Usage Stats */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" /> Usage
              </h2>

              {isLoading ? (
                <div className="space-y-4">
                  <div className="h-8 rounded bg-muted/40 animate-pulse" />
                  <div className="h-8 rounded bg-muted/40 animate-pulse" />
                </div>
              ) : (
                <div className="space-y-5">
                  <UsageBar used={data?.dailyUsed ?? 0} limit={data?.dailyLimit ?? null} label="Today" color="bg-primary" />
                  <UsageBar used={data?.monthlyUsed ?? 0} limit={data?.monthlyLimit ?? null} label="This month" color="bg-violet-500" />
                </div>
              )}
            </div>

            {/* Limits & Settings Info */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" /> Your Limits
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-muted/30 border border-border">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Daily Limit</p>
                  <p className="text-sm font-bold text-foreground" data-testid="text-daily-limit">
                    {data?.dailyLimit != null ? data.dailyLimit.toLocaleString() : "Unlimited"}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Monthly Limit</p>
                  <p className="text-sm font-bold text-foreground" data-testid="text-monthly-limit">
                    {data?.monthlyLimit != null ? data.monthlyLimit.toLocaleString() : "Unlimited"}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Rate Limit</p>
                  <p className="text-sm font-bold text-foreground" data-testid="text-rate-limit">
                    {data?.rateLimitPerMin != null ? `${data.rateLimitPerMin}/min` : "No limit"}
                  </p>
                </div>
              </div>
              {data?.webhookUrl && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
                  <span className="text-blue-400 font-semibold">Webhook:</span>
                  <span className="text-blue-300/80 font-mono truncate">{data.webhookUrl}</span>
                </div>
              )}
            </div>

            {/* Endpoint */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" /> Endpoint
              </h2>
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-xs">
                <span className="font-semibold text-violet-400">Claude only:</span>
                <span className="text-violet-300/80">Routes exclusively through Anthropic Claude models.</span>
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
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border/60 flex items-center gap-3">
              <Clock className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">Recent API Calls</h2>
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
                    <div key={log.id} data-testid={`row-api-log-${log.id}`} className="px-6 py-3 hover:bg-muted/20 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground truncate font-mono">{preview || "(no content)"}</p>
                          {log.response && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">↪ {log.response.slice(0, 80)}</p>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-right space-y-0.5">
                          <p className="text-[10px] text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</p>
                          {(log.inputTokens > 0 || log.outputTokens > 0) && (
                            <p className="text-[10px] text-muted-foreground font-mono">
                              ↑{log.inputTokens} ↓{log.outputTokens} tok
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
        )}

        {/* Docs Tab */}
        {activeTab === "docs" && (
          <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary" /> Code Examples
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
              <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-1">
                <p className="text-xs font-semibold text-foreground">Request body fields</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 font-mono">
                  <li><span className="text-blue-400">message</span> — string (simple)</li>
                  <li><span className="text-blue-400">messages</span> — array (multi-turn)</li>
                  <li><span className="text-blue-400">systemPrompt</span> — string (optional)</li>
                  <li><span className="text-blue-400">stream</span> — boolean (optional)</li>
                  <li><span className="text-blue-400">maxTokens</span> — number (optional)</li>
                </ul>
              </div>
              <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-1">
                <p className="text-xs font-semibold text-foreground">Response (non-stream)</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 font-mono">
                  <li><span className="text-green-400">content</span> — AI response text</li>
                  <li><span className="text-green-400">model</span> — model used</li>
                  <li><span className="text-green-400">dailyUsed</span> — calls today</li>
                  <li><span className="text-green-400">monthlyUsed</span> — calls this month</li>
                </ul>
                <p className="text-xs font-semibold text-foreground mt-2">Auth header</p>
                <p className="text-xs text-muted-foreground font-mono">Authorization: Bearer &lt;key&gt;</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">cURL — simple message</p>
              <CodeBlock code={curlExample} language="bash" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">cURL — streaming</p>
              <CodeBlock code={curlStreamExample} language="bash (streaming)" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Python</p>
              <CodeBlock code={pythonExample} language="python" />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">JavaScript / Node.js</p>
              <CodeBlock code={jsExample} language="javascript" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
