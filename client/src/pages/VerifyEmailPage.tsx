import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CheckCircle, XCircle, Loader2, Mail, Bot, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AGENT_NAME_SUGGESTIONS = ["Nova", "Aria", "Echo", "Atlas", "Luna", "Kai", "Sage", "Orion"];

export default function VerifyEmailPage() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  const [showAgentSetup, setShowAgentSetup] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentSaving, setAgentSaving] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      setMessage("No verification token found in the URL.");
      return;
    }
    apiRequest("POST", "/api/auth/verify-email", { token })
      .then(async (res) => {
        if (res.ok) {
          setStatus("success");
          await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
          setShowAgentSetup(true);
        } else {
          const data = await res.json();
          setStatus("error");
          setMessage(data.error ?? "Verification failed. The link may be expired.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
      });
  }, []);

  const handleSaveAgentName = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) { navigate("/"); return; }
    setAgentSaving(true);
    setAgentError(null);
    try {
      const res = await apiRequest("PATCH", "/api/settings", { assistantName: trimmed });
      if (!res.ok) throw new Error("Failed to save");
      await queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      navigate("/");
    } catch {
      setAgentError("Couldn't save — you can always change it later in settings.");
      setTimeout(() => navigate("/"), 1800);
    } finally {
      setAgentSaving(false);
    }
  };

  const handleSkip = () => navigate("/");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/6 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[300px] h-[250px] bg-violet-600/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="relative inline-flex items-center justify-center mb-4">
            <div className="absolute inset-0 rounded-2xl bg-primary/30 blur-2xl scale-150 pointer-events-none" />
            <div className="relative w-14 h-14 rounded-2xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shadow-2xl shadow-primary/20">
              <Mail className="w-7 h-7 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Email Verification</h1>
        </div>

        {/* Verification status card */}
        {!showAgentSetup && (
          <div className="bg-card/80 backdrop-blur-sm border border-border/60 ring-1 ring-white/5 rounded-2xl p-8 shadow-2xl shadow-black/40 text-center">
            {status === "loading" && (
              <>
                <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Verifying your email address…</p>
              </>
            )}

            {status === "error" && (
              <>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 mb-4">
                  <XCircle className="w-9 h-9 text-red-400" />
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">Verification failed</h2>
                <p className="text-muted-foreground mb-6">{message}</p>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate("/")}
                    data-testid="button-go-home"
                  >
                    Back to AI Sparky
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Agent name setup — shown after successful verification */}
        {showAgentSetup && (
          <div className="bg-card/80 backdrop-blur-sm border border-border/60 ring-1 ring-white/5 rounded-2xl p-8 shadow-2xl shadow-black/40">
            {/* Success indicator */}
            <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border/60">
              <div className="w-10 h-10 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Email verified!</p>
                <p className="text-xs text-muted-foreground">Your account is now active.</p>
              </div>
            </div>

            {/* Agent name prompt */}
            <div className="text-center mb-6">
              <div className="relative inline-flex items-center justify-center mb-4">
                <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl scale-150 pointer-events-none" />
                <div className="relative w-14 h-14 rounded-2xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
                  <Bot className="w-7 h-7 text-primary" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-foreground mb-1">Name your AI</h2>
              <p className="text-sm text-muted-foreground">
                Give your AI assistant a name — you can always change it later in settings.
              </p>
            </div>

            {/* Name input */}
            <div className="space-y-4">
              <div className="relative">
                <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                <input
                  type="text"
                  data-testid="input-agent-name"
                  placeholder="e.g. Sparky, Nova, Aria…"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && agentName.trim()) handleSaveAgentName(agentName); }}
                  maxLength={30}
                  autoFocus
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl text-sm bg-background/60 border border-border/60 hover:border-border focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-colors outline-none placeholder:text-muted-foreground/50 text-foreground"
                />
              </div>

              {/* Quick suggestions */}
              <div className="flex flex-wrap gap-1.5 justify-center">
                {AGENT_NAME_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    data-testid={`suggestion-agent-${s.toLowerCase()}`}
                    onClick={() => setAgentName(s)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium transition-all border",
                      agentName === s
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-border/60 hover:border-primary/40 hover:text-foreground"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {agentError && (
                <p className="text-xs text-destructive text-center">{agentError}</p>
              )}

              <Button
                className="w-full"
                disabled={agentSaving || !agentName.trim()}
                onClick={() => handleSaveAgentName(agentName)}
                data-testid="button-save-agent-name"
              >
                {agentSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {agentSaving ? "Saving…" : "Start chatting →"}
              </Button>

              <button
                type="button"
                onClick={handleSkip}
                data-testid="button-skip-agent-name"
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip for now
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
