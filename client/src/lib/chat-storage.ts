export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "ai_chat_conversations";
const ACTIVE_KEY = "ai_chat_active";

export function getConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Conversation[];
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

export function getActiveConversationId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveConversationId(id: string | null): void {
  if (id) {
    localStorage.setItem(ACTIVE_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_KEY);
  }
}

export function createConversation(model: string): Conversation {
  const id = crypto.randomUUID();
  const now = Date.now();
  return {
    id,
    title: "New Chat",
    messages: [],
    model,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateConversation(conversation: Conversation): void {
  const conversations = getConversations();
  const index = conversations.findIndex((c) => c.id === conversation.id);
  if (index >= 0) {
    conversations[index] = conversation;
  } else {
    conversations.unshift(conversation);
  }
  saveConversations(conversations);
}

export function deleteConversation(id: string): void {
  const conversations = getConversations().filter((c) => c.id !== id);
  saveConversations(conversations);
}

export function generateTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim();
  if (trimmed.length <= 40) return trimmed;
  return trimmed.substring(0, 40).trimEnd() + "…";
}
