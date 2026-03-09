import { useRef, useEffect, KeyboardEvent, useState, useCallback, DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Square, Paperclip, X, FileText, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Attachment, readFileAsAttachment, formatFileSize } from "@/lib/chat-storage";

const ACCEPTED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "text/plain", "text/markdown", "text/csv",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png,.gif,.webp,.txt,.md,.csv,.pdf,.docx";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (attachments: Attachment[]) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  disabled,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && (value.trim() || attachments.length > 0)) {
        handleSend();
      }
    }
  };

  const handleSend = () => {
    if (isStreaming || (!value.trim() && attachments.length === 0)) return;
    const toSend = [...attachments];
    setAttachments([]);
    onSubmit(toSend);
  };

  const processFiles = useCallback(async (files: FileList | File[]) => {
    setIsProcessing(true);
    const fileArray = Array.from(files).slice(0, 5);
    try {
      const results = await Promise.all(fileArray.map(readFileAsAttachment));
      setAttachments((prev) => {
        const combined = [...prev, ...results];
        return combined.slice(0, 5);
      });
    } catch (err) {
      console.error("File read error", err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      processFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length) {
      processFiles(e.dataTransfer.files);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const canSubmit = (value.trim().length > 0 || attachments.length > 0) && !isStreaming && !disabled && !isProcessing;

  return (
    <div className="px-4 pb-5 pt-2">
      <div className="relative max-w-3xl mx-auto">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative rounded-2xl border transition-all duration-200 shadow-lg bg-card",
            isDragOver
              ? "border-primary/60 shadow-primary/15 ring-2 ring-primary/20"
              : isStreaming
              ? "border-primary/25 shadow-primary/8"
              : "border-card-border focus-within:border-border focus-within:shadow-xl"
          )}
        >
          {/* Drag overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-10 rounded-2xl bg-primary/5 flex items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center gap-2 text-primary/70">
                <ImageIcon className="w-8 h-8" />
                <p className="text-sm font-medium">Drop files here</p>
              </div>
            </div>
          )}

          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3 pb-1">
              {attachments.map((att) => (
                <AttachmentChip
                  key={att.id}
                  attachment={att}
                  onRemove={() => removeAttachment(att.id)}
                />
              ))}
            </div>
          )}

          {/* Textarea */}
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
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

          {/* Bottom toolbar */}
          <div className="flex items-center justify-between px-3 pb-2.5">
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isStreaming}
                data-testid="button-attach-file"
                title="Attach file"
                className={cn(
                  "p-1.5 rounded-lg text-muted-foreground/50 transition-colors",
                  "hover:text-muted-foreground hover:bg-muted/40",
                  "disabled:opacity-30 disabled:cursor-not-allowed"
                )}
              >
                <Paperclip className="w-4 h-4" />
              </button>
              {isProcessing && (
                <span className="text-xs text-muted-foreground/50 ml-1">Reading file…</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground/30 select-none hidden sm:block">
                Shift+Enter for new line
              </span>
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
                  className={cn(
                    "h-8 w-8 rounded-xl shadow-sm transition-all duration-150",
                    !canSubmit && "opacity-25"
                  )}
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

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) {
  if (attachment.type === "image") {
    return (
      <div className="relative group rounded-xl overflow-hidden border border-border/50 shadow-sm">
        <img
          src={attachment.data}
          alt={attachment.name}
          className="h-16 w-16 object-cover"
        />
        <button
          onClick={onRemove}
          data-testid="button-remove-attachment"
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-3 h-3" />
        </button>
        <div className="absolute bottom-0 inset-x-0 bg-black/50 px-1.5 py-0.5">
          <p className="text-[9px] text-white truncate">{attachment.name}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/60 border border-border/50 group">
      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <FileText className="w-3.5 h-3.5 text-primary/70" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground/80 truncate max-w-[120px]">{attachment.name}</p>
        <p className="text-[10px] text-muted-foreground/60">{formatFileSize(attachment.size)}</p>
      </div>
      <button
        onClick={onRemove}
        data-testid="button-remove-attachment"
        className="ml-1 p-0.5 rounded-md text-muted-foreground/40 hover:text-muted-foreground transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
