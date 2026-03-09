import { useState, useEffect, useRef, useCallback } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/AppSidebar";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { type ModelId } from "@/components/ModelSelector";
import { useTheme } from "@/hooks/use-theme";
import { Moon, Sun, Plus } from "lucide-react";
import {
  type Conversation,
  type Message,
  type Attachment,
  getConversations,
  getActiveConversationId,
  setActiveConversationId,
  createConversation,
  updateConversation,
  deleteConversation,
  generateTitle,
} from "@/lib/chat-storage";

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [model, setModel] = useState<ModelId>("claude-sonnet");
  const [error, setError] = useState<string | null>(null);

  const { theme, toggleTheme } = useTheme();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isSubmittingRef = useRef(false);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const messages = activeConversation?.messages ?? [];

  useEffect(() => {
    const saved = getConversations();
    setConversations(saved);
    const savedActiveId = getActiveConversationId();
    if (savedActiveId && saved.some((c) => c.id === savedActiveId)) {
      setActiveId(savedActiveId);
      const conv = saved.find((c) => c.id === savedActiveId);
      if (conv) setModel(conv.model as ModelId);
    }
  }, []);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages.length, isStreaming]);

  const refreshConversations = useCallback(() => {
    setConversations(getConversations());
  }, []);

  const handleNewChat = () => {
    setActiveId(null);
    setActiveConversationId(null);
    setInput("");
    setError(null);
  };

  const handleSelectConversation = (id: string) => {
    const conv = conversations.find((c) => c.id === id);
    if (conv) {
      setActiveId(id);
      setActiveConversationId(id);
      setModel(conv.model as ModelId);
      setInput("");
      setError(null);
    }
  };

  const handleDeleteConversation = (id: string) => {
    deleteConversation(id);
    if (activeId === id) {
      setActiveId(null);
      setActiveConversationId(null);
    }
    refreshConversations();
  };

  const handleModelChange = (newModel: ModelId) => {
    setModel(newModel);
    if (activeConversation) {
      const updated = { ...activeConversation, model: newModel };
      updateConversation(updated);
      refreshConversations();
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStreamingMessageId(null);
  };

  const streamAssistantReply = async (
    conversation: Conversation,
    assistantMsgId: string
  ) => {
    let currentConversation = conversation;
    const controller = new AbortController();
    abortRef.current = controller;

    setIsStreaming(true);
    setStreamingMessageId(assistantMsgId);

    const historyForApi = currentConversation.messages
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

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyForApi, model, maxTokens: 4096 }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(errorData.error || "Request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let accumulated = "";

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
            if (parsed.text) {
              accumulated += parsed.text;
              const updated: Conversation = {
                ...currentConversation,
                messages: currentConversation.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: accumulated } : m
                ),
              };
              currentConversation = updated;
              updateConversation(updated);
              refreshConversations();
            }
          } catch (parseErr: unknown) {
            const err = parseErr as Error;
            if (err.name !== "SyntaxError") throw parseErr;
          }
        }
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === "AbortError") {
        // stopped by user
      } else {
        setError(error.message || "Something went wrong. Please try again.");
        const errorConv = {
          ...currentConversation,
          messages: currentConversation.messages.filter((m) => m.id !== assistantMsgId),
        };
        updateConversation(errorConv);
        refreshConversations();
      }
    } finally {
      setIsStreaming(false);
      setStreamingMessageId(null);
      isSubmittingRef.current = false;
    }
  };

  const handleSubmit = async (attachments: Attachment[]) => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || isStreaming || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setError(null);
    setInput("");

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      attachments: attachments.length > 0 ? attachments : undefined,
      timestamp: Date.now(),
    };

    const assistantMsgId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    let currentConversation: Conversation;

    if (activeConversation) {
      currentConversation = {
        ...activeConversation,
        messages: [...activeConversation.messages, userMsg, assistantMsg],
        updatedAt: Date.now(),
      };
    } else {
      currentConversation = createConversation(model);
      currentConversation.title = generateTitle(text || attachments[0]?.name || "File upload");
      currentConversation.messages = [userMsg, assistantMsg];
      setActiveId(currentConversation.id);
      setActiveConversationId(currentConversation.id);
    }

    updateConversation(currentConversation);
    refreshConversations();

    await streamAssistantReply(currentConversation, assistantMsgId);
  };

  const handleRegenerate = async () => {
    if (!activeConversation || isStreaming) return;

    const msgs = activeConversation.messages;
    const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;

    const assistantMsgId = crypto.randomUUID();
    const newAssistantMsg: Message = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    const updatedMsgs = msgs.filter((m) => m.id !== lastAssistant.id);
    updatedMsgs.push(newAssistantMsg);

    const updatedConversation: Conversation = {
      ...activeConversation,
      messages: updatedMsgs,
      updatedAt: Date.now(),
    };

    isSubmittingRef.current = true;
    setError(null);
    updateConversation(updatedConversation);
    refreshConversations();

    await streamAssistantReply(updatedConversation, assistantMsgId);
  };

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <>
      <AppSidebar
        conversations={conversations}
        activeId={activeId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
      />

      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-3 py-2 flex-shrink-0 border-b border-border/40">
          <div className="flex items-center gap-1">
            <SidebarTrigger data-testid="button-sidebar-toggle" className="h-9 w-9 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-1">
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
              onClick={toggleTheme}
              data-testid="button-theme-toggle"
              title="Toggle theme"
              className="h-9 w-9 text-muted-foreground"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar">
          {messages.length === 0 ? (
            <EmptyState onSuggestion={(s) => setInput(s)} />
          ) : (
            <div className="max-w-3xl mx-auto py-6">
              {messages.map((msg, i) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  isStreaming={isStreaming && msg.id === streamingMessageId}
                  isLast={msg.id === lastAssistantMsg?.id}
                  onRegenerate={msg.role === "assistant" && msg.id === lastAssistantMsg?.id && !isStreaming ? handleRegenerate : undefined}
                />
              ))}
              {error && (
                <div data-testid="error-message" className="mx-4 mt-2 mb-4 px-4 py-3 rounded-xl bg-destructive/8 border border-destructive/20 text-destructive text-sm">
                  <span className="font-semibold">Error: </span>{error}
                </div>
              )}
              <div className="h-4" />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex-shrink-0">
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            onStop={handleStop}
            isStreaming={isStreaming}
            model={model}
            onModelChange={handleModelChange}
          />
        </div>
      </div>
    </>
  );
}

const SUGGESTIONS = [
  { text: "Explain quantum entanglement in simple terms", category: "Science" },
  { text: "Write a Python script to scrape a website", category: "Code" },
  { text: "What makes a great SaaS pitch deck?", category: "Business" },
  { text: "Refactor this code for better readability", category: "Code" },
  { text: "Summarize key ideas in clean architecture", category: "Learning" },
  { text: "Draft a professional email declining a meeting", category: "Writing" },
];

function EmptyState({ onSuggestion }: { onSuggestion: (s: string) => void }) {
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-w-3xl w-full">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.text}
            onClick={() => onSuggestion(s.text)}
            data-testid="button-suggestion"
            className="group text-left px-4 py-3.5 rounded-xl border border-border/60 bg-card/60 hover-elevate transition-all duration-150"
          >
            <div className="flex items-start gap-2.5">
              <span className="text-primary/50 text-sm mt-0.5 font-bold select-none">✦</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground/80 leading-snug group-hover:text-foreground transition-colors">
                  {s.text}
                </p>
                <p className="text-[10px] text-muted-foreground/50 mt-1 font-semibold uppercase tracking-widest">
                  {s.category}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
