import { useState } from "react";
import { Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["Sparky", "Max", "Luna", "Aria", "Nova", "Echo"];

interface AssistantNameModalProps {
  onDone: () => void;
}

export function AssistantNameModal({ onDone }: AssistantNameModalProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(assistantName: string) {
    const trimmed = assistantName.trim();
    if (!trimmed) { onDone(); return; }
    setSaving(true);
    try {
      await apiRequest("PATCH", "/api/settings", { assistantName: trimmed });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    } finally {
      setSaving(false);
      onDone();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary/10 to-violet-500/10 px-6 pt-7 pb-5 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Welcome aboard!</h2>
          <p className="text-sm text-muted-foreground">
            What would you like to name your AI assistant?
          </p>
        </div>

        {/* Suggestions */}
        <div className="px-6 pt-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick picks</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setName(s)}
                data-testid={`button-name-suggestion-${s.toLowerCase()}`}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                  name === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:border-primary/40"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Custom input */}
        <div className="px-6 pt-4">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Or type your own</p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(name); }}
            placeholder="e.g. Alex, Blaze, Milo…"
            maxLength={32}
            autoFocus
            data-testid="input-assistant-name"
            className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {/* Actions */}
        <div className="px-6 py-5 flex gap-3">
          <button
            onClick={() => onDone()}
            data-testid="button-skip-assistant-name"
            className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all"
          >
            Skip for now
          </button>
          <button
            onClick={() => save(name)}
            disabled={saving || !name.trim()}
            data-testid="button-save-assistant-name"
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-40"
          >
            {saving ? "Saving…" : "Get started"}
          </button>
        </div>
      </div>
    </div>
  );
}
