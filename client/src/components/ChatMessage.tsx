import { useState, useRef, useEffect, memo, lazy, Suspense, type ReactNode, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Copy, Check, User, RefreshCw, FileText, Pencil, X, ThumbsUp, ThumbsDown, Terminal, GitFork, Quote, Loader2, Table as TableIcon, ChevronDown, ChevronUp, ExternalLink, Download, Volume2, VolumeX, Pin, Eye, Code2, RotateCcw, Search, Hash, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message, ToolCall } from "@/lib/chat-storage";
import { BADGE_STYLE } from "@/components/ModelSelector";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import Papa from "papaparse";

const CodeBlock = lazy(() => import("@/components/CodeBlock"));

const LANG_COLORS: Record<string, string> = {
  python: "text-blue-400",
  javascript: "text-yellow-400",
  typescript: "text-blue-300",
  js: "text-yellow-400",
  ts: "text-blue-300",
  jsx: "text-cyan-400",
  tsx: "text-cyan-300",
  html: "text-orange-400",
  css: "text-pink-400",
  sql: "text-emerald-400",
  bash: "text-green-400",
  sh: "text-green-400",
  json: "text-amber-400",
  rust: "text-orange-500",
  go: "text-cyan-400",
  java: "text-red-400",
  cpp: "text-purple-400",
  c: "text-purple-300",
  ruby: "text-red-500",
  php: "text-violet-400",
  swift: "text-orange-400",
  kotlin: "text-violet-500",
};

function CopyCodeButton({ text, always = false }: { text: string; always?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      data-testid="button-copy-code"
      title="Copy code"
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
        copied
          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
          : "bg-white/5 text-zinc-400 border border-white/8 hover:bg-white/10 hover:text-zinc-200 hover:border-white/15"
      )}
    >
      {copied ? (
        <><Check className="w-3 h-3" /><span>Copied!</span></>
      ) : (
        <><Copy className="w-3 h-3" /><span>Copy</span></>
      )}
    </button>
  );
}

function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    import("mermaid").then((mod) => {
      const mermaid = mod.default;
      mermaid.initialize({ startOnLoad: false, theme: "dark", darkMode: true });
      const id = "mermaid-" + Math.random().toString(36).slice(2);
      mermaid.render(id, code).then(({ svg: rendered }) => {
        if (!cancelled) setSvg(rendered);
      }).catch((e: Error) => {
        if (!cancelled) setError(e.message || "Diagram render failed");
      });
    });
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <div className="my-4 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-xs text-red-400 font-mono">
        Mermaid error: {error}
      </div>
    );
  }
  if (!svg) {
    return (
      <div className="my-4 rounded-xl border border-border bg-muted/20 p-6 flex items-center justify-center text-xs text-muted-foreground gap-2">
        <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
        Rendering diagram…
      </div>
    );
  }
  return (
    <div
      className="my-4 rounded-xl border border-border/60 bg-muted/10 p-4 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
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

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onFork?: (messageId: string) => void;
  onQuoteReply?: (messageId: string, snippet: string) => void;
  isLast?: boolean;
  conversationId?: string;
  assistantName?: string;
  fontSize?: string;
  searchQuery?: string;
  showTokenUsage?: boolean;
}

function highlightText(text: string, query: string): ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="search-highlight bg-yellow-300/70 dark:bg-yellow-500/50 text-foreground rounded-sm px-0.5">{part}</mark>
      : part
  );
}

function CSVTable({ data, filename }: { data: string; filename: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const csv = useMemo(() => {
    try {
      const decoded = atob(data.split(",")[1]);
      const results = Papa.parse(decoded, { header: true, skipEmptyLines: true });
      return {
        headers: results.meta.fields || [],
        rows: results.data as any[],
      };
    } catch (e) {
      console.error("CSV parse error", e);
      return null;
    }
  }, [data]);

  if (!csv) return null;

  return (
    <div className="my-2 rounded-xl border border-border/40 bg-muted/20 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <TableIcon className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold text-foreground/90">{filename}</p>
            <p className="text-[10px] text-muted-foreground/70">{csv.rows.length} rows</p>
          </div>
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground/50" /> : <ChevronDown className="w-4 h-4 text-muted-foreground/50" />}
      </button>

      {isExpanded && (
        <div className="border-t border-border/20 animate-fade-in">
          <div className="overflow-x-auto max-h-[400px]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10 border-b border-border/40">
                <tr>
                  {csv.headers.map((h, i) => (
                    <th key={i} className="px-4 py-2 text-left font-semibold text-foreground/70 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 bg-card/50">
                {csv.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    {csv.headers.map((h, j) => (
                      <td key={j} className="px-4 py-2 text-foreground/80 whitespace-nowrap">
                        {row[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {csv.rows.length > 50 && (
            <div className="px-4 py-1.5 border-t border-border/20 bg-muted/20 text-center">
              <p className="text-[10px] text-muted-foreground/50 italic">Showing all {csv.rows.length} rows</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ARTIFACT_LANGS = new Set(["html", "svg"]);

function ArtifactBlock({ code, lang, langColor }: { code: string; lang: string; langColor: string }) {
  const [activeTab, setActiveTab] = useState<"code" | "preview">("code");
  const [iframeKey, setIframeKey] = useState(0);

  const handleOpenNew = () => {
    const mime = lang === "svg" ? "image/svg+xml" : "text/html";
    const url = URL.createObjectURL(new Blob([code], { type: mime }));
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div className="relative rounded-xl overflow-hidden my-4 border border-white/12 shadow-xl bg-[#181a24]" data-testid={`artifact-block-${lang}`}>
      {/* Header */}
      <div className="flex items-center justify-between bg-[#13151e] border-b border-white/6 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
          </div>
          <span className={cn("text-[11px] font-mono font-semibold tracking-wider uppercase flex items-center gap-1.5", langColor)}>
            <Terminal className="w-3 h-3 text-zinc-500" /> {lang}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("code")}
            data-testid="artifact-tab-code"
            className={cn("flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors", activeTab === "code" ? "bg-white/15 text-white" : "text-zinc-400 hover:text-zinc-200")}
          >
            <Code2 className="w-3 h-3" /> Code
          </button>
          <button
            onClick={() => setActiveTab("preview")}
            data-testid="artifact-tab-preview"
            className={cn("flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors", activeTab === "preview" ? "bg-white/15 text-white" : "text-zinc-400 hover:text-zinc-200")}
          >
            <Eye className="w-3 h-3" /> Preview
          </button>
          {activeTab === "preview" && (
            <button onClick={() => setIframeKey((k) => k + 1)} className="px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-zinc-200" title="Refresh preview">
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
          <button onClick={handleOpenNew} className="px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-zinc-200 ml-1" title="Open in new tab">
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === "code" ? (
        <>
          <Suspense fallback={<pre className="bg-[#181a24] text-[#e2e8f0] font-mono text-[0.8125rem] p-5 overflow-auto m-0 leading-relaxed">{code}</pre>}>
            <CodeBlock code={code} language={lang} />
          </Suspense>
          <div className="flex items-center justify-between bg-[#13151e] border-t border-white/5 px-4 py-1.5">
            <span className="text-[10px] text-zinc-600 font-mono">{code.split("\n").length} lines</span>
            <span className="text-[10px] text-zinc-600">{code.length} chars</span>
          </div>
        </>
      ) : (
        <iframe
          key={iframeKey}
          srcDoc={code}
          sandbox="allow-scripts allow-forms allow-same-origin"
          className="w-full border-0 bg-white"
          style={{ height: "420px", display: "block" }}
          title="artifact-preview"
          data-testid="artifact-iframe"
        />
      )}
    </div>
  );
}

function ToolCallsDisplay({ toolCalls, isStreaming }: { toolCalls: ToolCall[]; isStreaming?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const hasPending = toolCalls.some((tc) => tc.result === undefined);

  return (
    <div className="mb-3 rounded-xl border border-border/40 bg-muted/30 overflow-hidden text-sm">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
        data-testid="button-toggle-tool-calls"
      >
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {toolCalls.map((tc, i) => (
            <span key={i} className="flex items-center gap-1 bg-background/60 border border-border/30 rounded-md px-2 py-0.5 text-xs font-medium text-foreground/70">
              {tc.name === "web_search" ? (
                <Search className="w-3 h-3 text-blue-400 shrink-0" />
              ) : (
                <Hash className="w-3 h-3 text-green-400 shrink-0" />
              )}
              {tc.name === "web_search" ? "Web search" : "Calculator"}
            </span>
          ))}
          {hasPending && isStreaming && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              Running…
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border/30 divide-y divide-border/20">
          {toolCalls.map((tc, i) => (
            <div key={i} className="px-3 py-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                {tc.name === "web_search" ? (
                  <Search className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                ) : (
                  <Hash className="w-3.5 h-3.5 text-green-400 shrink-0" />
                )}
                <span className="font-medium text-foreground/80">
                  {tc.name === "web_search" ? "Searched the web" : "Calculated"}
                </span>
              </div>
              <div className="pl-5 space-y-1">
                <p className="text-xs text-muted-foreground font-mono bg-background/50 rounded px-2 py-1 border border-border/20">
                  {tc.name === "web_search" ? tc.input.query : tc.input.expression}
                </p>
                {tc.result !== undefined ? (
                  <p className="text-xs text-foreground/60 leading-relaxed line-clamp-4">{tc.result}</p>
                ) : (
                  <p className="text-xs text-muted-foreground animate-pulse">Fetching results…</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChatMessageInner({ message, isStreaming, onRegenerate, onEdit, onFork, onQuoteReply, isLast, conversationId, assistantName = "Assistant", fontSize = "normal", searchQuery = "", showTokenUsage = false }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [localReaction, setLocalReaction] = useState<string | null>(message.reaction ?? null);
  const [localIsPinned, setLocalIsPinned] = useState(message.isPinned ?? false);
  const [isForkLoading, setIsForkLoading] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const fontClass = fontSize === "compact" ? "text-xs" : fontSize === "large" ? "text-base" : "text-sm";

  const showThinkingIndicator = !isUser && isStreaming && message.content === "";

  useEffect(() => {
    setLocalReaction(message.reaction ?? null);
  }, [message.reaction]);

  useEffect(() => {
    setLocalIsPinned(message.isPinned ?? false);
  }, [message.isPinned]);

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.setSelectionRange(editRef.current.value.length, editRef.current.value.length);
    }
  }, [isEditing]);

  const reactionMutation = useMutation({
    mutationFn: async (reaction: string | null) => {
      if (!conversationId) return;
      await apiRequest("PATCH", `/api/conversations/${conversationId}/messages/${message.id}/reaction`, { reaction });
    },
    onMutate: (reaction) => { setLocalReaction(reaction); },
    onSuccess: () => {
      if (conversationId) {
        queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      }
    },
  });

  const pinMutation = useMutation({
    mutationFn: async (isPinned: boolean) => {
      if (!conversationId) return;
      await apiRequest("PATCH", `/api/conversations/${conversationId}/messages/${message.id}/pin`, { isPinned });
    },
    onMutate: (isPinned) => { setLocalIsPinned(isPinned); },
    onSuccess: () => {
      if (conversationId) {
        queryClient.invalidateQueries({ queryKey: ["/api/conversations", conversationId, "messages"] });
      }
    },
  });

  const handleTogglePin = () => {
    pinMutation.mutate(!localIsPinned);
  };

  const handleReaction = (r: "up" | "down") => {
    const next = localReaction === r ? null : r;
    reactionMutation.mutate(next);
  };

  const handleCopyResponse = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditSave = () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === message.content) { setIsEditing(false); return; }
    onEdit?.(message.id, trimmed);
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setEditValue(message.content);
    setIsEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleEditSave(); }
    if (e.key === "Escape") handleEditCancel();
  };

  const [isSpeaking, setIsSpeaking] = useState(false);

  const stripMarkdown = (text: string) => {
    return text
      .replace(/!\[.*?\]\(.*?\)/g, "") // images
      .replace(/\[(.*?)\]\(.*?\)/g, "$1") // links
      .replace(/(`{3})[\s\S]*?\1/g, "") // code blocks
      .replace(/`.*?`/g, "") // inline code
      .replace(/[#*`_~]/g, "") // formatting
      .replace(/>+/g, "") // quotes
      .replace(/\|.*?\|/g, "") // tables
      .trim();
  };

  const handleToggleSpeech = () => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(stripMarkdown(message.content));
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  useEffect(() => {
    return () => {
      if (isSpeaking) window.speechSynthesis.cancel();
    };
  }, [isSpeaking]);

  if (isUser) {
    return (
      <div
        data-testid={`message-${message.id}`}
        className="flex justify-end px-4 py-2 animate-fade-up group/user-msg"
        onMouseEnter={() => setActionsVisible(true)}
        onMouseLeave={() => setActionsVisible(false)}
      >
        <div className="flex items-end gap-2.5 max-w-[90%] sm:max-w-[78%]">
          <div className="flex flex-col gap-2">
            {message.attachments?.filter(a => a.type === "image").map(att => (
              <div key={att.id} className="rounded-2xl overflow-hidden shadow-md">
                <img src={att.data} alt={att.name} className="max-w-[280px] max-h-[280px] object-cover" />
              </div>
            ))}
            {message.attachments?.filter(a => a.type !== "image").map(att => {
              const isPdf = att.mimeType === "application/pdf";
              const isCsv = att.name.endsWith(".csv");

              if (isCsv) {
                return <CSVTable key={att.id} data={att.data} filename={att.name} />;
              }

              {/* Parse page count from extracted PDF data prefix */}
              const pdfMeta = isPdf ? att.data.match(/^\s*PDF:[^(]*\((\d+) pages?\)/) : null;
              const pageCount = pdfMeta ? parseInt(pdfMeta[1]) : null;
              const fileTypeLabel = isPdf
                ? (pageCount ? `PDF · ${pageCount} page${pageCount !== 1 ? "s" : ""}` : "PDF Document")
                : `${att.type} file`;
              return (
                <div key={att.id} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-primary/15 border border-primary/20 min-w-[200px]">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", isPdf ? "bg-red-500/10" : "bg-primary/20")}>
                    {isPdf ? <FileText className="w-4 h-4 text-red-500" /> : <FileText className="w-4 h-4 text-primary/80" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground/90 truncate" title={att.name}>{att.name}</p>
                    <p className="text-[10px] text-muted-foreground/70">{fileTypeLabel}</p>
                  </div>
                </div>
              );
            })}

            {isEditing ? (
              <div className="flex flex-col gap-2">
                <textarea
                  ref={editRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  rows={Math.max(2, editValue.split("\n").length)}
                  data-testid="input-edit-message"
                  className="px-4 py-3 rounded-2xl rounded-br-sm border border-primary/40 bg-primary/10 text-sm text-foreground leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-[200px] max-w-[360px]"
                />
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={handleEditCancel} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-3 h-3" /> Cancel
                  </button>
                  <button onClick={handleEditSave} data-testid="button-save-edit" className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity">
                    <Check className="w-3 h-3" /> Save & Resend
                  </button>
                </div>
              </div>
            ) : (
              <>
                {message.content && (
                  <div className="relative group/bubble">
                    <div className={cn("px-4 py-3 rounded-2xl rounded-br-sm bg-primary text-primary-foreground leading-relaxed shadow-md", fontClass)} data-testid="content-user">
                      <p className="whitespace-pre-wrap break-words font-[450]">{highlightText(message.content, searchQuery)}</p>
                      {localIsPinned && (
                        <div className="absolute -top-2 -left-2 bg-yellow-500 rounded-full p-1 shadow-sm border border-background">
                          <Pin className="w-3 h-3 text-white fill-current" />
                        </div>
                      )}
                    </div>
                    <div className={cn("absolute -left-20 top-1/2 -translate-y-1/2 flex items-center gap-0.5 transition-all", actionsVisible ? "opacity-100" : "opacity-0")}>
                      <button
                        onClick={handleTogglePin}
                        data-testid={`button-pin-message-${message.id}`}
                        title={localIsPinned ? "Unpin message" : "Pin message"}
                        className={cn(
                          "p-1.5 rounded-lg transition-all",
                          localIsPinned ? "text-yellow-500 bg-yellow-500/10" : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        <Pin className={cn("w-3.5 h-3.5", localIsPinned && "fill-current")} />
                      </button>
                      {onFork && (
                        <button
                          onClick={async () => {
                            setIsForkLoading(true);
                            try { await onFork(message.id); } finally { setIsForkLoading(false); }
                          }}
                          data-testid={`button-fork-message-${message.id}`}
                          title="Fork from here"
                          className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 transition-all"
                          disabled={isForkLoading}
                        >
                          {isForkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitFork className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      {onEdit && (
                        <button
                          onClick={() => { setEditValue(message.content); setIsEditing(true); }}
                          data-testid={`button-edit-message-${message.id}`}
                          title="Edit message"
                          className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 transition-all"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          {!isEditing && (
            <div className="w-7 h-7 rounded-full bg-foreground/10 border border-border flex items-center justify-center flex-shrink-0 mb-0.5">
              <User className="w-3.5 h-3.5 text-foreground/60" />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={`message-${message.id}`}
      className="flex gap-3 px-4 py-4 animate-fade-up group/message"
      onMouseEnter={() => setActionsVisible(true)}
      onMouseLeave={() => setActionsVisible(false)}
    >
      <AILogo />
      <div className="flex-1 min-w-0 pt-0.5">
        {/* Assistant name row */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-semibold text-foreground/50 uppercase tracking-widest">{assistantName}</span>
        </div>

        <div className={cn("leading-relaxed text-foreground/90 relative", fontClass)} data-testid="content-assistant">
          {localIsPinned && (
            <div className="absolute -top-3 -left-10 bg-yellow-500 rounded-full p-1 shadow-sm border border-background z-10">
              <Pin className="w-3 h-3 text-white fill-current" />
            </div>
          )}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <ToolCallsDisplay toolCalls={message.toolCalls} isStreaming={isStreaming} />
          )}
          {message.searching && (
            <div className="flex items-center gap-2 py-2 text-sky-400/80 text-sm" data-testid="status-searching">
              <Globe className="w-3.5 h-3.5 animate-pulse" />
              <span>Searching the web for <em className="font-medium not-italic">{message.searching}</em>…</span>
            </div>
          )}
          {message.content === "" && isStreaming && (!message.toolCalls || message.toolCalls.length === 0) && !message.searching ? (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-muted/30 border border-border/40 w-fit animate-fade-up shadow-sm">
              <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary typing-dot" />
                <div className="w-1.5 h-1.5 rounded-full bg-primary typing-dot" />
                <div className="w-1.5 h-1.5 rounded-full bg-primary typing-dot" />
              </div>
              <span className="text-xs font-medium text-muted-foreground">Thinking…</span>
            </div>
          ) : (
            <div className="max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const codeString = String(children).replace(/\n$/, "");

                    if (match?.[1] === "mermaid") {
                      return <MermaidBlock code={codeString} />;
                    }

                    if (!match) {
                      return (
                        <code className="bg-muted/60 text-foreground/90 rounded-md px-1.5 py-0.5 font-mono text-[0.85em] border border-border/40" {...props}>
                          {children}
                        </code>
                      );
                    }

                    const lang = match[1].toLowerCase();
                    const langColor = LANG_COLORS[lang] ?? "text-zinc-400";

                    if (ARTIFACT_LANGS.has(lang)) {
                      return <ArtifactBlock code={codeString} lang={lang} langColor={langColor} />;
                    }

                    return (
                      <div className="relative rounded-xl overflow-hidden my-4 border border-white/12 shadow-xl bg-[#181a24]" data-testid={`code-block-${lang}`}>
                        {/* Header bar */}
                        <div className="flex items-center justify-between bg-[#13151e] border-b border-white/6 px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            {/* Traffic lights */}
                            <div className="flex gap-1.5">
                              <div className="w-3 h-3 rounded-full bg-red-500/70 hover:bg-red-500 transition-colors" />
                              <div className="w-3 h-3 rounded-full bg-yellow-500/70 hover:bg-yellow-500 transition-colors" />
                              <div className="w-3 h-3 rounded-full bg-green-500/70 hover:bg-green-500 transition-colors" />
                            </div>
                            {/* Language badge */}
                            <div className="flex items-center gap-1.5">
                              <Terminal className="w-3 h-3 text-zinc-500" />
                              <span className={cn("text-[11px] font-mono font-semibold tracking-wider uppercase", langColor)}>
                                {lang}
                              </span>
                            </div>
                          </div>
                          {/* Copy button — always visible */}
                          <CopyCodeButton text={codeString} always />
                        </div>

                        {/* Code content */}
                        <Suspense fallback={
                          <pre className="bg-[#181a24] text-[#e2e8f0] font-mono text-[0.8125rem] p-5 overflow-auto m-0 leading-relaxed">
                            {codeString}
                          </pre>
                        }>
                          <CodeBlock code={codeString} language={lang} />
                        </Suspense>

                        {/* Bottom bar with line count */}
                        <div className="flex items-center justify-between bg-[#13151e] border-t border-white/5 px-4 py-1.5">
                          <span className="text-[10px] text-zinc-600 font-mono">
                            {codeString.split("\n").length} line{codeString.split("\n").length !== 1 ? "s" : ""}
                          </span>
                          <span className="text-[10px] text-zinc-600">
                            {codeString.length} chars
                          </span>
                        </div>
                      </div>
                    );
                  },
                  pre({ children }) { return <>{children}</>; },
                  p({ children }) {
                    return <p className="mb-4 last:mb-0 leading-[1.8] text-foreground/90">{children}</p>;
                  },
                  ul({ children }) {
                    return (
                      <ul className="mb-4 last:mb-0 space-y-1.5 pl-1">
                        {children}
                      </ul>
                    );
                  },
                  ol({ children }) {
                    return (
                      <ol className="mb-4 last:mb-0 space-y-1.5 pl-1 list-decimal list-inside marker:text-primary/70 marker:font-semibold marker:text-sm">
                        {children}
                      </ol>
                    );
                  },
                  li({ children, ...props }) {
                    const isOrdered = (props as { ordered?: boolean }).ordered;
                    if (isOrdered) {
                      return (
                        <li className="leading-[1.8] text-foreground/95 pl-1" {...props}>
                          {children}
                        </li>
                      );
                    }
                    return (
                      <li className="flex items-start gap-2.5 leading-[1.8] text-foreground/95" {...(props as object)}>
                        <span className="mt-[0.55em] w-[5px] h-[5px] rounded-full bg-primary/60 flex-shrink-0" />
                        <span className="flex-1 min-w-0">{children}</span>
                      </li>
                    );
                  },
                  h1({ children }) {
                    return (
                      <h1 className="text-[1.3em] font-bold mb-4 mt-7 first:mt-0 tracking-tight text-foreground pb-2 border-b border-border/40">
                        {children}
                      </h1>
                    );
                  },
                  h2({ children }) {
                    return (
                      <h2 className="text-[1.15em] font-semibold mb-3 mt-6 first:mt-0 tracking-tight text-foreground flex items-center gap-2">
                        <span className="w-1 h-[1em] rounded-full bg-primary/70 inline-block flex-shrink-0" />
                        {children}
                      </h2>
                    );
                  },
                  h3({ children }) {
                    return (
                      <h3 className="text-[1.05em] font-semibold mb-2.5 mt-5 first:mt-0 text-foreground/90">
                        {children}
                      </h3>
                    );
                  },
                  blockquote({ children }) {
                    return (
                      <blockquote className="border-l-[3px] border-primary/60 pl-4 pr-3 py-0.5 my-4 bg-primary/5 rounded-r-xl">
                        <div className="text-foreground/88 leading-[1.8] italic">{children}</div>
                      </blockquote>
                    );
                  },
                  hr() { return <hr className="border-border/30 my-6" />; },
                  table({ children }) {
                    return (
                      <div className="overflow-x-auto my-4 rounded-xl border border-border/60 shadow-sm">
                        <table className="min-w-full text-sm border-collapse">{children}</table>
                      </div>
                    );
                  },
                  thead({ children }) {
                    return <thead className="bg-muted/60 border-b border-border">{children}</thead>;
                  },
                  tbody({ children }) {
                    return <tbody className="divide-y divide-border/40">{children}</tbody>;
                  },
                  tr({ children }) {
                    return <tr className="hover:bg-muted/30 transition-colors">{children}</tr>;
                  },
                  th({ children }) {
                    return (
                      <th className="px-4 py-3 text-left font-semibold text-foreground/70 text-xs uppercase tracking-wider">
                        {children}
                      </th>
                    );
                  },
                  td({ children }) {
                    return (
                      <td className="px-4 py-3 text-foreground/80">
                        {children}
                      </td>
                    );
                  },
                  a({ href, children }) {
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary transition-colors">
                        {children}
                      </a>
                    );
                  },
                  strong({ children }) {
                    return <strong className="font-semibold text-foreground">{children}</strong>;
                  },
                  em({ children }) {
                    return <em className="italic text-foreground/80">{children}</em>;
                  },
                  img({ src, alt }) {
                    return (
                      <span className="block my-3 relative group/img">
                        <img
                          src={src}
                          alt={alt || "Generated image"}
                          data-testid={`img-generated-${message.id}`}
                          className="rounded-xl max-w-full shadow-md border border-border/30"
                          style={{ maxHeight: "512px" }}
                        />
                        <button
                          onClick={() => {
                            if (!src) return;
                            const link = document.createElement("a");
                            link.href = src;
                            link.download = `generated-${Date.now()}.png`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                          data-testid={`button-download-overlay-${message.id}`}
                          className="absolute top-2 right-2 p-2 rounded-lg bg-black/50 backdrop-blur-md text-white opacity-0 group-hover/img:opacity-100 transition-opacity hover:bg-black/70"
                          title="Download image"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {src?.startsWith("data:") && (
                          <a
                            href={src}
                            download={`generated-${Date.now()}.png`}
                            data-testid={`button-download-image-${message.id}`}
                            className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg bg-muted/60 hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-colors border border-border/40"
                          >
                            <Download className="w-3 h-3" /> Download image
                          </a>
                        )}
                      </span>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && message.content && (
                <span className="inline-block w-[3px] h-[1.1em] bg-primary/70 ml-0.5 cursor-blink align-middle rounded-sm" />
              )}
            </div>
          )}
        </div>

        {/* Web search source cards */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 space-y-1.5" data-testid="section-sources">
            <div className="flex items-center gap-1.5 text-[11px] text-sky-400/70 font-medium uppercase tracking-wide mb-2">
              <Globe className="w-3 h-3" />
              Sources
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {message.sources.map((src, i) => (
                <a
                  key={i}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`link-source-${i}`}
                  className="group flex flex-col gap-0.5 p-2.5 rounded-lg border border-border/30 bg-muted/20 hover:bg-muted/40 hover:border-sky-500/30 transition-all text-xs"
                >
                  <span className="flex items-center gap-1 text-foreground/80 font-medium line-clamp-1 group-hover:text-sky-400 transition-colors">
                    <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground/60 group-hover:text-sky-400" />
                    {src.title || src.url}
                  </span>
                  {src.snippet && (
                    <span className="text-muted-foreground/60 line-clamp-2 leading-relaxed">{src.snippet}</span>
                  )}
                  <span className="text-muted-foreground/40 truncate mt-0.5">{src.url}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Stopped indicator */}
        {message.stopped && (
          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-amber-500/80 bg-amber-500/8 border border-amber-500/15 rounded-lg px-3 py-1.5 w-fit">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500/70 inline-block" />
            Response stopped early
          </div>
        )}

        {/* Action bar */}
        {!isStreaming && message.content && (
          <div
            className={cn(
              "flex items-center gap-0.5 mt-3 pt-2 border-t border-border/20 transition-all duration-150",
              actionsVisible || isLast ? "opacity-100" : "opacity-0"
            )}
          >
            {/* Pin/Unpin */}
            <button
              onClick={handleTogglePin}
              data-testid={`button-pin-message-${message.id}`}
              title={localIsPinned ? "Unpin message" : "Pin message"}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-all",
                localIsPinned
                  ? "text-yellow-500 bg-yellow-500/10"
                  : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50"
              )}
            >
              <Pin className={cn("w-3.5 h-3.5", localIsPinned && "fill-current")} />
              <span>{localIsPinned ? "Pinned" : "Pin"}</span>
            </button>

            {/* Speech */}
            <button
              onClick={handleToggleSpeech}
              data-testid={`button-speech-${message.id}`}
              title={isSpeaking ? "Stop speaking" : "Read aloud"}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs transition-all",
                isSpeaking
                  ? "text-primary bg-primary/10 animate-pulse"
                  : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50"
              )}
            >
              {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>{isSpeaking ? "Stop" : "Speak"}</span>
            </button>

            {/* Copy */}
            <button
              onClick={handleCopyResponse}
              data-testid="button-copy-response"
              title="Copy full response"
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 text-xs transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied!" : "Copy"}</span>
            </button>

            {/* Reactions */}
            <button
              onClick={() => handleReaction("up")}
              data-testid="button-reaction-up"
              title="Helpful"
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all",
                localReaction === "up"
                  ? "text-emerald-400 bg-emerald-500/10"
                  : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50"
              )}
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleReaction("down")}
              data-testid="button-reaction-down"
              title="Not helpful"
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all",
                localReaction === "down"
                  ? "text-red-400 bg-red-500/10"
                  : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50"
              )}
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>

            {/* Quote reply */}
            {onQuoteReply && (
              <button
                onClick={() => onQuoteReply(message.id, message.content.slice(0, 120))}
                data-testid={`button-quote-reply-${message.id}`}
                title="Reply to this message"
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 text-xs transition-all"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Regenerate */}
            {onRegenerate && isLast && (
              <button
                onClick={onRegenerate}
                data-testid="button-regenerate"
                title="Regenerate response"
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 text-xs transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Regenerate</span>
              </button>
            )}

            {/* Model badge */}
            {message.modelUsed && (() => {
              const style = BADGE_STYLE[message.modelUsed];
              if (!style) return null;
              return (
                <span
                  data-testid="badge-model-used"
                  className={cn(
                    "ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide",
                    style.bg, style.color
                  )}
                >
                  {message.modelUsed}
                </span>
              );
            })()}

            {/* Token badge */}
            {showTokenUsage && (message.outputTokens ?? 0) > 0 && (
              <span
                data-testid="badge-token-count"
                className="ml-auto text-[10px] text-muted-foreground/35 tabular-nums"
                title={`${message.inputTokens ?? 0} input / ${message.outputTokens ?? 0} output tokens`}
              >
                {fmtTokens(message.outputTokens ?? 0)} tok
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageInner, (prev, next) =>
  prev.message.content === next.message.content &&
  prev.message.modelUsed === next.message.modelUsed &&
  prev.message.reaction === next.message.reaction &&
  prev.message.stopped === next.message.stopped &&
  prev.isStreaming === next.isStreaming &&
  prev.isLast === next.isLast &&
  prev.assistantName === next.assistantName &&
  prev.fontSize === next.fontSize &&
  prev.searchQuery === next.searchQuery &&
  prev.showTokenUsage === next.showTokenUsage &&
  prev.onRegenerate === next.onRegenerate &&
  prev.onEdit === next.onEdit &&
  prev.onFork === next.onFork &&
  prev.onQuoteReply === next.onQuoteReply
);
