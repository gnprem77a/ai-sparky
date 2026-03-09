import { useRef, useEffect, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
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

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && value.trim()) {
        onSubmit();
      }
    }
  };

  const canSubmit = value.trim().length > 0 && !isStreaming && !disabled;

  return (
    <div className="px-4 pb-5 pt-3">
      <div className="relative max-w-3xl mx-auto">
        <div
          className={cn(
            "relative flex items-end rounded-2xl border transition-all duration-200 shadow-lg",
            "bg-card border-card-border",
            isStreaming
              ? "border-primary/30 shadow-primary/10"
              : "focus-within:border-border focus-within:shadow-xl"
          )}
        >
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Claude…"
            disabled={disabled}
            rows={1}
            data-testid="input-message"
            className={cn(
              "flex-1 resize-none border-0 bg-transparent text-sm leading-relaxed",
              "focus-visible:ring-0 focus-visible:ring-offset-0",
              "min-h-[52px] max-h-[220px] py-3.5 px-4 pr-14",
              "placeholder:text-muted-foreground/40 text-foreground/90",
              "scrollbar-none"
            )}
          />
          <div className="absolute bottom-2.5 right-2.5">
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
                onClick={onSubmit}
                disabled={!canSubmit}
                data-testid="button-send"
                className={cn(
                  "h-8 w-8 rounded-xl shadow-sm transition-all duration-150",
                  canSubmit ? "opacity-100" : "opacity-30"
                )}
              >
                <ArrowUp className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-center text-[11px] text-muted-foreground/35 mt-2.5 select-none">
          Claude can make mistakes. Shift + Enter for new line.
        </p>
      </div>
    </div>
  );
}
