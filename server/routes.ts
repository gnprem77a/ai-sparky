import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { MODEL_REGISTRY, FALLBACK_MODEL, getModel, type ModelDefinition } from "../shared/models";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import { insertUserSchema } from "../shared/schema";

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

/* ─── stream parsers ─────────────────────────────────────────── */
function parseClaudeChunk(decoded: string): string | null {
  try {
    const parsed = JSON.parse(decoded);
    if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
      return parsed.delta.text as string;
    }
  } catch { /* ignore */ }
  return null;
}

function parseLlamaChunk(decoded: string): string | null {
  try {
    const parsed = JSON.parse(decoded);
    if (parsed.generation) return parsed.generation as string;
  } catch { /* ignore */ }
  return null;
}

/* ─── stream runner ──────────────────────────────────────────── */
async function streamModel(
  client: BedrockRuntimeClient,
  entry: ModelDefinition,
  messages: RawMessage[],
  maxTokens: number,
  res: Response,
  sendHeader: boolean,
  systemPrompt?: string,
): Promise<void> {
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
  for await (const event of response.body) {
    if (event.chunk?.bytes) {
      const decoded = decoder.decode(event.chunk.bytes);
      const text = entry.provider === "anthropic"
        ? parseClaudeChunk(decoded)
        : parseLlamaChunk(decoded);
      if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
    }
  }
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
    return res.json({ id: user.id, username: user.username, isAdmin: user.isAdmin, plan: user.plan, planExpiresAt: user.planExpiresAt });
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
    const conv = await storage.getConversation(req.params.id);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    const msgs = await storage.getMessages(conv.id);
    return res.json({ ...conv, messages: msgs });
  });

  /* ── conversations: update ── */
  app.patch("/api/conversations/:id", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.id);
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
    const conv = await storage.getConversation(req.params.id);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteConversation(conv.id);
    return res.json({ ok: true });
  });

  /* ── messages: add ── */
  app.post("/api/conversations/:id/messages", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.id);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    const { role, content, modelUsed, attachments } = req.body;
    if (!role || content === undefined) return res.status(400).json({ error: "role and content are required" });
    const msg = await storage.createMessage({
      conversationId: conv.id,
      role,
      content,
      modelUsed,
      attachments: attachments ? JSON.stringify(attachments) : undefined,
    });
    await storage.updateConversation(conv.id, { updatedAt: new Date() });
    return res.status(201).json(msg);
  });

  /* ── settings: get ── */
  app.get("/api/settings", requireAuth as any, async (req: Request, res: Response) => {
    const settings = await storage.getUserSettings(req.session.userId!);
    return res.json(settings);
  });

  /* ── settings: update ── */
  app.patch("/api/settings", requireAuth as any, async (req: Request, res: Response) => {
    const { systemPrompt } = req.body;
    const settings = await storage.updateUserSettings(req.session.userId!, {
      systemPrompt: systemPrompt ?? "",
    });
    return res.json(settings);
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
    const conv = await storage.getConversation(req.params.id);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    const { isPinned } = req.body;
    const updated = await storage.updateConversation(conv.id, { isPinned: Boolean(isPinned) });
    return res.json(updated);
  });

  /* ── conversations: generate share link ── */
  app.post("/api/conversations/:id/share", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.id);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    const token = conv.shareToken ?? crypto.randomUUID();
    const updated = await storage.updateConversation(conv.id, { shareToken: token });
    return res.json({ shareToken: token, shareUrl: `/share/${token}` });
  });

  /* ── conversations: remove share link ── */
  app.delete("/api/conversations/:id/share", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.id);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    await storage.updateConversation(conv.id, { shareToken: null as any });
    return res.json({ ok: true });
  });

  /* ── conversations: delete messages from index ── */
  app.delete("/api/conversations/:id/messages/from/:messageId", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.id);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteMessagesFromId(conv.id, req.params.messageId);
    return res.json({ ok: true });
  });

  /* ── public share: view conversation (no auth) ── */
  app.get("/api/share/:token", async (req: Request, res: Response) => {
    const conv = await storage.getConversationByShareToken(req.params.token);
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
    await storage.deleteSavedPrompt(req.params.id);
    return res.json({ ok: true });
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
    const { id } = req.params;
    if (id === req.session.userId) return res.status(400).json({ error: "Cannot change your own admin status." });
    const user = await storage.setAdmin(id, Boolean(req.body.isAdmin));
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ id: user.id, username: user.username, isAdmin: user.isAdmin });
  });

  /* ── admin: delete user ── */
  app.delete("/api/admin/users/:id", requireAdmin as any, async (req: Request, res: Response) => {
    const { id } = req.params;
    if (id === req.session.userId) return res.status(400).json({ error: "Cannot delete your own account." });
    await storage.deleteUser(id);
    return res.json({ ok: true });
  });

  /* ── admin: set plan ── */
  app.patch("/api/admin/users/:id/plan", requireAdmin as any, async (req: Request, res: Response) => {
    const { id } = req.params;
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
    const systemPrompt = settings.systemPrompt?.trim() || undefined;

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
      await streamModel(client, selected, recentMessages, maxTokens, res, true, systemPrompt);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (primaryErr: unknown) {
      const err = primaryErr as Error;
      console.error(`[bedrock] ${selected.exactName} failed:`, err.message);

      if (selected.bedrockId !== FALLBACK_MODEL.bedrockId) {
        console.log(`[bedrock] Falling back to ${FALLBACK_MODEL.exactName}…`);
        try {
          await streamModel(client, FALLBACK_MODEL, recentMessages, maxTokens, res, false, systemPrompt);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
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

  return httpServer;
}
