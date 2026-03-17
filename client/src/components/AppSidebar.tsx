import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Trash2, MessageSquareDashed, Search, X, Pin, PinOff, Share2, Check, Link, Tag, Filter, Upload, Image as ImageIcon, Folder, ChevronRight, ChevronDown, MoreVertical, Settings, LogOut, LogIn, Shield, UserCircle, Database, Key, Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
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
  SidebarMenuAction,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Folder as FolderType } from "@shared/schema";
import type { Conversation } from "@/lib/chat-storage";
import type { AuthUser } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ImportModal } from "./ImportModal";
import { useLanguage } from "@/lib/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";

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
  onOpenSettings: () => void;
  onLogout: () => void;
  onLogin: () => void;
}

const FOLDER_COLORS = [
  { name: "default", class: "bg-muted-foreground/40" },
  { name: "blue", class: "bg-blue-500" },
  { name: "green", class: "bg-green-500" },
  { name: "red", class: "bg-red-500" },
  { name: "purple", class: "bg-purple-500" },
  { name: "orange", class: "bg-orange-500" },
];

const TAG_COLORS = [
  { id: "gray",   chip: "bg-muted/70 text-muted-foreground",           dot: "bg-gray-400",   filter: "bg-gray-400/20 text-gray-500 dark:text-gray-400" },
  { id: "blue",   chip: "bg-blue-500/15 text-blue-600 dark:text-blue-400",   dot: "bg-blue-500",   filter: "bg-blue-500/20 text-blue-600 dark:text-blue-400" },
  { id: "green",  chip: "bg-green-500/15 text-green-600 dark:text-green-400",  dot: "bg-green-500",  filter: "bg-green-500/20 text-green-600 dark:text-green-400" },
  { id: "red",    chip: "bg-red-500/15 text-red-600 dark:text-red-400",    dot: "bg-red-500",    filter: "bg-red-500/20 text-red-600 dark:text-red-400" },
  { id: "yellow", chip: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400", dot: "bg-yellow-400", filter: "bg-yellow-400/20 text-yellow-700 dark:text-yellow-400" },
  { id: "purple", chip: "bg-purple-500/15 text-purple-600 dark:text-purple-400", dot: "bg-purple-500", filter: "bg-purple-500/20 text-purple-600 dark:text-purple-400" },
  { id: "pink",   chip: "bg-pink-500/15 text-pink-600 dark:text-pink-400",   dot: "bg-pink-500",   filter: "bg-pink-500/20 text-pink-600 dark:text-pink-400" },
  { id: "orange", chip: "bg-orange-500/15 text-orange-600 dark:text-orange-400", dot: "bg-orange-500", filter: "bg-orange-500/20 text-orange-600 dark:text-orange-400" },
];

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
  onOpenSettings,
  onLogout,
  onLogin,
}: AppSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
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
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [dragFolderId, setDragFolderId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [tagColorMap, setTagColorMap] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("tag-color-map") || "{}"); } catch { return {}; }
  });
  const [newTagColor, setNewTagColor] = useState("gray");

  const saveTagColor = (tag: string, colorId: string) => {
    const updated = { ...tagColorMap, [tag]: colorId };
    setTagColorMap(updated);
    localStorage.setItem("tag-color-map", JSON.stringify(updated));
  };

  const getTagStyle = (tag: string) =>
    TAG_COLORS.find((c) => c.id === (tagColorMap[tag] || "gray")) || TAG_COLORS[0];

  /* Debounce search for full-text lookup */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: usage } = useQuery<UsageData>({
    queryKey: ["/api/settings/usage"],
  });

  interface MonthlyUsage { isPro: boolean; used: number; limit: number; resetAt: string | null; warnAt: number; blocked: boolean; }
  const { data: monthlyUsage } = useQuery<MonthlyUsage>({
    queryKey: ["/api/usage"],
    enabled: !!user && (user?.plan === "pro"),
    refetchInterval: 60_000,
  });

  const { data: folders = [] } = useQuery<FolderType[]>({
    queryKey: ["/api/folders"],
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) =>
      apiRequest("POST", "/api/folders", { name }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setIsCreatingFolder(false);
      setNewFolderName("");
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/folders/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/folders"] }),
  });

  const reorderFoldersMutation = useMutation({
    mutationFn: (orderedIds: string[]) => apiRequest("PUT", "/api/folders/reorder", { orderedIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/folders"] }),
  });

  const moveToFolderMutation = useMutation({
    mutationFn: ({ convId, folderId }: { convId: string; folderId: string | null }) =>
      apiRequest("PATCH", `/api/conversations/${convId}/folder`, { folderId }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/conversations"] }),
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
  const allTags = Array.from(new Set(conversations.flatMap((c) => c.tags ?? [])));

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

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

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
      <SidebarMenuItem key={conv.id} className="relative group/menu-item">
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
            <div className="flex-1 min-w-0">
              <span
                className="block truncate text-left text-[13px] font-normal leading-snug"
                onDoubleClick={(e) => startRename(conv, e)}
                title="Double-click to rename"
              >
                {conv.title}
              </span>
              <span className="block text-[10px] text-muted-foreground/40 leading-none mt-0.5">
                {relativeTime(conv.updatedAt)}
              </span>
            </div>
          )}

          {!isRenaming && (hoveredId === conv.id || conv.id === activeId) && (
            <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <span
                    role="button"
                    className="p-0.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => onPinConversation(conv.id, !conv.isPinned)}>
                    {conv.isPinned ? <PinOff className="w-4 h-4 mr-2" /> : <Pin className="w-4 h-4 mr-2" />}
                    {conv.isPinned ? "Unpin" : "Pin"}
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Folder className="w-4 h-4 mr-2" />
                      Move to Folder
                    </DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem onClick={() => moveToFolderMutation.mutate({ convId: conv.id, folderId: null })}>
                          No Folder
                        </DropdownMenuItem>
                        {folders.map((f) => (
                          <DropdownMenuItem key={f.id} onClick={() => moveToFolderMutation.mutate({ convId: conv.id, folderId: f.id })}>
                            <div className={cn("w-2 h-2 rounded-full mr-2", FOLDER_COLORS.find(c => c.name === f.color)?.class || "bg-muted-foreground/40")} />
                            {f.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setTagPopoverId(tagPopoverId === conv.id ? null : conv.id); setTagInput(""); }}>
                    <Tag className="w-4 h-4 mr-2" />
                    Tags
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => handleShareClick(conv.id, e)}>
                    <Share2 className="w-4 h-4 mr-2" />
                    Share
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDeleteConversation(conv.id)} className="text-destructive focus:text-destructive">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </SidebarMenuButton>

        {/* Tag chips */}
        {(conv.tags ?? []).length > 0 && !isRenaming && (
          <div className="flex flex-wrap gap-1 px-2.5 pb-1.5 -mt-1" onClick={(e) => e.stopPropagation()}>
            {(conv.tags ?? []).map((tag) => {
              const style = getTagStyle(tag);
              return (
                <span
                  key={tag}
                  onClick={(e) => { e.stopPropagation(); setTagFilter(tag === tagFilter ? null : tag); }}
                  className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors",
                    tag === tagFilter ? "ring-1 ring-current opacity-100" : "opacity-80 hover:opacity-100",
                    style.chip
                  )}
                >
                  # {tag}
                </span>
              );
            })}
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
                {(conv.tags ?? []).map((tag) => {
                  const style = getTagStyle(tag);
                  return (
                    <span
                      key={tag}
                      className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] cursor-pointer hover:opacity-70 transition-opacity", style.chip)}
                      onClick={() => tagMutation.mutate({ convId: conv.id, tags: (conv.tags ?? []).filter((t) => t !== tag) })}
                      title="Click to remove"
                    >
                      # {tag} <X className="w-2.5 h-2.5" />
                    </span>
                  );
                })}
              </div>
            )}
            <div className="flex gap-1 mb-2">
              {TAG_COLORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setNewTagColor(c.id)}
                  className={cn("w-4 h-4 rounded-full transition-transform", c.dot, newTagColor === c.id ? "ring-2 ring-offset-1 ring-foreground/40 scale-110" : "hover:scale-110")}
                  title={c.id}
                />
              ))}
            </div>
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
                      saveTagColor(newTag, newTagColor);
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
            <img src="/logo.png" alt="AI Sparky" className="w-7 h-7 rounded-lg shadow-lg flex-shrink-0 object-cover" />
            <span className="font-semibold text-sm text-foreground tracking-tight">AI Sparky</span>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTheme}
              data-testid="button-sidebar-theme"
              title={theme === "dark" ? "Light mode" : "Dark mode"}
              className="h-8 w-8 text-muted-foreground"
            >
              {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsImportModalOpen(true)}
              data-testid="button-import-chat"
              title="Import Chats"
              className="h-8 w-8 text-muted-foreground"
            >
              <Upload className="w-4 h-4" />
            </Button>
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
        </div>

        <ImportModal
          open={isImportModalOpen}
          onOpenChange={setIsImportModalOpen}
        />

        {/* Search */}
        <div className="relative mt-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("sidebar.search")}
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
            {allTags.map((tag) => {
              const style = getTagStyle(tag);
              return (
                <button
                  key={tag}
                  onClick={() => setTagFilter(tag === tagFilter ? null : tag)}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all",
                    tag === tagFilter ? cn(style.filter, "ring-1 ring-current") : cn(style.filter, "opacity-70 hover:opacity-100")
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", style.dot)} />
                  {tag}
                </button>
              );
            })}
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
                {search ? "No matches found" : tagFilter ? `No conversations tagged #${tagFilter}` : t("sidebar.noConversations")}
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
                  <Pin className="w-2.5 h-2.5" /> {t("sidebar.pinnedChats")}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-0.5">
                    {pinned.map(renderConvItem)}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {/* Folders */}
            <SidebarGroup className="py-0.5">
              <div className="flex items-center justify-between px-2 py-1.5">
                <SidebarGroupLabel className="text-[10px] p-0 text-muted-foreground/60 uppercase tracking-widest font-semibold">
                  {t("sidebar.folders")}
                </SidebarGroupLabel>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-4 w-4 text-muted-foreground/60 hover:text-foreground"
                  onClick={() => setIsCreatingFolder(true)}
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {isCreatingFolder && (
                    <SidebarMenuItem className="px-2 py-1">
                      <input
                        autoFocus
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onBlur={() => { if (!newFolderName) setIsCreatingFolder(false); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newFolderName.trim()) {
                            createFolderMutation.mutate(newFolderName.trim());
                          } else if (e.key === "Escape") {
                            setIsCreatingFolder(false);
                            setNewFolderName("");
                          }
                        }}
                        placeholder={t("sidebar.folderName")}
                        className="w-full bg-muted/50 border-none text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/30"
                      />
                    </SidebarMenuItem>
                  )}
                  {folders.map((folder) => {
                    const folderConvs = unpinned.filter((c) => c.folderId === folder.id);
                    const isExpanded = expandedFolders[folder.id];
                    const isDraggingOver = dragOverFolderId === folder.id && dragFolderId !== folder.id;
                    return (
                      <div
                        key={folder.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragFolderId(folder.id); }}
                        onDragOver={(e) => { e.preventDefault(); setDragOverFolderId(folder.id); }}
                        onDragLeave={() => setDragOverFolderId(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOverFolderId(null);
                          if (!dragFolderId || dragFolderId === folder.id) { setDragFolderId(null); return; }
                          const ids = folders.map(f => f.id);
                          const fromIdx = ids.indexOf(dragFolderId);
                          const toIdx = ids.indexOf(folder.id);
                          if (fromIdx === -1 || toIdx === -1) { setDragFolderId(null); return; }
                          const newOrder = [...ids];
                          newOrder.splice(fromIdx, 1);
                          newOrder.splice(toIdx, 0, dragFolderId);
                          reorderFoldersMutation.mutate(newOrder);
                          setDragFolderId(null);
                        }}
                        onDragEnd={() => { setDragFolderId(null); setDragOverFolderId(null); }}
                        className={cn(
                          "rounded-lg transition-all",
                          isDraggingOver && "ring-1 ring-primary/40 bg-primary/5",
                          dragFolderId === folder.id && "opacity-50"
                        )}
                      >
                        <SidebarMenuItem>
                          <SidebarMenuButton
                            onClick={() => toggleFolder(folder.id)}
                            className="w-full group/folder cursor-grab active:cursor-grabbing"
                          >
                            {isExpanded ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                            <div className={cn("w-2 h-2 rounded-full mr-2", FOLDER_COLORS.find(c => c.name === folder.color)?.class || "bg-muted-foreground/40")} />
                            <span className="flex-1 truncate text-[13px]">{folder.name}</span>
                            <span className="text-[10px] text-muted-foreground/60 px-1.5">{folderConvs.length}</span>
                          </SidebarMenuButton>
                          <SidebarMenuAction className="opacity-0 group-hover/folder:opacity-100">
                             <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => deleteFolderMutation.mutate(folder.id)} className="text-destructive focus:text-destructive">
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Delete Folder
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                             </DropdownMenu>
                          </SidebarMenuAction>
                        </SidebarMenuItem>
                        {isExpanded && (
                          <div className="ml-4 border-l border-border/40 pl-1 mt-0.5 flex flex-col gap-0.5">
                            {folderConvs.length === 0 ? (
                              <div className="px-3 py-2 text-[11px] text-muted-foreground/50 italic">Empty</div>
                            ) : (
                              folderConvs.map(renderConvItem)
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Date-grouped (Unfolded) */}
            {Object.entries(groupByDate(unpinned.filter(c => !c.folderId))).map(([label, convs]) => (
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

      <SidebarFooter className="px-3 py-3 space-y-1">

        {/* Navigation links */}
        {user && (
          <div className="space-y-0.5">
            <p className="px-2 pb-1 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">Explore</p>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a href="/kb" data-testid="link-knowledge-base" className="group">
                    <Database className="w-4 h-4 text-blue-400 group-hover:text-blue-400" />
                    <span>Knowledge Base</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {user?.apiEnabled && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <a href="/api-access" data-testid="link-api-access" className="group">
                      <Key className="w-4 h-4 text-amber-400 group-hover:text-amber-400" />
                      <span>API Access</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </div>
        )}

        {/* Guest nav: just KB */}
        {!user && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <a href="/kb" data-testid="link-knowledge-base">
                  <Database className="w-4 h-4 text-blue-400" />
                  <span>Knowledge Base</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}

        {/* Profile trigger + popup */}
        <div ref={profileMenuRef} className="relative">

          {/* Guest (not logged in) — show Sign In button */}
          {!user ? (
            <button
              onClick={onLogin}
              data-testid="button-sign-in"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-colors group"
            >
              <div className="w-7 h-7 rounded-full bg-muted/60 border border-border/60 flex items-center justify-center flex-shrink-0">
                <UserCircle className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-semibold text-foreground/80 group-hover:text-foreground">Sign in</p>
                <p className="text-[10px] text-muted-foreground">to save your chats</p>
              </div>
              <LogIn className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            </button>
          ) : (
            <>
              {/* Popup menu — appears above the trigger */}
              {profileMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 z-50 rounded-xl border border-border/60 bg-popover shadow-2xl overflow-hidden py-1">
                  {/* User info header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40">
                    <div className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold",
                      isPro
                        ? "bg-amber-500/20 text-amber-500"
                        : "bg-gradient-to-br from-primary/80 to-violet-400/80 text-white"
                    )}>
                      {user.username?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold text-foreground truncate">{user.username}</p>
                        {user.isAdmin && <Shield className="w-3 h-3 text-violet-500 flex-shrink-0" />}
                        {isPro && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-gradient-to-r from-amber-400 to-amber-500 text-white shadow-sm flex-shrink-0">
                            ✦ PRO
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{isPro ? "Pro plan" : "Free plan"}</p>
                    </div>
                  </div>

                  {/* Menu items */}
                  <div className="py-1">
                    <button
                      onClick={() => { setProfileMenuOpen(false); onOpenSettings(); }}
                      data-testid="button-sidebar-settings"
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 hover:text-foreground hover:bg-muted/60 transition-colors"
                    >
                      <Settings className="w-4 h-4 text-muted-foreground" />
                      Settings
                    </button>

                    <a
                      href="/profile"
                      onClick={() => setProfileMenuOpen(false)}
                      data-testid="button-sidebar-profile"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 hover:text-foreground hover:bg-muted/60 transition-colors"
                    >
                      <UserCircle className="w-4 h-4 text-muted-foreground" />
                      My Profile
                    </a>


                    {user.isAdmin && (
                      <a
                        href="/admin"
                        onClick={() => setProfileMenuOpen(false)}
                        data-testid="button-sidebar-admin"
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 hover:text-violet-500 hover:bg-muted/60 transition-colors"
                      >
                        <Shield className="w-4 h-4 text-muted-foreground" />
                        Admin Dashboard
                      </a>
                    )}
                  </div>

                  <div className="mx-3 border-t border-border/40" />

                  <div className="py-1">
                    <button
                      onClick={() => { setProfileMenuOpen(false); onLogout(); }}
                      data-testid="button-sidebar-logout"
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/80 hover:text-destructive hover:bg-destructive/5 transition-colors"
                    >
                      <LogOut className="w-4 h-4 text-muted-foreground" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}

              {/* Trigger button */}
              <button
                onClick={() => setProfileMenuOpen((o) => !o)}
                data-testid="button-profile-trigger"
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors",
                  profileMenuOpen
                    ? "bg-muted/60 text-foreground"
                    : "hover:bg-muted/50 text-foreground/80 hover:text-foreground"
                )}
              >
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold",
                  isPro
                    ? "bg-amber-500/20 text-amber-500"
                    : "bg-gradient-to-br from-primary/80 to-violet-400/80 text-white"
                )}>
                  {user.username?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold truncate">{user.username}</p>
                    {user.isAdmin && <Shield className="w-3 h-3 text-violet-500 flex-shrink-0" />}
                    {isPro && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-black bg-gradient-to-r from-amber-400 to-amber-500 text-white shadow-sm flex-shrink-0">
                        ✦ PRO
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{isPro ? "Pro plan" : "Free plan"}</p>
                </div>
                <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0", profileMenuOpen && "rotate-180")} />
              </button>
            </>
          )}
        </div>

        {/* Legal links */}
        <div className="flex items-center justify-center gap-3 pt-1 pb-0.5">
          {[
            { label: "About", href: "/about" },
            { label: "Privacy", href: "/privacy" },
            { label: "Terms", href: "/terms" },
            { label: "Contact", href: "/contact" },
          ].map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              {label}
            </a>
          ))}
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

  const sortedGroups: Record<string, Conversation[]> = {};
  for (const label of GROUP_ORDER) {
    if (rawGroups[label]) {
      sortedGroups[label] = rawGroups[label];
    }
  }

  return sortedGroups;
}