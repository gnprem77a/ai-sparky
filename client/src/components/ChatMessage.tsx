import { useState, useRef, useEffect, memo, lazy, Suspense } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check, User, RefreshCw, FileText, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/chat-storage";
import { BADGE_STYLE } from "@/components/ModelSelector";

const CodeBlock = lazy(() => import("@/components/CodeBlock"));

function CopyCodeButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-all">
      {copied
        ? <><Check className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">Copied</span></>
        : <><Copy className="w-3 h-3" /><span>Copy</span></>
      }
    </button>
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

interface ChatMessageProps {
  message: Message;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  onEdit?: (messageId: string, newContent: string) => void;
  isLast?: boolean;
}

function ChatMessageInner({ message, isStreaming, onRegenerate, onEdit, isLast }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.setSelectionRange(editRef.current.value.length, editRef.current.value.length);
    }
  }, [isEditing]);

  const handleCopyResponse = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditSave = () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === message.content) {
      setIsEditing(false);
      return;
    }
    onEdit?.(message.id, trimmed);
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setEditValue(message.content);
    setIsEditing(false);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleEditSave();
    }
    if (e.key === "Escape") handleEditCancel();
  };

  if (isUser) {
    return (
      <div
        data-testid={`message-${message.id}`}
        className="flex justify-end px-4 py-2 animate-fade-up group/user-msg"
        onMouseEnter={() => setActionsVisible(true)}
        onMouseLeave={() => setActionsVisible(false)}
      >
        <div className="flex items-end gap-2.5 max-w-[78%]">
          <div className="flex flex-col gap-2">
            {message.attachments?.filter(a => a.type === "image").map(att => (
              <div key={att.id} className="rounded-2xl overflow-hidden shadow-md">
                <img src={att.data} alt={att.name} className="max-w-[280px] max-h-[280px] object-cover" />
              </div>
            ))}
            {message.attachments?.filter(a => a.type !== "image").map(att => (
              <div key={att.id} className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-primary/15 border border-primary/20">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-primary/80" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground/90">{att.name}</p>
                  <p className="text-[10px] text-muted-foreground/70 capitalize">{att.type} file</p>
                </div>
              </div>
            ))}

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
                  <button
                    onClick={handleEditCancel}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                  <button
                    onClick={handleEditSave}
                    data-testid="button-save-edit"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                  >
                    <Check className="w-3 h-3" /> Save & Resend
                  </button>
                </div>
              </div>
            ) : (
              <>
                {message.content && (
                  <div className="relative group/bubble">
                    <div className="px-4 py-3 rounded-2xl rounded-br-sm bg-primary text-primary-foreground text-sm leading-relaxed shadow-md" data-testid="content-user">
                      <p className="whitespace-pre-wrap break-words font-[450]">{message.content}</p>
                    </div>
                    {onEdit && (
                      <button
                        onClick={() => { setEditValue(message.content); setIsEditing(true); }}
                        data-testid={`button-edit-message-${message.id}`}
                        title="Edit message"
                        className={cn(
                          "absolute -left-8 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 transition-all",
                          actionsVisible ? "opacity-100" : "opacity-0"
                        )}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
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
      className="flex gap-3 px-4 py-3 animate-fade-up group/message"
      onMouseEnter={() => setActionsVisible(true)}
      onMouseLeave={() => setActionsVisible(false)}
    >
      <AILogo />
      <div className="flex-1 min-w-0 pt-0.5">
        <div className="text-sm leading-relaxed text-foreground/90" data-testid="content-assistant">
          {message.content === "" && isStreaming ? (
            <div className="flex items-center gap-1.5 py-2">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground inline-block" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground inline-block" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground inline-block" />
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const codeString = String(children).replace(/\n$/, "");
                    if (!match) {
                      return (
                        <code className="bg-muted/80 text-foreground/90 rounded-md px-1.5 py-0.5 font-mono text-[0.8em] border border-border/50" {...props}>
                          {children}
                        </code>
                      );
                    }
                    return (
                      <div className="relative rounded-xl overflow-hidden my-4 border border-white/5 shadow-lg">
                        <div className="flex items-center justify-between bg-[#0a0a12] border-b border-white/5 px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                              <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                            </div>
                            <span className="text-[11px] text-zinc-500 font-mono ml-1.5 uppercase tracking-wider">{match[1]}</span>
                          </div>
                          <CopyCodeButton text={codeString} />
                        </div>
                        <Suspense fallback={
                          <pre className="bg-[#0a0a12] text-[#e2e8f0] font-mono text-[0.8125rem] p-5 overflow-auto m-0 leading-relaxed">
                            {codeString}
                          </pre>
                        }>
                          <CodeBlock code={codeString} language={match[1]} />
                        </Suspense>
                      </div>
                    );
                  },
                  pre({ children }) { return <>{children}</>; },
                  p({ children }) { return <p className="mb-3 last:mb-0 leading-7">{children}</p>; },
                  ul({ children }) { return <ul className="mb-3 last:mb-0 ml-5 list-disc space-y-1.5">{children}</ul>; },
                  ol({ children }) { return <ol className="mb-3 last:mb-0 ml-5 list-decimal space-y-1.5">{children}</ol>; },
                  li({ children }) { return <li className="leading-7">{children}</li>; },
                  h1({ children }) { return <h1 className="text-xl font-semibold mb-4 mt-6 first:mt-0 tracking-tight">{children}</h1>; },
                  h2({ children }) { return <h2 className="text-lg font-semibold mb-3 mt-5 first:mt-0 tracking-tight">{children}</h2>; },
                  h3({ children }) { return <h3 className="text-base font-semibold mb-2 mt-4 first:mt-0">{children}</h3>; },
                  blockquote({ children }) { return <blockquote className="border-l-2 border-primary/40 pl-4 italic text-muted-foreground my-4 leading-7">{children}</blockquote>; },
                  hr() { return <hr className="border-border my-6" />; },
                  table({ children }) {
                    return (
                      <div className="overflow-x-auto my-4 rounded-lg border border-border">
                        <table className="min-w-full text-sm border-collapse">{children}</table>
                      </div>
                    );
                  },
                  thead({ children }) { return <thead className="bg-muted/50">{children}</thead>; },
                  th({ children }) { return <th className="px-4 py-2.5 text-left font-semibold text-foreground/80 border-b border-border text-xs uppercase tracking-wide">{children}</th>; },
                  td({ children }) { return <td className="px-4 py-2.5 border-b border-border/50 last:border-0 text-foreground/80">{children}</td>; },
                  a({ href, children }) { return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary transition-colors">{children}</a>; },
                  strong({ children }) { return <strong className="font-semibold text-foreground">{children}</strong>; },
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

        {!isStreaming && message.content && (
          <div
            className={cn(
              "flex items-center gap-0.5 mt-2 transition-all duration-150",
              actionsVisible || isLast ? "opacity-100" : "opacity-0"
            )}
          >
            <button
              onClick={handleCopyResponse}
              data-testid="button-copy-response"
              title="Copy response"
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 text-xs transition-all"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied!" : "Copy"}</span>
            </button>
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
          </div>
        )}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageInner, (prev, next) =>
  prev.message.content === next.message.content &&
  prev.message.modelUsed === next.message.modelUsed &&
  prev.isStreaming === next.isStreaming &&
  prev.isLast === next.isLast &&
  prev.onRegenerate === next.onRegenerate &&
  prev.onEdit === next.onEdit
);
