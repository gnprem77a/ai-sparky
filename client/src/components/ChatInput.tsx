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
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
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
    <div className="px-4 pb-4 pt-2">
      <div className="relative max-w-3xl mx-auto">
        <div
          className={cn(
            "flex items-end gap-2 rounded-xl border bg-background px-4 py-2 transition-colors",
            "border-border",
            isStreaming ? "border-primary/40" : "focus-within:border-primary/60"
          )}
        >
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Claude… (Shift+Enter for new line)"
            disabled={disabled}
            rows={1}
            data-testid="input-message"
            className={cn(
              "flex-1 resize-none border-0 bg-transparent text-sm leading-relaxed",
              "focus-visible:ring-0 focus-visible:ring-offset-0",
              "min-h-[44px] max-h-[200px] py-2.5",
              "placeholder:text-muted-foreground/60"
            )}
          />
          <div className="flex-shrink-0 pb-1">
            {isStreaming ? (
              <Button
                size="icon"
                variant="destructive"
                onClick={onStop}
                data-testid="button-stop"
                className="h-8 w-8 rounded-lg"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={onSubmit}
                disabled={!canSubmit}
                data-testid="button-send"
                className="h-8 w-8 rounded-lg"
              >
                <ArrowUp className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground/50 mt-2">
          Claude can make mistakes. Use Shift+Enter for a new line.
        </p>
      </div>
    </div>
  );
}
