import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/AppSidebar";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { GlobalSearchModal } from "@/components/GlobalSearchModal";
import { SettingsModal } from "@/components/SettingsModal";
import { LoginPromptModal } from "@/components/LoginPromptModal";
import { SecondaryChat } from "@/components/SecondaryChat";
import { type ModelId } from "@/components/ModelSelector";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useLocation } from "wouter";
import { Plus, ChevronDown, Settings, Download, Crown, Code2, PenLine, BarChart2, Lightbulb, Globe, FlaskConical, Search, X, ChevronUp, FileText, Printer, Columns2, Pin, Sparkles, FileDown, Megaphone, MoreHorizontal, Sun, Moon, Square, Upload, MailCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type Conversation, type Message, type Attachment, type ApiMessage, apiMessageToLocal, generateTitle, exportConversationAsMarkdown, getActiveConversationId, setActiveConversationId } from "@/lib/chat-storage";
import { type Broadcast } from "@shared/schema";
import { useLanguage } from "@/lib/i18n";

function isProActive(user: { plan: string; planExpiresAt: string | null } | null): boolean {
  if (!user) return false;
  if (user.plan !== "pro") return false;
  if (!user.planExpiresAt) return true;
  return new Date(user.planExpiresAt) > new Date();
}

import { UpgradeModal } from "@/components/UpgradeModal";
import { OnboardingModal } from "@/components/OnboardingModal";
import { AssistantNameModal } from "@/components/AssistantNameModal";
import { useToast } from "@/hooks/use-toast";

export default function ChatPage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingModel, setStreamingModel] = useState<string | null>(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [model, setModel] = useState<ModelId>("auto");
  const [error, setError] = useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<"limit" | "model">("limit");
  const [showAssistantNameModal, setShowAssistantNameModal] = useState(() => sessionStorage.getItem("justRegistered") === "1");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([]);
  const [pinnedOpen, setPinnedOpen] = useState(false);

  const { user, logout } = useAuth();
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const [, navigate] = useLocation();
  const { setOpenMobile, isMobile, openMobile } = useSidebar();
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [localAutoScroll, setLocalAutoScroll] = useState(true);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [splitView, setSplitView] = useState(() => {
    return localStorage.getItem("chat-split-view") === "true";
  });
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[] | null>(null);
  const dragCounterRef = useRef(0);

  /* ── Swipe gestures state ── */
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || !isMobile) return;

    const touchEnd = {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY,
    };

    const deltaX = touchEnd.x - touchStartRef.current.x;
    const deltaY = touchEnd.y - touchStartRef.current.y;

    // Must be a primarily horizontal swipe
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0 && touchStartRef.current.x < 40) {
        // Swipe right from edge -> open
        setOpenMobile(true);
      } else if (deltaX < 0 && openMobile) {
        // Swipe left -> close
        setOpenMobile(false);
      }
    }

    touchStartRef.current = null;
  };

  useEffect(() => {
    localStorage.setItem("chat-split-view", String(splitView));
  }, [splitView]);

  /* ── Web search grounding state ── */
  const [webSearchMode, setWebSearchMode] = useState(false);

  /* ── Search state ── */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [searchTotalMatches, setSearchTotalMatches] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const [quotedMessage, setQuotedMessage] = useState<{ id: string; snippet: string } | null>(null);

  /* ── Email verification banner ── */
  const [verifyBannerDismissed, setVerifyBannerDismissed] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);

  const handleResendVerification = async () => {
    setResendingVerification(true);
    try {
      const res = await apiRequest("POST", "/api/auth/resend-verification");
      if (res.ok) {
        toast({ title: "Verification email sent!", description: "Check your inbox and click the link to verify your email." });
        setVerifyBannerDismissed(true);
      } else {
        const d = await res.json();
        toast({ title: "Could not send email", description: d.error, variant: "destructive" });
      }
    } finally {
      setResendingVerification(false);
    }
  };

  /* ── Broadcast state ── */
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [broadcastDismissed, setBroadcastDismissed] = useState(false);

  const { data: activeBroadcast } = useQuery<Broadcast | null>({
    queryKey: ["/api/broadcast"],
    queryFn: () => fetch("/api/broadcast", { credentials: "include" }).then((r) => r.json()),
    enabled: !!user,
  });

  useEffect(() => {
    if (activeBroadcast) {
      const dismissed = localStorage.getItem(`broadcast-dismissed-${activeBroadcast.id}`);
      if (!dismissed) {
        setBroadcast(activeBroadcast);
        setBroadcastDismissed(false);
      }
    } else {
      setBroadcast(null);
    }
  }, [activeBroadcast]);

  const dismissBroadcast = () => {
    if (broadcast) {
      localStorage.setItem(`broadcast-dismissed-${broadcast.id}`, "true");
      setBroadcastDismissed(true);
    }
  };

  /* ── Summary state ── */
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  const handleSummarize = async () => {
    if (!messages.length) return;
    setSummaryOpen(true);
    setSummaryText("");
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: messages.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to summarize");
      setSummaryText(data.summary);
    } catch (err: unknown) {
      setSummaryText(`Error: ${(err as Error).message}`);
    } finally {
      setSummaryLoading(false);
    }
  };

  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isSubmittingRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  const inputRef = useRef("");
  const streamStartRef = useRef<number>(0);
  const prevTitleRef = useRef<string>("");
  const tabHiddenDuringStreamRef = useRef(false);
  const [isAtTop, setIsAtTop] = useState(true);

  const isPro = isProActive(user);

  /* ── Plan limits (for model selector UI) ── */
  const { data: planLimitsData } = useQuery<{
    freeAllowedModels: string[];
    freeDailyLimit: number;
    proMonthlyTokens: number;
  }>({
    queryKey: ["/api/config/plan-limits"],
    staleTime: 5 * 60 * 1000,
  });

  /* ── Usage tracking & approaching-limit notification ── */
  const { data: usageData } = useQuery<{ count: number; limit: number; isPro: boolean }>({
    queryKey: ["/api/settings/usage"],
    queryFn: () => fetch("/api/settings/usage", { credentials: "include" }).then((r) => r.json()),
    enabled: !!user && !isPro,
    refetchInterval: 60000,
  });

  const limitWarningFiredRef = useRef(false);
  useEffect(() => {
    if (!usageData || isPro || limitWarningFiredRef.current) return;
    const pct = usageData.count / usageData.limit;
    if (pct >= 0.8 && pct < 1.0) {
      limitWarningFiredRef.current = true;
      toast({
        title: "Approaching daily limit",
        description: `You've used ${usageData.count} of ${usageData.limit} messages today. Upgrade to Pro for unlimited access.`,
        variant: "default",
      });
    }
  }, [usageData, isPro, toast]);

  /* ── Global keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl+K — new chat (only when not typing in an input)
      if (mod && e.key === "k" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        handleNewChat();
      }

      // Escape — close search/summary/settings modals
      if (e.key === "Escape") {
        setSearchOpen(false);
        setSearchQuery("");
        setSummaryOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Load user settings ── */
  const { data: userSettings } = useQuery<{
    fontSize: string; assistantName: string; activePromptId: string | null;
    defaultModel: string; autoScroll: boolean; autoTitle: boolean; showTokenUsage: boolean;
    notificationSound: boolean;
  }>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings", { credentials: "include" }).then((r) => r.json()),
    enabled: !!user,
  });
  const fontSize = userSettings?.fontSize ?? "normal";
  const assistantName = userSettings?.assistantName ?? "Assistant";
  const autoScroll = userSettings?.autoScroll ?? true;
  const autoTitle = userSettings?.autoTitle ?? true;
  useEffect(() => { setLocalAutoScroll(autoScroll); }, [autoScroll]);
  const showTokenUsage = userSettings?.showTokenUsage ?? false;
  const notificationSound = userSettings?.notificationSound ?? false;

  /* ── Web Audio chime ── */
  const playChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.12;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t);
        osc.stop(t + 0.35);
      });
    } catch { /* audio not supported */ }
  };

  /* Keep inputRef in sync for use in callbacks */
  useEffect(() => { inputRef.current = input; }, [input]);

  /* ── Draft helpers (use refs to avoid stale closures) ── */
  const saveDraft = (id: string | null, text: string) => {
    if (!id) return;
    if (text.trim()) localStorage.setItem(`draft-${id}`, text);
    else localStorage.removeItem(`draft-${id}`);
  };
  const getDraft = (id: string | null) => (id ? localStorage.getItem(`draft-${id}`) || "" : "");

  /* Persist draft as user types (debounced 400ms) */
  useEffect(() => {
    if (!activeId) return;
    const id = activeId;
    const text = input;
    const t = setTimeout(() => saveDraft(id, text), 400);
    return () => clearTimeout(t);
  }, [input, activeId]);

  /* ── Apply default model once settings load (only for new chats) ── */
  useEffect(() => {
    if (userSettings?.defaultModel && !activeId) {
      setModel(userSettings.defaultModel as ModelId);
    }
  }, [userSettings?.defaultModel]);

  /* ── Elapsed time timer during streaming ── */
  useEffect(() => {
    if (!isStreaming) { setElapsedTime(0); return; }
    streamStartRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - streamStartRef.current) / 100) / 10);
    }, 100);
    return () => clearInterval(interval);
  }, [isStreaming]);


  /* ── Load conversations from API ── */
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    queryFn: () =>
      fetch("/api/conversations", { credentials: "include" }).then((r) => r.json()),
    enabled: !!user,
  });

  /* ── Always start with a new chat on mount (no conversation restored) ── */

  /* ── Sync activeIdRef ── */
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (localAutoScroll && isAtBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming, localAutoScroll, isAtBottom]);

  /* ── Track scroll position for "scroll to bottom" button ── */
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setIsAtBottom(scrollHeight - scrollTop - clientHeight < 80);
      setIsAtTop(scrollTop < 100);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsAtBottom(true);
  };

  const scrollToTop = () => {
    topRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsAtTop(true);
  };

  /* ── Tab title notification when AI finishes while tab is hidden ── */
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && isStreaming) {
        tabHiddenDuringStreamRef.current = true;
      }
      if (!document.hidden) {
        if (document.title !== prevTitleRef.current && prevTitleRef.current) {
          document.title = prevTitleRef.current;
          prevTitleRef.current = "";
        }
        tabHiddenDuringStreamRef.current = false;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isStreaming]);

  useEffect(() => {
    if (!isStreaming && tabHiddenDuringStreamRef.current && document.hidden) {
      prevTitleRef.current = document.title;
      document.title = "✓ Response ready — AI Sparky";
    }
  }, [isStreaming]);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        if (messages.length > 0) {
          e.preventDefault();
          setSearchOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 50);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setGlobalSearchOpen(true);
      }
      if (e.key === "Escape") {
        if (globalSearchOpen) {
          setGlobalSearchOpen(false);
        } else if (searchOpen) {
          setSearchOpen(false);
          setSearchQuery("");
        } else if (isStreaming) {
          abortRef.current?.abort();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isStreaming, searchOpen, globalSearchOpen, messages.length]);

  /* ── Update search match count whenever query or messages change ── */
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchTotalMatches(0); setSearchMatchIndex(0); return; }
    const container = messagesContainerRef.current;
    if (!container) return;
    const count = container.querySelectorAll(".search-highlight").length;
    setSearchTotalMatches(count);
  });

  /* ── Load messages when selecting a conversation ── */
  const handleSelectConversation = useCallback(async (id: string) => {
    abortRef.current?.abort();
    setError(null);
    saveDraft(activeIdRef.current, inputRef.current);
    setInput(getDraft(id));
    setActiveId(id);
    setActiveConversationId(id);
    const conv = conversations.find((c) => c.id === id);
    if (conv) setModel(conv.model as ModelId);

    setIsLoadingMessages(true);
    try {
      const res = await fetch(`/api/conversations/${id}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const msgs: Message[] = (data.messages as ApiMessage[]).map(apiMessageToLocal);
        setMessages(msgs);
      }
    } finally {
      setIsLoadingMessages(false);
    }
  }, [conversations]);

  const handleNewChat = () => {
    abortRef.current?.abort();
    saveDraft(activeIdRef.current, inputRef.current);
    setActiveId(null);
    setActiveConversationId(null);
    setMessages([]);
    setInput("");
    setError(null);
  };

  const handleDeleteConversation = async (id: string) => {
    await apiRequest("DELETE", `/api/conversations/${id}`);
    queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    if (activeId === id) {
      setActiveId(null);
      setActiveConversationId(null);
      setMessages([]);
    }
  };

  const handleModelChange = async (newModel: ModelId) => {
    if (!isPro) return;
    setModel(newModel);
    if (activeId) {
      await apiRequest("PATCH", `/api/conversations/${activeId}`, { model: newModel });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    }
  };

  const handleRenameConversation = async (id: string, title: string) => {
    await apiRequest("PATCH", `/api/conversations/${id}`, { title });
    queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
  };

  const handlePinConversation = async (id: string, isPinned: boolean) => {
    await apiRequest("PATCH", `/api/conversations/${id}/pin`, { isPinned });
    queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
  };

  const handleShareConversation = async (id: string): Promise<string | null> => {
    try {
      const res = await apiRequest("POST", `/api/conversations/${id}/share`);
      const data = await res.json();
      return data.shareUrl as string;
    } catch {
      return null;
    }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!activeId || isStreaming || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setError(null);

    /* Delete from that message onward in DB */
    try {
      await apiRequest("DELETE", `/api/conversations/${activeId}/messages/from/${messageId}`);
    } catch { /* continue */ }

    /* Rebuild local messages: remove from the edited message onward */
    const idx = messages.findIndex((m) => m.id === messageId);
    const priorMsgs = idx >= 0 ? messages.slice(0, idx) : messages;

    const newUserMsgId = crypto.randomUUID();
    const newAssistantMsgId = crypto.randomUUID();

    const newUserMsg: Message = {
      id: newUserMsgId,
      role: "user",
      content: newContent,
      timestamp: Date.now(),
      isPinned: false,
    };
    const newAssistantMsg: Message = {
      id: newAssistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isPinned: false,
    };

    const updatedMsgs = [...priorMsgs, newUserMsg, newAssistantMsg];
    setMessages(updatedMsgs);

    /* Save the edited user message to DB */
    try {
      await apiRequest("POST", `/api/conversations/${activeId}/messages`, {
        role: "user",
        content: newContent,
      });
    } catch { /* non-fatal */ }

    await streamAssistantReply(activeId, updatedMsgs, newAssistantMsgId);
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamingMessageId(null);
  };

  const handleExport = () => {
    if (!messages.length) return;
    const conv = conversations.find((c) => c.id === activeId);
    exportConversationAsMarkdown(conv?.title ?? "Conversation", messages);
  };

  const handleExportPDF = () => {
    if (!messages.length) return;
    const conv = conversations.find((c) => c.id === activeId);
    const title = conv?.title ?? "Conversation";
    const exportedAt = new Date().toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });

    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const mdToHtml = (text: string) => {
      let t = esc(text);
      t = t.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) =>
        `<div class="code-block">${lang ? `<div class="code-lang">${lang}</div>` : ""}<pre><code>${code}</code></pre></div>`
      );
      t = t.replace(/`([^`\n]+)`/g, "<code>$1</code>");
      t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      t = t.replace(/\*(.+?)\*/g, "<em>$1</em>");
      t = t.replace(/^### (.+)$/gm, "<h3>$1</h3>");
      t = t.replace(/^## (.+)$/gm, "<h2>$1</h2>");
      t = t.replace(/^# (.+)$/gm, "<h1>$1</h1>");
      t = t.replace(/^\s*[-*] (.+)$/gm, "<li>$1</li>");
      t = t.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
      t = t.replace(/\n\n+/g, "</p><p>");
      t = t.replace(/\n/g, "<br>");
      return `<p>${t}</p>`;
    };

    const messagesHtml = messages.map((m) => {
      const isUser = m.role === "user";
      const time = new Date(m.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      const content = isUser ? `<p class="user-text">${esc(m.content)}</p>` : mdToHtml(m.content);
      const attachments = m.attachments?.length
        ? `<div class="attachments">${m.attachments.map(a => `<span class="att-chip">📎 ${esc(a.name)}</span>`).join("")}</div>`
        : "";
      return `
        <div class="message ${isUser ? "user" : "assistant"}">
          <div class="msg-header">
            <span class="role">${isUser ? "You" : (assistantName || "Assistant")}</span>
            <span class="time">${time}</span>
          </div>
          ${attachments}
          <div class="msg-body">${content}</div>
        </div>`;
    }).join("\n");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 14px; color: #1a1a2e; background: #fff; padding: 0 24px; max-width: 820px; margin: 0 auto; }
  .doc-header { padding: 32px 0 24px; border-bottom: 2px solid #6d28d9; margin-bottom: 28px; }
  .doc-header h1 { font-size: 22px; font-weight: 700; color: #4c1d95; margin-bottom: 6px; }
  .doc-header .meta { font-size: 12px; color: #6b7280; display: flex; gap: 16px; flex-wrap: wrap; }
  .message { margin-bottom: 20px; padding: 14px 16px; border-radius: 12px; page-break-inside: avoid; }
  .message.user { background: #f5f3ff; border-left: 3px solid #7c3aed; }
  .message.assistant { background: #f9fafb; border-left: 3px solid #e5e7eb; }
  .msg-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .role { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  .message.user .role { color: #7c3aed; }
  .message.assistant .role { color: #6b7280; }
  .time { font-size: 10px; color: #9ca3af; margin-left: auto; }
  .msg-body p { line-height: 1.7; margin-bottom: 10px; }
  .msg-body p:last-child { margin-bottom: 0; }
  .msg-body h1 { font-size: 18px; font-weight: 700; margin: 16px 0 8px; }
  .msg-body h2 { font-size: 15px; font-weight: 600; margin: 14px 0 6px; }
  .msg-body h3 { font-size: 13px; font-weight: 600; margin: 12px 0 5px; }
  .msg-body ul { padding-left: 20px; margin: 8px 0; }
  .msg-body li { margin-bottom: 4px; line-height: 1.6; }
  .msg-body code { background: #f3f4f6; padding: 1px 5px; border-radius: 4px; font-family: "SF Mono", Consolas, monospace; font-size: 12px; color: #b45309; }
  .code-block { background: #1e1e2e; border-radius: 8px; overflow: hidden; margin: 12px 0; page-break-inside: avoid; }
  .code-lang { background: #2d2d3f; color: #a78bfa; font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 6px 14px; letter-spacing: 0.08em; font-family: monospace; }
  .code-block pre { padding: 14px; overflow-x: auto; }
  .code-block code { background: none; color: #e2e8f0; font-size: 12px; padding: 0; line-height: 1.6; }
  .user-text { white-space: pre-wrap; word-break: break-word; }
  .attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .att-chip { background: #ede9fe; color: #7c3aed; font-size: 11px; padding: 2px 8px; border-radius: 20px; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: #7c3aed; color: white; border: none; padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; z-index: 100; }
  .print-btn:hover { background: #6d28d9; }
  @media print { .print-btn { display: none; } body { padding: 0 8px; } }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨 Print / Save PDF</button>
<div class="doc-header">
  <h1>${esc(title)}</h1>
  <div class="meta">
    <span>📅 Exported ${exportedAt}</span>
    <span>💬 ${messages.length} message${messages.length !== 1 ? "s" : ""}</span>
  </div>
</div>
${messagesHtml}
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleExportTxt = () => {
    if (!messages.length) return;
    const conv = conversations.find((c) => c.id === activeId);
    const title = conv?.title ?? "Conversation";
    const lines: string[] = [`${title}`, `${"=".repeat(title.length)}`, ""];
    for (const msg of messages) {
      const role = msg.role === "user" ? "You" : "AI";
      const ts = new Date(msg.timestamp).toLocaleString();
      lines.push(`[${role}] ${ts}`);
      lines.push(msg.content);
      lines.push("");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleForkMessage = useCallback(async (messageId: string) => {
    if (!activeId) return;
    const conv = conversations.find((c) => c.id === activeId);
    const msgIndex = messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) return;
    const msgsToFork = messages.slice(0, msgIndex + 1);
    try {
      const res = await apiRequest("POST", "/api/conversations", {
        title: `Fork: ${conv?.title ?? "Conversation"}`,
        model: conv?.model ?? "auto",
      });
      const newConv: Conversation = await res.json();
      for (const msg of msgsToFork) {
        await apiRequest("POST", `/api/conversations/${newConv.id}/messages`, {
          role: msg.role,
          content: msg.content,
          modelUsed: msg.modelUsed,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      handleSelectConversation(newConv.id);
    } catch (err) {
      console.error("Fork failed", err);
    }
  }, [activeId, messages, conversations]);

  const handleQuoteReply = useCallback((messageId: string, snippet: string) => {
    setQuotedMessage({ id: messageId, snippet });
  }, []);

  /* ── Stream assistant reply ── */
  const streamAssistantReply = async (
    convId: string,
    msgs: Message[],
    assistantMsgId: string,
    modelOverride?: string,
  ) => {
    const controller = new AbortController();
    abortRef.current = controller;

    setIsStreaming(true);
    setStreamingModel(modelOverride ?? model);
    setStreamingMessageId(assistantMsgId);

    const historyForApi = msgs
      .filter((m) => m.id !== assistantMsgId)
      .map((m) => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments?.map((a) => ({
          type: a.type,
          name: a.name,
          mimeType: a.mimeType,
          data: a.data,
        })),
      }));

    let accumulated = "";
    let finalModelUsed: string | undefined;
    let finalInputTokens: number | undefined;
    let finalOutputTokens: number | undefined;
    let finalSources: import("@/lib/chat-storage").WebSource[] | undefined;
    const pendingToolCalls: import("@/lib/chat-storage").ToolCall[] = [];

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historyForApi,
          model: modelOverride ?? model,
          webSearch: webSearchMode,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Request failed" }));
        if (errorData.monthlyLimitReached) {
          toast({ title: "Monthly token limit reached", description: errorData.error || "Your Pro monthly output limit has been reached. It resets on your billing date.", variant: "destructive" });
          queryClient.invalidateQueries({ queryKey: ["/api/usage"] });
          setIsStreaming(false);
          setStreamingModel(null);
          setStreamingMessageId(null);
          setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
          return;
        }
        throw new Error(errorData.error || "Request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let pendingText = "";
      let flushTimeout: ReturnType<typeof setTimeout> | null = null;

      const flush = () => {
        flushTimeout = null;
        if (!pendingText) return;
        accumulated += pendingText;
        pendingText = "";
        const text = accumulated;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, content: text } : m))
        );
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            if (parsed.error || parsed.limitReached || parsed.monthlyLimitReached) {
              if (parsed.monthlyLimitReached) {
                toast({ title: "Monthly token limit reached", description: parsed.error || "Your Pro monthly output limit has been reached. It will reset on your billing date.", variant: "destructive" });
                queryClient.invalidateQueries({ queryKey: ["/api/usage"] });
                setIsStreaming(false);
                setStreamingModel(null);
                setStreamingMessageId(null);
                setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
                return;
              }
              if (parsed.limitReached || (parsed.error && String(parsed.error).includes("Daily message limit"))) {
                setUpgradeReason("limit");
                setShowUpgradeModal(true);
                setIsStreaming(false);
                setStreamingModel(null);
                setStreamingMessageId(null);
                setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
                return;
              }
              throw new Error(parsed.error);
            }
            if (parsed.routingInfo) {
              setMessages((prev) =>
                prev.map((m) => m.id === assistantMsgId ? { ...m, routingInfo: parsed.routingInfo } : m)
              );
            }
            if (parsed.searching) {
              setMessages((prev) =>
                prev.map((m) => m.id === assistantMsgId ? { ...m, searching: parsed.query as string } : m)
              );
            }
            if (parsed.done) {
              finalInputTokens = parsed.inputTokens ?? undefined;
              finalOutputTokens = parsed.outputTokens ?? undefined;
              if (parsed.sources?.length) {
                finalSources = parsed.sources;
                setMessages((prev) =>
                  prev.map((m) => m.id === assistantMsgId ? { ...m, sources: parsed.sources, searching: undefined } : m)
                );
              } else {
                setMessages((prev) =>
                  prev.map((m) => m.id === assistantMsgId ? { ...m, searching: undefined } : m)
                );
              }
              /* Refresh Pro monthly usage bar */
              if (parsed.monthlyTokensUsed !== undefined) {
                queryClient.invalidateQueries({ queryKey: ["/api/usage"] });
              }
              /* 90% warning toast */
              if (parsed.monthlyWarn && !sessionStorage.getItem("monthlyWarnToasted")) {
                sessionStorage.setItem("monthlyWarnToasted", "1");
                toast({ title: "Token budget at 90%", description: `You've used ${(parsed.monthlyTokensUsed / 1000).toFixed(0)}K / 2,200K output tokens this month.`, variant: "destructive" });
              }
            }
            if (parsed.modelUsed) {
              finalModelUsed = parsed.modelUsed;
              setStreamingModel(parsed.modelUsed);
              if (flushTimeout) { clearTimeout(flushTimeout); flush(); }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, modelUsed: parsed.modelUsed } : m
                )
              );
            }
            if (parsed.text) {
              pendingText += parsed.text;
              if (!flushTimeout) {
                flushTimeout = setTimeout(flush, 50);
              }
            }
            if (parsed.toolCall) {
              pendingToolCalls.push({ name: parsed.toolCall.name, input: parsed.toolCall.input });
              setMessages((prev) =>
                prev.map((m) => m.id === assistantMsgId ? { ...m, toolCalls: [...pendingToolCalls] } : m)
              );
            }
            if (parsed.toolResult) {
              const last = pendingToolCalls[pendingToolCalls.length - 1];
              if (last) last.result = parsed.toolResult.result;
              setMessages((prev) =>
                prev.map((m) => m.id === assistantMsgId ? { ...m, toolCalls: [...pendingToolCalls] } : m)
              );
            }
          } catch (parseErr: unknown) {
            const err = parseErr as Error;
            if (err.name !== "SyntaxError") throw parseErr;
          }
        }
      }

      if (flushTimeout) clearTimeout(flushTimeout);
      flush();

      /* ── Save completed assistant message to DB (always, even if user navigated away) ── */
      if (accumulated) {
        await apiRequest("POST", `/api/conversations/${convId}/messages`, {
          role: "assistant",
          content: accumulated,
          modelUsed: finalModelUsed,
          inputTokens: finalInputTokens,
          outputTokens: finalOutputTokens,
          toolCalls: pendingToolCalls.length > 0 ? pendingToolCalls : undefined,
          sources: finalSources,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/settings/usage"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats/tokens"] });
      }

      /* ── In-page celebrations only if still viewing this conversation ── */
      if (convId === activeIdRef.current) {

        /* ── Milestone celebrations ── */
        const MILESTONES = [10, 25, 50, 100, 250, 500, 1000];
        const MILESTONE_LABELS: Record<number, { title: string; description: string }> = {
          10:   { title: "10 messages! 🔥",   description: "You're getting warmed up — just the beginning!" },
          25:   { title: "25 messages! ⚡",    description: "Finding your rhythm with AI Sparky." },
          50:   { title: "50 messages! 🎉",    description: "Halfway to 100 — you're on fire!" },
          100:  { title: "100 messages! 👑",   description: "Power user unlocked. You're unstoppable." },
          250:  { title: "250 messages! 💫",   description: "AI Sparky superfan status achieved." },
          500:  { title: "500 messages! 🏆",   description: "Elite status. This is seriously impressive." },
          1000: { title: "1,000 messages! ✨", description: "Legendary. You've mastered the art of AI chat." },
        };
        const prevCount = parseInt(localStorage.getItem("sparky-total-msgs") || "0", 10);
        const newCount = prevCount + 1;
        localStorage.setItem("sparky-total-msgs", String(newCount));
        for (const m of MILESTONES) {
          if (newCount >= m && !localStorage.getItem(`sparky-ms-${m}`)) {
            localStorage.setItem(`sparky-ms-${m}`, "1");
            const { title, description } = MILESTONE_LABELS[m];
            toast({ title, description, duration: 6000 });
            break;
          }
        }
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === "AbortError") {
        /* user stopped — mark message as stopped in UI */
        setMessages((prev) =>
          prev.map((m) => m.id === assistantMsgId ? { ...m, stopped: true } : m)
        );
        /* save partial response to DB */
        if (accumulated && convId) {
          try {
            await apiRequest("POST", `/api/conversations/${convId}/messages`, {
              role: "assistant",
              content: accumulated,
              modelUsed: finalModelUsed,
            });
            queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
          } catch { /* ignore save error on abort */ }
        }
      } else {
        setError(error.message || "Something went wrong. Please try again.");
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
      }
    } finally {
      setIsStreaming(false);
      setStreamingModel(null);
      setStreamingMessageId(null);
      isSubmittingRef.current = false;
      if (notificationSound && accumulated.length > 80) playChime();
    }
    /* ── Fetch follow-up suggestions (non-blocking) ── */
    setFollowUpSuggestions([]);
    apiRequest("POST", "/api/suggestions", {
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }).then((r) => r.json()).then((d) => {
      if (Array.isArray(d.suggestions) && d.suggestions.length > 0) {
        setFollowUpSuggestions(d.suggestions);
      }
    }).catch(() => {});
  };

  /* ── Submit message ── */
  const handleSubmit = async (attachments: Attachment[]) => {
    if (!user) { setLoginModalOpen(true); return; }
    setFollowUpSuggestions([]);
    const text = input.trim();
    if ((!text && attachments.length === 0) || isStreaming || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setError(null);
    setInput("");
    saveDraft(activeId, "");

    /* Prepend quoted message if set */
    const contentWithQuote = quotedMessage
      ? `> ${quotedMessage.snippet}\n\n${text}`
      : text;
    setQuotedMessage(null);

    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    const userMsg: Message = {
      id: userMsgId,
      role: "user",
      content: contentWithQuote,
      attachments: attachments.length > 0 ? attachments : undefined,
      timestamp: Date.now(),
      isPinned: false,
    };

    const assistantMsg: Message = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isPinned: false,
    };

    /* Get or create conversation */
    let convId = activeId;

    if (!convId) {
      const title = autoTitle
        ? generateTitle(text || attachments[0]?.name || "File upload")
        : (text.slice(0, 40) || attachments[0]?.name || "New Conversation");
      const res = await apiRequest("POST", "/api/conversations", {
        title,
        model,
      });
      const newConv: Conversation = await res.json();
      convId = newConv.id;
      setActiveId(convId);
      setActiveConversationId(convId);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    }

    /* Optimistically add messages to UI */
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    /* Save user message to DB */
    try {
      await apiRequest("POST", `/api/conversations/${convId}/messages`, {
        role: "user",
        content: contentWithQuote,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
    } catch {
      /* non-fatal — streaming continues */
    }

    await streamAssistantReply(convId, [...messages, userMsg, assistantMsg], assistantMsgId);
  };

  /* ── Regenerate last assistant message ── */
  const handleRegenerate = useCallback(async () => {
    if (!activeId || isStreaming || messages.length === 0) return;

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    const assistantMsgId = crypto.randomUUID();
    const newAssistantMsg: Message = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isPinned: false,
    };

    const updatedMsgs = messages.filter((m) => m.id !== lastAssistant.id);
    updatedMsgs.push(newAssistantMsg);

    isSubmittingRef.current = true;
    setError(null);
    setMessages(updatedMsgs);

    await streamAssistantReply(activeId, updatedMsgs, assistantMsgId);
  }, [activeId, messages, isStreaming]);

  const handleRetryWith = useCallback(async (modelKey: string) => {
    if (!activeId || isStreaming || messages.length === 0) return;

    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    const assistantMsgId = crypto.randomUUID();
    const newAssistantMsg: Message = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isPinned: false,
    };

    const updatedMsgs = messages.filter((m) => m.id !== lastAssistant.id);
    updatedMsgs.push(newAssistantMsg);

    isSubmittingRef.current = true;
    setError(null);
    setMessages(updatedMsgs);

    await streamAssistantReply(activeId, updatedMsgs, assistantMsgId, modelKey);
  }, [activeId, messages, isStreaming]);

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
  const activeConvTitle = conversations.find((c) => c.id === activeId)?.title;

  const navigateSearch = (dir: 1 | -1) => {
    if (searchTotalMatches === 0) return;
    const next = (searchMatchIndex + dir + searchTotalMatches) % searchTotalMatches;
    setSearchMatchIndex(next);
    const container = messagesContainerRef.current;
    if (!container) return;
    const highlights = container.querySelectorAll(".search-highlight");
    highlights[next]?.scrollIntoView({ behavior: "smooth", block: "center" });
    highlights.forEach((el, i) => {
      (el as HTMLElement).style.outline = i === next ? "2px solid hsl(var(--primary))" : "none";
    });
  };

  return (
    <div
      className="flex h-dvh w-full bg-background overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <AppSidebar
        conversations={conversations}
        activeId={activeId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        onRenameConversation={handleRenameConversation}
        onPinConversation={handlePinConversation}
        onShareConversation={handleShareConversation}
        user={user}
        onOpenSettings={() => setSettingsOpen(true)}
        onLogout={() => logout.mutate()}
        onLogin={() => setLoginModalOpen(true)}
      />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-3 py-2 flex-shrink-0 border-b border-border/40">
          <div className="flex items-center gap-1">
            <SidebarTrigger data-testid="button-sidebar-toggle" className="h-9 w-9 text-muted-foreground" />
            {activeConvTitle && (
              <span className="hidden sm:block ml-1 text-sm text-muted-foreground/60 truncate max-w-[200px]">
                {activeConvTitle}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && activeId && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
                  data-testid="button-open-search"
                  title="Search in chat (Ctrl+F)"
                  className="h-9 w-9 text-muted-foreground hidden sm:flex"
                >
                  <Search className="w-4 h-4" />
                </Button>

                {/* Pinned Messages Panel — desktop trigger */}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setPinnedOpen(true)}
                  data-testid="button-view-pinned"
                  title="View pinned messages"
                  className="h-9 w-9 text-muted-foreground hidden sm:flex"
                >
                  <Pin className="w-4 h-4" />
                </Button>

                {/* Mobile: More menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="sm:hidden h-9 w-9 text-muted-foreground" data-testid="button-mobile-more">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => setGlobalSearchOpen(true)} className="gap-2 cursor-pointer">
                      <Search className="w-3.5 h-3.5 text-primary/60" /> Search all chats
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }} className="gap-2 cursor-pointer">
                      <Search className="w-3.5 h-3.5" /> Search in chat
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPinnedOpen(true)} className="gap-2 cursor-pointer">
                      <Pin className="w-3.5 h-3.5" /> Pinned messages
                    </DropdownMenuItem>

                    <DropdownMenuItem onClick={handleExport} className="gap-2 cursor-pointer">
                      <Download className="w-3.5 h-3.5" /> Download Markdown
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportTxt} className="gap-2 cursor-pointer">
                      <FileText className="w-3.5 h-3.5" /> Download Plain Text
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportPDF} className="gap-2 cursor-pointer">
                      <Printer className="w-3.5 h-3.5" /> Export as PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleSummarize} className="gap-2 cursor-pointer">
                      <Sparkles className="w-3.5 h-3.5" /> Summarize
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Pinned Messages Sheet (state-driven) */}
                <Sheet open={pinnedOpen} onOpenChange={setPinnedOpen}>
                  <SheetContent side="right" className="w-[400px] sm:w-[540px]">
                    <SheetHeader>
                      <SheetTitle className="flex items-center gap-2">
                        <Pin className="w-5 h-5 text-yellow-500 fill-current" />
                        Pinned Messages
                      </SheetTitle>
                    </SheetHeader>
                    <ScrollArea className="h-[calc(100dvh-100px)] mt-4 pr-4">
                      <div className="flex flex-col gap-4">
                        {messages.filter(m => m.isPinned).length === 0 ? (
                          <div className="text-center py-10 text-muted-foreground">
                            <Pin className="w-10 h-10 mx-auto mb-3 opacity-20" />
                            <p>No pinned messages in this conversation</p>
                          </div>
                        ) : (
                          messages.filter(m => m.isPinned).map((msg) => (
                            <div
                              key={msg.id}
                              className="group relative p-4 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                              onClick={() => {
                                const el = document.querySelector(`[data-testid="message-${msg.id}"]`);
                                el?.scrollIntoView({ behavior: "smooth", block: "center" });
                              }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                  {msg.role === "user" ? "You" : assistantName}
                                </span>
                                <span className="text-[10px] text-muted-foreground/50">
                                  {new Date(msg.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                              <p className="text-sm line-clamp-3 text-foreground/80 leading-relaxed">
                                {msg.content}
                              </p>
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Pin className="w-3 h-3 text-yellow-500 fill-current" />
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </SheetContent>
                </Sheet>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      data-testid="button-export-dropdown"
                      title="Export conversation"
                      className="hidden sm:flex h-9 w-9 text-muted-foreground"
                    >
                      <FileDown className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={handleExport} data-testid="button-export-md" className="gap-2 cursor-pointer">
                      <Download className="w-3.5 h-3.5" /> Download Markdown
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportTxt} data-testid="button-export-txt" className="gap-2 cursor-pointer">
                      <FileText className="w-3.5 h-3.5" /> Download Plain Text
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportPDF} data-testid="button-export-pdf" className="gap-2 cursor-pointer">
                      <Printer className="w-3.5 h-3.5" /> Export as PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleSummarize}
                  data-testid="button-summarize"
                  title="Summarize conversation"
                  className="hidden sm:flex h-9 w-9 text-muted-foreground"
                >
                  <Sparkles className="w-4 h-4" />
                </Button>
              </>
            )}

            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTheme}
              data-testid="button-toggle-theme"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="h-9 w-9 text-muted-foreground"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setGlobalSearchOpen(true)}
              data-testid="button-global-search"
              title="Search all conversations (⌘K)"
              className="hidden sm:flex h-9 w-9 text-muted-foreground"
            >
              <Search className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleNewChat}
              data-testid="button-new-chat-header"
              title="New chat"
              className="h-9 w-9 text-muted-foreground"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setSplitView(!splitView)}
              data-testid="button-toggle-split-view"
              title={splitView ? "Single view" : "Split view"}
              className={cn("hidden sm:flex h-9 w-9", splitView ? "text-primary bg-primary/10" : "text-muted-foreground")}
            >
              <Columns2 className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Email Verification Banner */}
        {user && user.email && !user.emailVerified && !verifyBannerDismissed && (
          <div className="flex-shrink-0 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300 no-print" data-testid="banner-email-verification">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <MailCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-sm text-foreground font-medium truncate">
                Please verify your email address.{" "}
                <button
                  onClick={handleResendVerification}
                  disabled={resendingVerification}
                  className="underline text-amber-600 dark:text-amber-400 hover:opacity-80 disabled:opacity-50 cursor-pointer"
                  data-testid="button-resend-verification"
                >
                  {resendingVerification ? "Sending…" : "Resend verification email"}
                </button>
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full hover:bg-amber-500/20 flex-shrink-0"
              onClick={() => setVerifyBannerDismissed(true)}
              data-testid="button-dismiss-verification-banner"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Broadcast Banner */}
        {broadcast && !broadcastDismissed && (
          <div className="flex-shrink-0 bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300 no-print">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Megaphone className="w-4 h-4 text-primary" />
              </div>
              <p className="text-sm text-foreground font-medium truncate">
                {broadcast.message}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full hover:bg-primary/20 flex-shrink-0"
              onClick={dismissBroadcast}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Primary Chat */}
          <div
            className={cn("flex-1 flex flex-col min-w-0 relative", splitView && "border-r border-border/40")}
            onDragEnter={(e) => {
              e.preventDefault();
              if (Array.from(e.dataTransfer.items).some(i => i.kind === "file")) {
                dragCounterRef.current += 1;
                setIsDraggingOver(true);
              }
            }}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
            onDragLeave={() => {
              dragCounterRef.current -= 1;
              if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setIsDraggingOver(false); }
            }}
            onDrop={(e) => {
              e.preventDefault();
              dragCounterRef.current = 0;
              setIsDraggingOver(false);
              const files = Array.from(e.dataTransfer.files);
              if (files.length > 0) setDroppedFiles(files);
            }}
          >
            {/* Search bar */}
            {searchOpen && (
              <div className="flex-shrink-0 border-b border-border/40 bg-background/95 backdrop-blur-sm px-3 py-1.5 flex items-center gap-2 no-print">
                <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSearchMatchIndex(0); }}
                  onKeyDown={(e) => { if (e.key === "Enter") navigateSearch(e.shiftKey ? -1 : 1); }}
                  placeholder="Search in conversation..."
                  data-testid="input-conversation-search"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
                />
                {searchQuery && (
                  <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                    {searchTotalMatches > 0 ? `${searchMatchIndex + 1}/${searchTotalMatches}` : "0 results"}
                  </span>
                )}
                <Button size="icon" variant="ghost" onClick={() => navigateSearch(-1)} data-testid="button-search-prev" className="h-6 w-6" disabled={searchTotalMatches === 0} title="Previous (Shift+Enter)">
                  <ChevronUp className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => navigateSearch(1)} data-testid="button-search-next" className="h-6 w-6" disabled={searchTotalMatches === 0} title="Next (Enter)">
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => { setSearchOpen(false); setSearchQuery(""); }} data-testid="button-search-close" className="h-6 w-6" title="Close (Esc)">
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 relative overflow-y-auto overscroll-contain custom-scrollbar" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties} ref={messagesContainerRef}>
              {isLoadingMessages ? (
                <div className="flex items-center justify-center h-full gap-2">
                  <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                  <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                  <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <EmptyState onSuggest={(text) => { setInput(text); }} userName={user?.username} />
              ) : (
                <div className="max-w-3xl mx-auto py-6">
                  <div ref={topRef} />
                  {messages.map((msg) => (
                    <ChatMessage
                      key={msg.id}
                      message={msg}
                      isStreaming={isStreaming && msg.id === streamingMessageId}
                      streamingModel={isStreaming && msg.id === streamingMessageId ? streamingModel ?? undefined : undefined}
                      elapsedTime={isStreaming && msg.id === streamingMessageId ? elapsedTime : 0}
                      selectedModel={isStreaming && msg.id === streamingMessageId ? model : undefined}
                      isLast={msg.id === lastAssistantMsg?.id}
                      conversationId={activeId ?? undefined}
                      assistantName={assistantName}
                      fontSize={fontSize}
                      searchQuery={searchQuery}
                      showTokenUsage={showTokenUsage}
                      onRegenerate={
                        msg.role === "assistant" && msg.id === lastAssistantMsg?.id && !isStreaming
                          ? handleRegenerate
                          : undefined
                      }
                      onRetryWith={
                        msg.role === "assistant" && msg.id === lastAssistantMsg?.id && !isStreaming
                          ? handleRetryWith
                          : undefined
                      }
                      isPro={isPro}
                      onEdit={msg.role === "user" && !isStreaming ? handleEditMessage : undefined}
                      onFork={msg.role === "user" && !isStreaming ? handleForkMessage : undefined}
                      onQuoteReply={msg.role === "assistant" && !isStreaming ? handleQuoteReply : undefined}
                    />
                  ))}
                  {error && (
                    <div data-testid="error-message" className="mx-4 mt-2 mb-4 px-4 py-3 rounded-xl bg-destructive/8 border border-destructive/20 text-destructive text-sm flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold">Error: </span>{error}
                      </div>
                      {error.includes("Daily message limit") && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="flex-shrink-0 h-8 text-xs font-semibold bg-primary/10 border-primary/20 hover:bg-primary/20 text-primary"
                          onClick={() => { setUpgradeReason("limit"); setShowUpgradeModal(true); }}
                          data-testid="button-error-upgrade"
                        >
                          <Crown className="w-3 h-3 mr-1" /> Upgrade
                        </Button>
                      )}
                    </div>
                  )}
                  <div ref={bottomRef} className="h-4" />
                </div>
              )}

            </div>

            {/* Scroll to bottom button — absolute inside the relative primary chat column */}
            {!isAtBottom && messages.length > 0 && (
              <button
                onClick={scrollToBottom}
                data-testid="button-scroll-to-bottom"
                className="absolute bottom-36 right-5 z-20 flex items-center gap-1.5 pl-3 pr-3.5 py-2 rounded-full bg-background/95 backdrop-blur-sm border border-border shadow-lg hover:shadow-xl hover:bg-card text-foreground font-medium transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
              >
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Jump to latest</span>
              </button>
            )}
            {/* Scroll to top button */}
            {!isAtTop && messages.length > 0 && (
              <button
                onClick={scrollToTop}
                data-testid="button-scroll-to-top"
                className="absolute bottom-52 right-5 z-20 flex items-center gap-1.5 pl-3 pr-3.5 py-2 rounded-full bg-background/95 backdrop-blur-sm border border-border shadow-lg hover:shadow-xl hover:bg-card text-foreground font-medium transition-all duration-200 animate-in fade-in slide-in-from-top-2"
              >
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Jump to top</span>
              </button>
            )}


            {/* Follow-up suggestion chips */}
            {followUpSuggestions.length > 0 && !isStreaming && (
              <div className="flex flex-wrap gap-2 px-4 pb-3 max-w-3xl mx-auto w-full">
                {followUpSuggestions.map((s, i) => (
                  <button
                    key={i}
                    data-testid={`suggestion-chip-${i}`}
                    onClick={() => { setInput(s); setFollowUpSuggestions([]); }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border border-border/60 bg-card hover:bg-card hover:border-primary/40 hover:shadow-sm hover:shadow-primary/8 text-muted-foreground hover:text-foreground transition-all duration-200"
                  >
                    <Sparkles className="w-3 h-3 text-primary/60 flex-shrink-0" />
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Full-page drag-and-drop overlay */}
            {isDraggingOver && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/90 backdrop-blur-sm border-2 border-dashed border-primary/50 rounded-none pointer-events-none animate-in fade-in duration-150">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Upload className="w-8 h-8 text-primary/70" />
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold text-foreground/80">Drop files to attach</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">Images, PDFs, text files and more</p>
                </div>
              </div>
            )}

            <div className="flex-shrink-0 safe-bottom" data-testid="chat-input-area">
              <ChatInput
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                onStop={handleStop}
                isStreaming={isStreaming}
                model={model}
                onModelChange={handleModelChange}
                isPro={isPro}
                freeAllowedModels={isPro ? undefined : planLimitsData?.freeAllowedModels}
                quotedMessage={quotedMessage ?? undefined}
                onClearQuote={() => setQuotedMessage(null)}
                isWebSearch={webSearchMode}
                onToggleWebSearch={() => setWebSearchMode((m) => !m)}
                onUpgradeClick={() => {
                  setUpgradeReason("model");
                  setShowUpgradeModal(true);
                }}
                externalFiles={droppedFiles}
              />
            </div>
          </div>

          {/* Secondary Chat (Split View) */}
          {splitView && (
            <div className="flex-1 min-w-0 hidden lg:flex">
              <SecondaryChat isPro={isPro} />
            </div>
          )}
        </div>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <LoginPromptModal open={loginModalOpen} onClose={() => setLoginModalOpen(false)} />
      <GlobalSearchModal
        open={globalSearchOpen}
        onOpenChange={setGlobalSearchOpen}
        onNavigate={(convId) => { setActiveId(convId); setGlobalSearchOpen(false); }}
      />
      <UpgradeModal open={showUpgradeModal} onOpenChange={setShowUpgradeModal} reason={upgradeReason} />
      {user && <OnboardingModal onStartWithPrompt={(prompt) => setInput(prompt)} />}
      {showAssistantNameModal && (
        <AssistantNameModal onDone={() => {
          sessionStorage.removeItem("justRegistered");
          setShowAssistantNameModal(false);
        }} />
      )}

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Conversation Summary
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 min-h-[80px]">
            {summaryLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block" />
                Generating summary…
              </div>
            ) : (
              <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {summaryText}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const QUICK_SUGGESTIONS = [
  { icon: Code2,       label: "Write code",       prompt: "Write a TypeScript function that debounces any async function and returns a promise.", color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-500/10 dark:bg-blue-500/8"    },
  { icon: PenLine,     label: "Draft writing",     prompt: "Write a concise, compelling bio for a software engineer who is also an avid reader and hiker.", color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10 dark:bg-violet-500/8" },
  { icon: BarChart2,   label: "Analyze data",      prompt: "Explain how to interpret a confusion matrix and what precision, recall, and F1 score mean.", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 dark:bg-emerald-500/8" },
  { icon: Lightbulb,   label: "Brainstorm ideas",  prompt: "Give me 10 creative side project ideas for a developer who wants to learn about AI.", color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-500/10 dark:bg-amber-500/8"   },
  { icon: Globe,       label: "Explain concepts",  prompt: "Explain how large language models work in plain English, step by step.", color: "text-cyan-600 dark:text-cyan-400",     bg: "bg-cyan-500/10 dark:bg-cyan-500/8"    },
  { icon: FlaskConical,label: "Debug & review",    prompt: "What are the most common React performance pitfalls and how do I fix them?", color: "text-rose-600 dark:text-rose-400",     bg: "bg-rose-500/10 dark:bg-rose-500/8"    },
];

const STARTER_TEMPLATES = [
  {
    icon: Code2,
    label: "Code Review",
    category: "Technical",
    desc: "Paste your code for a detailed review",
    prompt: "Please review the following code for bugs, performance issues, and best practices. Provide specific, actionable feedback:\n\n```\n// Paste your code here\n```",
    color: "text-blue-600 dark:text-blue-400",
    bgGradient: "from-blue-500/10 to-blue-500/5",
    border: "border-blue-500/20",
  },
  {
    icon: PenLine,
    label: "Email Draft",
    category: "Writing",
    desc: "Write a professional email in seconds",
    prompt: "Help me write a professional email. Here are the details:\n- To: [recipient]\n- Purpose: [what you want to achieve]\n- Tone: [formal/friendly/urgent]\n- Key points to include: [list your points]",
    color: "text-violet-600 dark:text-violet-400",
    bgGradient: "from-violet-500/10 to-violet-500/5",
    border: "border-violet-500/20",
  },
  {
    icon: BarChart2,
    label: "Resume Help",
    category: "Career",
    desc: "Improve a bullet point or section",
    prompt: "Help me improve this resume bullet point to be more impactful and results-oriented:\n\n[Paste your bullet point here]\n\nJob I'm applying for: [Job title]",
    color: "text-emerald-600 dark:text-emerald-400",
    bgGradient: "from-emerald-500/10 to-emerald-500/5",
    border: "border-emerald-500/20",
  },
  {
    icon: Lightbulb,
    label: "Study Plan",
    category: "Learning",
    desc: "Build a structured learning roadmap",
    prompt: "Create a detailed 4-week study plan to learn [topic]. I'm a [beginner/intermediate/advanced] learner with [X hours/week] available. Include resources, milestones, and daily exercises.",
    color: "text-amber-600 dark:text-amber-400",
    bgGradient: "from-amber-500/10 to-amber-500/5",
    border: "border-amber-500/20",
  },
];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function EmptyState({ onSuggest, userName }: { onSuggest: (text: string) => void; userName?: string }) {
  const { t } = useLanguage();
  const greeting = getGreeting();
  const personalName = userName ? `, ${userName.charAt(0).toUpperCase() + userName.slice(1)}` : "";
  return (
    <div className="relative flex flex-col items-center justify-center min-h-full py-10 px-4 sm:px-6 overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-primary/8 rounded-full blur-[100px] pointer-events-none -z-10" />

      <div className="relative mb-5">
        <img src="/logo.png" alt="AI Sparky" className="w-[72px] h-[72px] rounded-2xl object-cover shadow-2xl shadow-primary/40 ring-1 ring-white/10" />
        <div className="absolute inset-0 rounded-2xl bg-primary/30 blur-3xl scale-[2] -z-10" />
      </div>

      <p className="text-xs font-semibold text-primary/60 uppercase tracking-widest mb-1">{greeting}{personalName}</p>
      <h1 className="text-[1.8rem] sm:text-[2rem] font-black tracking-tight text-foreground mb-2 text-center">
        {t("chat.empty.title")}
      </h1>
      <p className="text-muted-foreground/70 text-sm mb-7 text-center max-w-[340px] leading-relaxed">
        {t("chat.empty.subtitle")}
      </p>

      {/* Opus 4.6 featured banner */}
      <div className="w-full max-w-2xl mb-5 relative overflow-hidden rounded-xl border border-amber-500/25 bg-gradient-to-r from-amber-500/8 via-amber-400/5 to-orange-500/8 px-4 py-3.5 flex items-center gap-3.5">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
          <span className="text-lg">👑</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-amber-500 dark:text-amber-400">Claude Opus 4.6 is now available</span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-500 uppercase tracking-wide">New</span>
          </div>
          <p className="text-[11px] text-muted-foreground/80 leading-snug mt-0.5">
            Anthropic's most intelligent model — select <span className="text-foreground font-medium">Powerful</span> in the model picker to activate it.
          </p>
        </div>
      </div>

      {/* Model lineup */}
      <div className="w-full max-w-2xl mb-5">
        <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider mb-2.5">Available Models</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { icon: "👑", label: "Powerful",  model: "Claude Opus 4.6",  color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-500/8  border-amber-500/20" },
            { icon: "⚖️", label: "Balanced",  model: "Mistral Large 3",  color: "text-violet-600 dark:text-violet-400",  bg: "bg-violet-500/8 border-violet-500/20" },
            { icon: "🎨", label: "Creative",  model: "GPT 5.3",          color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/8 border-emerald-500/20" },
            { icon: "⚡", label: "Fast",      model: "Claude Haiku",     color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-500/8   border-blue-500/20" },
          ].map((f) => (
            <div key={f.label} className={cn("flex flex-col gap-1 px-3 py-2.5 rounded-xl border", f.bg)}>
              <div className="flex items-center gap-1.5">
                <span className="text-base">{f.icon}</span>
                <span className={cn("text-[11px] font-bold", f.color)}>{f.label}</span>
              </div>
              <span className="text-[10px] text-muted-foreground/70 leading-tight">{f.model}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Feature highlights */}
      <div className="w-full max-w-2xl mb-6 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { icon: "📚", label: "Knowledge Base", desc: "Upload & search your docs" },
          { icon: "🔍", label: "Cohere Rerank",  desc: "Smarter KB search results" },
          { icon: "🎤", label: "Voice Chat",     desc: "Talk instead of type" },
          { icon: "📎", label: "File Uploads",   desc: "Share images & PDFs" },
        ].map((f) => (
          <div key={f.label} className="flex flex-col items-center text-center gap-1 px-3 py-3 rounded-xl border border-border/40 bg-muted/20">
            <span className="text-xl">{f.icon}</span>
            <span className="text-[11px] font-semibold text-foreground">{f.label}</span>
            <span className="text-[10px] text-muted-foreground/60 leading-tight">{f.desc}</span>
          </div>
        ))}
      </div>

      {/* Starter Templates */}
      <div className="w-full max-w-2xl mb-6">
        <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-3">Starter Templates</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {STARTER_TEMPLATES.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.label}
                onClick={() => onSuggest(t.prompt)}
                data-testid={`template-${t.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={cn(
                  "group flex items-start gap-3 px-4 py-3.5 rounded-xl border text-left transition-all hover:shadow-md hover:scale-[1.01]",
                  `bg-gradient-to-br ${t.bgGradient}`,
                  t.border,
                )}
              >
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", t.bgGradient.split(" ")[0].replace("from-", "bg-").replace("/10", "/20"))}>
                  <Icon className={cn("w-4 h-4", t.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[13px] font-semibold text-foreground">{t.label}</span>
                    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full", t.bgGradient.split(" ")[0].replace("from-", "bg-").replace("/10", "/20"), t.color)}>{t.category}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick prompts */}
      <div className="w-full max-w-2xl">
        <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-3">Quick Prompts</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {QUICK_SUGGESTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.label}
              onClick={() => onSuggest(s.prompt)}
              data-testid={`suggestion-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
              className="group relative flex items-center gap-2.5 px-4 py-3 rounded-xl border border-border/50 bg-card hover:bg-card/80 hover:border-primary/30 hover:shadow-md text-left transition-all duration-200"
            >
              <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0", s.bg)}>
                <Icon className={cn("w-3.5 h-3.5", s.color)} />
              </div>
                      <span className="text-[12px] font-semibold text-foreground leading-tight">{s.label}</span>
            </button>
          );
        })}
        </div>
      </div>
    </div>
  );
}
