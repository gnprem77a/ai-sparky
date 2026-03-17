import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Search, MessageSquare, ArrowRight, User, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResult {
  conversationId: string;
  conversationTitle: string;
  messageId: string;
  snippet: string;
  role: string;
}

interface GlobalSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (conversationId: string) => void;
}

export function GlobalSearchModal({ open, onOpenChange, onNavigate }: GlobalSearchModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 280);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isFetching } = useQuery<SearchResult[]>({
    queryKey: ["/api/search", debouncedQuery],
    queryFn: () =>
      fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`, { credentials: "include" })
        .then((r) => r.json()),
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 10_000,
  });

  useEffect(() => { setSelectedIdx(0); }, [results]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  const handleSelect = (result: SearchResult) => {
    onNavigate(result.conversationId);
    onOpenChange(false);
    setQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => {
        const next = Math.min(i + 1, results.length - 1);
        scrollResultIntoView(next);
        return next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => {
        const prev = Math.max(i - 1, 0);
        scrollResultIntoView(prev);
        return prev;
      });
    } else if (e.key === "Enter") {
      if (results[selectedIdx]) handleSelect(results[selectedIdx]);
    }
  };

  const scrollResultIntoView = (idx: number) => {
    const el = listRef.current?.children[idx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  };

  const showEmpty = debouncedQuery.length >= 2 && !isFetching && results.length === 0;
  const showResults = results.length > 0;
  const showPrompt = debouncedQuery.length < 2 && !query.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 max-w-xl overflow-hidden shadow-2xl border-border/60"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Search all conversations</DialogTitle>

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/50">
          {isFetching && debouncedQuery.length >= 2 ? (
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin flex-shrink-0" />
          ) : (
            <Search className="w-4 h-4 text-muted-foreground/60 flex-shrink-0" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search all conversations and messages…"
            data-testid="input-global-search"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
          />
          {query && (
            <button
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground bg-muted px-1.5 py-0.5 rounded transition-colors"
            >
              ESC
            </button>
          )}
        </div>

        {/* Results area */}
        <div className="overflow-y-auto max-h-[420px] custom-scrollbar">
          {showPrompt && (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-primary/8 flex items-center justify-center">
                <Search className="w-5 h-5 text-primary/50" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground/60">Search everything</p>
                <p className="text-xs text-muted-foreground/50 mt-1">
                  Search through message content across all your conversations
                </p>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <kbd className="text-[10px] text-muted-foreground/40 bg-muted px-2 py-1 rounded font-mono">↑↓</kbd>
                <span className="text-[11px] text-muted-foreground/40">navigate</span>
                <kbd className="text-[10px] text-muted-foreground/40 bg-muted px-2 py-1 rounded font-mono">↵</kbd>
                <span className="text-[11px] text-muted-foreground/40">open</span>
              </div>
            </div>
          )}

          {showEmpty && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 px-6 text-center">
              <p className="text-sm text-muted-foreground/60">No results for <span className="font-medium text-foreground/60">"{debouncedQuery}"</span></p>
              <p className="text-xs text-muted-foreground/40">Try different keywords or a shorter phrase</p>
            </div>
          )}

          {showResults && (
            <div ref={listRef} className="py-1.5">
              {results.map((r, i) => (
                <button
                  key={`${r.conversationId}-${r.messageId || i}`}
                  onClick={() => handleSelect(r)}
                  data-testid={`search-result-${i}`}
                  onMouseEnter={() => setSelectedIdx(i)}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors group",
                    i === selectedIdx
                      ? "bg-primary/8"
                      : "hover:bg-muted/40"
                  )}
                >
                  <div className={cn(
                    "mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                    r.role === "user"
                      ? "bg-violet-500/10"
                      : "bg-muted"
                  )}>
                    {r.role === "user"
                      ? <User className="w-3.5 h-3.5 text-violet-500/70" />
                      : <Bot className="w-3.5 h-3.5 text-muted-foreground/60" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[13px] font-medium text-foreground/85 truncate">
                        {r.conversationTitle}
                      </span>
                      {r.role !== "title" && (
                        <span className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 uppercase tracking-wide",
                          r.role === "user"
                            ? "bg-violet-500/10 text-violet-500/70"
                            : "bg-muted text-muted-foreground/60"
                        )}>
                          {r.role === "user" ? "You" : "AI"}
                        </span>
                      )}
                    </div>
                    {r.role !== "title" && r.snippet && (
                      <p className="text-[12px] text-muted-foreground/60 line-clamp-2 leading-relaxed">
                        {r.snippet}
                      </p>
                    )}
                  </div>
                  <ArrowRight className={cn(
                    "w-3.5 h-3.5 flex-shrink-0 mt-1 self-center transition-all",
                    i === selectedIdx
                      ? "text-primary/50 translate-x-0.5"
                      : "text-muted-foreground/20"
                  )} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {showResults && (
          <div className="border-t border-border/40 px-4 py-2 flex items-center gap-4 bg-muted/20">
            <span className="text-[11px] text-muted-foreground/40">
              <kbd className="font-mono">↑↓</kbd> navigate
            </span>
            <span className="text-[11px] text-muted-foreground/40">
              <kbd className="font-mono">↵</kbd> open
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground/40">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
