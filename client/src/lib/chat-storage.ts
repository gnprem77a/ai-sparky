export interface Attachment {
  id: string;
  name: string;
  type: "image" | "text" | "file";
  mimeType: string;
  data: string;
  size: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  timestamp: number;
  modelUsed?: string;
  reaction?: string | null;
  stopped?: boolean;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  userId?: string;
  isPinned: boolean;
  shareToken?: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiMessage {
  id: string;
  role: string;
  content: string;
  modelUsed?: string | null;
  attachments?: string | null;
  createdAt: string;
  reaction?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}

export function apiMessageToLocal(m: ApiMessage): Message {
  return {
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    modelUsed: m.modelUsed ?? undefined,
    attachments: m.attachments ? JSON.parse(m.attachments) : undefined,
    timestamp: new Date(m.createdAt).getTime(),
    reaction: m.reaction ?? null,
    inputTokens: m.inputTokens ?? null,
    outputTokens: m.outputTokens ?? null,
  };
}

export function generateTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim();
  if (trimmed.length <= 45) return trimmed;
  return trimmed.substring(0, 45).trimEnd() + "…";
}

export async function readFileAsAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const id = crypto.randomUUID();
    const isImage = file.type.startsWith("image/");
    const isText =
      file.type === "text/plain" ||
      file.name.endsWith(".txt") ||
      file.name.endsWith(".md") ||
      file.name.endsWith(".csv");

    reader.onload = (e) => {
      const result = e.target?.result as string;
      resolve({
        id,
        name: file.name,
        type: isImage ? "image" : isText ? "text" : "file",
        mimeType: file.type || "application/octet-stream",
        data: result,
        size: file.size,
      });
    };
    reader.onerror = reject;

    if (isImage) reader.readAsDataURL(file);
    else if (isText) reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function exportConversationAsMarkdown(title: string, msgs: Message[]): void {
  const lines: string[] = [`# ${title}`, ""];
  for (const msg of msgs) {
    lines.push(`## ${msg.role === "user" ? "You" : "Assistant"}${msg.modelUsed ? ` (${msg.modelUsed})` : ""}`);
    lines.push("");
    lines.push(msg.content || "");
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export function getActiveConversationId(): string | null {
  return localStorage.getItem("ai_chat_active");
}

export function setActiveConversationId(id: string | null): void {
  if (id) localStorage.setItem("ai_chat_active", id);
  else localStorage.removeItem("ai_chat_active");
}
