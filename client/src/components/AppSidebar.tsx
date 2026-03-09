import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Trash2, MessageSquareDashed, Search, X, Crown, Pin, PinOff, Share2, Check, Link, Tag, Filter } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/chat-storage";
import type { AuthUser } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface UsageData {
  count: number;
  limit: number;
  isPro: boolean;
  date: string;
}

interface AppSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  onPinConversation: (id: string, isPinned: boolean) => void;
  onShareConversation: (id: string) => Promise<string | null>;
  user: AuthUser | null;
}

export function AppSidebar({
  conversations,
  activeId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onRenameConversation,
  onPinConversation,
  onShareConversation,
  user,
}: AppSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sharePopoverId, setSharePopoverId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tagPopoverId, setTagPopoverId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  /* Debounce search for full-text lookup */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data: usage } = useQuery<UsageData>({
    queryKey: ["/api/settings/usage"],
  });

  interface SearchResult { conversationId: string; conversationTitle: string; messageId: string; snippet: string; role: string; }
  const { data: searchResults = [] } = useQuery<SearchResult[]>({
    queryKey: ["/api/search", debouncedSearch],
    queryFn: () => fetch(`/api/search?q=${encodeURIComponent(debouncedSearch)}`, { credentials: "include" }).then((r) => r.json()),
    enabled: debouncedSearch.trim().length >= 3,
  });

  const tagMutation = useMutation({
    mutationFn: ({ convId, tags }: { convId: string; tags: string[] }) =>
      apiRequest("PATCH", `/api/conversations/${convId}/tags`, { tags }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/conversations"] }),
  });

  const isPro = usage?.isPro ?? user?.plan === "pro";

  /* All tags across all conversations */
  const allTags = [...new Set(conversations.flatMap((c) => c.tags ?? []))];

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const filtered = search.trim()
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(search.trim().toLowerCase())
      )
    : tagFilter
      ? conversations.filter((c) => (c.tags ?? []).includes(tagFilter))
      : conversations;

  const pinned = filtered.filter((c) => c.isPinned);
  const unpinned = filtered.filter((c) => !c.isPinned);
  const grouped = groupByDate(unpinned);

  const startRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(conv.id);
    setRenameValue(conv.title);
  };

  const commitRename = (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) onRenameConversation(id, trimmed);
    setRenamingId(null);
  };

  const handleShareClick = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sharePopoverId === convId) {
      setSharePopoverId(null);
      setShareUrl(null);
      return;
    }
    setShareLoading(true);
    setSharePopoverId(convId);
    setShareUrl(null);
    setShareCopied(false);
    const url = await onShareConversation(convId);
    setShareUrl(url);
    setShareLoading(false);
  };

  const handleCopyShareUrl = () => {
    if (!shareUrl) return;
    const full = `${window.location.origin}${shareUrl}`;
    navigator.clipboard.writeText(full);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const renderConvItem = (conv: Conversation) => {
    const isRenaming = renamingId === conv.id;
    return (
      <SidebarMenuItem key={conv.id} className="relative">
        <SidebarMenuButton
          isActive={conv.id === activeId}
          onClick={() => !isRenaming && onSelectConversation(conv.id)}
          onMouseEnter={() => setHoveredId(conv.id)}
          onMouseLeave={() => setHoveredId(null)}
          data-testid={`button-conversation-${conv.id}`}
          className={cn(
            "relative flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm w-full transition-colors",
            conv.id === activeId
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70"
          )}
        >
          {conv.isPinned && !isRenaming && (
            <Pin className="w-2.5 h-2.5 text-primary/50 flex-shrink-0" />
          )}

          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => commitRename(conv.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitRename(conv.id); }
                if (e.key === "Escape") { setRenamingId(null); }
              }}
              onClick={(e) => e.stopPropagation()}
              data-testid={`input-rename-${conv.id}`}
              className="flex-1 bg-transparent border-0 border-b border-primary/50 text-[13px] text-foreground focus:outline-none px-0 py-0 min-w-0"
            />
          ) : (
            <span
              className="flex-1 truncate text-left text-[13px] font-normal leading-snug"
              onDoubleClick={(e) => startRename(conv, e)}
              title="Double-click to rename"
            >
              {conv.title}
            </span>
          )}

          {!isRenaming && (hoveredId === conv.id || conv.id === activeId) && (
            <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              {/* Pin */}
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); onPinConversation(conv.id, !conv.isPinned); }}
                data-testid={`button-pin-${conv.id}`}
                title={conv.isPinned ? "Unpin" : "Pin"}
                className="p-0.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                {conv.isPinned
                  ? <PinOff className="w-3.5 h-3.5" />
                  : <Pin className="w-3.5 h-3.5" />
                }
              </span>

              {/* Tag */}
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); setTagPopoverId(tagPopoverId === conv.id ? null : conv.id); setTagInput(""); }}
                data-testid={`button-tag-${conv.id}`}
                title="Add tag"
                className="p-0.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <Tag className="w-3.5 h-3.5" />
              </span>

              {/* Share */}
              <span
                role="button"
                onClick={(e) => handleShareClick(conv.id, e)}
                data-testid={`button-share-${conv.id}`}
                title="Share conversation"
                className="p-0.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
              </span>

              {/* Delete */}
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); onDeleteConversation(conv.id); }}
                data-testid={`button-delete-${conv.id}`}
                title="Delete"
                className="p-0.5 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </span>
            </div>
          )}
        </SidebarMenuButton>

        {/* Tag chips */}
        {(conv.tags ?? []).length > 0 && !isRenaming && (
          <div className="flex flex-wrap gap-1 px-2.5 pb-1.5 -mt-1" onClick={(e) => e.stopPropagation()}>
            {(conv.tags ?? []).map((tag) => (
              <span
                key={tag}
                onClick={(e) => { e.stopPropagation(); setTagFilter(tag === tagFilter ? null : tag); }}
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors",
                  tag === tagFilter
                    ? "bg-primary/20 text-primary"
                    : "bg-muted/60 text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                )}
              >
                # {tag}
              </span>
            ))}
          </div>
        )}

        {/* Tag popover */}
        {tagPopoverId === conv.id && (
          <div
            className="absolute left-0 right-0 z-50 mt-0.5 px-3 py-2.5 rounded-xl border border-border/60 bg-popover shadow-xl"
            style={{ top: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <Tag className="w-3 h-3 text-primary" /> Tags
            </p>
            {(conv.tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {(conv.tags ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-primary/10 text-primary cursor-pointer hover:bg-destructive/10 hover:text-destructive transition-colors"
                    onClick={() => tagMutation.mutate({ convId: conv.id, tags: (conv.tags ?? []).filter((t) => t !== tag) })}
                    title="Click to remove"
                  >
                    # {tag} <X className="w-2.5 h-2.5" />
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add tag…"
                data-testid={`input-tag-${conv.id}`}
                className="flex-1 px-2 py-1 text-[12px] rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    const newTag = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
                    const current = conv.tags ?? [];
                    if (!current.includes(newTag)) {
                      tagMutation.mutate({ convId: conv.id, tags: [...current, newTag] });
                    }
                    setTagInput("");
                  }
                  if (e.key === "Escape") setTagPopoverId(null);
                }}
                autoFocus
              />
              <button
                onClick={() => setTagPopoverId(null)}
                className="text-[11px] text-muted-foreground hover:text-foreground px-1.5"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Share popover */}
        {sharePopoverId === conv.id && (
          <div
            className="absolute left-0 right-0 z-50 mt-0.5 px-3 py-2.5 rounded-xl border border-border/60 bg-popover shadow-xl"
            style={{ top: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
              <Link className="w-3 h-3 text-primary" /> Share conversation
            </p>
            {shareLoading ? (
              <p className="text-[11px] text-muted-foreground animate-pulse">Generating link…</p>
            ) : shareUrl ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1.5">
                  <span className="text-[11px] text-muted-foreground flex-1 truncate">
                    {window.location.origin}{shareUrl}
                  </span>
                </div>
                <button
                  onClick={handleCopyShareUrl}
                  data-testid={`button-copy-share-${conv.id}`}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/15 transition-colors"
                >
                  {shareCopied ? <><Check className="w-3 h-3" /> Copied!</> : <><Link className="w-3 h-3" /> Copy link</>}
                </button>
                <button
                  onClick={() => { setSharePopoverId(null); setShareUrl(null); }}
                  className="w-full text-[11px] text-muted-foreground hover:text-foreground text-center transition-colors"
                >
                  Close
                </button>
              </div>
            ) : null}
          </div>
        )}
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar>
      <SidebarHeader className="px-3 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-violet-400 flex items-center justify-center flex-shrink-0 shadow-lg">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-white">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="currentColor" opacity="0.3"/>
                <path d="M21 12c0-4.97-4.03-9-9-9s-9 4.03-9 9 4.03 9 9 9 9-4.03 9-9zM8 8h2.5l1.5 4 1.5-4H16l-2.5 8H11L8 8z" fill="currentColor"/>
              </svg>
            </div>
            <span className="font-semibold text-sm text-foreground tracking-tight">Claude Chat</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onNewChat}
            data-testid="button-new-chat"
            title="New chat (Ctrl+K)"
            className="h-8 w-8 text-muted-foreground"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            data-testid="input-search-conversations"
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-muted/50 border border-border/40 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 custom-scrollbar">
        {/* Tag filter bar */}
        {allTags.length > 0 && !search && (
          <div className="flex flex-wrap gap-1 px-1 pt-2 pb-1">
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setTagFilter(tag === tagFilter ? null : tag)}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors",
                  tag === tagFilter
                    ? "bg-primary/20 text-primary"
                    : "bg-muted/50 text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                )}
              >
                <Filter className="w-2.5 h-2.5" /> {tag}
              </button>
            ))}
            {tagFilter && (
              <button
                onClick={() => setTagFilter(null)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-2.5 h-2.5" /> Clear
              </button>
            )}
          </div>
        )}

        {/* Full-text search results */}
        {debouncedSearch.length >= 3 && searchResults.length > 0 && (
          <SidebarGroup className="py-0.5">
            <SidebarGroupLabel className="text-[10px] px-2 py-1.5 text-muted-foreground/60 uppercase tracking-widest font-semibold">
              Search Results
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {searchResults.slice(0, 8).map((result, idx) => (
                  <SidebarMenuItem key={`${result.conversationId}-${result.messageId || idx}`}>
                    <SidebarMenuButton
                      onClick={() => { onSelectConversation(result.conversationId); setSearch(""); }}
                      className="flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-lg text-sm w-full h-auto"
                    >
                      <span className="text-[12px] font-medium text-foreground/80 truncate w-full">
                        {result.conversationTitle}
                      </span>
                      {result.role !== "title" && (
                        <span className="text-[11px] text-muted-foreground/60 line-clamp-2 text-left w-full leading-snug">
                          {result.snippet}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-14 text-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mb-1">
              <MessageSquareDashed className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground/80">
                {search ? "No matches found" : tagFilter ? `No conversations tagged #${tagFilter}` : "No conversations"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {search ? "Try a different search term" : "Start a new chat to get going"}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Pinned */}
            {pinned.length > 0 && (
              <SidebarGroup className="py-0.5">
                <SidebarGroupLabel className="text-[10px] px-2 py-1.5 text-muted-foreground/60 uppercase tracking-widest font-semibold flex items-center gap-1">
                  <Pin className="w-2.5 h-2.5" /> Pinned
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-0.5">
                    {pinned.map(renderConvItem)}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {/* Date-grouped */}
            {Object.entries(grouped).map(([label, convs]) => (
              <SidebarGroup key={label} className="py-0.5">
                <SidebarGroupLabel className="text-[10px] px-2 py-1.5 text-muted-foreground/60 uppercase tracking-widest font-semibold">
                  {label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-0.5">
                    {convs.map(renderConvItem)}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="px-3 py-3">
        <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-muted/40">
          <div className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold",
            isPro
              ? "bg-amber-500/20 text-amber-500"
              : "bg-gradient-to-br from-primary/80 to-violet-400/80 text-white"
          )}>
            {user?.username?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground/80 truncate">{user?.username ?? "User"}</p>
            {isPro ? (
              <p className="text-[10px] text-amber-500 font-medium flex items-center gap-1">
                <Crown className="w-2.5 h-2.5" /> Pro
              </p>
            ) : usage ? (
              <div className="space-y-0.5 mt-0.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-muted-foreground">{usage.count} / {usage.limit} today</p>
                </div>
                <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      usage.count >= usage.limit ? "bg-destructive" : "bg-primary/50"
                    )}
                    style={{ width: `${Math.min((usage.count / usage.limit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground">Free plan</p>
            )}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

const GROUP_ORDER = ["Today", "Yesterday", "Last 7 days", "Last 30 days", "Older"];

function groupByDate(conversations: Conversation[]): Record<string, Conversation[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sevenDays = new Date(today);
  sevenDays.setDate(sevenDays.getDate() - 7);
  const thirtyDays = new Date(today);
  thirtyDays.setDate(thirtyDays.getDate() - 30);

  const rawGroups: Record<string, Conversation[]> = {};

  for (const conv of conversations) {
    const date = new Date(conv.updatedAt);
    let label: string;
    if (date >= today) label = "Today";
    else if (date >= yesterday) label = "Yesterday";
    else if (date >= sevenDays) label = "Last 7 days";
    else if (date >= thirtyDays) label = "Last 30 days";
    else label = "Older";

    if (!rawGroups[label]) rawGroups[label] = [];
    rawGroups[label].push(conv);
  }

  const ordered: Record<string, Conversation[]> = {};
  for (const key of GROUP_ORDER) {
    if (rawGroups[key]) ordered[key] = rawGroups[key];
  }
  return ordered;
}
