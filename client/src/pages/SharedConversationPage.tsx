import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, User, Lock, Copy, Check, LogIn, Loader2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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

function AILogo() {
  return (
    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-violet-400 flex items-center justify-center flex-shrink-0 shadow-md mt-0.5">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="white" opacity="0.35"/>
        <path d="M8 8h2.5l1.5 4 1.5-4H16l-2.5 8H11L8 8z" fill="white"/>
      </svg>
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Open AI Sparky
          </button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="AI Sparky" className="w-5 h-5 rounded-md object-cover shadow-sm" />
            <span className="font-semibold text-sm text-foreground">
              {data?.title ?? "Shared Conversation"}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {data && (
              user ? (
                <button
                  onClick={() => importMutation.mutate()}
                  disabled={importMutation.isPending || imported}
                  data-testid="button-import-conversation"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {importMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : imported ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {imported ? "Copied!" : "Copy to my chats"}
                </button>
              ) : (
                <button
                  onClick={() => navigate("/login")}
                  data-testid="button-login-to-copy"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors border border-primary/20"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Login to copy
                </button>
              )
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="w-3 h-3" />
              Read-only
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {isLoading && (
          <div className="flex items-center justify-center py-20 gap-2">
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
            <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
          </div>
        )}

        {isError && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-muted mx-auto mb-4 flex items-center justify-center">
              <Lock className="w-7 h-7 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold text-foreground mb-2">Conversation not found</h1>
            <p className="text-muted-foreground text-sm">This link may have expired or been removed.</p>
            <button
              onClick={() => navigate("/")}
              className="mt-6 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Start your own chat
            </button>
          </div>
        )}

        {data && (
          <div className="space-y-1">
            {data.messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === "user" ? (
                  <div className="flex justify-end px-4 py-2">
                    <div className="flex items-end gap-2.5 max-w-[78%]">
                      <div>
                        {msg.content && (
                          <div className="px-4 py-3 rounded-2xl rounded-br-sm bg-primary text-primary-foreground text-sm leading-relaxed shadow-md">
                            <p className="whitespace-pre-wrap break-words font-[450]">{msg.content}</p>
                          </div>
                        )}
                      </div>
                      <div className="w-7 h-7 rounded-full bg-foreground/10 border border-border flex items-center justify-center flex-shrink-0 mb-0.5">
                        <User className="w-3.5 h-3.5 text-foreground/60" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3 px-4 py-3">
                    <AILogo />
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-foreground/90">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            p({ children }) { return <p className="mb-3 last:mb-0 leading-7">{children}</p>; },
                            ul({ children }) { return <ul className="mb-3 last:mb-0 ml-5 list-disc space-y-1.5">{children}</ul>; },
                            ol({ children }) { return <ol className="mb-3 last:mb-0 ml-5 list-decimal space-y-1.5">{children}</ol>; },
                            li({ children }) { return <li className="leading-7">{children}</li>; },
                            code({ className, children }) {
                              const match = /language-(\w+)/.exec(className || "");
                              return match ? (
                                <pre className="bg-muted rounded-xl p-4 overflow-x-auto my-4 text-xs font-mono">
                                  <code>{children}</code>
                                </pre>
                              ) : (
                                <code className="bg-muted/80 text-foreground/90 rounded-md px-1.5 py-0.5 font-mono text-[0.8em] border border-border/50">{children}</code>
                              );
                            },
                            pre({ children }) { return <>{children}</>; },
                            strong({ children }) { return <strong className="font-semibold text-foreground">{children}</strong>; },
                            a({ href, children }) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">{children}</a>; },
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                      {msg.modelUsed && (
                        <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary">
                          {msg.modelUsed}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div className="pt-8 text-center border-t border-border/40 mt-8">
              <p className="text-xs text-muted-foreground mb-3">Shared via AI Sparky</p>
              <button
                onClick={() => navigate("/")}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Start your own conversation
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
