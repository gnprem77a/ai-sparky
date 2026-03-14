import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Key, Copy, RefreshCw, Eye, EyeOff, CheckCircle2, ArrowLeft, Terminal, Code2, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

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

export default function ApiAccessPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [revealed, setRevealed] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  const { data, isLoading, error } = useQuery<{ apiKey: string; apiEnabled: boolean }>({
    queryKey: ["/api/me/api-key"],
    enabled: !!user && user.apiEnabled,
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

  if (!user) {
    navigate("/auth");
    return null;
  }

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
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            data-testid="button-go-home"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Chat
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
  -d '{
    "message": "Hello! What is the capital of France?"
  }'`;

  const curlStreamExample = `curl -X POST ${baseUrl}/api/v1/chat \\
  -H "Authorization: Bearer ${apiKey || "<your-api-key>"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "Write a short story",
    "stream": true
  }'`;

  const pythonExample = `import requests

API_KEY = "${apiKey || "<your-api-key>"}"
BASE_URL = "${baseUrl}/api/v1/chat"

response = requests.post(
    BASE_URL,
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "message": "Hello! What is the capital of France?",
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
  body: JSON.stringify({
    message: "Hello! What is the capital of France?",
    systemPrompt: "You are a helpful assistant."
  })
});

const data = await response.json();
console.log(data.content);`;

  const messagesExample = `{
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user",   "content": "What is the capital of France?" },
    { "role": "assistant", "content": "Paris." },
    { "role": "user",   "content": "And Germany?" }
  ]
}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Key className="w-6 h-6 text-primary" />
              API Access
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Use your API key to access the AI from external apps</p>
          </div>
        </div>

        {/* API Key Card */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" />
              Your API Key
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-500 font-semibold ring-1 ring-green-500/20">
              Active
            </span>
          </div>

          {isLoading ? (
            <div className="h-12 rounded-lg bg-muted/40 animate-pulse" />
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/40 border border-border font-mono text-sm text-foreground overflow-hidden">
                <span className="flex-1 truncate" data-testid="text-api-key">
                  {revealed ? apiKey : maskedKey}
                </span>
              </div>
              <button
                onClick={() => setRevealed(!revealed)}
                title={revealed ? "Hide key" : "Reveal key"}
                className="p-3 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex-shrink-0"
                data-testid="button-toggle-reveal"
              >
                {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                onClick={() => {
                  if (!apiKey) return;
                  navigator.clipboard.writeText(apiKey);
                  setKeyCopied(true);
                  setTimeout(() => setKeyCopied(false), 2000);
                }}
                title="Copy key"
                className={cn(
                  "p-3 rounded-xl border transition-all flex-shrink-0",
                  keyCopied
                    ? "border-green-500/30 bg-green-500/10 text-green-500"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
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
              onClick={() => {
                if (confirm("Regenerate your API key? The old key will stop working immediately.")) {
                  regenerateMutation.mutate();
                }
              }}
              disabled={regenerateMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
              data-testid="button-regenerate-key"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", regenerateMutation.isPending && "animate-spin")} />
              {regenerateMutation.isPending ? "Regenerating..." : "Regenerate Key"}
            </button>
          </div>
        </div>

        {/* Endpoint Info */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" />
            Endpoint
          </h2>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-xs">
            <span className="font-semibold text-violet-400">Claude only:</span>
            <span className="text-violet-300/80">This API routes exclusively through Anthropic Claude models.</span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/40 border border-border font-mono text-sm">
            <span className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-blue-500/15 text-blue-500">POST</span>
            <span className="text-foreground truncate" data-testid="text-endpoint">{baseUrl}/api/v1/chat</span>
            <button
              onClick={() => navigator.clipboard.writeText(`${baseUrl}/api/v1/chat`)}
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              data-testid="button-copy-endpoint"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
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
              </ul>
              <p className="text-xs font-semibold text-foreground mt-2">Auth header</p>
              <p className="text-xs text-muted-foreground font-mono">Authorization: Bearer &lt;key&gt;</p>
            </div>
          </div>
        </div>

        {/* Code Examples */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            Code Examples
          </h2>

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

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Multi-turn conversation (messages array)</p>
            <CodeBlock code={messagesExample} language="json" />
          </div>
        </div>
      </div>
    </div>
  );
}
