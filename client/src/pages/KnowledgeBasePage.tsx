import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  BookOpen, Plus, Trash2, ArrowLeft, FileText, MessageSquare,
  Loader2, Send, X, ChevronRight, Database, Search, Zap, AlertCircle, Upload,
  Share2, Check, Copy, Globe, Lock
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
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-12 space-y-10">

        {/* Hero */}
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/10 flex items-center justify-center mx-auto border border-blue-500/20 shadow-lg shadow-blue-500/10">
            <Database className="w-8 h-8 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Knowledge Base</h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              Your own private AI that knows <strong className="text-foreground">your documents</strong>. Upload anything — then ask questions and get instant answers from your own content.
            </p>
          </div>
        </div>

        {/* What is it in plain English */}
        <div className="rounded-2xl border border-blue-500/15 bg-blue-500/5 p-6 space-y-3">
          <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">What does this do?</p>
          <p className="text-sm text-foreground leading-relaxed">
            Imagine you have a 100-page manual, a research paper, or your company's entire documentation. Instead of searching through it manually, you just <strong>ask a question</strong> and the AI instantly finds and reads the right parts to give you an accurate answer — with citations showing exactly where it found the information.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The AI only uses <strong className="text-foreground">your documents</strong> — it won't make things up or pull information from the internet. Every answer is grounded in what you uploaded.
          </p>
        </div>

        {/* Real-world use cases */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Popular use cases</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                icon: <FileText className="w-4 h-4" />,
                color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
                title: "Company Docs & SOPs",
                desc: "Upload employee handbooks, procedures, or policies. Ask \"How do I submit a reimbursement?\" and get an instant cited answer.",
              },
              {
                icon: <BookOpen className="w-4 h-4" />,
                color: "text-violet-400 bg-violet-500/10 border-violet-500/20",
                title: "Research & Study Notes",
                desc: "Upload papers, textbooks, or lecture notes. Ask questions like \"What does the paper say about inflammation?\"",
              },
              {
                icon: <MessageSquare className="w-4 h-4" />,
                color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
                title: "Product Manuals & FAQs",
                desc: "Let customers or your team ask questions about your product and get precise answers pulled directly from the manual.",
              },
              {
                icon: <Zap className="w-4 h-4" />,
                color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
                title: "Legal & Contracts",
                desc: "Upload contracts, agreements, or legal documents. Ask \"What are the termination clauses?\" and find it in seconds.",
              },
            ].map(({ icon, color, title, desc }) => (
              <div key={title} className={`flex gap-3 p-4 rounded-xl border bg-card/40`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
                  {icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* How it works */}
        <div className="space-y-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">How it works — 3 simple steps</p>
          <div className="space-y-2">
            {[
              { step: "1", icon: <Plus className="w-4 h-4" />, title: "Create a Knowledge Base", desc: "Give it a name like \"Product Docs\" or \"Research Papers\". You can have multiple for different topics.", color: "bg-blue-500" },
              { step: "2", icon: <Upload className="w-4 h-4" />, title: "Add your documents", desc: "Paste text, upload PDFs, or type directly. Add as many documents as you need — each gets indexed automatically.", color: "bg-violet-500" },
              { step: "3", icon: <MessageSquare className="w-4 h-4" />, title: "Ask questions in Chat", desc: "Switch to the Chat tab and ask anything. The AI searches your documents, finds the relevant parts, and gives you a cited answer.", color: "bg-emerald-500" },
            ].map(({ step, icon, title, desc, color }) => (
              <div key={step} className="flex gap-4 p-4 rounded-xl border border-border/50 bg-card/30">
                <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                  {step}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground mb-0.5">{title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center pt-2 pb-6">
          <p className="text-xs text-muted-foreground/60 flex items-center justify-center gap-1.5">
            <ChevronRight className="w-3.5 h-3.5" />
            Click <strong className="text-foreground">+ New Knowledge Base</strong> in the sidebar to get started
          </p>
        </div>
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
  const [pdfUploading, setPdfUploading] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const handlePdfUpload = async (file: File) => {
    if (!file) return;
    setPdfUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract-pdf", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error("Failed to extract PDF");
      const { text } = await res.json();
      setDocContent(text);
      if (!docName) setDocName(file.name.replace(/\.pdf$/i, ""));
      toast({ description: "PDF text extracted — review and click Add & Index" });
    } catch {
      toast({ description: "Could not read PDF. Try copy-pasting the text instead.", variant: "destructive" });
    } finally {
      setPdfUploading(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

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

  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrlCopied, setShareUrlCopied] = useState(false);

  const shareKb = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/kb/${id}/share`).then(r => r.json()) as Promise<{ shareToken: string; shareUrl: string }>,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/kb"] }),
    onError: () => toast({ title: "Failed to share", variant: "destructive" }),
  });

  const unshareKb = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/kb/${id}/share`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/kb"] }); setShowShareModal(false); },
    onError: () => toast({ title: "Failed to unshare", variant: "destructive" }),
  });

  const copyShareLink = (url: string) => {
    navigator.clipboard.writeText(window.location.origin + url);
    setShareUrlCopied(true);
    setTimeout(() => setShareUrlCopied(false), 2000);
  };

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
      {/* Hidden PDF file input */}
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        data-testid="input-pdf-upload-kb"
        onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); }}
      />

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
          {/* Share modal */}
          {showShareModal && selectedKb && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowShareModal(false)}>
              <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-blue-400" /> Share Knowledge Base
                  </h3>
                  <button onClick={() => setShowShareModal(false)} className="p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {selectedKb.isPublic && selectedKb.shareToken ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
                      <Globe className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <p className="text-xs text-green-300">Anyone with the link can view and clone this knowledge base.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={`${window.location.origin}/kb/shared/${selectedKb.shareToken}`}
                        className="flex-1 px-3 py-2 rounded-lg bg-muted/40 border border-border text-xs text-foreground outline-none font-mono"
                      />
                      <button
                        onClick={() => copyShareLink(`/kb/shared/${selectedKb.shareToken}`)}
                        data-testid="button-copy-kb-link"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 transition-all flex-shrink-0"
                      >
                        {shareUrlCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {shareUrlCopied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <button
                      onClick={() => unshareKb.mutate(selectedKb.id)}
                      disabled={unshareKb.isPending}
                      data-testid="button-unshare-kb"
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-red-500/30 text-red-400 text-xs hover:bg-red-500/10 transition-all"
                    >
                      {unshareKb.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                      Stop sharing
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">Generate a public link so anyone can view and clone your knowledge base.</p>
                    <button
                      onClick={() => shareKb.mutate(selectedKb.id)}
                      disabled={shareKb.isPending}
                      data-testid="button-enable-share-kb"
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 transition-all disabled:opacity-50"
                    >
                      {shareKb.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                      Generate share link
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Header + tabs */}
          <div className="border-b border-border px-6 py-3 flex items-center justify-between flex-shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">{selectedKb?.name}</h2>
                {selectedKb?.isPublic && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 text-[10px] font-medium">
                    <Globe className="w-2.5 h-2.5" /> Shared
                  </span>
                )}
              </div>
              {selectedKb?.description && <p className="text-xs text-muted-foreground mt-0.5">{selectedKb.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowShareModal(true)}
                data-testid="button-share-kb"
                title="Share knowledge base"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-border/60 transition-all"
              >
                <Share2 className="w-3.5 h-3.5" /> Share
              </button>
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
                    <div className="relative">
                      <textarea
                        value={docContent}
                        onChange={e => setDocContent(e.target.value)}
                        placeholder="Paste your document content here, or upload a PDF below…"
                        data-testid="textarea-doc-content"
                        rows={10}
                        className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-blue-500/50 resize-none leading-relaxed"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => pdfInputRef.current?.click()}
                        disabled={pdfUploading || addDoc.isPending}
                        data-testid="button-upload-pdf-kb"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border text-xs font-semibold text-foreground hover:bg-muted/80 transition-all disabled:opacity-50"
                      >
                        {pdfUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        {pdfUploading ? "Extracting…" : "Upload PDF"}
                      </button>
                      <p className="text-xs text-muted-foreground">{docContent.length > 0 ? `${docContent.length.toLocaleString()} characters · ~${Math.ceil(docContent.length / 800)} chunks` : "Supported: PDF, plain text"}</p>
                    </div>
                    <div className="flex items-center justify-end">
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
