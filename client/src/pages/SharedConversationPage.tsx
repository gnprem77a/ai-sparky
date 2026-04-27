import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  ArrowRight, User, Lock, Copy, Check, LogIn, Loader2,
  Sparkles, MessageSquare, Share2, ExternalLink, Bot,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface SharedMessage {
  id: string;
  role: string;
  content: string;
  modelUsed?: string | null;
}

interface SharedConversation {
  id: string;
  title: string;
  model: string;
  messages: SharedMessage[];
}

const MODEL_COLOR: Record<string, string> = {
  powerful: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  creative: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  fast: "text-green-400 bg-green-500/10 border-green-500/20",
  auto: "text-primary bg-primary/10 border-primary/20",
};

function AISparkyLogo({ size = 32 }: { size?: number }) {
  return (
    <div
      className="rounded-xl bg-gradient-to-br from-primary via-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-primary/30 flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <Sparkles className="text-white" style={{ width: size * 0.45, height: size * 0.45 }} />
    </div>
  );
}

function MessageBubble({ msg }: { msg: SharedMessage }) {
  const isUser = msg.role === "user";
  const modelStyle = msg.modelUsed ? (MODEL_COLOR[msg.modelUsed] ?? MODEL_COLOR.auto) : null;

  if (isUser) {
    return (
      <div className="flex justify-end gap-3 group">
        <div className="max-w-[82%] sm:max-w-[72%]">
          <div className="px-4 py-3 rounded-2xl rounded-br-sm bg-gradient-to-br from-violet-600 to-purple-600 text-white text-sm leading-relaxed shadow-lg shadow-violet-900/20">
            <p className="whitespace-pre-wrap break-words font-[450]">{msg.content}</p>
          </div>
        </div>
        <div className="w-7 h-7 rounded-full bg-foreground/8 border border-border flex items-center justify-center flex-shrink-0 self-end mb-0.5">
          <User className="w-3.5 h-3.5 text-foreground/50" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 group">
      <AISparkyLogo size={28} />
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-foreground">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              p({ children }) { return <p className="mb-3 last:mb-0 leading-7">{children}</p>; },
              ul({ children }) { return <ul className="mb-3 last:mb-0 ml-5 list-disc space-y-1.5">{children}</ul>; },
              ol({ children }) { return <ol className="mb-3 last:mb-0 ml-5 list-decimal space-y-1.5">{children}</ol>; },
              li({ children }) { return <li className="leading-7">{children}</li>; },
              blockquote({ children }) { return <blockquote className="border-l-2 border-primary/40 pl-4 my-3 text-muted-foreground italic">{children}</blockquote>; },
              table({ children }) { return <div className="overflow-x-auto my-4"><table className="w-full border-collapse text-xs">{children}</table></div>; },
              th({ children }) { return <th className="border border-border px-3 py-2 text-left bg-muted/50 font-semibold text-foreground">{children}</th>; },
              td({ children }) { return <td className="border border-border px-3 py-2 text-foreground/80">{children}</td>; },
              code({ className, children }) {
                const match = /language-(\w+)/.exec(className || "");
                return match ? (
                  <pre className="bg-muted/60 border border-border/60 rounded-xl p-4 overflow-x-auto my-3 text-xs font-mono leading-relaxed">
                    <code>{children}</code>
                  </pre>
                ) : (
                  <code className="bg-muted/70 text-foreground/90 rounded-md px-1.5 py-0.5 font-mono text-[0.8em] border border-border/40">{children}</code>
                );
              },
              pre({ children }) { return <>{children}</>; },
              strong({ children }) { return <strong className="font-semibold text-foreground">{children}</strong>; },
              a({ href, children }) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity">{children}</a>; },
              h1({ children }) { return <h1 className="text-xl font-bold text-foreground mt-5 mb-3">{children}</h1>; },
              h2({ children }) { return <h2 className="text-lg font-semibold text-foreground mt-4 mb-2">{children}</h2>; },
              h3({ children }) { return <h3 className="text-base font-semibold text-foreground mt-3 mb-1.5">{children}</h3>; },
            }}
          >
            {msg.content}
          </ReactMarkdown>
        </div>
        {modelStyle && (
          <span className={cn("mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize", modelStyle)}>
            {msg.modelUsed}
          </span>
        )}
      </div>
    </div>
  );
}

export default function SharedConversationPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? (window.location.pathname.split("/share/")[1] ?? "");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [imported, setImported] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const { data, isLoading, isError } = useQuery<SharedConversation>({
    queryKey: ["/api/share", token],
    queryFn: () =>
      fetch(`/api/share/${token}`).then(async (r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      }),
    retry: false,
  });

  const importMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/share/${token}/import`),
    onSuccess: () => {
      setImported(true);
      toast({ title: "Conversation copied!", description: "It's now in your chat history." });
    },
    onError: () => {
      toast({ title: "Failed to copy", description: "Please try again.", variant: "destructive" });
    },
  });

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  const userMsgs = data?.messages.filter((m) => m.role === "user").length ?? 0;
  const aiMsgs = data?.messages.filter((m) => m.role === "assistant").length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <div className="relative border-b border-border/40 bg-gradient-to-b from-primary/5 via-violet-500/3 to-background">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_70%)] pointer-events-none" />

        <div className="max-w-3xl mx-auto px-4 pt-10 pb-8 relative">
          {/* Brand bar */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium group"
            >
              <AISparkyLogo size={24} />
              <span className="group-hover:text-primary transition-colors">AI Sparky</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyUrl}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                data-testid="button-copy-url"
              >
                {urlCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Share2 className="w-3.5 h-3.5" />}
                {urlCopied ? "Copied!" : "Copy link"}
              </button>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60 border border-border/50 px-2 py-1 rounded-lg">
                <Lock className="w-3 h-3" />
                Read-only
              </div>
            </div>
          </div>

          {/* Conversation title + meta */}
          {data && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-4 h-4 text-primary/60" />
                  <span className="text-xs text-muted-foreground font-medium">Shared conversation</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight" data-testid="text-conversation-title">
                  {data.title}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{userMsgs} question{userMsgs !== 1 ? "s" : ""}</span>
                </div>
                <div className="w-1 h-1 rounded-full bg-border" />
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{aiMsgs} AI response{aiMsgs !== 1 ? "s" : ""}</span>
                </div>
                {data.model && data.model !== "auto" && (
                  <>
                    <div className="w-1 h-1 rounded-full bg-border" />
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize", MODEL_COLOR[data.model] ?? MODEL_COLOR.auto)}>
                      {data.model} model
                    </span>
                  </>
                )}
              </div>

              {/* CTA buttons */}
              <div className="flex items-center gap-2 pt-1">
                {user ? (
                  <button
                    onClick={() => importMutation.mutate()}
                    disabled={importMutation.isPending || imported}
                    data-testid="button-import-conversation"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 shadow-lg shadow-primary/25"
                  >
                    {importMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : imported ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    {imported ? "Copied to my chats!" : "Copy to my chats"}
                  </button>
                ) : (
                  <button
                    onClick={() => navigate("/login")}
                    data-testid="button-login-to-copy"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors border border-primary/20"
                  >
                    <LogIn className="w-4 h-4" />
                    Sign in to save this
                  </button>
                )}
                <button
                  onClick={() => navigate("/")}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                  data-testid="button-start-own"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Start your own
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <AISparkyLogo size={48} />
            <div className="flex gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <p className="text-sm text-muted-foreground">Loading conversation…</p>
          </div>
        )}

        {isError && (
          <div className="text-center py-24 space-y-4">
            <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mx-auto">
              <Lock className="w-9 h-9 text-muted-foreground/40" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-2">Conversation not found</h1>
              <p className="text-muted-foreground text-sm">This link may have expired or been removed by the owner.</p>
            </div>
            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-primary/25"
            >
              Start a new conversation <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {data.messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}

            {/* Footer CTA */}
            <div className="mt-12 pt-8 border-t border-border/40">
              <div className="rounded-2xl bg-gradient-to-br from-primary/8 via-violet-500/5 to-transparent border border-primary/10 p-6 text-center space-y-4">
                <AISparkyLogo size={48} />
                <div>
                  <h3 className="text-lg font-bold text-foreground mb-1">Like what you see?</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
                    AI Sparky gives you access to powerful AI models for writing, coding, analysis, and more. Join for free.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => navigate("/auth")}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-primary/25"
                    data-testid="button-get-started"
                  >
                    Get started free <ArrowRight className="w-4 h-4" />
                  </button>
                  {user && (
                    <button
                      onClick={() => navigate("/")}
                      className="px-5 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                    >
                      Open AI Sparky
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground/50">Shared via AI Sparky · No credit card required</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
