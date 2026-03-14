import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Database, FileText, Lock, Globe, Loader2, Copy, Check, LogIn } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SharedKbDoc {
  id: string;
  name: string;
  content: string;
  chunkCount: number;
  createdAt: string;
}

interface SharedKbData {
  kb: { id: string; name: string; description: string | null };
  docs: SharedKbDoc[];
}

export default function SharedKnowledgeBasePage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? (window.location.pathname.split("/kb/shared/")[1]?.split("/")[0] ?? "");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [cloned, setCloned] = useState(false);

  const { data, isLoading, isError } = useQuery<SharedKbData>({
    queryKey: ["/api/kb/shared", token],
    queryFn: () =>
      fetch(`/api/kb/shared/${token}`).then(async (r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      }),
    retry: false,
    enabled: !!token,
  });

  const cloneMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/kb/shared/${token}/clone`),
    onSuccess: () => {
      setCloned(true);
      queryClient.invalidateQueries({ queryKey: ["/api/kb"] });
      toast({ title: "Knowledge base cloned!", description: "It's now in your library at /kb." });
    },
    onError: () => {
      toast({ title: "Failed to clone", description: "Please try again.", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/60 bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            data-testid="button-back-home"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Open AI Sparky
          </button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-sm text-foreground">
              {data?.kb.name ?? "Shared Knowledge Base"}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {data && (
              user ? (
                <button
                  onClick={() => cloneMutation.mutate()}
                  disabled={cloneMutation.isPending || cloned}
                  data-testid="button-clone-kb"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors disabled:opacity-60"
                >
                  {cloneMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : cloned ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {cloned ? "Cloned!" : "Clone to my library"}
                </button>
              ) : (
                <button
                  onClick={() => navigate("/login")}
                  data-testid="button-login-to-clone"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-semibold hover:bg-blue-500/20 transition-colors border border-blue-500/20"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Login to clone
                </button>
              )
            )}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Globe className="w-3 h-3" />
              Public KB
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
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
            <h1 className="text-xl font-semibold text-foreground mb-2">Knowledge base not found</h1>
            <p className="text-muted-foreground text-sm">This link may have expired or the KB is no longer public.</p>
            <button
              onClick={() => navigate("/")}
              className="mt-6 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Go home
            </button>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* KB info */}
            <div className="rounded-2xl border border-border bg-card/40 p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Database className="w-6 h-6 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-bold text-foreground" data-testid="text-kb-name">{data.kb.name}</h1>
                  {data.kb.description && (
                    <p className="text-sm text-muted-foreground mt-1" data-testid="text-kb-description">{data.kb.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-3">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="w-3.5 h-3.5" />
                      {data.docs.length} document{data.docs.length !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-green-400">
                      <Globe className="w-3.5 h-3.5" />
                      Publicly shared
                    </span>
                  </div>
                </div>
              </div>

              {!user && (
                <div className="mt-4 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 flex items-center gap-3">
                  <LogIn className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  <p className="text-xs text-muted-foreground flex-1">
                    <button onClick={() => navigate("/login")} className="text-blue-400 font-semibold hover:underline">Sign in</button>
                    {" "}to clone this knowledge base into your own library.
                  </p>
                </div>
              )}
            </div>

            {/* Documents list */}
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3 px-1">Documents ({data.docs.length})</h2>
              {data.docs.length === 0 ? (
                <div className="text-center py-12 rounded-2xl border border-dashed border-border">
                  <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No documents in this knowledge base</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.docs.map((doc) => (
                    <div key={doc.id} data-testid={`doc-item-${doc.id}`} className="flex items-start gap-3 rounded-xl border border-border bg-card/30 px-4 py-3.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <FileText className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted-foreground">{doc.chunkCount} chunks</span>
                          <span className="text-xs text-muted-foreground">{(doc.content.length / 1000).toFixed(1)}k chars</span>
                          <span className="text-xs text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 text-center">
              <p className="text-xs text-muted-foreground">Shared via AI Sparky Knowledge Base</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
