import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  BookOpen, Plus, Trash2, ArrowLeft, FileText, MessageSquare,
  Loader2, Send, X, ChevronRight, Database, Search, Zap, AlertCircle
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { KnowledgeBase, KbDocument } from "@shared/schema";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: { docName: string; docId: string; snippet: string }[];
}

function WelcomeScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 py-16 text-center overflow-y-auto">
      <div className="w-16 h-16 rounded-2xl bg-blue-500/15 flex items-center justify-center mb-6">
        <Database className="w-8 h-8 text-blue-400" />
      </div>
      <h1 className="text-2xl font-bold text-foreground mb-3">Knowledge Base</h1>
      <p className="text-sm text-muted-foreground max-w-md leading-relaxed mb-10">
        Upload your documents and ask questions about them. Powered by semantic search with embed-v-4-0 and Cohere reranking.
      </p>

      <div className="grid grid-cols-3 gap-4 max-w-2xl w-full mb-10">
        {[
          { icon: <FileText className="w-5 h-5 text-blue-400" />, bg: "bg-blue-500/10", title: "Upload Documents", desc: "Paste text, articles, manuals, or any reference material" },
          { icon: <Search className="w-5 h-5 text-violet-400" />, bg: "bg-violet-500/10", title: "Semantic Search", desc: "Finds relevant content by meaning — not just keywords" },
          { icon: <Zap className="w-5 h-5 text-amber-400" />, bg: "bg-amber-500/10", title: "AI Q&A", desc: "Ask anything — get cited answers from your own docs" },
        ].map(({ icon, bg, title, desc }) => (
          <div key={title} className="rounded-xl border border-border/60 bg-card/40 p-4 text-left">
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>{icon}</div>
            <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <div className="text-xs text-muted-foreground/60 space-y-1">
        <p>← Create a knowledge base from the sidebar to get started</p>
      </div>
    </div>
  );
}

export default function KnowledgeBasePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"documents" | "chat">("documents");
  const [showCreateKb, setShowCreateKb] = useState(false);
  const [kbName, setKbName] = useState("");
  const [kbDesc, setKbDesc] = useState("");
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [docName, setDocName] = useState("");
  const [docContent, setDocContent] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const { data: kbs = [], isLoading: kbsLoading } = useQuery<KnowledgeBase[]>({
    queryKey: ["/api/kb"],
    enabled: !!user,
  });

  const { data: docs = [], isLoading: docsLoading } = useQuery<KbDocument[]>({
    queryKey: ["/api/kb", selectedKbId, "documents"],
    queryFn: () => fetch(`/api/kb/${selectedKbId}/documents`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedKbId,
  });

  const selectedKb = kbs.find(k => k.id === selectedKbId);

  const createKb = useMutation({
    mutationFn: () => apiRequest("POST", "/api/kb", { name: kbName.trim(), description: kbDesc.trim() }),
    onSuccess: async (res) => {
      const kb = await res.json() as KnowledgeBase;
      await qc.invalidateQueries({ queryKey: ["/api/kb"] });
      setSelectedKbId(kb.id);
      setKbName(""); setKbDesc(""); setShowCreateKb(false);
      toast({ title: "Knowledge base created" });
    },
    onError: () => toast({ title: "Failed to create knowledge base", variant: "destructive" }),
  });

  const deleteKb = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/kb/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/kb"] });
      if (selectedKbId) setSelectedKbId(null);
      toast({ title: "Deleted" });
    },
  });

  const addDoc = useMutation({
    mutationFn: () => apiRequest("POST", `/api/kb/${selectedKbId}/documents`, { name: docName.trim(), content: docContent.trim() }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/kb", selectedKbId, "documents"] });
      setDocName(""); setDocContent(""); setShowAddDoc(false);
      toast({ title: "Document added and indexed" });
    },
    onError: async (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to add document";
      toast({ title: msg.includes("credit") ? "API credits needed" : "Failed to add document", description: msg, variant: "destructive" });
    },
  });

  const deleteDoc = useMutation({
    mutationFn: (docId: string) => apiRequest("DELETE", `/api/kb/${selectedKbId}/documents/${docId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/kb", selectedKbId, "documents"] }),
  });

  async function sendChat() {
    if (!chatInput.trim() || chatLoading || !selectedKbId) return;
    const question = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: question }]);
    setChatLoading(true);
    try {
      const res = await apiRequest("POST", `/api/kb/${selectedKbId}/chat`, { question });
      const data = await res.json() as { answer: string; sources: { docName: string; docId: string; snippet: string }[] };
      setChatMessages(prev => [...prev, { role: "assistant", content: data.answer, sources: data.sources }]);
    } catch {
      setChatMessages(prev => [...prev, { role: "assistant", content: "Sorry, I couldn't answer that. Check your API credits and try again." }]);
    } finally {
      setChatLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/15 flex items-center justify-center mx-auto">
            <Database className="w-8 h-8 text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Sign in to use Knowledge Base</h2>
          <p className="text-sm text-muted-foreground">Upload documents and ask AI questions about them.</p>
          <Link href="/login">
            <button className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 transition-all">Sign In</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Left sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-border flex flex-col bg-sidebar">
        <div className="flex items-center justify-between px-4 py-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Link href="/">
              <button className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all" title="Back to chat">
                <ArrowLeft className="w-4 h-4" />
              </button>
            </Link>
            <div className="flex items-center gap-1.5">
              <Database className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-foreground">Knowledge Base</span>
            </div>
          </div>
          <button
            onClick={() => setShowCreateKb(true)}
            data-testid="button-create-kb"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
            title="New knowledge base"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Create KB form */}
        {showCreateKb && (
          <div className="px-3 py-3 border-b border-border/60 space-y-2">
            <input
              autoFocus
              value={kbName}
              onChange={e => setKbName(e.target.value)}
              placeholder="Name (e.g. Medical Docs)"
              data-testid="input-kb-name"
              className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-blue-500/50"
            />
            <input
              value={kbDesc}
              onChange={e => setKbDesc(e.target.value)}
              placeholder="Description (optional)"
              data-testid="input-kb-desc"
              className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-blue-500/50"
            />
            <div className="flex gap-2">
              <button
                onClick={() => createKb.mutate()}
                disabled={!kbName.trim() || createKb.isPending}
                data-testid="button-confirm-create-kb"
                className="flex-1 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-50 transition-all"
              >
                {createKb.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : "Create"}
              </button>
              <button onClick={() => { setShowCreateKb(false); setKbName(""); setKbDesc(""); }} className="px-3 py-1.5 rounded-lg bg-muted/40 text-xs text-muted-foreground hover:text-foreground transition-all">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* KB list */}
        <div className="flex-1 overflow-y-auto py-2">
          {kbsLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : kbs.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-muted-foreground">No knowledge bases yet.</p>
              <button onClick={() => setShowCreateKb(true)} className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors">Create one →</button>
            </div>
          ) : kbs.map(kb => (
            <div
              key={kb.id}
              onClick={() => { setSelectedKbId(kb.id); setActiveTab("documents"); setChatMessages([]); }}
              data-testid={`kb-item-${kb.id}`}
              className={`group flex items-center gap-2 mx-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${selectedKbId === kb.id ? "bg-blue-500/15 text-foreground" : "hover:bg-muted/40 text-muted-foreground hover:text-foreground"}`}
            >
              <BookOpen className="w-4 h-4 flex-shrink-0 text-blue-400" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{kb.name}</p>
                {kb.description && <p className="text-xs text-muted-foreground/60 truncate">{kb.description}</p>}
              </div>
              <button
                onClick={e => { e.stopPropagation(); if (confirm("Delete this knowledge base?")) deleteKb.mutate(kb.id); }}
                data-testid={`button-delete-kb-${kb.id}`}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-red-400 transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      {!selectedKbId ? <WelcomeScreen /> : (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header + tabs */}
          <div className="border-b border-border px-6 py-3 flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{selectedKb?.name}</h2>
              {selectedKb?.description && <p className="text-xs text-muted-foreground mt-0.5">{selectedKb.description}</p>}
            </div>
            <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
              {(["documents", "chat"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  data-testid={`tab-${tab}`}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize ${activeTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {tab === "documents" ? <FileText className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Documents tab */}
          {activeTab === "documents" && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto space-y-4">
                {/* Add document */}
                {showAddDoc ? (
                  <div className="rounded-xl border border-border bg-card/40 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">Add Document</h3>
                      <button onClick={() => { setShowAddDoc(false); setDocName(""); setDocContent(""); }} className="p-1 rounded text-muted-foreground hover:text-foreground">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <input
                      value={docName}
                      onChange={e => setDocName(e.target.value)}
                      placeholder="Document name (e.g. Chapter 1 - Immunology)"
                      data-testid="input-doc-name"
                      className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-blue-500/50"
                    />
                    <textarea
                      value={docContent}
                      onChange={e => setDocContent(e.target.value)}
                      placeholder="Paste your document content here…"
                      data-testid="textarea-doc-content"
                      rows={10}
                      className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-blue-500/50 resize-none leading-relaxed"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">{docContent.length} characters · ~{Math.ceil(docContent.length / 800)} chunks</p>
                      <button
                        onClick={() => addDoc.mutate()}
                        disabled={!docName.trim() || !docContent.trim() || addDoc.isPending}
                        data-testid="button-add-doc"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50 transition-all"
                      >
                        {addDoc.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Indexing…</> : <><Plus className="w-4 h-4" /> Add & Index</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddDoc(true)}
                    data-testid="button-show-add-doc"
                    className="w-full py-3 rounded-xl border border-dashed border-blue-500/30 bg-blue-500/5 text-sm text-blue-400 font-medium hover:bg-blue-500/10 hover:border-blue-500/50 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Add Document
                  </button>
                )}

                {/* Documents list */}
                {docsLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : docs.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No documents yet.</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Add your first document to start asking questions.</p>
                  </div>
                ) : docs.map(doc => (
                  <div key={doc.id} data-testid={`doc-item-${doc.id}`} className="flex items-start gap-3 rounded-xl border border-border bg-card/30 px-4 py-3.5 group">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <FileText className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">{doc.chunkCount} chunks indexed</span>
                        <span className="text-xs text-muted-foreground">{(doc.content.length / 1000).toFixed(1)}k chars</span>
                        <span className="text-xs text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => { if (confirm(`Delete "${doc.name}"?`)) deleteDoc.mutate(doc.id); }}
                      data-testid={`button-delete-doc-${doc.id}`}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                {docs.length > 0 && (
                  <div className="pt-2 text-center">
                    <button onClick={() => setActiveTab("chat")} className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors">
                      Start asking questions <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Chat tab */}
          {activeTab === "chat" && (
            <div className="flex-1 flex flex-col min-h-0">
              {docs.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <AlertCircle className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                    <p className="text-sm text-muted-foreground">Add documents first before chatting.</p>
                    <button onClick={() => setActiveTab("documents")} className="text-sm text-blue-400 hover:text-blue-300 transition-colors">Go to Documents →</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {chatMessages.length === 0 && (
                      <div className="flex items-center justify-center py-16">
                        <div className="text-center space-y-2">
                          <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                          <p className="text-sm text-muted-foreground">Ask anything about your {docs.length} document{docs.length !== 1 ? "s" : ""}</p>
                          <p className="text-xs text-muted-foreground/60">Answers will include source citations</p>
                        </div>
                      </div>
                    )}
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        {msg.role === "assistant" && (
                          <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Database className="w-3.5 h-3.5 text-blue-400" />
                          </div>
                        )}
                        <div className={`max-w-[75%] space-y-2`}>
                          <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "bg-blue-600 text-white rounded-br-sm" : "bg-card border border-border text-foreground rounded-bl-sm"}`}>
                            {msg.content}
                          </div>
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground px-1">Sources:</p>
                              {msg.sources.map((src, j) => (
                                <div key={j} className="px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
                                  <p className="text-xs font-medium text-blue-400">{src.docName}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{src.snippet}…</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex gap-3 justify-start">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                          <Database className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                        <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-card border border-border">
                          <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border px-6 py-4 flex-shrink-0">
                    <div className="flex items-end gap-3 max-w-3xl mx-auto">
                      <textarea
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                        placeholder="Ask a question about your documents…"
                        data-testid="textarea-chat-input"
                        rows={2}
                        className="flex-1 px-4 py-3 rounded-xl bg-muted/40 border border-border text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-blue-500/50 resize-none leading-relaxed"
                      />
                      <button
                        onClick={sendChat}
                        disabled={!chatInput.trim() || chatLoading}
                        data-testid="button-send-chat"
                        className="p-3 rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-all flex-shrink-0"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground/50 text-center mt-2">Enter to send · Shift+Enter for new line</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
