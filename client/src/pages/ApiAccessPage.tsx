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
  totalInputTokens: number;
  totalOutputTokens: number;
  byModel: Record<string, { calls: number; spent: number; inputTokens: number; outputTokens: number }>;
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
  sonnet: "Claude Sonnet 4.5",
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

function BalanceBar({ balance }: { balance: number }) {
  const isEmpty   = balance <= 0;
  const isRed     = balance < 5;
  const isYellow  = balance >= 5 && balance < 10;
  const isGreen   = balance >= 10;

  const borderCls = isEmpty || isRed ? "border-red-500/30 bg-red-500/5"
    : isYellow ? "border-amber-500/30 bg-amber-500/5"
    : "border-emerald-500/30 bg-emerald-500/5";
  const iconBg = isEmpty || isRed ? "bg-red-500/15"
    : isYellow ? "bg-amber-500/15"
    : "bg-emerald-500/15";
  const textCls = isEmpty || isRed ? "text-red-500"
    : isYellow ? "text-amber-500"
    : "text-emerald-500";

  return (
    <div className={cn("rounded-2xl border p-5 flex items-center gap-4", borderCls)} data-testid="card-balance">
      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0", iconBg)}>
        <DollarSign className={cn("w-6 h-6", textCls)} />
      </div>
      <div className="flex-1">
        <p className="text-xs text-muted-foreground font-medium mb-0.5">Available Balance</p>
        <p className={cn("text-2xl font-bold tabular-nums", textCls)} data-testid="text-balance">
          ${balance.toFixed(2)}
        </p>
        {isEmpty && <p className="text-xs text-red-400 mt-0.5">API calls are blocked. Contact admin to add balance.</p>}
        {!isEmpty && isRed && <p className="text-xs text-red-400 mt-0.5">Critical: Balance below $5.00 — API access will stop soon.</p>}
        {isYellow && <p className="text-xs text-amber-400 mt-0.5">Warning: Balance below $10.00 — consider topping up.</p>}
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
  const [newKeyReveal, setNewKeyReveal] = useState<string | null>(null);
  const [newKeyCopied, setNewKeyCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "history" | "pricing" | "webhooks" | "docs" | "claude-cli">("overview");
  const [docsLang, setDocsLang] = useState<"curl" | "python" | "js" | "nodejs" | "php" | "ruby" | "go">("curl");
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
    onSuccess: (responseData: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/api-key"] });
      if (responseData?.apiKey && responseData?.oneTimeReveal) {
        setNewKeyReveal(responseData.apiKey);
        setNewKeyCopied(false);
      }
      setRevealed(false);
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

  /* ── User has API access enabled by admin → go straight to dashboard ── */
  /* ── Free user without API access: locked view ── */
  if (!user.apiEnabled && !isPro) {
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

  /* ── Pro user, API not yet enabled by admin ── */
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
  // API key is stored masked for security (full key shown one-time on generation only)
  const maskedKey = apiKey || "Loading...";
  const balance = data?.balance ?? 0;
  const balanceLow = balance > 0 && balance < 10;

  const displayKey = newKeyReveal || "<your-api-key>";
  const curlExample = `curl -X POST ${baseUrl}/api/v1/chat \\
  -H "Authorization: Bearer ${displayKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Hello!", "model": "balanced"}'`;

  const curlStreamExample = `curl -X POST ${baseUrl}/api/v1/chat \\
  -H "Authorization: Bearer ${displayKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Write a short story", "model": "powerful", "stream": true}'`;

  const pythonExample = `import requests

API_KEY = "${displayKey}"
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
    "Authorization": "Bearer ${displayKey}",
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

  const nodeAxiosExample = `const axios = require("axios");
// npm install axios

const API_KEY = "${displayKey}";
const BASE_URL = "${baseUrl}/api/v1/chat";

async function chat(message) {
  const response = await axios.post(
    BASE_URL,
    {
      message,
      model: "balanced",   // powerful | fast | creative | balanced
      systemPrompt: "You are a helpful assistant."
    },
    {
      headers: {
        Authorization: \`Bearer \${API_KEY}\`,
        "Content-Type": "application/json"
      }
    }
  );
  console.log(response.data.content);
  console.log("Balance:", response.headers["x-balance-remaining"]);
  console.log("Request ID:", response.headers["x-request-id"]);
}

chat("Explain quantum computing in simple terms.");`;

  const phpExample = `<?php
$apiKey = "${displayKey}";
$baseUrl = "${baseUrl}/api/v1/chat";

$payload = json_encode([
    "message"      => "Hello!",
    "model"        => "balanced",   // powerful | fast | creative | balanced
    "systemPrompt" => "You are a helpful assistant."
]);

$ch = curl_init($baseUrl);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => [
        "Authorization: Bearer $apiKey",
        "Content-Type: application/json"
    ],
    CURLOPT_POSTFIELDS => $payload,
]);

$response   = curl_exec($ch);
$httpCode   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$result = json_decode($response, true);
echo $result["content"] . PHP_EOL;`;

  const rubyExample = `require "net/http"
require "json"
require "uri"

API_KEY  = "${displayKey}"
BASE_URL = "${baseUrl}/api/v1/chat"

uri  = URI(BASE_URL)
http = Net::HTTP.new(uri.host, uri.port)
http.use_ssl = uri.scheme == "https"

request = Net::HTTP::Post.new(uri.path)
request["Authorization"] = "Bearer #{API_KEY}"
request["Content-Type"]  = "application/json"
request.body = JSON.generate(
  message:      "Hello!",
  model:        "balanced",   # powerful | fast | creative | balanced
  systemPrompt: "You are a helpful assistant."
)

response = http.request(request)
result   = JSON.parse(response.body)

puts result["content"]
puts "Balance: #{response["X-Balance-Remaining"]}"`;

  const goExample = `package main

import (
  "bytes"
  "encoding/json"
  "fmt"
  "io"
  "net/http"
)

const (
  APIKey  = "${displayKey}"
  BaseURL = "${baseUrl}/api/v1/chat"
)

func main() {
  payload, _ := json.Marshal(map[string]interface{}{
    "message":      "Hello!",
    "model":        "balanced", // powerful | fast | creative | balanced
    "systemPrompt": "You are a helpful assistant.",
  })

  req, _ := http.NewRequest("POST", BaseURL, bytes.NewBuffer(payload))
  req.Header.Set("Authorization", "Bearer "+APIKey)
  req.Header.Set("Content-Type", "application/json")

  client := &http.Client{}
  resp, err := client.Do(req)
  if err != nil {
    panic(err)
  }
  defer resp.Body.Close()

  body, _ := io.ReadAll(resp.Body)
  fmt.Println(string(body))
  fmt.Println("Balance:", resp.Header.Get("X-Balance-Remaining"))
  fmt.Println("Request ID:", resp.Header.Get("X-Request-ID"))
}`;

  const tabs = [
    { id: "overview" as const, label: "Overview", icon: BarChart2 },
    { id: "history" as const, label: "Call History", icon: Clock },
    { id: "pricing" as const, label: "Pricing", icon: DollarSign },
    { id: "webhooks" as const, label: "Webhooks", icon: Webhook },
    { id: "docs" as const, label: "Docs", icon: Terminal },
    { id: "claude-cli" as const, label: "Claude CLI", icon: Zap },
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
          <BalanceBar balance={balance} />
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
                <span className="flex-1 truncate" data-testid="text-api-key">{maskedKey}</span>
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(newKeyReveal ?? ""); setKeyCopied(true); setTimeout(() => setKeyCopied(false), 2000); }}
                disabled={!newKeyReveal}
                title={newKeyReveal ? "Copy full key" : "Regenerate your key to copy it"}
                className={cn("p-3 rounded-xl border transition-all flex-shrink-0", !newKeyReveal ? "border-border/40 text-muted-foreground/30 cursor-not-allowed" : keyCopied ? "border-green-500/30 bg-green-500/10 text-green-500" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50")}
                data-testid="button-copy-key"
              >
                {keyCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}

          {/* One-time reveal banner shown immediately after key generation/regeneration */}
          {newKeyReveal && (
            <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-green-500/10 border border-green-500/30 text-xs">
              <div className="flex items-start gap-2">
                <span className="text-green-500 font-bold flex-shrink-0 mt-0.5">✓</span>
                <span className="text-green-700 dark:text-green-400 font-semibold">New key generated — copy it now. It will not be shown again.</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 rounded-lg bg-background border border-green-500/30 font-mono text-green-700 dark:text-green-300 overflow-x-auto whitespace-nowrap text-[11px]" data-testid="text-new-api-key">
                  {newKeyReveal}
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(newKeyReveal); setNewKeyCopied(true); setTimeout(() => setNewKeyCopied(false), 3000); }}
                  className={cn("p-2 rounded-lg border transition-all flex-shrink-0", newKeyCopied ? "border-green-500/40 bg-green-500/15 text-green-600" : "border-green-500/30 text-green-600 hover:bg-green-500/15")}
                  data-testid="button-copy-new-key"
                >
                  {newKeyCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setNewKeyReveal(null)}
                  className="p-2 rounded-lg border border-green-500/20 text-green-600/60 hover:text-green-600 hover:bg-green-500/10 transition-all flex-shrink-0"
                  data-testid="button-dismiss-new-key"
                  title="Dismiss"
                >
                  ✕
                </button>
              </div>
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
                      ${value.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Token usage summary */}
            {!isLoading && ((data?.totalInputTokens ?? 0) + (data?.totalOutputTokens ?? 0)) > 0 && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4">
                  <BarChart2 className="w-4 h-4 text-primary" /> Token Usage (All Time)
                </h2>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Input Tokens", value: data?.totalInputTokens ?? 0, color: "text-blue-500" },
                    { label: "Output Tokens", value: data?.totalOutputTokens ?? 0, color: "text-violet-500" },
                    { label: "Total Tokens", value: (data?.totalInputTokens ?? 0) + (data?.totalOutputTokens ?? 0), color: "text-foreground" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded-xl border border-border bg-muted/20 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">{label}</p>
                      <p className={cn("text-base font-bold tabular-nums", color)} data-testid={`text-tokens-${label.toLowerCase().replace(/ /g, "-")}`}>
                        {value >= 1_000_000
                          ? `${(value / 1_000_000).toFixed(2)}M`
                          : value >= 1_000
                          ? `${(value / 1_000).toFixed(1)}K`
                          : value.toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Model usage breakdown */}
            {!isLoading && data?.byModel && Object.keys(data.byModel).length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-primary" /> Usage by Model
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60">
                        <th className="text-left py-2 text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Model</th>
                        <th className="text-right py-2 text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Calls</th>
                        <th className="text-right py-2 text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Input Tok</th>
                        <th className="text-right py-2 text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Output Tok</th>
                        <th className="text-right py-2 text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {Object.entries(data.byModel).map(([model, stats]) => {
                        const fmtTok = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n/1_000).toFixed(1)}K` : n.toString();
                        return (
                          <tr key={model} data-testid={`row-model-${model}`} className="hover:bg-muted/20 transition-colors">
                            <td className="py-3 font-medium text-foreground">{MODEL_LABELS[model] ?? model}</td>
                            <td className="py-3 text-right tabular-nums text-muted-foreground text-xs">{stats.calls}</td>
                            <td className="py-3 text-right tabular-nums text-blue-500 text-xs font-mono">{fmtTok(stats.inputTokens)}</td>
                            <td className="py-3 text-right tabular-nums text-violet-500 text-xs font-mono">{fmtTok(stats.outputTokens)}</td>
                            <td className="py-3 text-right tabular-nums font-mono text-foreground">${stats.spent.toFixed(4)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
                  <p className="text-base font-bold tabular-nums text-foreground">${(data?.todaySpent ?? 0).toFixed(2)}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-1">Month Spent</p>
                  <p className="text-base font-bold tabular-nums text-foreground">${(data?.monthSpent ?? 0).toFixed(2)}</p>
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
                <span className="text-xs text-muted-foreground">Last 50 calls</span>
                <a
                  href="/api/me/api-history/export.csv"
                  download
                  data-testid="button-export-history-csv"
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                >
                  ↓ Export CSV
                </a>
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
                            <div className="flex items-center justify-end gap-1.5">
                              <span className={cn("w-1.5 h-1.5 rounded-full", log.success !== false ? "bg-emerald-500" : "bg-red-500")} title={log.success !== false ? "Success" : "Failed"} />
                              <p className="text-[10px] text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</p>
                            </div>
                            <p className="text-[10px] font-mono text-muted-foreground">
                              ↑{log.inputTokens} ↓{log.outputTokens} tok
                            </p>
                            {log.costDeducted != null && (
                              <p className="text-[11px] font-bold font-mono text-foreground" data-testid={`text-cost-${log.id}`}>
                                -{log.success !== false ? "$" : ""}{log.success !== false ? log.costDeducted.toFixed(4) : "no charge"}
                              </p>
                            )}
                            {log.success === false && (log as any).failReason && (
                              <p className="text-[10px] text-red-400 font-mono max-w-[180px] text-right truncate" title={(log as any).failReason}>
                                ⚠ {(log as any).failReason}
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
            {/* Base URL banner */}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-5 py-4 flex items-center gap-4">
              <Globe className="w-5 h-5 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">API Endpoint</p>
                <code className="text-sm font-mono text-foreground break-all">{baseUrl}/api/v1/chat</code>
              </div>
            </div>

            {/* Language picker + code examples */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-1 px-4 pt-4 pb-0 border-b border-border flex-wrap">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-2">Language</p>
                {(["curl", "python", "js", "nodejs", "php", "ruby", "go"] as const).map((lang) => {
                  const labels: Record<string, string> = { curl: "cURL", python: "Python", js: "JavaScript", nodejs: "Node.js", php: "PHP", ruby: "Ruby", go: "Go" };
                  return (
                    <button
                      key={lang}
                      onClick={() => setDocsLang(lang)}
                      data-testid={`button-docs-lang-${lang}`}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium rounded-t-lg border-b-2 transition-all -mb-px",
                        docsLang === lang
                          ? "border-primary text-primary bg-primary/5"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {labels[lang]}
                    </button>
                  );
                })}
              </div>
              <div className="p-4 space-y-3">
                {docsLang === "curl" && (
                  <>
                    <CodeBlock code={curlExample} language="cURL — basic" />
                    <CodeBlock code={curlStreamExample} language="cURL — streaming (SSE)" />
                  </>
                )}
                {docsLang === "python" && <CodeBlock code={pythonExample} language="Python — requests" />}
                {docsLang === "js" && <CodeBlock code={jsExample} language="JavaScript — fetch (browser / Deno)" />}
                {docsLang === "nodejs" && <CodeBlock code={nodeAxiosExample} language="Node.js — axios" />}
                {docsLang === "php" && <CodeBlock code={phpExample} language="PHP — cURL" />}
                {docsLang === "ruby" && <CodeBlock code={rubyExample} language="Ruby — net/http" />}
                {docsLang === "go" && <CodeBlock code={goExample} language="Go — net/http" />}
              </div>
            </div>

            {/* Request body reference */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Terminal className="w-4 h-4 text-primary" /> Request Body Fields
              </h2>
              <div className="space-y-2 text-xs">
                {[
                  { field: "message", type: "string", req: true,  desc: "Single user message (alternative to messages array)" },
                  { field: "messages", type: "array",  req: false, desc: "Array of {role, content} objects for multi-turn conversations" },
                  { field: "model",   type: "string", req: false, desc: "Model slug: powerful | fast | creative | balanced (default: balanced)" },
                  { field: "systemPrompt", type: "string", req: false, desc: "Optional system instruction prepended to the conversation" },
                  { field: "stream",  type: "boolean", req: false, desc: "Set true to enable SSE streaming (default: false)" },
                  { field: "maxTokens", type: "number", req: false, desc: "Override max output tokens — capped per model" },
                ].map(({ field, type, req, desc }) => (
                  <div key={field} className="flex gap-3 py-1.5 border-b border-border/40 last:border-0 items-start">
                    <code className="font-mono text-primary w-28 flex-shrink-0 mt-0.5">{field}</code>
                    <div className="flex flex-col gap-0.5 w-20 flex-shrink-0">
                      <code className="text-muted-foreground text-[11px]">{type}</code>
                      <span className={cn("text-[10px] font-semibold", req ? "text-amber-500" : "text-muted-foreground/50")}>{req ? "required*" : "optional"}</span>
                    </div>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">* Either <code className="font-mono text-primary">message</code> or <code className="font-mono text-primary">messages</code> must be provided.</p>
            </div>

            {/* Response headers reference */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" /> Response Headers
              </h2>
              <div className="space-y-2 text-xs">
                {[
                  { header: "X-Request-ID",          desc: "Unique ID for this request — use for dispute or debug (e.g. req_a1b2c3d4e5f6)" },
                  { header: "X-Balance-Remaining",   desc: "Your wallet balance after this request (e.g. $28.450000)" },
                  { header: "X-Cost-This-Request",   desc: "Exact cost deducted for this request (e.g. $0.000125)" },
                  { header: "X-Tokens-Input",        desc: "Input tokens consumed" },
                  { header: "X-Tokens-Output",       desc: "Output tokens generated" },
                  { header: "X-Rate-Limit-Remaining", desc: "Requests remaining in the current 60-second window" },
                  { header: "X-Rate-Limit-Reset",    desc: "Unix timestamp (seconds) when the rate limit window resets" },
                ].map(({ header, desc }) => (
                  <div key={header} className="flex gap-3 py-1.5 border-b border-border/40 last:border-0 items-start">
                    <code className="font-mono text-primary w-52 flex-shrink-0 text-[11px] mt-0.5">{header}</code>
                    <span className="text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Models quick-reference */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Model Slugs
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { slug: "balanced",  label: "Balanced",  hint: "Best value" },
                  { slug: "fast",      label: "Fast",      hint: "Lowest cost" },
                  { slug: "powerful",  label: "Powerful",  hint: "Highest quality" },
                  { slug: "creative",  label: "Creative",  hint: "Creative tasks" },
                ].map(({ slug, label, hint }) => (
                  <div key={slug} className="rounded-xl border border-border bg-muted/20 p-3 space-y-1">
                    <code className="text-xs font-mono text-primary font-bold">{slug}</code>
                    <p className="text-xs text-foreground font-medium">{label}</p>
                    <p className="text-[10px] text-muted-foreground">{hint}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* Claude CLI Tab */}
        {activeTab === "claude-cli" && (
          <div className="space-y-4" data-testid="section-claude-cli">

            {/* What is it */}
            <div className="rounded-2xl border border-violet-500/25 bg-violet-500/5 px-5 py-4">
              <p className="text-sm font-semibold text-foreground">What is Claude CLI?</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Claude CLI is an AI coding assistant that works inside your terminal. You point it at your codebase, ask it questions or give it tasks, and it reads/writes files for you. By setting your AI Sparky API key, every request goes through your account and is billed from your balance.
              </p>
            </div>

            {/* Step 1 */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                <div>
                  <p className="font-semibold text-foreground text-sm">Install Claude CLI</p>
                  <p className="text-xs text-muted-foreground">You need Node.js installed first. Then run this once in your terminal:</p>
                </div>
              </div>
              <CodeBlock code={`npm install -g @anthropic-ai/claude-code`} language="Terminal" />
            </div>

            {/* Step 2 */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                <div>
                  <p className="font-semibold text-foreground text-sm">Save your API key permanently</p>
                  <p className="text-xs text-muted-foreground">Open <code className="font-mono">~/.zshrc</code> (Mac/Linux) or <code className="font-mono">~/.bashrc</code> and add these two lines at the bottom:</p>
                </div>
              </div>
              <CodeBlock
                code={`export ANTHROPIC_BASE_URL=${baseUrl}/api\nexport ANTHROPIC_API_KEY=${displayKey}`}
                language="~/.zshrc  or  ~/.bashrc"
              />
              <p className="text-xs text-muted-foreground pl-1">After saving the file, run <code className="font-mono bg-muted px-1 py-0.5 rounded">source ~/.zshrc</code> (or open a new terminal) to apply it.</p>
            </div>

            {/* Step 3 */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                <div>
                  <p className="font-semibold text-foreground text-sm">Open a project folder and run Claude</p>
                  <p className="text-xs text-muted-foreground">Navigate to any folder on your computer, then start Claude CLI:</p>
                </div>
              </div>
              <CodeBlock
                code={`cd /your/project/folder\nclaude`}
                language="Terminal"
              />
              <p className="text-xs text-muted-foreground pl-1">Claude will start and show a prompt. You can now ask it things like <em>"explain this codebase"</em>, <em>"fix the bug in auth.ts"</em>, or <em>"add a login page"</em>.</p>
            </div>

            {/* Step 4 — done */}
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground text-sm">You're all set!</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Claude CLI is now connected to AI Sparky. Every conversation is billed from your balance at the same rates shown in the Pricing tab. No separate Anthropic subscription needed.
                </p>
              </div>
            </div>

            {/* Quick tip */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2"><Zap className="w-4 h-4 text-primary" /> Quick tip — test without saving env vars first</p>
              <p className="text-xs text-muted-foreground">If you just want to try it before doing the permanent setup, paste this entire block into your terminal:</p>
              <CodeBlock
                code={`ANTHROPIC_BASE_URL=${baseUrl}/api \\\nANTHROPIC_API_KEY=${displayKey} \\\nclaude`}
                language="Terminal — one-off test"
              />
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
