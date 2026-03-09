import {
  useRef, useEffect, KeyboardEvent, useState, useCallback, DragEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowUp, Square, X, FileText, Image as ImageIcon, Camera,
  ClipboardPaste, Plus, File, ChevronDown, Zap, Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type Attachment, readFileAsAttachment, formatFileSize } from "@/lib/chat-storage";
import { type ModelId, MODELS } from "@/components/ModelSelector";

/* ─── accepted file types ────────────────────────────────────── */
const EXTS_ALL = ".jpg,.jpeg,.png,.gif,.webp,.txt,.md,.csv,.json,.pdf,.docx,.py,.ts,.tsx,.js,.jsx,.html,.css,.xml,.yaml,.yml,.sh,.rb,.go,.rs,.java,.cpp,.c,.php,.swift";
const EXTS_IMG = ".jpg,.jpeg,.png,.gif,.webp";

/* ─── menu items ─────────────────────────────────────────────── */
interface MenuItem {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
  action: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    id: "images",
    label: "Upload photos",
    description: "JPG, PNG, GIF, WebP",
    icon: <ImageIcon className="w-4 h-4" />,
    accent: "text-violet-400 bg-violet-500/10",
    action: "images",
  },
  {
    id: "any",
    label: "Upload files",
    description: "Images, PDFs, docs, code, and more",
    icon: <File className="w-4 h-4" />,
    accent: "text-blue-400 bg-blue-500/10",
    action: "any",
  },
  {
    id: "camera",
    label: "Take a photo",
    description: "Use your device camera",
    icon: <Camera className="w-4 h-4" />,
    accent: "text-pink-400 bg-pink-500/10",
    action: "camera",
  },
  {
    id: "clipboard",
    label: "Paste from clipboard",
    description: "Paste an image or text",
    icon: <ClipboardPaste className="w-4 h-4" />,
    accent: "text-cyan-400 bg-cyan-500/10",
    action: "clipboard",
  },
];

/* ─── props ──────────────────────────────────────────────────── */
interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (attachments: Attachment[]) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  model: ModelId;
  onModelChange: (model: ModelId) => void;
}

/* ═══════════════════════════════════════════════════════════════ */
export function ChatInput({ value, onChange, onSubmit, onStop, isStreaming, disabled, model, onModelChange }: ChatInputProps) {
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const allInputRef    = useRef<HTMLInputElement>(null);
  const imgInputRef    = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const menuRef        = useRef<HTMLDivElement>(null);
  const modelMenuRef   = useRef<HTMLDivElement>(null);

  const [attachments, setAttachments]     = useState<Attachment[]>([]);
  const [isDragOver, setIsDragOver]       = useState(false);
  const [isProcessing, setIsProcessing]   = useState(false);
  const [menuOpen, setMenuOpen]           = useState(false);
  const [modelOpen, setModelOpen]         = useState(false);
  const [clipError, setClipError]         = useState("");

  /* auto-resize textarea */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  /* close menus on outside click */
  useEffect(() => {
    if (!menuOpen && !modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) setModelOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen, modelOpen]);

  /* keyboard */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && (value.trim() || attachments.length > 0)) handleSend();
    }
    if (e.key === "Escape") setMenuOpen(false);
  };

  const handleSend = () => {
    if (isStreaming || (!value.trim() && attachments.length === 0)) return;
    const toSend = [...attachments];
    setAttachments([]);
    onSubmit(toSend);
  };

  /* process raw files */
  const processFiles = useCallback(async (files: FileList | File[]) => {
    setIsProcessing(true);
    const arr = Array.from(files).slice(0, 5);
    try {
      const results = await Promise.all(arr.map(readFileAsAttachment));
      setAttachments(prev => [...prev, ...results].slice(0, 5));
    } catch (e) {
      console.error("file read error", e);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) { processFiles(e.target.files); e.target.value = ""; }
  };

  /* drag-drop */
  const handleDragOver  = (e: DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: DragEvent) => { e.preventDefault(); setIsDragOver(false); };
  const handleDrop      = (e: DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  };

  /* clipboard paste */
  const handleClipboard = async () => {
    setMenuOpen(false);
    setClipError("");
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            files.push(new File([blob], `clipboard.${type.split("/")[1]}`, { type }));
          } else if (type === "text/plain") {
            const blob = await item.getType(type);
            const text = await blob.text();
            if (text.trim()) {
              onChange(value + (value ? "\n" : "") + text);
            }
          }
        }
      }
      if (files.length) processFiles(files);
      else if (!document.hasFocus()) setClipError("Focus the page then try again.");
    } catch {
      setClipError("Clipboard access denied. Allow clipboard permission and try again.");
    }
  };

  /* menu action dispatch */
  const handleMenuAction = (action: string) => {
    setMenuOpen(false);
    switch (action) {
      case "images":    imgInputRef.current?.click();    break;
      case "camera":    cameraInputRef.current?.click(); break;
      case "clipboard": handleClipboard();               break;
      case "any":       allInputRef.current?.click();    break;
    }
  };

  const removeAttachment = (id: string) => setAttachments(prev => prev.filter(a => a.id !== id));
  const canSubmit = (value.trim().length > 0 || attachments.length > 0) && !isStreaming && !disabled && !isProcessing;

  return (
    <div className="px-4 pb-5 pt-2">
      <div className="relative max-w-3xl mx-auto">

        {/* ── hidden file inputs ─────────────────────────── */}
        <input ref={allInputRef}    type="file" multiple accept={EXTS_ALL} className="hidden" onChange={handleInputChange} />
        <input ref={imgInputRef}    type="file" multiple accept={EXTS_IMG} className="hidden" onChange={handleInputChange} />
        <input ref={cameraInputRef} type="file" accept={EXTS_IMG} capture="environment" className="hidden" onChange={handleInputChange} />

        {/* ── main input card ────────────────────────────── */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative rounded-2xl border transition-all duration-200 shadow-lg bg-card",
            isDragOver        ? "border-primary/60 shadow-primary/15 ring-2 ring-primary/20"
            : isStreaming     ? "border-primary/25"
                              : "border-card-border focus-within:border-border focus-within:shadow-xl"
          )}
        >
          {/* drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-10 rounded-2xl bg-primary/5 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-2 text-primary/70">
                <ImageIcon className="w-7 h-7" />
                <p className="text-sm font-medium">Drop to attach</p>
              </div>
            </div>
          )}

          {/* attachment chips */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3 pb-1">
              {attachments.map(att => (
                <AttachmentChip key={att.id} attachment={att} onRemove={() => removeAttachment(att.id)} />
              ))}
            </div>
          )}

          {/* textarea */}
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isDragOver ? "Drop to attach…" : "Message Claude…"}
            disabled={disabled}
            rows={1}
            data-testid="input-message"
            className={cn(
              "w-full resize-none border-0 bg-transparent text-sm leading-relaxed",
              "focus-visible:ring-0 focus-visible:ring-offset-0",
              "min-h-[52px] max-h-[220px] py-3.5 px-4",
              "placeholder:text-muted-foreground/40 text-foreground/90"
            )}
          />

          {/* toolbar */}
          <div className="flex items-center justify-between px-3 pb-2.5 gap-2">

            {/* ── left: model pill + attach button ──────────── */}
            <div className="flex items-center gap-1.5">

              {/* model selector pill */}
              <div className="relative" ref={modelMenuRef}>
                <button
                  onClick={() => { setModelOpen(o => !o); setMenuOpen(false); }}
                  disabled={disabled || isStreaming}
                  data-testid="button-model-selector"
                  className={cn(
                    "flex items-center gap-1.5 h-8 px-3 rounded-xl border text-sm font-medium transition-all",
                    modelOpen
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "border-border/40 text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 hover:border-border/60",
                    "disabled:opacity-30 disabled:cursor-not-allowed"
                  )}
                >
                  <span>{MODELS.find(m => m.id === model)?.label ?? "Claude"}</span>
                  <ChevronDown className={cn("w-3.5 h-3.5 opacity-60 transition-transform duration-200", modelOpen && "rotate-180")} />
                </button>

                {/* model dropdown */}
                {modelOpen && (
                  <div className="absolute bottom-full left-0 mb-2 z-50 animate-fade-up">
                    <div className="w-64 rounded-2xl border border-border/60 bg-popover shadow-2xl overflow-hidden p-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-3 py-1.5">
                        Model
                      </p>
                      {MODELS.map(m => (
                        <button
                          key={m.id}
                          onClick={() => { onModelChange(m.id); setModelOpen(false); }}
                          data-testid={`option-model-${m.id}`}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors group",
                            m.id === model ? "bg-primary/8 text-primary" : "hover:bg-muted/50"
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                            m.id === "claude-sonnet" ? "bg-violet-500/10 text-violet-400" : "bg-amber-500/10 text-amber-400"
                          )}>
                            {m.id === "claude-sonnet" ? <Zap className="w-4 h-4" /> : <Brain className="w-4 h-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm font-medium leading-none mb-0.5", m.id === model ? "text-primary" : "text-foreground/90 group-hover:text-foreground")}>
                              {m.label}
                            </p>
                            <p className="text-[11px] text-muted-foreground/60 leading-none">
                              {m.id === "claude-sonnet" ? "Fast & capable" : "Most intelligent"}
                            </p>
                          </div>
                          {m.id === model && (
                            <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* divider */}
              <div className="w-px h-4 bg-border/40" />

              {/* "+" attach button */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => { setMenuOpen(o => !o); setModelOpen(false); }}
                  disabled={disabled || isStreaming}
                  data-testid="button-attach-menu"
                  title="Attach"
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-xl border transition-all",
                    menuOpen
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "border-border/40 text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/40 hover:border-border/60",
                    "disabled:opacity-30 disabled:cursor-not-allowed"
                  )}
                >
                  <Plus className={cn("w-4 h-4 transition-transform duration-200", menuOpen && "rotate-45")} />
                </button>

                {/* attach popup */}
                {menuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 z-50 animate-fade-up">
                    <div className="w-72 rounded-2xl border border-border/60 bg-popover shadow-2xl overflow-hidden p-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-3 py-1.5">
                        Attach
                      </p>
                      {MENU_ITEMS.map(item => (
                        <button
                          key={item.id}
                          onClick={() => handleMenuAction(item.action)}
                          data-testid={`menu-item-${item.id}`}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-muted/50 transition-colors group"
                        >
                          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", item.accent)}>
                            {item.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground/90 group-hover:text-foreground leading-none mb-0.5">
                              {item.label}
                            </p>
                            <p className="text-[11px] text-muted-foreground/60 leading-none">{item.description}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {isProcessing && (
                <span className="text-[11px] text-muted-foreground/50 animate-pulse">Reading…</span>
              )}
              {clipError && (
                <span className="text-[11px] text-destructive/80 max-w-[160px] truncate" title={clipError}>
                  {clipError}
                </span>
              )}
            </div>

            {/* ── right: send / stop ────────────────────────── */}
            <div className="flex items-center gap-2">
              {isStreaming ? (
                <Button
                  size="icon"
                  variant="secondary"
                  onClick={onStop}
                  data-testid="button-stop"
                  className="h-8 w-8 rounded-xl shadow-sm"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!canSubmit}
                  data-testid="button-send"
                  className={cn("h-8 w-8 rounded-xl shadow-sm transition-all", !canSubmit && "opacity-25")}
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted-foreground/30 mt-2.5 select-none">
          Claude may make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}

/* ─── attachment chip ─────────────────────────────────────────── */
function AttachmentChip({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  if (attachment.type === "image") {
    return (
      <div className="relative group rounded-xl overflow-hidden border border-border/50 shadow-sm flex-shrink-0">
        <img src={attachment.data} alt={attachment.name} className="h-16 w-16 object-cover" />
        <button
          onClick={onRemove}
          data-testid="button-remove-attachment"
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-3 h-3" />
        </button>
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 px-1.5 py-0.5">
          <p className="text-[9px] text-white truncate">{attachment.name}</p>
        </div>
      </div>
    );
  }

  const iconColor =
    attachment.mimeType === "application/pdf"                              ? "text-red-400 bg-red-500/10"
    : attachment.name.match(/\.(py|js|ts|tsx|jsx|html|css|json|yaml)$/)   ? "text-emerald-400 bg-emerald-500/10"
    : attachment.mimeType?.includes("spreadsheet") || attachment.name.match(/\.(csv|xlsx)$/) ? "text-orange-400 bg-orange-500/10"
    : "text-blue-400 bg-blue-500/10";

  return (
    <div className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-xl bg-muted/40 border border-border/50 group max-w-[180px]">
      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0", iconColor)}>
        <FileText className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground/80 truncate">{attachment.name}</p>
        <p className="text-[10px] text-muted-foreground/60">{formatFileSize(attachment.size)}</p>
      </div>
      <button
        onClick={onRemove}
        data-testid="button-remove-attachment"
        className="flex-shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
