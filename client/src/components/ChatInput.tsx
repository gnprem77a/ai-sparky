import {
  useRef, useEffect, KeyboardEvent, useState, useCallback, DragEvent, useMemo,
} from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowUp, Square, X, FileText, Image as ImageIcon, Camera,
  ClipboardPaste, Plus, File as FileIcon, ChevronDown, Lock,
  Table as TableIcon, Eye, Sparkles, Mic, MicOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type Attachment, readFileAsAttachment, formatFileSize } from "@/lib/chat-storage";
import { type ModelId, MODELS } from "@/components/ModelSelector";
import { useLanguage } from "@/lib/i18n";
import { PromptLibrary } from "@/components/PromptLibrary";
import Papa from "papaparse";

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
    icon: <FileIcon className="w-4 h-4" />,
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
  isPro?: boolean;
  quotedMessage?: { id: string; snippet: string };
  onClearQuote?: () => void;
  isImageMode?: boolean;
  onToggleImageMode?: () => void;
}

/* ═══════════════════════════════════════════════════════════════ */
export function ChatInput({ value, onChange, onSubmit, onStop, isStreaming, disabled, model, onModelChange, isPro = true, quotedMessage, onClearQuote, isImageMode = false, onToggleImageMode }: ChatInputProps) {
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const allInputRef    = useRef<HTMLInputElement>(null);
  const imgInputRef    = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const menuRef        = useRef<HTMLDivElement>(null);
  const modelMenuRef   = useRef<HTMLDivElement>(null);

  const { t } = useLanguage();
  const [attachments, setAttachments]     = useState<Attachment[]>([]);
  const [isDragOver, setIsDragOver]       = useState(false);
  const [isProcessing, setIsProcessing]   = useState(false);
  const [menuOpen, setMenuOpen]           = useState(false);
  const [modelOpen, setModelOpen]         = useState(false);
  const [clipError, setClipError]         = useState("");
  const [isRecording, setIsRecording]     = useState(false);
  const [interimText, setInterimText]     = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recognitionRef  = useRef<any>(null);
  const recordTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const committedRef    = useRef(""); // finalized transcript so far this session

  const supportsSpeechRecognition = !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    setIsRecording(false);
    setInterimText("");
    setRecordingSeconds(0);
    committedRef.current = "";
  }, []);

  const toggleRecording = () => {
    if (isRecording) { stopRecording(); return; }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new (SpeechRecognition as any)();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    committedRef.current = "";

    recognition.onstart = () => {
      setIsRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    };

    recognition.onend = () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      setIsRecording(false);
      setInterimText("");
      setRecordingSeconds(0);
      committedRef.current = "";
    };

    recognition.onerror = () => stopRecording();

    recognition.onresult = (event: any) => {
      let interim = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalChunk += res[0].transcript;
        else interim += res[0].transcript;
      }
      if (finalChunk) {
        committedRef.current += (committedRef.current ? " " : "") + finalChunk.trim();
        const base = value.trim();
        onChange((base ? base + " " : "") + committedRef.current);
      }
      setInterimText(interim);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

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
      const results = await Promise.all(arr.map(async (file) => {
        if (file.type === "application/pdf") {
          const formData = new FormData();
          formData.append("file", file);
          try {
            const resp = await fetch("/api/extract-pdf", { method: "POST", body: formData });
            if (resp.ok) {
              const { text, pageCount } = await resp.json();
              return {
                id: `${Date.now()}-${Math.random()}`,
                name: file.name,
                type: "file" as const,
                mimeType: "application/pdf",
                size: file.size,
                data: `PDF: ${file.name} (${pageCount} page${pageCount !== 1 ? "s" : ""})\n\n${text}`,
              };
            }
          } catch (e) {
            console.error("PDF extract error", e);
          }
        }
        return readFileAsAttachment(file);
      }));
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
            files.push(new File([blob], `clipboard.${type.split("/")[1]}`, { type: blob.type }));
          } else if (type === "text/plain") {
            const blob = await item.getType(type);
            const text = await blob.text();
            if (text.trim()) onChange(value + (value ? "\n" : "") + text);
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

  const effectiveModel = isPro ? model : "fast";
  const selectedModel = MODELS.find(m => m.id === effectiveModel) ?? MODELS[MODELS.length - 1];

  return (
    <div className="px-4 pb-5 pt-2">
      <div className="relative max-w-3xl mx-auto">

        {/* ── hidden file inputs ─────────────────────────── */}
        <input ref={allInputRef}    type="file" multiple accept={EXTS_ALL} className="hidden" onChange={handleInputChange} />
        <input ref={imgInputRef}    type="file" multiple accept={EXTS_IMG} className="hidden" onChange={handleInputChange} />
        <input ref={cameraInputRef} type="file" accept={EXTS_IMG} capture="environment" className="hidden" onChange={handleInputChange} />

        {/* ── voice recording panel ─────────────────────── */}
        {isRecording && (
          <div
            data-testid="div-voice-recording"
            className="flex items-center gap-3 mb-2 px-4 py-2.5 rounded-2xl bg-red-500/8 border border-red-500/20 text-xs"
          >
            <div className="flex items-center gap-[3px] flex-shrink-0">
              {[0.6, 1.0, 0.7, 0.9, 0.5, 0.8, 0.6].map((h, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-full bg-red-500 animate-voice-bar"
                  style={{ height: `${h * 18}px`, animationDelay: `${i * 80}ms` }}
                />
              ))}
            </div>
            <span className="flex-1 min-w-0 text-foreground/80 italic truncate">
              {interimText || "Listening…"}
            </span>
            <span className="tabular-nums text-red-500/70 flex-shrink-0">
              {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:{String(recordingSeconds % 60).padStart(2, "0")}
            </span>
            <button
              onClick={stopRecording}
              data-testid="button-stop-recording"
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/15 text-red-500 hover:bg-red-500/25 transition-colors flex-shrink-0 font-medium"
            >
              <Square className="w-2.5 h-2.5 fill-current" /> Stop
            </button>
          </div>
        )}

        {/* ── quote preview bar ──────────────────────────── */}
        {quotedMessage && (
          <div
            data-testid="div-quote-preview"
            className="flex items-start gap-2 mb-2 px-3 py-2 rounded-xl bg-muted/60 border border-border/40 text-xs text-muted-foreground"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-primary/70 mb-0.5 uppercase tracking-wide">Replying to</p>
              <p className="truncate leading-relaxed">{quotedMessage.snippet}{quotedMessage.snippet.length >= 120 ? "…" : ""}</p>
            </div>
            <button
              onClick={onClearQuote}
              data-testid="button-clear-quote"
              className="p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors flex-shrink-0 mt-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

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
            placeholder={isDragOver ? "Drop to attach…" : isImageMode ? "Describe an image to generate…" : t("input.placeholder")}
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

            {/* ── left: attach button + model pill ──────────── */}
            <div className="flex items-center gap-1.5">

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

              {/* Prompt library */}
              <PromptLibrary currentInput={value} onInsert={(content) => onChange(content)} />

              {/* divider */}
              <div className="w-px h-4 bg-border/40" />

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
                  <span className={cn("w-3.5 h-3.5 flex-shrink-0", modelOpen ? "text-primary" : selectedModel.iconColor)}>
                    {selectedModel.icon}
                  </span>
                  <span>{selectedModel.friendlyName}</span>
                  {!isPro && <Lock className="w-2.5 h-2.5 opacity-50" />}
                  <ChevronDown className={cn("w-3.5 h-3.5 opacity-60 transition-transform duration-200", modelOpen && "rotate-180")} />
                </button>

                {/* model dropdown */}
                {modelOpen && (
                  <div className="absolute bottom-full left-0 mb-2 z-50 animate-fade-up">
                    <div className="w-72 rounded-2xl border border-border/60 bg-popover shadow-2xl overflow-hidden p-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 px-3 py-1.5">
                        Model
                      </p>
                      {MODELS.map(m => {
                        const locked = m.proOnly && !isPro;
                        return (
                          <button
                            key={m.id}
                            onClick={() => {
                              if (locked) return;
                              onModelChange(m.id);
                              setModelOpen(false);
                            }}
                            disabled={locked}
                            data-testid={`option-model-${m.id}`}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors group",
                              m.id === effectiveModel ? "bg-primary/8" : "hover:bg-muted/50",
                              locked && "opacity-45 cursor-not-allowed"
                            )}
                          >
                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", m.iconBg, m.iconColor)}>
                              {m.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-1.5 mb-0.5">
                                <p className={cn("text-sm font-medium leading-none", m.id === effectiveModel ? "text-primary" : "text-foreground/90 group-hover:text-foreground")}>
                                  {m.friendlyName}
                                </p>
                                {locked && (
                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-500">
                                    <Lock className="w-2 h-2" /> Pro
                                  </span>
                                )}
                                {!locked && m.id !== "auto" && (
                                  <span className="text-[10px] text-muted-foreground/40 leading-none font-normal">
                                    {m.exactName}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground/60 leading-none">{m.description}</p>
                            </div>
                            {m.id === effectiveModel && !locked && (
                              <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                      {!isPro && (
                        <div className="mx-1 mt-1 mb-0.5 px-3 py-2 rounded-xl bg-amber-500/8 border border-amber-500/15">
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                            Upgrade to Pro to unlock all models
                          </p>
                        </div>
                      )}
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

            {/* ── right: image mode toggle + voice input + send / stop ────── */}
            <div className="flex items-center gap-2">
              {supportsSpeechRecognition && !isStreaming && (
                <button
                  type="button"
                  onClick={toggleRecording}
                  data-testid="button-voice-input"
                  title={isRecording ? "Stop recording" : "Voice input"}
                  className={cn(
                    "h-8 w-8 rounded-xl flex items-center justify-center transition-all",
                    isRecording
                      ? "bg-red-500/20 text-red-500 animate-pulse ring-1 ring-red-500/40"
                      : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}
              {onToggleImageMode && !isStreaming && (
                <button
                  type="button"
                  onClick={onToggleImageMode}
                  data-testid="button-image-mode"
                  title={isImageMode ? "Switch to chat mode" : "Switch to image generation mode"}
                  className={cn(
                    "h-8 w-8 rounded-xl flex items-center justify-center transition-all",
                    isImageMode
                      ? "bg-violet-500/20 text-violet-400 ring-1 ring-violet-500/40"
                      : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <Sparkles className="w-4 h-4" />
                </button>
              )}
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
  const [showCsvPreview, setShowCsvPreview] = useState(false);

  const csvData = useMemo(() => {
    if (attachment.name.endsWith(".csv") && attachment.data) {
      try {
        const decoded = atob(attachment.data.split(",")[1]);
        const results = Papa.parse(decoded, { header: true, skipEmptyLines: true });
        return {
          headers: results.meta.fields || [],
          rows: results.data.slice(0, 5) as any[],
          total: results.data.length
        };
      } catch (e) {
        console.error("CSV parse error", e);
      }
    }
    return null;
  }, [attachment]);

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

  const isPdf = attachment.mimeType === "application/pdf";
  const isCsv = attachment.name.endsWith(".csv");

  const iconColor =
    isPdf                                                                  ? "text-red-400 bg-red-500/10"
    : attachment.name.match(/\.(py|js|ts|tsx|jsx|html|css|json|yaml)$/)   ? "text-emerald-400 bg-emerald-500/10"
    : attachment.mimeType?.includes("spreadsheet") || isCsv               ? "text-orange-400 bg-orange-500/10"
    : "text-blue-400 bg-blue-500/10";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-xl bg-muted/40 border border-border/50 group max-w-[240px]">
        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0", iconColor)}>
          {isCsv ? <TableIcon className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground/80 truncate" title={attachment.name}>{attachment.name}</p>
          <p className="text-[10px] text-muted-foreground/60">{formatFileSize(attachment.size)}</p>
        </div>
        <div className="flex items-center gap-1">
          {isCsv && csvData && (
            <button
              onClick={() => setShowCsvPreview(!showCsvPreview)}
              className="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              title="Preview CSV"
            >
              <Eye className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={onRemove}
            data-testid="button-remove-attachment"
            className="flex-shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {isCsv && showCsvPreview && csvData && (
        <div className="w-full max-w-md bg-muted/30 border border-border/40 rounded-xl overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="bg-muted/50 border-b border-border/40">
                  {csvData.headers.map((h, i) => (
                    <th key={i} className="px-2 py-1.5 text-left font-semibold text-muted-foreground uppercase tracking-wider truncate max-w-[80px]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {csvData.rows.map((row, i) => (
                  <tr key={i}>
                    {csvData.headers.map((h, j) => (
                      <td key={j} className="px-2 py-1 text-muted-foreground/80 truncate max-w-[80px]">
                        {row[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-2 py-1 border-t border-border/20 bg-muted/20">
            <p className="text-[9px] text-muted-foreground/50">
              Showing first 5 of {csvData.total} rows
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
