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
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Moon, Sun, Plus, LogOut, Shield, ChevronDown, Settings, Download, Crown } from "lucide-react";
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

  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isSubmittingRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);

  const isPro = isProActive(user);

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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming]);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        handleNewChat();
      }
      if (e.key === "Escape" && isStreaming) {
        abortRef.current?.abort();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isStreaming]);

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
        });
        queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === "AbortError") {
        /* user stopped */
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

    isSubmittingRef.current = true;
    setError(null);
    setInput("");

    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    const userMsg: Message = {
      id: userMsgId,
      role: "user",
      content: text,
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
      const title = generateTitle(text || attachments[0]?.name || "File upload");
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
        content: text,
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

  return (
    <>
      <AppSidebar
        conversations={conversations}
        activeId={activeId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
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
              <Button
                size="icon"
                variant="ghost"
                onClick={handleExport}
                data-testid="button-export"
                title="Export as Markdown"
                className="h-9 w-9 text-muted-foreground"
              >
                <Download className="w-4 h-4" />
              </Button>
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
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTheme}
              data-testid="button-theme-toggle"
              title="Toggle theme"
              className="h-9 w-9 text-muted-foreground"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
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

                    <button
                      onClick={() => { setProfileOpen(false); logout.mutate(); }}
                      data-testid="button-logout"
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <LogOut className="w-4 h-4 text-muted-foreground" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {isLoadingMessages ? (
            <div className="flex items-center justify-center h-full gap-2">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="max-w-3xl mx-auto py-6">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  isStreaming={isStreaming && msg.id === streamingMessageId}
                  isLast={msg.id === lastAssistantMsg?.id}
                  onRegenerate={
                    msg.role === "assistant" && msg.id === lastAssistantMsg?.id && !isStreaming
                      ? handleRegenerate
                      : undefined
                  }
                />
              ))}
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
        <div className="flex-shrink-0">
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            onStop={handleStop}
            isStreaming={isStreaming}
            model={isPro ? model : "fast"}
            onModelChange={handleModelChange}
            isPro={isPro}
          />
        </div>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-full py-16 px-6">
      <div className="relative mb-8">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary via-violet-500 to-blue-500 flex items-center justify-center shadow-2xl shadow-primary/25">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="white" opacity="0.35"/>
            <path d="M8 8h2.5l1.5 4 1.5-4H16l-2.5 8H11L8 8z" fill="white"/>
          </svg>
        </div>
        <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-2xl scale-150 -z-10" />
      </div>

      <h1 className="text-[2rem] font-semibold text-foreground mb-2 tracking-tight text-center">
        How can I help you?
      </h1>
      <p className="text-muted-foreground/70 text-[15px] mb-10 text-center max-w-[360px] leading-relaxed">
        Ask me anything — code, writing, analysis, ideas, and more.
        You can also attach files and images.
      </p>
    </div>
  );
}
