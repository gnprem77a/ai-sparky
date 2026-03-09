import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BookMarked, Plus, Trash2, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SavedPrompt {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

interface PromptLibraryProps {
  currentInput: string;
  onInsert: (content: string) => void;
}

export function PromptLibrary({ currentInput, onInsert }: PromptLibraryProps) {
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState(currentInput);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showCreate) setNewContent(currentInput);
  }, [showCreate]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const { data: prompts = [] } = useQuery<SavedPrompt[]>({
    queryKey: ["/api/prompts"],
    enabled: open,
  });

  const createPrompt = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/prompts", {
        title: newTitle.trim(),
        content: newContent.trim(),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prompts"] });
      setShowCreate(false);
      setNewTitle("");
      setNewContent("");
    },
  });

  const deletePrompt = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/prompts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/prompts"] }),
  });

  const handleInsert = (content: string) => {
    onInsert(content);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((o) => !o); setShowCreate(false); }}
        data-testid="button-prompt-library"
        title="Prompt library"
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-xl border transition-all",
          open
            ? "bg-primary/10 border-primary/40 text-primary"
            : "border-border/40 text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/40 hover:border-border/60"
        )}
      >
        <BookMarked className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-50 animate-fade-up">
          <div className="w-80 rounded-2xl border border-border/60 bg-popover shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
              <div>
                <p className="text-sm font-semibold text-foreground">Prompt Library</p>
                <p className="text-[11px] text-muted-foreground">Click to insert into input</p>
              </div>
              <button
                onClick={() => setShowCreate((s) => !s)}
                data-testid="button-create-prompt"
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  showCreate
                    ? "bg-primary/10 text-primary"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Plus className="w-3 h-3" />
                Save
              </button>
            </div>

            {/* Create form */}
            {showCreate && (
              <div className="px-4 py-3 border-b border-border/30 bg-muted/20 space-y-2">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Title (optional)"
                  data-testid="input-prompt-title"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border/50 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/40"
                />
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Prompt content…"
                  rows={3}
                  data-testid="input-prompt-content"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border/50 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/40"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setShowCreate(false)}
                    className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => createPrompt.mutate()}
                    disabled={!newContent.trim() || createPrompt.isPending}
                    data-testid="button-save-prompt"
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-all"
                  >
                    <Check className="w-3 h-3" />
                    {createPrompt.isPending ? "Saving…" : "Save prompt"}
                  </button>
                </div>
              </div>
            )}

            {/* Prompt list */}
            <div className="max-h-64 overflow-y-auto custom-scrollbar">
              {prompts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 px-4 text-center gap-2">
                  <BookMarked className="w-7 h-7 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">No saved prompts yet</p>
                  <p className="text-[11px] text-muted-foreground/60">Click "Save" to add your first prompt</p>
                </div>
              ) : (
                <div className="p-1.5 space-y-0.5">
                  {prompts.map((prompt) => (
                    <div
                      key={prompt.id}
                      className="group flex items-start gap-2 px-3 py-2.5 rounded-xl hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleInsert(prompt.content)}
                      data-testid={`prompt-item-${prompt.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        {prompt.title && (
                          <p className="text-xs font-semibold text-foreground/90 truncate mb-0.5">
                            {prompt.title}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground/70 line-clamp-2 leading-relaxed">
                          {prompt.content}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePrompt.mutate(prompt.id);
                        }}
                        data-testid={`button-delete-prompt-${prompt.id}`}
                        className="flex-shrink-0 p-1 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all mt-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
