import { useState, useEffect, useRef, useCallback } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/AppSidebar";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { ModelSelector, type ModelId } from "@/components/ModelSelector";
import { useTheme } from "@/hooks/use-theme";
import { Moon, Sun, Plus, Sparkles } from "lucide-react";
import {
  type Conversation,
  type Message,
  getConversations,
  saveConversations,
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

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

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || isStreaming || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setError(null);
    setInput("");

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
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
      currentConversation.title = generateTitle(text);
      currentConversation.messages = [userMsg, assistantMsg];
      setActiveId(currentConversation.id);
      setActiveConversationId(currentConversation.id);
    }

    updateConversation(currentConversation);
    refreshConversations();

    setIsStreaming(true);
    setStreamingMessageId(assistantMsgId);

    const controller = new AbortController();
    abortRef.current = controller;

    const historyForApi = currentConversation.messages
      .filter((m) => m.id !== assistantMsgId)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historyForApi,
          model,
          maxTokens: 4096,
        }),
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
            if ((parseErr as Error).message && !(parseErr as SyntaxError).name?.includes("Syntax")) {
              throw parseErr;
            }
          }
        }
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === "AbortError") {
        // User stopped
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

  return (
    <>
      <AppSidebar
        conversations={conversations}
        activeId={activeId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
      />

      <div className="flex flex-col flex-1 min-w-0 h-screen">
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ModelSelector
              value={model}
              onChange={handleModelChange}
              disabled={isStreaming}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="icon"
              variant="ghost"
              onClick={handleNewChat}
              data-testid="button-new-chat-header"
              title="New chat"
              className="h-9 w-9"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTheme}
              data-testid="button-theme-toggle"
              title="Toggle theme"
              className="h-9 w-9"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState onSuggestion={(s) => { setInput(s); }} />
          ) : (
            <div className="max-w-3xl mx-auto py-4">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  isStreaming={isStreaming && msg.id === streamingMessageId}
                />
              ))}
              {error && (
                <div
                  data-testid="error-message"
                  className="mx-4 my-2 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
                >
                  {error}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="flex-shrink-0 border-t border-border/50">
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            onStop={handleStop}
            isStreaming={isStreaming}
          />
        </div>
      </div>
    </>
  );
}

const SUGGESTIONS = [
  "Explain quantum computing in simple terms",
  "Write a Python function to parse JSON",
  "What are the key differences between REST and GraphQL?",
  "Help me debug this TypeScript error",
  "Summarize the main ideas behind clean architecture",
  "Write a regex to validate email addresses",
];

function EmptyState({ onSuggestion }: { onSuggestion: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-full py-16 px-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <Sparkles className="w-8 h-8 text-primary" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground mb-2">
        How can I help you today?
      </h1>
      <p className="text-muted-foreground text-sm mb-10 text-center max-w-sm">
        Ask me anything — I'm here to help with coding, writing, analysis, and more.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl w-full">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            onClick={() => onSuggestion(suggestion)}
            data-testid={`button-suggestion`}
            className="text-left px-4 py-3 rounded-xl border border-border bg-card text-card-foreground text-sm hover-elevate transition-all"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
