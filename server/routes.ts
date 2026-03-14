import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { MODEL_REGISTRY, FALLBACK_MODEL, getModel, type ModelDefinition } from "../shared/models";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import { insertUserSchema, insertBroadcastSchema, insertAiProviderSchema } from "../shared/schema";
import { TOOL_DEFINITIONS, executeTool, executeWebSearchStructured } from "./tools";
import multer from "multer";
import { createRequire } from "module";
import { streamWithFallback, testProvider, generateText, type ProviderConfig } from "./lib/providers/index";
import { chunkText, generateEmbedding, generateEmbeddings, cosineSimilarity, rerankChunks, type RankedChunk } from "./lib/embeddings";
const _require = createRequire(import.meta.url);
const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> = _require("pdf-parse");

/* ─── auth middleware ─────────────────────────────────────────── */
function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  next();
}

async function requireAdmin(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  const user = await storage.getUser(req.session.userId);
  if (!user?.isAdmin) return res.status(403).json({ error: "Forbidden" });
  next();
}

function isProActive(user: { plan: string; planExpiresAt: Date | null }): boolean {
  if (user.plan !== "pro") return false;
  if (!user.planExpiresAt) return true;
  return user.planExpiresAt > new Date();
}

/* ─── bluesminds API client helpers ──────────────────────────── */
const BLUESMINDS_BASE = "https://api.bluesminds.com/v1";

function bluesmindsHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.BLUESMINDS_API_KEY ?? ""}`,
  };
}

function hasApiKey() {
  return !!process.env.BLUESMINDS_API_KEY;
}

/* Convert Anthropic tool definitions → OpenAI function format */
function toOpenAITools(tools: typeof TOOL_DEFINITIONS) {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

/* ─── message types ──────────────────────────────────────────── */
interface Attachment {
  type: "image" | "text" | "file";
  name: string;
  mimeType: string;
  data: string;
}

interface RawMessage {
  role: string;
  content: string;
  attachments?: Attachment[];
}

/* ─── auto-routing ───────────────────────────────────────────── */
const CODING_KEYWORDS = [
  "code", "debug", "error", "function", "class", "algorithm", "api",
  "database", "sql", "typescript", "javascript", "python", "bug", "fix",
  "refactor", "architecture", "implement", "compiler", "runtime", "regex",
  "async", "promise", "syntax", "library", "framework",
];

const CREATIVE_KEYWORDS = [
  "story", "creative", "write a", "poem", "brainstorm", "imagine", "fiction",
  "character", "novel", "song", "lyrics", "narrative", "plot", "screenplay",
  "metaphor", "invent", "fantasy", "roleplay",
];

function autoSelectModel(messages: RawMessage[]): ModelDefinition {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = (lastUser?.content ?? "").toLowerCase().trim();
  if (text.length < 50) return MODEL_REGISTRY.fast;
  if (CODING_KEYWORDS.some((k) => text.includes(k))) return MODEL_REGISTRY.powerful;
  if (CREATIVE_KEYWORDS.some((k) => text.includes(k))) return MODEL_REGISTRY.creative;
  return MODEL_REGISTRY.balanced;
}

function resolveModel(requestedModel: string, messages: RawMessage[]): ModelDefinition {
  if (requestedModel === "auto") return autoSelectModel(messages);
  return getModel(requestedModel);
}

/* ─── build OpenAI-compatible message array ──────────────────── */
function buildOpenAIMessages(
  messages: RawMessage[],
  systemPrompt?: string,
): Array<{ role: string; content: unknown }> {
  const out: Array<{ role: string; content: unknown }> = [];
  if (systemPrompt) out.push({ role: "system", content: systemPrompt });
  for (const m of messages) {
    const images = (m.attachments ?? []).filter((a) => a.type === "image");
    const textAtts = (m.attachments ?? []).filter((a) => a.type === "text");
    let text = m.content;
    if (textAtts.length > 0) {
      text += textAtts
        .map((a) => `\n\n--- File: ${a.name} ---\n${a.data}\n--- End of ${a.name} ---`)
        .join("");
    }
    if (images.length > 0) {
      const parts: unknown[] = images.map((att) => ({
        type: "image_url",
        image_url: {
          url: att.data.startsWith("data:") ? att.data : `data:${att.mimeType};base64,${att.data}`,
        },
      }));
      if (text.trim()) parts.unshift({ type: "text", text });
      out.push({ role: m.role, content: parts });
    } else {
      out.push({ role: m.role, content: text });
    }
  }
  return out;
}

/* ─── stream runner (OpenAI SSE format) ─────────────────────── */
interface ToolCallRecord {
  id: string;
  name: string;
  input: Record<string, string>;
  result?: string;
}

async function streamModelWithTools(
  entry: ModelDefinition,
  messages: RawMessage[],
  maxTokens: number,
  res: Response,
  systemPrompt?: string,
  useTools = false,
): Promise<{ inputTokens: number; outputTokens: number; toolCalls: ToolCallRecord[] }> {
  const allToolCalls: ToolCallRecord[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let isFirstCall = true;
  const MAX_TOOL_ROUNDS = useTools ? 3 : 1;

  const openAIMessages = buildOpenAIMessages(messages, systemPrompt);
  const openAITools = useTools ? toOpenAITools(TOOL_DEFINITIONS) : undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body: Record<string, unknown> = {
      model: entry.apiModelId,
      max_tokens: maxTokens,
      messages: openAIMessages,
      stream: true,
      ...(useTools ? { tools: openAITools, tool_choice: "auto" } : {}),
    };

    const httpRes = await fetch(`${BLUESMINDS_BASE}/chat/completions`, {
      method: "POST",
      headers: bluesmindsHeaders(),
      body: JSON.stringify(body),
    });

    if (!httpRes.ok) {
      const errText = await httpRes.text();
      throw new Error(errText || `API error ${httpRes.status}`);
    }

    if (isFirstCall) {
      res.write(`data: ${JSON.stringify({ modelUsed: entry.badgeLabel, exactName: entry.exactName })}\n\n`);
      isFirstCall = false;
    }

    if (!httpRes.body) throw new Error("No response body");

    const reader = httpRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finishReason = "stop";

    /* Accumulate tool call deltas */
    const pendingToolCalls: Record<number, { id: string; name: string; argsBuffer: string }> = {};
    let assistantTextAccum = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];
          if (!choice) continue;
          if (choice.finish_reason) finishReason = choice.finish_reason;
          const delta = choice.delta ?? {};

          /* Text streaming */
          if (delta.content) {
            res.write(`data: ${JSON.stringify({ text: delta.content })}\n\n`);
            assistantTextAccum += delta.content;
          }

          /* Tool call streaming — accumulate per-index */
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!pendingToolCalls[idx]) {
                pendingToolCalls[idx] = { id: tc.id ?? "", name: tc.function?.name ?? "", argsBuffer: "" };
              }
              if (tc.id) pendingToolCalls[idx].id = tc.id;
              if (tc.function?.name) pendingToolCalls[idx].name = tc.function.name;
              if (tc.function?.arguments) pendingToolCalls[idx].argsBuffer += tc.function.arguments;
            }
          }

          /* Usage */
          if (parsed.usage) {
            inputTokens += parsed.usage.prompt_tokens ?? 0;
            outputTokens += parsed.usage.completion_tokens ?? 0;
          }
        } catch { /* ignore parse errors */ }
      }
    }

    if (finishReason !== "tool_calls") break;

    /* Execute tool calls */
    const toolEntries = Object.values(pendingToolCalls);
    if (toolEntries.length === 0) break;

    const toolMessages: Array<{ role: string; content: string; tool_call_id: string }> = [];

    for (const tc of toolEntries) {
      let input: Record<string, string> = {};
      try { input = JSON.parse(tc.argsBuffer); } catch { /* ignore */ }
      res.write(`data: ${JSON.stringify({ toolCall: { name: tc.name, input } })}\n\n`);
      const result = await executeTool(tc.name, input);
      res.write(`data: ${JSON.stringify({ toolResult: { name: tc.name, input, result } })}\n\n`);
      allToolCalls.push({ id: tc.id, name: tc.name, input, result });
      toolMessages.push({ role: "tool", content: result, tool_call_id: tc.id });
    }

    /* Append assistant + tool-result messages */
    openAIMessages.push({
      role: "assistant",
      content: assistantTextAccum || null,
    } as unknown as { role: string; content: unknown });

    for (const tm of toolMessages) {
      openAIMessages.push(tm as unknown as { role: string; content: unknown });
    }
  }

  return { inputTokens, outputTokens, toolCalls: allToolCalls };
}

/* Simple non-streaming call for summarize / suggestions */
async function callAPI(modelId: string, systemPrompt: string, userPrompt: string, maxTokens: number): Promise<string> {
  const res = await fetch(`${BLUESMINDS_BASE}/chat/completions`, {
    method: "POST",
    headers: bluesmindsHeaders(),
    body: JSON.stringify({
      model: modelId,
      max_tokens: maxTokens,
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

/* ─── route registration ─────────────────────────────────────── */
export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  /* ── auth: register ── */
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const parsed = insertUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Username and password are required." });
    const { username, password } = parsed.data;

    const existing = await storage.getUserByUsername(username);
    if (existing) return res.status(409).json({ error: "Username already taken." });

    const hashed = await bcrypt.hash(password, 12);
    const allUsers = await storage.getAllUsers();
    const isFirstUser = allUsers.length === 0;
    const user = await storage.createUser({ username, password: hashed });
    if (isFirstUser) await storage.setAdmin(user.id, true);
    const finalUser = isFirstUser ? { ...user, isAdmin: true } : user;
    req.session.userId = finalUser.id;
    return res.status(201).json({ id: finalUser.id, username: finalUser.username, isAdmin: finalUser.isAdmin, plan: finalUser.plan, planExpiresAt: finalUser.planExpiresAt });
  });

  /* ── auth: login ── */
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const parsed = insertUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Username and password are required." });
    const { username, password } = parsed.data;

    const user = await storage.getUserByUsername(username);
    if (!user) return res.status(401).json({ error: "Invalid username or password." });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid username or password." });

    req.session.userId = user.id;
    return res.json({ id: user.id, username: user.username, isAdmin: user.isAdmin, plan: user.plan, planExpiresAt: user.planExpiresAt });
  });

  /* ── auth: logout ── */
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });

  /* ── auth: me ── */
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
    const user = await storage.getUser(req.session.userId);
    if (!user) { req.session.destroy(() => {}); return res.status(401).json({ error: "User not found" }); }
    return res.json({ id: user.id, username: user.username, isAdmin: user.isAdmin, plan: user.plan, planExpiresAt: user.planExpiresAt, createdAt: user.createdAt });
  });

  /* ── auth: change password ── */
  app.post("/api/auth/change-password", requireAuth as any, async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: "Both current and new password are required." });
    if (newPassword.length < 6) return res.status(400).json({ error: "New password must be at least 6 characters." });

    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect." });

    const hashed = await bcrypt.hash(newPassword, 12);
    await storage.updatePassword(user.id, hashed);
    return res.json({ ok: true });
  });

  /* ── auth: delete account ── */
  app.delete("/api/auth/account", requireAuth as any, async (req: Request, res: Response) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Password is required to delete account." });

    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Incorrect password." });

    await storage.deleteUser(user.id);
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });

  /* ── conversations: list ── */
  app.get("/api/conversations", requireAuth as any, async (req: Request, res: Response) => {
    const convs = await storage.getConversations(req.session.userId!);
    return res.json(convs);
  });

  /* ── conversations: create ── */
  app.post("/api/conversations", requireAuth as any, async (req: Request, res: Response) => {
    const { title = "New Chat", model = "auto" } = req.body;
    const conv = await storage.createConversation(req.session.userId!, title, model);
    return res.status(201).json(conv);
  });

  /* ── conversations: get with messages ── */
  app.get("/api/conversations/:id", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.id as string);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    const msgs = await storage.getMessages(conv.id);
    return res.json({ ...conv, messages: msgs });
  });

  /* ── conversations: update ── */
  app.patch("/api/conversations/:id", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.id as string);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    const { title, model } = req.body;
    const updated = await storage.updateConversation(conv.id, {
      ...(title !== undefined ? { title } : {}),
      ...(model !== undefined ? { model } : {}),
      updatedAt: new Date(),
    });
    return res.json(updated);
  });

  /* ── conversations: delete ── */
  app.delete("/api/conversations/:id", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.id as string);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteConversation(conv.id);
    return res.json({ ok: true });
  });

  /* ── messages: add ── */
  app.post("/api/conversations/:id/messages", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.id as string);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    const { role, content, modelUsed, attachments, inputTokens, outputTokens, toolCalls, sources } = req.body;
    if (!role || content === undefined) return res.status(400).json({ error: "role and content are required" });
    const msg = await storage.createMessage({
      conversationId: conv.id,
      role,
      content,
      modelUsed,
      attachments: attachments ? JSON.stringify(attachments) : undefined,
      inputTokens: typeof inputTokens === "number" ? inputTokens : undefined,
      outputTokens: typeof outputTokens === "number" ? outputTokens : undefined,
      toolCalls: toolCalls ? JSON.stringify(toolCalls) : undefined,
      sources: sources ? JSON.stringify(sources) : undefined,
    });
    await storage.updateConversation(conv.id, { updatedAt: new Date() });
    return res.status(201).json(msg);
  });

  /* ── messages: pin/unpin ── */
  app.patch("/api/conversations/:convId/messages/:msgId/pin", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.convId as string);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    const { isPinned } = req.body;
    const msg = await storage.pinMessage(req.params.msgId as string, Boolean(isPinned));
    if (!msg) return res.status(404).json({ error: "Message not found" });
    return res.json(msg);
  });

  /* ── settings: get ── */
  app.get("/api/settings", requireAuth as any, async (req: Request, res: Response) => {
    const settings = await storage.getUserSettings(req.session.userId!);
    return res.json(settings);
  });

  /* ── settings: update ── */
  app.patch("/api/settings", requireAuth as any, async (req: Request, res: Response) => {
    const { systemPrompt, fontSize, assistantName, activePromptId, defaultModel, autoScroll, autoTitle, showTokenUsage, customInstructions, notificationSound, responseLanguage } = req.body;
    const updateData: Parameters<typeof storage.updateUserSettings>[1] = {};
    if (systemPrompt !== undefined) updateData.systemPrompt = systemPrompt;
    if (fontSize !== undefined) updateData.fontSize = fontSize;
    if (assistantName !== undefined) updateData.assistantName = assistantName;
    if ("activePromptId" in req.body) updateData.activePromptId = activePromptId ?? null;
    if (defaultModel !== undefined) updateData.defaultModel = defaultModel;
    if (autoScroll !== undefined) updateData.autoScroll = autoScroll;
    if (autoTitle !== undefined) updateData.autoTitle = autoTitle;
    if (showTokenUsage !== undefined) updateData.showTokenUsage = showTokenUsage;
    if (customInstructions !== undefined) updateData.customInstructions = customInstructions;
    if (notificationSound !== undefined) updateData.notificationSound = notificationSound;
    if (responseLanguage !== undefined) updateData.responseLanguage = responseLanguage;
    const settings = await storage.updateUserSettings(req.session.userId!, updateData);
    return res.json(settings);
  });

  /* ── data: export all conversations ── */
  app.get("/api/data/export", requireAuth as any, async (req: Request, res: Response) => {
    const convs = await storage.getConversations(req.session.userId!);
    const full = await Promise.all(convs.map(async (c) => {
      const msgs = await storage.getMessages(c.id);
      return { ...c, messages: msgs };
    }));
    res.setHeader("Content-Disposition", `attachment; filename="claude-chat-export-${new Date().toISOString().split("T")[0]}.json"`);
    res.setHeader("Content-Type", "application/json");
    return res.json(full);
  });

  /* ── data: delete all conversations ── */
  app.delete("/api/data/conversations", requireAuth as any, async (req: Request, res: Response) => {
    await storage.deleteAllConversations(req.session.userId!);
    return res.json({ success: true });
  });

  /* ── settings: usage counter ── */
  app.get("/api/settings/usage", requireAuth as any, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ error: "User not found" });
    const pro = isProActive(user);
    const settings = await storage.getUserSettings(req.session.userId!);
    const today = new Date().toISOString().split("T")[0];
    const count = settings.lastMessageDate === today ? settings.dailyMessageCount : 0;
    return res.json({ count, limit: 20, isPro: pro, date: today });
  });

  /* ── conversations: pin/unpin ── */
  app.patch("/api/conversations/:id/pin", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.id as string);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    const { isPinned } = req.body;
    const updated = await storage.updateConversation(conv.id, { isPinned: Boolean(isPinned) });
    return res.json(updated);
  });

  /* ── conversations: generate share link ── */
  app.post("/api/conversations/:id/share", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.id as string);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    const token = conv.shareToken ?? crypto.randomUUID();
    const updated = await storage.updateConversation(conv.id, { shareToken: token });
    return res.json({ shareToken: token, shareUrl: `/share/${token}` });
  });

  /* ── conversations: remove share link ── */
  app.delete("/api/conversations/:id/share", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.id as string);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    await storage.updateConversation(conv.id, { shareToken: null as any });
    return res.json({ ok: true });
  });

  /* ── messages: set reaction ── */
  app.patch("/api/conversations/:convId/messages/:msgId/reaction", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.convId as string);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    const reaction = req.body.reaction ?? null;
    if (reaction !== null && reaction !== "up" && reaction !== "down") {
      return res.status(400).json({ error: "reaction must be 'up', 'down', or null" });
    }
    const msg = await storage.updateMessage(req.params.msgId as string, { reaction });
    return res.json(msg);
  });

  /* ── conversations: update tags ── */
  app.patch("/api/conversations/:id/tags", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.id as string);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    const { tags } = req.body;
    if (!Array.isArray(tags)) return res.status(400).json({ error: "tags must be an array" });
    const updated = await storage.updateConversation(conv.id, { tags });
    return res.json(updated);
  });

  /* ── search: full-text across messages ── */
  app.get("/api/search", requireAuth as any, async (req: Request, res: Response) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json([]);
    const results = await storage.searchMessages(req.session.userId!, q);
    return res.json(results);
  });

  /* ── conversations: delete messages from index ── */
  app.delete("/api/conversations/:id/messages/from/:messageId", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.id as string);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteMessagesFromId(conv.id, req.params.messageId as string);
    return res.json({ ok: true });
  });

  /* ── public: admin contact info (no auth required) ── */
  app.get("/api/public/contact", async (_req: Request, res: Response) => {
    const admins = await storage.getAllUsers();
    const admin = admins.find((u) => u.isAdmin);
    if (!admin) return res.json({ contactEmail: null });
    const settings = await storage.getUserSettings(admin.id);
    return res.json({ contactEmail: (settings as any).contactEmail || null });
  });

  /* ── public share: view conversation (no auth) ── */
  app.get("/api/share/:token", async (req: Request, res: Response) => {
    const conv = await storage.getConversationByShareToken(req.params.token as string);
    if (!conv) return res.status(404).json({ error: "Shared conversation not found" });
    const msgs = await storage.getMessages(conv.id);
    return res.json({ id: conv.id, title: conv.title, model: conv.model, messages: msgs });
  });

  /* ── shared conversation: import to own account ── */
  app.post("/api/share/:token/import", requireAuth as any, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const conv = await storage.getConversationByShareToken(req.params.token as string);
    if (!conv) return res.status(404).json({ error: "Shared conversation not found" });
    const msgs = await storage.getMessages(conv.id);
    const newConv = await storage.createConversation(userId, `Copy of: ${conv.title}`, conv.model);
    for (const msg of msgs) {
      await storage.createMessage({
        conversationId: newConv.id,
        role: msg.role,
        content: msg.content,
        modelUsed: msg.modelUsed ?? undefined,
      });
    }
    return res.status(201).json({ conversationId: newConv.id });
  });

  /* ── prompts: list ── */
  app.get("/api/prompts", requireAuth as any, async (req: Request, res: Response) => {
    const prompts = await storage.getSavedPrompts(req.session.userId!);
    return res.json(prompts);
  });

  /* ── prompts: create ── */
  app.post("/api/prompts", requireAuth as any, async (req: Request, res: Response) => {
    const { title = "", content } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });
    const prompt = await storage.createSavedPrompt(req.session.userId!, title, content);
    return res.status(201).json(prompt);
  });

  /* ── prompts: delete ── */
  app.delete("/api/prompts/:id", requireAuth as any, async (req: Request, res: Response) => {
    await storage.deleteSavedPrompt(req.params.id as string);
    return res.json({ ok: true });
  });

  /* ── analytics: overview ── */
  app.get("/api/analytics/overview", requireAuth as any, async (req: Request, res: Response) => {
    const data = await storage.getAnalyticsOverview(req.session.userId!);
    return res.json(data);
  });

  /* ── analytics: daily ── */
  app.get("/api/analytics/daily", requireAuth as any, async (req: Request, res: Response) => {
    const data = await storage.getAnalyticsDaily(req.session.userId!);
    return res.json(data);
  });

  /* ── analytics: models ── */
  app.get("/api/analytics/models", requireAuth as any, async (req: Request, res: Response) => {
    const data = await storage.getAnalyticsModels(req.session.userId!);
    return res.json(data);
  });

  /* ── analytics: peak hours ── */
  app.get("/api/analytics/peak-hours", requireAuth as any, async (req: Request, res: Response) => {
    const data = await storage.getAnalyticsPeakHours(req.session.userId!);
    return res.json(data);
  });

  /* ── analytics: estimated cost ── */
  app.get("/api/analytics/cost", requireAuth as any, async (req: Request, res: Response) => {
    const data = await storage.getAnalyticsCost(req.session.userId!);
    return res.json(data);
  });

  /* ── analytics: top conversations ── */
  app.get("/api/analytics/top-conversations", requireAuth as any, async (req: Request, res: Response) => {
    const data = await storage.getAnalyticsTopConversations(req.session.userId!);
    return res.json(data);
  });

  /* ── folders: list ── */
  app.get("/api/folders", requireAuth as any, async (req: Request, res: Response) => {
    const folders = await storage.getFolders(req.session.userId!);
    return res.json(folders);
  });

  /* ── folders: create ── */
  app.post("/api/folders", requireAuth as any, async (req: Request, res: Response) => {
    const { name, color = "default" } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const folder = await storage.createFolder(req.session.userId!, name, color);
    return res.status(201).json(folder);
  });

  /* ── folders: delete ── */
  app.delete("/api/folders/:id", requireAuth as any, async (req: Request, res: Response) => {
    await storage.deleteFolder(req.params.id as string);
    return res.json({ ok: true });
  });

  /* ── conversations: move to folder ── */
  app.patch("/api/conversations/:id/folder", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.id as string);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    const { folderId } = req.body;
    const updated = await storage.moveConversationToFolder(conv.id, folderId);
    return res.json(updated);
  });

  /* ── admin: token stats ── */
  app.get("/api/admin/stats/tokens", requireAdmin as any, async (req: Request, res: Response) => {
    const stats = await storage.getTokenStats();
    return res.json(stats);
  });

  /* ── admin: list users ── */
  app.get("/api/admin/users", requireAdmin as any, async (req: Request, res: Response) => {
    const allUsers = await storage.getAllUsers();
    return res.json(allUsers.map((u) => ({
      id: u.id, username: u.username, isAdmin: u.isAdmin,
      plan: u.plan, planExpiresAt: u.planExpiresAt, createdAt: u.createdAt,
    })));
  });

  /* ── admin: toggle admin ── */
  app.patch("/api/admin/users/:id/admin", requireAdmin as any, async (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (id === req.session.userId) return res.status(400).json({ error: "Cannot change your own admin status." });
    const user = await storage.setAdmin(id, Boolean(req.body.isAdmin));
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ id: user.id, username: user.username, isAdmin: user.isAdmin });
  });

  /* ── admin: delete user ── */
  app.delete("/api/admin/users/:id", requireAdmin as any, async (req: Request, res: Response) => {
    const id = req.params.id as string;
    if (id === req.session.userId) return res.status(400).json({ error: "Cannot delete your own account." });
    await storage.deleteUser(id);
    return res.json({ ok: true });
  });

  /* ── admin: set plan ── */
  app.patch("/api/admin/users/:id/plan", requireAdmin as any, async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { plan, expiresAt } = req.body;
    if (!["free", "pro"].includes(plan)) return res.status(400).json({ error: "plan must be 'free' or 'pro'" });
    const expiry = expiresAt ? new Date(expiresAt) : null;
    const user = await storage.setPlan(id, plan, expiry);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ id: user.id, username: user.username, isAdmin: user.isAdmin, plan: user.plan, planExpiresAt: user.planExpiresAt });
  });

  /* ── broadcasts: get active ── */
  app.get("/api/broadcast", requireAuth as any, async (req: Request, res: Response) => {
    const broadcast = await storage.getActiveBroadcast();
    return res.json(broadcast || null);
  });

  /* ── admin: list broadcasts ── */
  app.get("/api/admin/broadcasts", requireAdmin as any, async (req: Request, res: Response) => {
    const all = await storage.getAllBroadcasts();
    return res.json(all);
  });

  /* ── admin: create broadcast ── */
  app.post("/api/admin/broadcast", requireAdmin as any, async (req: Request, res: Response) => {
    const parsed = insertBroadcastSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid broadcast data" });
    const broadcast = await storage.createBroadcast(parsed.data);
    return res.status(201).json(broadcast);
  });

  /* ── chat (protected) ── */
  app.post("/api/chat", requireAuth as any, async (req: Request, res: Response) => {
    const { messages, model = "auto", maxTokens = 4096, webSearch = false } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      return res.status(500).json({
        error: "AWS credentials not configured. Add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION to Secrets.",
      });
    }

    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const pro = isProActive(user);

    /* ── Free plan enforcement ── */
    let effectiveModel = model;
    if (!pro) {
      effectiveModel = "fast";
      const today = new Date().toISOString().split("T")[0];
      const settings = await storage.getUserSettings(user.id);
      const count = settings.lastMessageDate === today ? settings.dailyMessageCount : 0;
      const FREE_DAILY_LIMIT = 20;
      if (count >= FREE_DAILY_LIMIT) {
        return res.status(429).json({
          error: `Daily message limit reached (${FREE_DAILY_LIMIT}/day). Upgrade to Pro for unlimited access.`,
          limitReached: true,
        });
      }
      await storage.updateUserSettings(user.id, {
        dailyMessageCount: count + 1,
        lastMessageDate: today,
      });
    }

    /* ── load system prompt ── */
    const settings = await storage.getUserSettings(user.id);
    const nowBlock = `Current date and time: ${new Date().toLocaleString("en-US", { timeZone: "UTC", dateStyle: "full", timeStyle: "long" })} (UTC). When the user asks for the current time, date, or day, use this information to answer directly.`;
    let systemPrompt: string | undefined = settings.systemPrompt?.trim() || undefined;
    if (settings.activePromptId) {
      const prompts = await storage.getSavedPrompts(user.id);
      const active = prompts.find((p) => p.id === settings.activePromptId);
      if (active) systemPrompt = active.content;
    }
    systemPrompt = systemPrompt ? `${nowBlock}\n\n${systemPrompt}` : nowBlock;
    const customInstructions = settings.customInstructions?.trim();
    if (customInstructions) {
      systemPrompt = systemPrompt ? `${systemPrompt}\n\n${customInstructions}` : customInstructions;
    }
    const memories = await storage.getMemories(user.id);
    if (memories.length > 0) {
      const memBlock = `Remembered facts about the user:\n${memories.map((m) => `- ${m.content}`).join("\n")}`;
      systemPrompt = systemPrompt ? `${systemPrompt}\n\n${memBlock}` : memBlock;
    }

    if (settings.responseLanguage) {
      const langPrompt = `Always respond in ${settings.responseLanguage}, regardless of the language the user writes in.`;
      systemPrompt = systemPrompt ? `${systemPrompt}\n\n${langPrompt}` : langPrompt;
    }

    const selected = resolveModel(effectiveModel, messages as RawMessage[]);
    const recentMessages: RawMessage[] = (messages as RawMessage[]).slice(-6);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    if (!pro) {
      res.write(`data: ${JSON.stringify({ planEnforced: true })}\n\n`);
    }

    /* ── Web search grounding ── */
    let searchSources: Array<{ title: string; url: string; snippet?: string }> = [];
    if (webSearch) {
      const lastUser = [...recentMessages].reverse().find((m) => m.role === "user");
      const query = (lastUser?.content ?? "").slice(0, 200).trim();
      if (query) {
        res.write(`data: ${JSON.stringify({ searching: true, query })}\n\n`);
        const { context, sources } = await executeWebSearchStructured(query);
        searchSources = sources;
        const searchBlock = `\n\n[Web search results]\n${context}\n[End of web search results]\n\nUse the above search results to inform your answer. Cite sources naturally in your response when relevant.`;
        systemPrompt = systemPrompt ? `${systemPrompt}${searchBlock}` : searchBlock.trim();
      }
    }

    try {
      const dbProviders = await storage.getActiveProviders();
      const providerConfigs: ProviderConfig[] = dbProviders.map((p) => ({
        id: p.id,
        name: p.name,
        providerType: p.providerType,
        apiUrl: p.apiUrl ?? null,
        apiKey: p.apiKey ?? null,
        modelName: p.modelName,
        headers: p.headers ?? null,
        httpMethod: p.httpMethod ?? "POST",
        authStyle: (p.authStyle ?? "bearer") as ProviderConfig["authStyle"],
        authHeaderName: p.authHeaderName ?? null,
        streamMode: (p.streamMode ?? "none") as ProviderConfig["streamMode"],
        bodyTemplate: p.bodyTemplate ?? null,
        responsePath: p.responsePath ?? null,
        isActive: p.isActive,
        isEnabled: p.isEnabled,
        priority: p.priority,
      }));

      const { inputTokens, outputTokens } = await streamWithFallback(providerConfigs, {
        messages: recentMessages,
        systemPrompt: systemPrompt ?? undefined,
        maxTokens,
        useTools: webSearch,
        res,
      }, (failedProvider, reason) => {
        res.write(`data: ${JSON.stringify({ providerFallback: true, failedProvider, reason })}\n\n`);
      });
      res.write(`data: ${JSON.stringify({ done: true, inputTokens, outputTokens, sources: searchSources })}\n\n`);
      res.end();
    } catch (primaryErr: unknown) {
      const err = primaryErr as Error;
      console.error(`[providers] stream failed:`, err.message);
      res.write(`data: ${JSON.stringify({ error: err.message || "Stream failed" })}\n\n`);
      res.end();
    }
  });

  /* ── Image generation via Bedrock Titan ── */
  app.post("/api/generate-image", requireAuth as any, async (_req: Request, res: Response) => {
    return res.status(503).json({ error: "Image generation is not available with the current API provider." });
  });

  /* ── messages: pin/unpin ── */
  app.patch("/api/conversations/:convId/messages/:msgId/pin", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.convId as string);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    const { isPinned } = req.body;
    const msg = await storage.pinMessage(req.params.msgId as string, Boolean(isPinned));
    return res.json(msg);
  });

  /* ── folders: list ── */
  app.get("/api/folders", requireAuth as any, async (req: Request, res: Response) => {
    const result = await storage.getFolders(req.session.userId!);
    return res.json(result);
  });

  /* ── folders: create ── */
  app.post("/api/folders", requireAuth as any, async (req: Request, res: Response) => {
    const { name, color = "default" } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "name is required" });
    const folder = await storage.createFolder(req.session.userId!, name.trim(), color);
    return res.status(201).json(folder);
  });

  /* ── folders: delete ── */
  app.delete("/api/folders/:id", requireAuth as any, async (req: Request, res: Response) => {
    await storage.deleteFolder(req.params.id as string);
    return res.json({ ok: true });
  });

  /* ── conversations: move to folder ── */
  app.patch("/api/conversations/:id/folder", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.id as string);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    const { folderId } = req.body;
    const updated = await storage.moveConversationToFolder(conv.id, folderId ?? null);
    return res.json(updated);
  });

  /* ── memories: list ── */
  app.get("/api/memories", requireAuth as any, async (req: Request, res: Response) => {
    const memories = await storage.getMemories(req.session.userId!);
    return res.json(memories);
  });

  /* ── memories: create ── */
  app.post("/api/memories", requireAuth as any, async (req: Request, res: Response) => {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "content is required" });
    const mem = await storage.createMemory(req.session.userId!, content.trim());
    return res.status(201).json(mem);
  });

  /* ── memories: delete ── */
  app.delete("/api/memories/:id", requireAuth as any, async (req: Request, res: Response) => {
    await storage.deleteMemory(req.params.id as string);
    return res.json({ ok: true });
  });

  /* ── gallery: list images ── */
  app.get("/api/gallery", requireAuth as any, async (req: Request, res: Response) => {
    const images = await storage.getGalleryImages(req.session.userId!);
    return res.json(images);
  });

  /* ── Conversation summary ── */
  app.post("/api/summarize", requireAuth as any, async (req: Request, res: Response) => {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }
    if (!hasApiKey()) return res.status(500).json({ error: "API key not configured" });
    const conversationText = messages
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => `${m.role === "user" ? "User" : "Assistant"}: ${typeof m.content === "string" ? m.content : "[attachment]"}`)
      .join("\n\n");
    try {
      const summary = await callAPI(
        FALLBACK_MODEL.apiModelId,
        "You are a concise summarizer. Respond ONLY with bullet points — no intro, no conclusion.",
        `Summarize this conversation as 3–5 clear bullet points. Each bullet should capture a key topic, question answered, or decision made.\n\n${conversationText}`,
        600,
      );
      res.json({ summary: summary || "Unable to generate summary." });
    } catch (err: unknown) {
      console.error("[bluesminds] summarize error:", err);
      res.status(500).json({ error: "Failed to generate summary" });
    }
  });

  /* ── Follow-up suggestions ── */
  app.post("/api/suggestions", requireAuth as any, async (req: Request, res: Response) => {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.json({ suggestions: [] });
    }
    if (!hasApiKey()) return res.json({ suggestions: [] });
    const recent = messages
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .slice(-6)
      .map((m: any) => `${m.role === "user" ? "User" : "Assistant"}: ${typeof m.content === "string" ? m.content.slice(0, 300) : "[attachment]"}`)
      .join("\n\n");
    try {
      const text = await callAPI(
        FALLBACK_MODEL.apiModelId,
        "You generate short follow-up questions. Respond ONLY with a JSON array of exactly 3 strings. No explanation, no markdown, just valid JSON like: [\"Question 1?\",\"Question 2?\",\"Question 3?\"]",
        `Based on this conversation, suggest 3 short follow-up questions the user might ask next. Keep each under 60 characters.\n\n${recent}`,
        150,
      );
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const suggestions = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      return res.json({ suggestions: Array.isArray(suggestions) ? suggestions.slice(0, 3) : [] });
    } catch {
      return res.json({ suggestions: [] });
    }
  });

  /* ── Admin: AI Providers CRUD ── */
  app.get("/api/admin/providers", requireAdmin as any, async (_req: Request, res: Response) => {
    return res.json(await storage.getProviders());
  });

  app.get("/api/admin/providers/:id", requireAdmin as any, async (req: Request, res: Response) => {
    const p = await storage.getProvider(req.params.id as string);
    if (!p) return res.status(404).json({ error: "Not found" });
    return res.json(p);
  });

  app.post("/api/admin/providers", requireAdmin as any, async (req: Request, res: Response) => {
    const parsed = insertAiProviderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
    const p = await storage.createProvider(parsed.data);
    return res.status(201).json(p);
  });

  app.patch("/api/admin/providers/:id", requireAdmin as any, async (req: Request, res: Response) => {
    const p = await storage.updateProvider(req.params.id as string, req.body);
    if (!p) return res.status(404).json({ error: "Not found" });
    return res.json(p);
  });

  app.delete("/api/admin/providers/:id", requireAdmin as any, async (req: Request, res: Response) => {
    await storage.deleteProvider(req.params.id as string);
    return res.status(204).send();
  });

  app.post("/api/admin/providers/:id/activate", requireAdmin as any, async (req: Request, res: Response) => {
    await storage.setActiveProvider(req.params.id as string);
    return res.json({ success: true });
  });

  app.post("/api/admin/providers/reorder", requireAdmin as any, async (req: Request, res: Response) => {
    const { ids } = req.body as { ids?: string[] };
    if (!Array.isArray(ids)) return res.status(400).json({ error: "ids must be an array" });
    await storage.reorderProviders(ids);
    return res.json({ success: true });
  });

  app.post("/api/admin/providers/:id/test", requireAdmin as any, async (req: Request, res: Response) => {
    const p = await storage.getProvider(req.params.id as string);
    if (!p) return res.status(404).json({ error: "Not found" });
    const config: ProviderConfig = {
      id: p.id, name: p.name, providerType: p.providerType,
      apiUrl: p.apiUrl ?? null, apiKey: p.apiKey ?? null, modelName: p.modelName,
      headers: p.headers ?? null, httpMethod: p.httpMethod ?? "POST",
      authStyle: (p.authStyle ?? "bearer") as ProviderConfig["authStyle"],
      authHeaderName: p.authHeaderName ?? null,
      streamMode: (p.streamMode ?? "none") as ProviderConfig["streamMode"],
      bodyTemplate: p.bodyTemplate ?? null,
      responsePath: p.responsePath ?? null, isActive: p.isActive, isEnabled: p.isEnabled, priority: p.priority,
    };
    const result = await testProvider(config);
    return res.json(result);
  });

  app.post("/api/admin/providers/test-config", requireAdmin as any, async (req: Request, res: Response) => {
    const config: ProviderConfig = {
      id: "temp", name: "temp", httpMethod: "POST",
      ...req.body,
      isActive: false, isEnabled: true, priority: 0,
    };
    const result = await testProvider(config);
    return res.json(result);
  });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
  app.post("/api/extract-pdf", requireAuth as any, upload.single("file") as any, async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    try {
      const result = await pdfParse(req.file.buffer);
      return res.json({ text: result.text.slice(0, 50000), pageCount: result.numpages });
    } catch (e) {
      return res.status(422).json({ error: `Could not parse PDF: ${(e as Error).message}` });
    }
  });

  /* ─── Knowledge Base ─────────────────────────────────────────── */

  app.get("/api/kb", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const kbs = await storage.getKnowledgeBases(userId);
    res.json(kbs);
  });

  app.post("/api/kb", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const { name, description = "" } = req.body as { name: string; description?: string };
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    const kb = await storage.createKnowledgeBase(userId, name.trim(), description.trim());
    res.status(201).json(kb);
  });

  app.delete("/api/kb/:id", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const kb = await storage.getKnowledgeBase(req.params.id);
    if (!kb || kb.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteKnowledgeBase(req.params.id);
    res.status(204).end();
  });

  /* ── kb: generate/remove share link ── */
  app.post("/api/kb/:id/share", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const kb = await storage.getKnowledgeBase(req.params.id);
    if (!kb || kb.userId !== userId) return res.status(404).json({ error: "Not found" });
    const token = kb.shareToken ?? crypto.randomUUID();
    const updated = await storage.updateKnowledgeBase(kb.id, { isPublic: true, shareToken: token });
    return res.json({ shareToken: token, shareUrl: `/kb/shared/${token}`, kb: updated });
  });

  app.delete("/api/kb/:id/share", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const kb = await storage.getKnowledgeBase(req.params.id);
    if (!kb || kb.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.updateKnowledgeBase(kb.id, { isPublic: false, shareToken: undefined });
    return res.json({ ok: true });
  });

  /* ── kb: view public shared kb (no auth required) ── */
  app.get("/api/kb/shared/:token", async (req, res) => {
    const kb = await storage.getKnowledgeBaseByToken(req.params.token);
    if (!kb || !kb.isPublic) return res.status(404).json({ error: "Knowledge base not found or not shared" });
    const docs = await storage.getKbDocuments(kb.id);
    return res.json({ kb: { id: kb.id, name: kb.name, description: kb.description }, docs });
  });

  /* ── kb: clone shared kb into own account ── */
  app.post("/api/kb/shared/:token/clone", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const sourceKb = await storage.getKnowledgeBaseByToken(req.params.token);
    if (!sourceKb || !sourceKb.isPublic) return res.status(404).json({ error: "Not found" });
    const newKb = await storage.createKnowledgeBase(userId, `Copy of: ${sourceKb.name}`, sourceKb.description);
    const docs = await storage.getKbDocuments(sourceKb.id);
    for (const doc of docs) {
      const newDoc = await storage.createKbDocument({ kbId: newKb.id, userId, name: doc.name, content: doc.content, chunkCount: doc.chunkCount });
      const chunks = await storage.getKbChunks(sourceKb.id);
      const docChunks = chunks.filter((c) => c.docId === doc.id);
      if (docChunks.length > 0) {
        await storage.createKbChunks(docChunks.map((c) => ({ docId: newDoc.id, kbId: newKb.id, content: c.content, embedding: Array.from(c.embedding ?? []), chunkIndex: c.chunkIndex })));
      }
    }
    return res.status(201).json({ kbId: newKb.id });
  });

  app.get("/api/kb/:id/documents", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const kb = await storage.getKnowledgeBase(req.params.id);
    if (!kb || kb.userId !== userId) return res.status(404).json({ error: "Not found" });
    const docs = await storage.getKbDocuments(req.params.id);
    res.json(docs);
  });

  app.post("/api/kb/:id/documents", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const kb = await storage.getKnowledgeBase(req.params.id);
    if (!kb || kb.userId !== userId) return res.status(404).json({ error: "Not found" });

    const { name, content } = req.body as { name: string; content: string };
    if (!name?.trim() || !content?.trim()) return res.status(400).json({ error: "Name and content required" });

    const chunks = chunkText(content.trim());

    // Find embed provider from admin config
    const allProviders = await storage.getActiveProviders();
    const embedProvider = allProviders.find(p =>
      p.modelName?.toLowerCase().includes("embed") && p.apiUrl && p.apiKey
    );
    const embedConfig = embedProvider ? {
      url: embedProvider.apiUrl!,
      apiKey: embedProvider.apiKey!,
      providerType: embedProvider.providerType,
      modelName: embedProvider.modelName,
    } : undefined;

    let embeddings: number[][];
    try {
      embeddings = await generateEmbeddings(chunks, embedConfig);
    } catch (err) {
      console.error("[kb/embed] failed:", err);
      return res.status(502).json({ error: `Embedding failed: ${(err as Error).message}` });
    }

    const doc = await storage.createKbDocument({
      kbId: req.params.id,
      userId,
      name: name.trim(),
      content: content.trim(),
      chunkCount: chunks.length,
    });

    await storage.createKbChunks(
      chunks.map((text, i) => ({
        docId: doc.id,
        kbId: req.params.id,
        content: text,
        embedding: embeddings[i],
        chunkIndex: i,
      }))
    );

    res.status(201).json(doc);
  });

  app.delete("/api/kb/:id/documents/:docId", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const kb = await storage.getKnowledgeBase(req.params.id);
    if (!kb || kb.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteKbChunksByDoc(req.params.docId);
    await storage.deleteKbDocument(req.params.docId);
    res.status(204).end();
  });

  app.post("/api/kb/:id/chat", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const kb = await storage.getKnowledgeBase(req.params.id);
    if (!kb || kb.userId !== userId) return res.status(404).json({ error: "Not found" });

    const { question } = req.body as { question: string };
    if (!question?.trim()) return res.status(400).json({ error: "Question required" });

    // Look up embed + rerank providers from admin config
    const allProviders = await storage.getActiveProviders();
    const embedProvider = allProviders.find(p =>
      p.modelName?.toLowerCase().includes("embed") && p.apiUrl && p.apiKey
    );
    const rerankProvider = allProviders.find(p =>
      p.modelName?.toLowerCase().includes("rerank") && p.apiUrl && p.apiKey
    );
    const embedConfig = embedProvider ? {
      url: embedProvider.apiUrl!,
      apiKey: embedProvider.apiKey!,
      providerType: embedProvider.providerType,
      modelName: embedProvider.modelName,
    } : undefined;
    const rerankConfig = rerankProvider ? {
      url: rerankProvider.apiUrl!,
      apiKey: rerankProvider.apiKey!,
      providerType: rerankProvider.providerType,
      modelName: rerankProvider.modelName,
    } : undefined;

    let queryEmbedding: number[];
    try {
      queryEmbedding = await generateEmbedding(question.trim(), embedConfig);
    } catch (err) {
      return res.status(502).json({ error: `Embedding failed: ${(err as Error).message}` });
    }

    const allChunks = await storage.getKbChunks(req.params.id);
    if (allChunks.length === 0) return res.status(400).json({ error: "No documents in this knowledge base" });

    const docMap = new Map<string, string>();
    const kbDocs = await storage.getKbDocuments(req.params.id);
    for (const d of kbDocs) docMap.set(d.id, d.name);

    const scored: RankedChunk[] = allChunks
      .filter(c => c.embedding && c.embedding.length > 0)
      .map(c => ({
        content: c.content,
        docName: docMap.get(c.docId) ?? "Unknown",
        docId: c.docId,
        similarity: cosineSimilarity(queryEmbedding, c.embedding as number[]),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10);

    const reranked = await rerankChunks(question.trim(), scored, 5, rerankConfig);

    const context = reranked
      .map((c, i) => `[Source ${i + 1}: ${c.docName}]\n${c.content}`)
      .join("\n\n---\n\n");

    const sources = reranked.map(c => ({ docName: c.docName, docId: c.docId, snippet: c.content.slice(0, 150) }));

    // Only pass chat-capable providers — exclude embed/rerank-only models
    const chatProviders = (await storage.getActiveProviders())
      .filter(p => {
        const m = (p.modelName ?? "").toLowerCase();
        return !m.includes("embed") && !m.includes("rerank");
      })
      .map((p) => ({
        id: p.id, name: p.name, providerType: p.providerType,
        apiUrl: p.apiUrl ?? null, apiKey: p.apiKey ?? null, modelName: p.modelName,
        headers: p.headers ?? null, httpMethod: p.httpMethod ?? "POST",
        authStyle: (p.authStyle ?? "bearer") as ProviderConfig["authStyle"],
        authHeaderName: p.authHeaderName ?? null,
        streamMode: (p.streamMode ?? "none") as ProviderConfig["streamMode"],
        bodyTemplate: p.bodyTemplate ?? null,
        responsePath: p.responsePath ?? null, isActive: p.isActive, isEnabled: p.isEnabled, priority: p.priority,
      }));

    const kbSystemPrompt = `You are a helpful assistant that answers questions strictly based on the provided document context. If the answer is not in the context, say "I couldn't find that in the provided documents." Always cite which source you used.`;
    const kbUserPrompt = `CONTEXT FROM DOCUMENTS:\n\n${context}\n\n---\n\nQUESTION: ${question.trim()}\n\nAnswer based only on the context above:`;

    try {
      let answer: string | null = null;

      // Try user-configured chat providers first
      if (chatProviders.length > 0) {
        try {
          answer = await generateText(chatProviders, kbSystemPrompt, kbUserPrompt, 1000);
        } catch {
          console.warn("[kb/chat] configured providers failed, falling back to built-in");
        }
      }

      // Fall back to direct Bluesminds call (proven to work)
      if (!answer) {
        answer = await callAPI(FALLBACK_MODEL.apiModelId, kbSystemPrompt, kbUserPrompt, 1000);
      }

      if (!answer) throw new Error("Empty response from AI");
      res.json({ answer, sources });
    } catch (err) {
      console.error("[kb/chat] error:", err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return httpServer;
}
