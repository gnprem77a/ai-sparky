import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { MODEL_REGISTRY, FALLBACK_MODEL, getModel, type ModelDefinition } from "../shared/models";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import { insertUserSchema } from "../shared/schema";
import { TOOL_DEFINITIONS, executeTool } from "./tools";
import multer from "multer";
import { createRequire } from "module";
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

/* ─── bedrock client ─────────────────────────────────────────── */
function getClient() {
  return new BedrockRuntimeClient({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
    },
  });
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

/* ─── request builders ───────────────────────────────────────── */
type ClaudeBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

function buildClaudeContent(msg: RawMessage): string | ClaudeBlock[] {
  const textAtts = msg.attachments?.filter((a) => a.type === "text") ?? [];
  let text = msg.content;
  if (textAtts.length > 0) {
    text += textAtts
      .map((a) => `\n\n--- File: ${a.name} ---\n${a.data}\n--- End of ${a.name} ---`)
      .join("");
  }
  const images = msg.attachments?.filter((a) => a.type === "image") ?? [];
  if (images.length === 0) return text;
  const blocks: ClaudeBlock[] = images.map((att) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: att.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: att.data.includes(",") ? att.data.split(",")[1] : att.data,
    },
  }));
  if (text.trim()) blocks.push({ type: "text", text });
  return blocks;
}

function buildClaudeBody(messages: RawMessage[], maxTokens: number, systemPrompt?: string) {
  return {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: messages.map((m) => ({ role: m.role, content: buildClaudeContent(m) })),
  };
}

function buildLlamaPrompt(messages: RawMessage[], systemPrompt?: string): string {
  let prompt = "<|begin_of_text|>";
  if (systemPrompt) {
    prompt += `<|start_header_id|>system<|end_header_id|>\n\n${systemPrompt}<|eot_id|>`;
  }
  for (const msg of messages) {
    const role = msg.role === "user" ? "user" : "assistant";
    const textAtts = msg.attachments?.filter((a) => a.type === "text") ?? [];
    let text = msg.content;
    if (textAtts.length > 0) {
      text += textAtts
        .map((a) => `\n\n--- File: ${a.name} ---\n${a.data}\n--- End of ${a.name} ---`)
        .join("");
    }
    prompt += `<|start_header_id|>${role}<|end_header_id|>\n\n${text}<|eot_id|>`;
  }
  prompt += "<|start_header_id|>assistant<|end_header_id|>\n\n";
  return prompt;
}

function buildLlamaBody(messages: RawMessage[], maxTokens: number, systemPrompt?: string) {
  return {
    prompt: buildLlamaPrompt(messages, systemPrompt),
    max_gen_len: Math.min(maxTokens, 2048),
    temperature: 0.8,
    top_p: 0.9,
  };
}

/* ─── stream runner (returns token counts) ───────────────────── */
async function streamModel(
  client: BedrockRuntimeClient,
  entry: ModelDefinition,
  messages: RawMessage[],
  maxTokens: number,
  res: Response,
  sendHeader: boolean,
  systemPrompt?: string,
): Promise<{ inputTokens: number; outputTokens: number }> {
  const body = entry.provider === "anthropic"
    ? buildClaudeBody(messages, maxTokens, systemPrompt)
    : buildLlamaBody(messages, maxTokens, systemPrompt);

  const command = new InvokeModelWithResponseStreamCommand({
    modelId: entry.bedrockId,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(body),
  });

  const response = await client.send(command);
  if (!response.body) throw new Error("No response body");

  if (sendHeader) {
    res.write(`data: ${JSON.stringify({ modelUsed: entry.badgeLabel, exactName: entry.exactName })}\n\n`);
  }

  const decoder = new TextDecoder();
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const event of response.body) {
    if (event.chunk?.bytes) {
      const decoded = decoder.decode(event.chunk.bytes);
      try {
        const parsed = JSON.parse(decoded);
        if (entry.provider === "anthropic") {
          if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
            res.write(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`);
          }
          if (parsed.type === "message_start" && parsed.message?.usage) {
            inputTokens = parsed.message.usage.input_tokens ?? 0;
          }
          if (parsed.type === "message_delta" && parsed.usage) {
            outputTokens = parsed.usage.output_tokens ?? 0;
          }
        } else {
          if (parsed.generation) {
            res.write(`data: ${JSON.stringify({ text: parsed.generation })}\n\n`);
          }
          if (parsed.prompt_token_count) inputTokens = parsed.prompt_token_count;
          if (parsed.generation_token_count) outputTokens = parsed.generation_token_count;
        }
      } catch { /* ignore parse errors */ }
    }
  }

  return { inputTokens, outputTokens };
}

/* ─── streaming with tool-use loop (Anthropic only) ─────────── */
interface ToolCallRecord {
  id: string;
  name: string;
  input: Record<string, string>;
  result?: string;
}

type AnthropicContent = string | unknown[];
interface AnthropicMessage { role: "user" | "assistant"; content: AnthropicContent }

async function streamModelWithTools(
  client: BedrockRuntimeClient,
  entry: ModelDefinition,
  messages: RawMessage[],
  maxTokens: number,
  res: Response,
  systemPrompt?: string,
): Promise<{ inputTokens: number; outputTokens: number; toolCalls: ToolCallRecord[] }> {
  if (entry.provider !== "anthropic") {
    const { inputTokens, outputTokens } = await streamModel(client, entry, messages, maxTokens, res, true, systemPrompt);
    return { inputTokens, outputTokens, toolCalls: [] };
  }

  const allToolCalls: ToolCallRecord[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let isFirstCall = true;
  const MAX_TOOL_ROUNDS = 3;

  /* Build initial Anthropic-format message array */
  const anthropicMessages: AnthropicMessage[] = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: buildClaudeContent(m),
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: maxTokens,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      tools: TOOL_DEFINITIONS,
      tool_choice: { type: "auto" },
      messages: anthropicMessages,
    };

    const command = new InvokeModelWithResponseStreamCommand({
      modelId: entry.bedrockId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(body),
    });

    const response = await client.send(command);
    if (!response.body) throw new Error("No response body");

    if (isFirstCall) {
      res.write(`data: ${JSON.stringify({ modelUsed: entry.badgeLabel, exactName: entry.exactName })}\n\n`);
      isFirstCall = false;
    }

    const decoder = new TextDecoder();
    let stopReason = "end_turn";

    const pendingBlocks: Record<number, { type: string; id: string; name: string; jsonBuffer: string }> = {};
    const assistantContentBlocks: unknown[] = [];
    let currentTextBlock = "";

    for await (const event of response.body) {
      if (!event.chunk?.bytes) continue;
      const decoded = decoder.decode(event.chunk.bytes);
      try {
        const parsed = JSON.parse(decoded);

        if (parsed.type === "message_start" && parsed.message?.usage) {
          inputTokens += parsed.message.usage.input_tokens ?? 0;
        }
        if (parsed.type === "message_delta" && parsed.usage) {
          outputTokens += parsed.usage.output_tokens ?? 0;
          if (parsed.delta?.stop_reason) stopReason = parsed.delta.stop_reason;
        }
        if (parsed.type === "content_block_start") {
          const cb = parsed.content_block;
          if (cb.type === "text") {
            pendingBlocks[parsed.index] = { type: "text", id: "", name: "", jsonBuffer: "" };
            currentTextBlock = "";
          } else if (cb.type === "tool_use") {
            pendingBlocks[parsed.index] = { type: "tool_use", id: cb.id, name: cb.name, jsonBuffer: "" };
          }
        }
        if (parsed.type === "content_block_delta") {
          const blk = pendingBlocks[parsed.index];
          if (!blk) continue;
          if (parsed.delta?.type === "text_delta" && blk.type === "text") {
            res.write(`data: ${JSON.stringify({ text: parsed.delta.text })}\n\n`);
            currentTextBlock += parsed.delta.text;
          } else if (parsed.delta?.type === "input_json_delta" && blk.type === "tool_use") {
            blk.jsonBuffer += parsed.delta.partial_json ?? "";
          }
        }
        if (parsed.type === "content_block_stop") {
          const blk = pendingBlocks[parsed.index];
          if (!blk) continue;
          if (blk.type === "text") {
            if (currentTextBlock) assistantContentBlocks.push({ type: "text", text: currentTextBlock });
          } else if (blk.type === "tool_use") {
            let parsedInput: Record<string, string> = {};
            try { parsedInput = JSON.parse(blk.jsonBuffer); } catch { /* ignore */ }
            assistantContentBlocks.push({ type: "tool_use", id: blk.id, name: blk.name, input: parsedInput });
          }
          delete pendingBlocks[parsed.index];
        }
      } catch { /* ignore parse errors */ }
    }

    if (stopReason !== "tool_use") break;

    /* Execute tool calls and collect results */
    const toolUseBlocks = assistantContentBlocks.filter(
      (b: unknown) => (b as { type: string }).type === "tool_use"
    ) as Array<{ type: string; id: string; name: string; input: Record<string, string> }>;
    if (toolUseBlocks.length === 0) break;

    const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];

    for (const block of toolUseBlocks) {
      res.write(`data: ${JSON.stringify({ toolCall: { name: block.name, input: block.input } })}\n\n`);
      const result = await executeTool(block.name, block.input);
      res.write(`data: ${JSON.stringify({ toolResult: { name: block.name, input: block.input, result } })}\n\n`);
      allToolCalls.push({ id: block.id, name: block.name, input: block.input, result });
      toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
    }

    /* Append assistant tool-use blocks + user tool-result blocks to conversation */
    anthropicMessages.push({ role: "assistant", content: assistantContentBlocks });
    anthropicMessages.push({ role: "user", content: toolResults });
  }

  return { inputTokens, outputTokens, toolCalls: allToolCalls };
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
    const { role, content, modelUsed, attachments, inputTokens, outputTokens, toolCalls } = req.body;
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
    const { systemPrompt, fontSize, assistantName, activePromptId, defaultModel, autoScroll, autoTitle, showTokenUsage, customInstructions } = req.body;
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

  /* ── public share: view conversation (no auth) ── */
  app.get("/api/share/:token", async (req: Request, res: Response) => {
    const conv = await storage.getConversationByShareToken(req.params.token as string);
    if (!conv) return res.status(404).json({ error: "Shared conversation not found" });
    const msgs = await storage.getMessages(conv.id);
    return res.json({ id: conv.id, title: conv.title, model: conv.model, messages: msgs });
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

  /* ── chat (protected) ── */
  app.post("/api/chat", requireAuth as any, async (req: Request, res: Response) => {
    const { messages, model = "auto", maxTokens = 4096 } = req.body;

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
    let systemPrompt = settings.systemPrompt?.trim() || undefined;
    if (settings.activePromptId) {
      const prompts = await storage.getSavedPrompts(user.id);
      const active = prompts.find((p) => p.id === settings.activePromptId);
      if (active) systemPrompt = active.content;
    }
    const customInstructions = settings.customInstructions?.trim();
    if (customInstructions) {
      systemPrompt = systemPrompt ? `${systemPrompt}\n\n${customInstructions}` : customInstructions;
    }
    const memories = await storage.getMemories(user.id);
    if (memories.length > 0) {
      const memBlock = `Remembered facts about the user:\n${memories.map((m) => `- ${m.content}`).join("\n")}`;
      systemPrompt = systemPrompt ? `${systemPrompt}\n\n${memBlock}` : memBlock;
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

    const client = getClient();

    try {
      const { inputTokens, outputTokens } = await streamModelWithTools(client, selected, recentMessages, maxTokens, res, systemPrompt);
      res.write(`data: ${JSON.stringify({ done: true, inputTokens, outputTokens })}\n\n`);
      res.end();
    } catch (primaryErr: unknown) {
      const err = primaryErr as Error;
      console.error(`[bedrock] ${selected.exactName} failed:`, err.message);

      if (selected.bedrockId !== FALLBACK_MODEL.bedrockId) {
        console.log(`[bedrock] Falling back to ${FALLBACK_MODEL.exactName}…`);
        try {
          const { inputTokens, outputTokens } = await streamModel(client, FALLBACK_MODEL, recentMessages, maxTokens, res, false, systemPrompt);
          res.write(`data: ${JSON.stringify({ done: true, inputTokens, outputTokens })}\n\n`);
          res.end();
          return;
        } catch (fallbackErr: unknown) {
          console.error("[bedrock] Fallback also failed:", (fallbackErr as Error).message);
        }
      }

      res.write(`data: ${JSON.stringify({ error: err.message || "Bedrock API error" })}\n\n`);
      res.end();
    }
  });

  /* ── Image generation via Bedrock Titan ── */
  app.post("/api/generate-image", requireAuth as any, async (req: Request, res: Response) => {
    const { prompt } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: "Prompt is required" });

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_REGION) {
      return res.status(503).json({ error: "AWS credentials not configured. Add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION to Secrets." });
    }

    const client = getClient();
    try {
      const payload = {
        taskType: "TEXT_IMAGE",
        textToImageParams: { text: prompt.trim() },
        imageGenerationConfig: {
          numberOfImages: 1,
          height: 512,
          width: 512,
          cfgScale: 8.0,
        },
      };

      const command = new InvokeModelCommand({
        modelId: "amazon.titan-image-generator-v1",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(payload),
      });

      const response = await client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      const base64Image = responseBody.images?.[0];
      if (!base64Image) return res.status(500).json({ error: "No image returned from Bedrock" });

      return res.json({ imageBase64: base64Image, mimeType: "image/png" });
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[bedrock-image]", error.message);
      return res.status(500).json({ error: error.message || "Image generation failed" });
    }
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
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      return res.status(500).json({ error: "AWS credentials not configured" });
    }
    const client = getClient();
    const conversationText = messages
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => `${m.role === "user" ? "User" : "Assistant"}: ${typeof m.content === "string" ? m.content : "[attachment]"}`)
      .join("\n\n");
    const payload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 600,
      system: "You are a concise summarizer. Respond ONLY with bullet points — no intro, no conclusion.",
      messages: [
        {
          role: "user",
          content: `Summarize this conversation as 3–5 clear bullet points. Each bullet should capture a key topic, question answered, or decision made.\n\n${conversationText}`,
        },
      ],
    };
    try {
      const command = new InvokeModelCommand({
        modelId: FALLBACK_MODEL.bedrockId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(payload),
      });
      const response = await client.send(command);
      const body = JSON.parse(new TextDecoder().decode(response.body));
      const summary = body.content?.[0]?.text || "Unable to generate summary.";
      res.json({ summary });
    } catch (err: unknown) {
      console.error("[bedrock] summarize error:", err);
      res.status(500).json({ error: "Failed to generate summary" });
    }
  });

  /* ── PDF text extraction ── */
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

  return httpServer;
}
