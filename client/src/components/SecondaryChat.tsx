import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import {
  type Conversation,
  type Message,
  type ApiMessage,
  apiMessageToLocal,
  getActiveConversationId,
} from "@/lib/chat-storage";
import { type ModelId } from "./ModelSelector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/use-auth";

interface SecondaryChatProps {
  isPro: boolean;
}

export function SecondaryChat({ isPro }: SecondaryChatProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [model, setModel] = useState<ModelId>("auto");
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const { user } = useAuth();
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isSubmittingRef = useRef(false);

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["/api/conversations"],
    queryFn: () => fetch("/api/conversations", { credentials: "include" }).then((r) => r.json()),
    enabled: !!user,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming]);

  const handleSelectConversation = async (id: string) => {
    if (id === "new") {
      setActiveId(null);
      setMessages([]);
      return;
    }
    
    abortRef.current?.abort();
    setError(null);
    setInput("");
    setActiveId(id);
    
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
  };

  const streamAssistantReply = async (convId: string, msgs: Message[], assistantMsgId: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);
    setStreamingMessageId(assistantMsgId);

    const historyForApi = msgs
      .filter((m) => m.id !== assistantMsgId)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    let accumulated = "";
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyForApi, model: isPro ? model : "fast", maxTokens: 4096 }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Request failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
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
            if (parsed.text) {
              accumulated += parsed.text;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsgId ? { ...m, content: accumulated } : m))
              );
            }
          } catch {}
        }
      }

      await apiRequest("POST", `/api/conversations/${convId}/messages`, {
        role: "assistant",
        content: accumulated,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    } catch (err) {
      setError("Something went wrong");
    } finally {
      setIsStreaming(false);
      setStreamingMessageId(null);
      isSubmittingRef.current = false;
    }
  };

  const handleSubmit = async (attachments: any[]) => {
    if (!input.trim() || isStreaming || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    const text = input.trim();
    setInput("");
    setError(null);

    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    const userMsg: Message = { id: userMsgId, role: "user", content: text, timestamp: Date.now(), isPinned: false };
    const assistantMsg: Message = { id: assistantMsgId, role: "assistant", content: "", timestamp: Date.now(), isPinned: false };

    let convId = activeId;
    if (!convId) {
      const res = await apiRequest("POST", "/api/conversations", { title: text.slice(0, 40), model: isPro ? model : "fast" });
      const newConv = await res.json();
      convId = newConv.id;
      setActiveId(convId);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    await apiRequest("POST", `/api/conversations/${convId}/messages`, { role: "user", content: text });
    await streamAssistantReply(convId!, [...messages, userMsg, assistantMsg], assistantMsgId);
  };

  return (
    <div className="flex flex-col h-full border-l border-border bg-background">
      <header className="flex items-center justify-between p-2 border-b bg-muted/30">
        <Select value={activeId || "new"} onValueChange={handleSelectConversation}>
          <SelectTrigger className="w-[200px] h-8 text-xs">
            <SelectValue placeholder="Select conversation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">New Chat</SelectItem>
            {conversations.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <div className="flex-1 overflow-hidden relative">
        <ScrollArea className="h-full">
          <div className="max-w-3xl mx-auto py-4 px-4 space-y-6">
            {messages.length === 0 && !isLoadingMessages && (
              <div className="flex flex-col items-center justify-center h-[40vh] text-center space-y-4">
                <p className="text-sm text-muted-foreground">Select a conversation or start a new one</p>
              </div>
            )}
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                isStreaming={isStreaming && streamingMessageId === msg.id}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      </div>

      <div className="p-4 border-t bg-background">
        <ChatInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          onStop={() => abortRef.current?.abort()}
          isStreaming={isStreaming}
          model={model}
          onModelChange={setModel}
          isPro={isPro}
        />
      </div>
    </div>
  );
}
