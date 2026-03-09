import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/AppSidebar";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { SettingsModal } from "@/components/SettingsModal";
import { type ModelId } from "@/components/ModelSelector";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Plus, LogOut, Shield, ChevronDown, Settings, Download, Crown, Code2, PenLine, BarChart2, Lightbulb, Globe, FlaskConical, UserCircle, Search, X, ChevronUp, FileText, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type Conversation,
  type Message,
  type Attachment,
  type ApiMessage,
  apiMessageToLocal,
  generateTitle,
  exportConversationAsMarkdown,
  getActiveConversationId,
  setActiveConversationId,
} from "@/lib/chat-storage";

function isProActive(user: { plan: string; planExpiresAt: string | null } | null): boolean {
  if (!user) return false;
  if (user.plan !== "pro") return false;
  if (!user.planExpiresAt) return true;
  return new Date(user.planExpiresAt) > new Date();
}

export default function ChatPage() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [model, setModel] = useState<ModelId>("auto");
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);

  /* ── Image generation state ── */
  const [isImageMode, setIsImageMode] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  /* ── Search state ── */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [searchTotalMatches, setSearchTotalMatches] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  /* ── Quote reply state ── */
  const [quotedMessage, setQuotedMessage] = useState<{ id: string; snippet: string } | null>(null);

  const profileRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isSubmittingRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  const streamStartRef = useRef<number>(0);

  const isPro = isProActive(user);

  /* ── Load user settings ── */
  const { data: userSettings } = useQuery<{
    fontSize: string; assistantName: string; activePromptId: string | null;
    defaultModel: string; autoScroll: boolean; autoTitle: boolean; showTokenUsage: boolean;
  }>({
    queryKey: ["/api/settings"],
    queryFn: () => fetch("/api/settings", { credentials: "include" }).then((r) => r.json()),
    enabled: !!user,
  });
  const fontSize = userSettings?.fontSize ?? "normal";
  const assistantName = userSettings?.assistantName ?? "Assistant";
  const autoScroll = userSettings?.autoScroll ?? true;
  const autoTitle = userSettings?.autoTitle ?? true;
  const showTokenUsage = userSettings?.showTokenUsage ?? false;

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

  /* ── Click-outside for profile menu ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── Load conversations from API ── */
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    queryFn: () =>
      fetch("/api/conversations", { credentials: "include" }).then((r) => r.json()),
    enabled: !!user,
  });

  /* ── Restore last active conversation on mount ── */
  useEffect(() => {
    if (!user || conversations.length === 0) return;
    const savedId = getActiveConversationId();
    if (savedId && conversations.some((c) => c.id === savedId) && !activeId) {
      handleSelectConversation(savedId);
    }
  }, [user, conversations.length]);

  /* ── Sync activeIdRef ── */
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming, autoScroll]);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        handleNewChat();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        if (messages.length > 0) {
          e.preventDefault();
          setSearchOpen(true);
          setTimeout(() => searchInputRef.current?.focus(), 50);
        }
      }
      if (e.key === "Escape") {
        if (searchOpen) {
          setSearchOpen(false);
          setSearchQuery("");
        } else if (isStreaming) {
          abortRef.current?.abort();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isStreaming, searchOpen, messages.length]);

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
    setInput("");
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
    };
    const newAssistantMsg: Message = {
      id: newAssistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
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
    const style = document.createElement("style");
    style.id = "print-style";
    style.innerHTML = `
      @media print {
        [data-sidebar], header, [data-testid="chat-input-area"], .no-print { display: none !important; }
        body, html { background: white !important; color: black !important; }
        .flex-1.overflow-y-auto { overflow: visible !important; height: auto !important; }
        pre, code { white-space: pre-wrap !important; word-break: break-all !important; }
        .max-w-3xl { max-width: 100% !important; }
        * { color-scheme: light !important; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    window.addEventListener("afterprint", () => {
      document.getElementById("print-style")?.remove();
    }, { once: true });
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

  const handleGenerateImage = async (prompt: string) => {
    if (!prompt.trim() || isGeneratingImage) return;
    setIsGeneratingImage(true);
    setError(null);

    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();
    const userMsg: Message = { id: userMsgId, role: "user", content: `🎨 Generate image: ${prompt}`, timestamp: Date.now() };
    const assistantMsg: Message = { id: assistantMsgId, role: "assistant", content: "", timestamp: Date.now() };

    let convId = activeId;
    if (!convId) {
      const res = await apiRequest("POST", "/api/conversations", { title: `Image: ${prompt.slice(0, 40)}`, model: "auto" });
      const newConv: Conversation = await res.json();
      convId = newConv.id;
      setActiveId(convId);
      setActiveConversationId(convId);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");

    try {
      const res = await apiRequest("POST", "/api/generate-image", { prompt });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Image generation failed");

      const imageMarkdown = `![Generated image](data:${data.mimeType};base64,${data.imageBase64})`;
      const finalContent = `Here's your generated image:\n\n${imageMarkdown}`;

      setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: finalContent } : m));

      await apiRequest("POST", `/api/conversations/${convId}/messages`, { role: "user", content: userMsg.content });
      await apiRequest("POST", `/api/conversations/${convId}/messages`, { role: "assistant", content: finalContent });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message);
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
    } finally {
      setIsGeneratingImage(false);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  /* ── Stream assistant reply ── */
  const streamAssistantReply = async (
    convId: string,
    msgs: Message[],
    assistantMsgId: string,
  ) => {
    const controller = new AbortController();
    abortRef.current = controller;

    setIsStreaming(true);
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

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyForApi, model: isPro ? model : "fast", maxTokens: 4096 }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Request failed" }));
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
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.done) {
              finalInputTokens = parsed.inputTokens ?? undefined;
              finalOutputTokens = parsed.outputTokens ?? undefined;
            }
            if (parsed.modelUsed) {
              finalModelUsed = parsed.modelUsed;
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
          } catch (parseErr: unknown) {
            const err = parseErr as Error;
            if (err.name !== "SyntaxError") throw parseErr;
          }
        }
      }

      if (flushTimeout) clearTimeout(flushTimeout);
      flush();

      /* ── Save completed assistant message to DB ── */
      if (convId === activeIdRef.current || activeIdRef.current === null) {
        await apiRequest("POST", `/api/conversations/${convId}/messages`, {
          role: "assistant",
          content: accumulated,
          modelUsed: finalModelUsed,
          inputTokens: finalInputTokens,
          outputTokens: finalOutputTokens,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
        queryClient.invalidateQueries({ queryKey: ["/api/settings/usage"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/stats/tokens"] });
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
      setStreamingMessageId(null);
      isSubmittingRef.current = false;
    }
  };

  /* ── Submit message ── */
  const handleSubmit = async (attachments: Attachment[]) => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isStreaming || isSubmittingRef.current) return;

    /* Route to image generation if image mode is on */
    if (isImageMode && text) {
      await handleGenerateImage(text);
      return;
    }

    isSubmittingRef.current = true;
    setError(null);
    setInput("");

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
    };

    const assistantMsg: Message = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    /* Get or create conversation */
    let convId = activeId;

    if (!convId) {
      const title = autoTitle
        ? generateTitle(text || attachments[0]?.name || "File upload")
        : (text.slice(0, 40) || attachments[0]?.name || "New Conversation");
      const res = await apiRequest("POST", "/api/conversations", {
        title,
        model: isPro ? model : "fast",
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
    };

    const updatedMsgs = messages.filter((m) => m.id !== lastAssistant.id);
    updatedMsgs.push(newAssistantMsg);

    isSubmittingRef.current = true;
    setError(null);
    setMessages(updatedMsgs);

    await streamAssistantReply(activeId, updatedMsgs, assistantMsgId);
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
    <>
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
      />

      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
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
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleExport}
                  data-testid="button-export"
                  title="Export as Markdown"
                  className="h-9 w-9 text-muted-foreground hidden sm:flex"
                >
                  <Download className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleExportPDF}
                  data-testid="button-export-pdf"
                  title="Export as PDF"
                  className="h-9 w-9 text-muted-foreground hidden sm:flex"
                >
                  <Printer className="w-4 h-4" />
                </Button>
              </>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={handleNewChat}
              data-testid="button-new-chat-header"
              title="New chat (Ctrl+K)"
              className="h-9 w-9 text-muted-foreground"
            >
              <Plus className="w-4 h-4" />
            </Button>
            {user && (
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => setProfileOpen((o) => !o)}
                  data-testid="button-profile-menu"
                  className="flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-sm"
                >
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold",
                    isPro ? "bg-amber-500/20 text-amber-500" : "bg-primary/20 text-primary"
                  )}>
                    {user.username[0].toUpperCase()}
                  </div>
                  <span className="hidden sm:block max-w-[100px] truncate font-medium">{user.username}</span>
                  {user.isAdmin && <Shield className="w-3 h-3 text-violet-500 flex-shrink-0" />}
                  <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${profileOpen ? "rotate-180" : ""}`} />
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-56 z-50 rounded-xl border border-border/60 bg-popover shadow-xl overflow-hidden py-1">
                    <div className="px-3 py-2.5 border-b border-border/40">
                      <p className="text-xs text-muted-foreground">Signed in as</p>
                      <p className="font-semibold text-sm text-foreground truncate">{user.username}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {user.isAdmin && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-violet-500/15 text-violet-500">
                            <Shield className="w-2.5 h-2.5" /> Admin
                          </span>
                        )}
                        <span className={cn(
                          "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold",
                          isPro
                            ? "bg-amber-500/15 text-amber-500"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {isPro ? <Crown className="w-2.5 h-2.5" /> : null}
                          {isPro ? "Pro" : "Free plan"}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => { setProfileOpen(false); navigate("/profile"); }}
                      data-testid="button-view-profile"
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <UserCircle className="w-4 h-4 text-muted-foreground" />
                      View Profile
                    </button>

                    {user.isAdmin && (
                      <button
                        onClick={() => { setProfileOpen(false); navigate("/admin"); }}
                        data-testid="button-admin-dashboard"
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
                      >
                        <Shield className="w-4 h-4 text-violet-500" />
                        Admin Dashboard
                      </button>
                    )}

                    <button
                      onClick={() => { setProfileOpen(false); setSettingsOpen(true); }}
                      data-testid="button-open-settings"
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <Settings className="w-4 h-4 text-muted-foreground" />
                      Settings
                    </button>

                    <div className="mx-2 my-1 border-t border-border/40" />

                    <button
                      onClick={() => { setProfileOpen(false); logout.mutate(); }}
                      data-testid="button-logout"
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-destructive/80 hover:text-destructive hover:bg-destructive/5 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

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
        <div className="flex-1 overflow-y-auto custom-scrollbar" ref={messagesContainerRef}>
          {isLoadingMessages ? (
            <div className="flex items-center justify-center h-full gap-2">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <EmptyState onSuggest={(text) => { setInput(text); }} />
          ) : (
            <div className="max-w-3xl mx-auto py-6">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  isStreaming={isStreaming && msg.id === streamingMessageId}
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
                  onEdit={msg.role === "user" && !isStreaming ? handleEditMessage : undefined}
                  onFork={msg.role === "user" && !isStreaming ? handleForkMessage : undefined}
                  onQuoteReply={msg.role === "assistant" && !isStreaming ? handleQuoteReply : undefined}
                />
              ))}
              {isStreaming && (
                <div className="px-4 pb-1 text-[11px] text-muted-foreground/50 tabular-nums">
                  {elapsedTime.toFixed(1)}s
                </div>
              )}
              {isGeneratingImage && (
                <div className="px-4 pb-2 flex items-center gap-2 text-xs text-violet-400/70">
                  <span className="typing-dot w-1.5 h-1.5 rounded-full bg-violet-400/70" />
                  <span className="typing-dot w-1.5 h-1.5 rounded-full bg-violet-400/70" />
                  <span className="typing-dot w-1.5 h-1.5 rounded-full bg-violet-400/70" />
                  <span className="ml-1">Generating image…</span>
                </div>
              )}
              {error && (
                <div data-testid="error-message" className="mx-4 mt-2 mb-4 px-4 py-3 rounded-xl bg-destructive/8 border border-destructive/20 text-destructive text-sm">
                  <span className="font-semibold">Error: </span>{error}
                </div>
              )}
              <div ref={bottomRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Plan banner for free users */}
        {!isPro && messages.length === 0 && !activeId && (
          <div className="flex-shrink-0 mx-4 mb-1">
            <div className="max-w-3xl mx-auto px-3 py-2 rounded-xl bg-amber-500/8 border border-amber-500/15 flex items-center gap-2">
              <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                <span className="font-semibold">Free plan:</span> 20 messages/day · Fast model only ·{" "}
                <span className="underline cursor-pointer" onClick={() => { setSettingsOpen(false); navigate("/admin"); }}>
                  Admin can upgrade your plan
                </span>
              </p>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="flex-shrink-0" data-testid="chat-input-area">
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            onStop={handleStop}
            isStreaming={isStreaming || isGeneratingImage}
            model={isPro ? model : "fast"}
            onModelChange={handleModelChange}
            isPro={isPro}
            quotedMessage={quotedMessage ?? undefined}
            onClearQuote={() => setQuotedMessage(null)}
            isImageMode={isImageMode}
            onToggleImageMode={() => setIsImageMode((m) => !m)}
          />
        </div>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

const SUGGESTIONS = [
  {
    icon: Code2,
    label: "Write code",
    prompt: "Write a TypeScript function that debounces any async function and returns a promise.",
    color: "text-blue-400",
    bg: "bg-blue-500/8 hover:bg-blue-500/14 border-blue-500/15",
  },
  {
    icon: PenLine,
    label: "Draft writing",
    prompt: "Write a concise, compelling bio for a software engineer who is also an avid reader and hiker.",
    color: "text-violet-400",
    bg: "bg-violet-500/8 hover:bg-violet-500/14 border-violet-500/15",
  },
  {
    icon: BarChart2,
    label: "Analyze data",
    prompt: "Explain how to interpret a confusion matrix and what precision, recall, and F1 score mean.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/8 hover:bg-emerald-500/14 border-emerald-500/15",
  },
  {
    icon: Lightbulb,
    label: "Brainstorm ideas",
    prompt: "Give me 10 creative side project ideas for a developer who wants to learn about AI.",
    color: "text-amber-400",
    bg: "bg-amber-500/8 hover:bg-amber-500/14 border-amber-500/15",
  },
  {
    icon: Globe,
    label: "Explain concepts",
    prompt: "Explain how large language models work in plain English, step by step.",
    color: "text-cyan-400",
    bg: "bg-cyan-500/8 hover:bg-cyan-500/14 border-cyan-500/15",
  },
  {
    icon: FlaskConical,
    label: "Debug & review",
    prompt: "What are the most common React performance pitfalls and how do I fix them?",
    color: "text-rose-400",
    bg: "bg-rose-500/8 hover:bg-rose-500/14 border-rose-500/15",
  },
];

function EmptyState({ onSuggest }: { onSuggest: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full py-12 px-6">
      <div className="relative mb-6">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary via-violet-500 to-blue-500 flex items-center justify-center shadow-2xl shadow-primary/25">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="white" opacity="0.35"/>
            <path d="M8 8h2.5l1.5 4 1.5-4H16l-2.5 8H11L8 8z" fill="white"/>
          </svg>
        </div>
        <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-2xl scale-150 -z-10" />
      </div>

      <h1 className="text-[1.75rem] font-semibold text-foreground mb-2 tracking-tight text-center">
        How can I help you?
      </h1>
      <p className="text-muted-foreground/60 text-sm mb-8 text-center max-w-[320px] leading-relaxed">
        Ask anything, or pick a suggestion below to get started.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-2xl">
        {SUGGESTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.label}
              onClick={() => onSuggest(s.prompt)}
              data-testid={`suggestion-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
              className={cn(
                "flex flex-col items-start gap-2 px-4 py-3.5 rounded-xl border text-left transition-all duration-150 group",
                s.bg
              )}
            >
              <Icon className={cn("w-4 h-4", s.color)} />
              <span className="text-[13px] font-medium text-foreground/80 group-hover:text-foreground leading-tight">
                {s.label}
              </span>
              <span className="text-[11px] text-muted-foreground/60 leading-snug line-clamp-2">
                {s.prompt}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
