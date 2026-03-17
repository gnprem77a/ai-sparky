import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { MODEL_REGISTRY, FALLBACK_MODEL, BLUESMINDS_MODEL_ID, getModel, getProviderPatterns, type ModelDefinition } from "../shared/models";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { sendEmail, emailConfigured, apiAccessGrantedEmail, apiAccessRevokedEmail, planChangedEmail, apiLimitReachedEmail, forgotPasswordEmail } from "./lib/email";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(apiKey: string, limitPerMin: number | null): boolean {
  if (!limitPerMin) return true;
  const now = Date.now();
  const windowMs = 60_000;
  const entry = rateLimitMap.get(apiKey);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(apiKey, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limitPerMin) return false;
  entry.count++;
  return true;
}

async function fireWebhook(url: string, event: string, data: Record<string, unknown>): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // non-blocking, ignore failures
  }
}
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

/* ─── Smart provider routing ────────────────────────────────── */
type RoutingCategory = "coding" | "math" | "creative" | "research" | "quick" | "general";

const SMART_KEYWORDS: Record<RoutingCategory, string[]> = {
  coding: [
    "code", "debug", "function", "class", "bug", "script", "program", "error",
    "exception", "implement", "refactor", "algorithm", "compile", "build", "deploy",
    "git", "react", "node", "python", "javascript", "typescript", "sql", "api",
    "backend", "frontend", "database", "regex", "async", "promise", "syntax",
    "library", "framework", "package", "import", "module", "test", "unit test",
  ],
  math: [
    "math", "calcul", "equation", "solve", "proof", "formula", "statistics",
    "probability", "geometry", "algebra", "theorem", "integral", "derivative",
    "matrix", "vector", "polynomial", "logarithm", "trigonometry", "arithmetic",
  ],
  creative: [
    "write a", "story", "poem", "essay", "creative", "brainstorm", "imagine",
    "fiction", "character", "novel", "song", "lyrics", "narrative", "plot",
    "screenplay", "metaphor", "invent", "fantasy", "roleplay", "blog post",
    "email draft", "rewrite", "tone", "style", "persuasive", "caption",
  ],
  research: [
    "explain", "what is", "who is", "how does", "why does", "history", "science",
    "overview", "background", "research", "compare", "difference between",
    "summarize", "define", "meaning of", "tell me about", "describe",
  ],
  quick: [],   // detected by message length
  general: [], // fallback
};

/** Score a provider for a given routing category. Higher = tried first. */
function scoreProvider(name: string, category: RoutingCategory): number {
  const n = name.toLowerCase();
  switch (category) {
    case "coding":
      // Mistral Large 3 excels at technical/code tasks
      if (n.includes("mistral"))                        return 100;
      if (n.includes("gpt"))                            return 80;
      if (n.includes("opus"))                           return 60;
      if (n.includes("claude") || n.includes("haiku")) return 40;
      break;
    case "math":
      // Mistral excels at math/logic
      if (n.includes("mistral"))                        return 100;
      if (n.includes("gpt"))                            return 70;
      if (n.includes("opus"))                           return 60;
      if (n.includes("claude") || n.includes("haiku")) return 40;
      break;
    case "creative":
      // GPT 5.3 excels at creative writing; Opus is a strong second
      if (n.includes("gpt"))                            return 100;
      if (n.includes("opus"))                           return 80;
      if (n.includes("claude") || n.includes("haiku")) return 60;
      if (n.includes("mistral"))                        return 40;
      break;
    case "research":
      // GPT excels at knowledge, explanations, research; Opus second
      if (n.includes("gpt"))                            return 100;
      if (n.includes("opus"))                           return 80;
      if (n.includes("claude") || n.includes("haiku")) return 60;
      if (n.includes("mistral"))                        return 40;
      break;
    case "quick":
      // Haiku is fastest for short responses
      if (n.includes("haiku"))                          return 100;
      if (n.includes("claude"))                         return 80;
      if (n.includes("gpt"))                            return 60;
      if (n.includes("mistral"))                        return 50;
      break;
  }
  return 50; // neutral
}

function detectRoutingCategory(messages: RawMessage[]): RoutingCategory {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = (lastUser?.content ?? "").toLowerCase().trim();
  if (text.length < 60) return "quick";
  for (const [cat, kws] of Object.entries(SMART_KEYWORDS) as [RoutingCategory, string[]][]) {
    if (kws.length && kws.some((k) => text.includes(k))) return cat;
  }
  return "general";
}

function smartSortProviders(providers: ProviderConfig[], messages: RawMessage[]): { sorted: ProviderConfig[]; category: RoutingCategory } {
  const category = detectRoutingCategory(messages);
  if (category === "general") return { sorted: providers, category };
  const sorted = [...providers].sort((a, b) => {
    const sa = scoreProvider(a.modelName ?? a.name, category);
    const sb = scoreProvider(b.modelName ?? b.name, category);
    if (sb !== sa) return sb - sa;         // higher score first
    return a.priority - b.priority;        // then original priority
  });
  return { sorted, category };
}

/**
 * Boost providers that match the user's explicit model key to the top of the list.
 * e.g. "powerful" → prefers providers whose name/modelName contains "opus".
 * Falls through to the original order for providers that don't match.
 */
function boostProvidersForModelKey(providers: ProviderConfig[], modelKey: string): ProviderConfig[] {
  const patterns = getProviderPatterns(modelKey);
  if (!patterns.length) return providers;
  return [...providers].sort((a, b) => {
    const na = ((a.name ?? "") + " " + (a.modelName ?? "")).toLowerCase();
    const nb = ((b.name ?? "") + " " + (b.modelName ?? "")).toLowerCase();
    const matchA = patterns.some((p) => na.includes(p)) ? 1 : 0;
    const matchB = patterns.some((p) => nb.includes(p)) ? 1 : 0;
    if (matchB !== matchA) return matchB - matchA;
    return a.priority - b.priority;
  });
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
    return res.json({ id: user.id, username: user.username, isAdmin: user.isAdmin, plan: user.plan, planExpiresAt: user.planExpiresAt, createdAt: user.createdAt, apiEnabled: user.apiEnabled });
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

  /* ── auth: forgot password ── */
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });
    const allUsers = await storage.getAllUsers();
    const user = allUsers.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) return res.json({ ok: true });
    if (!emailConfigured()) return res.status(503).json({ error: "Email service is not configured. Contact the administrator." });
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await storage.deletePasswordResetTokensByUser(user.id);
    await storage.createPasswordResetToken(user.id, token, expiresAt);
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;
    try {
      await sendEmail(user.email!, "Reset your password", forgotPasswordEmail(user.username, resetUrl));
    } catch {
      return res.status(502).json({ error: "Failed to send reset email. Please try again later." });
    }
    return res.json({ ok: true });
  });

  /* ── auth: reset password ── */
  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: "Token and new password are required." });
    if (newPassword.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
    const record = await storage.getPasswordResetToken(token);
    if (!record) return res.status(400).json({ error: "Invalid or expired reset link." });
    if (new Date() > record.expiresAt) {
      await storage.deletePasswordResetToken(token);
      return res.status(400).json({ error: "This reset link has expired. Please request a new one." });
    }
    const hashed = await bcrypt.hash(newPassword, 12);
    await storage.updatePassword(record.userId, hashed);
    await storage.deletePasswordResetToken(token);
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
    const { systemPrompt, fontSize, assistantName, activePromptId, defaultModel, autoScroll, autoTitle, showTokenUsage, customInstructions, notificationSound, responseLanguage, personaAvatarLetter, personaPersonality, notifyBroadcast, notifyWeeklyDigest, notifySecurityAlerts } = req.body;
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
    if (personaAvatarLetter !== undefined) updateData.personaAvatarLetter = personaAvatarLetter;
    if (personaPersonality !== undefined) updateData.personaPersonality = personaPersonality;
    if (notifyBroadcast !== undefined) updateData.notifyBroadcast = notifyBroadcast;
    if (notifyWeeklyDigest !== undefined) updateData.notifyWeeklyDigest = notifyWeeklyDigest;
    if (notifySecurityAlerts !== undefined) updateData.notifySecurityAlerts = notifySecurityAlerts;
    const settings = await storage.updateUserSettings(req.session.userId!, updateData);
    return res.json(settings);
  });

  /* ── account: delete self ── */
  app.delete("/api/auth/me", requireAuth as any, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    await storage.deleteAllConversations(userId);
    await storage.deleteUser(userId);
    req.session.destroy(() => {});
    return res.json({ success: true });
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

  /* ── user stats (analytics) ── */
  app.get("/api/stats/me", requireAuth as any, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const convs = await storage.getConversations(userId);
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalMessages = 0;
    for (const conv of convs) {
      const msgs = await storage.getMessages(conv.id);
      const assistant = msgs.filter((m) => m.role === "assistant");
      totalMessages += msgs.filter((m) => m.role === "user").length;
      for (const m of assistant) {
        totalInputTokens += m.inputTokens ?? 0;
        totalOutputTokens += m.outputTokens ?? 0;
      }
    }
    return res.json({
      conversations: convs.length,
      messages: totalMessages,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
    });
  });

  /* ── Pro monthly token usage ── */
  app.get("/api/usage", requireAuth as any, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ error: "User not found" });
    const pro = isProActive(user);
    const PRO_MONTHLY_LIMIT = 2_200_000;
    const now = new Date();
    let resetAt = user.monthlyTokensResetAt;
    let used    = user.monthlyOutputTokens ?? 0;
    if (pro && resetAt && now >= resetAt) {
      /* period elapsed — show 0 until next chat triggers reset */
      used = 0;
    }
    return res.json({
      isPro: pro,
      used,
      limit: PRO_MONTHLY_LIMIT,
      resetAt: resetAt?.toISOString() ?? null,
      warnAt: Math.floor(PRO_MONTHLY_LIMIT * 0.9),
      blocked: pro && used >= PRO_MONTHLY_LIMIT,
    });
  });

  /* ── conversations: pin/unpin ── */
  app.patch("/api/conversations/:id/pin", requireAuth as any, async (req: Request, res: Response) => {
    const conv = await storage.getConversation(req.params.id as string);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    const { isPinned } = req.body;
    const updated = await storage.updateConversation(conv.id, { isPinned: Boolean(isPinned) });
    return res.json(updated);
  });

  /* ── conversations: generate share link (Pro only) ── */
  app.post("/api/conversations/:id/share", requireAuth as any, async (req: Request, res: Response) => {
    const u = await storage.getUser(req.session.userId!);
    if (!u || !isProActive(u)) return res.status(403).json({ error: "Conversation sharing requires a Pro plan.", proRequired: true });
    const conv = await storage.getConversation(req.params.id as string);
    if (!conv || conv.userId !== req.session.userId) return res.status(404).json({ error: "Not found" });
    const token = conv.shareToken ?? crypto.randomUUID();
    const updated = await storage.updateConversation(conv.id, { shareToken: token });
    return res.json({ shareToken: token, shareUrl: `/share/${token}` });
  });

  /* ── conversations: remove share link (Pro only) ── */
  app.delete("/api/conversations/:id/share", requireAuth as any, async (req: Request, res: Response) => {
    const u = await storage.getUser(req.session.userId!);
    if (!u || !isProActive(u)) return res.status(403).json({ error: "Conversation sharing requires a Pro plan.", proRequired: true });
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

  /* ── prompts: create (Pro only) ── */
  app.post("/api/prompts", requireAuth as any, async (req: Request, res: Response) => {
    const u = await storage.getUser(req.session.userId!);
    if (!u || !isProActive(u)) return res.status(403).json({ error: "Saving prompts requires a Pro plan.", proRequired: true });
    const { title = "", content } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });
    const prompt = await storage.createSavedPrompt(req.session.userId!, title, content);
    return res.status(201).json(prompt);
  });

  /* ── prompts: delete (Pro only) ── */
  app.delete("/api/prompts/:id", requireAuth as any, async (req: Request, res: Response) => {
    const u = await storage.getUser(req.session.userId!);
    if (!u || !isProActive(u)) return res.status(403).json({ error: "Managing prompts requires a Pro plan.", proRequired: true });
    await storage.deleteSavedPrompt(req.params.id as string);
    return res.json({ ok: true });
  });

  /* ── analytics helper: Pro-only guard ── */
  async function requireProAnalytics(req: Request, res: Response): Promise<boolean> {
    const u = await storage.getUser(req.session.userId!);
    if (!u || !isProActive(u)) {
      res.status(403).json({ error: "Analytics requires a Pro plan.", proRequired: true });
      return false;
    }
    return true;
  }

  /* ── analytics: overview (Pro only) ── */
  app.get("/api/analytics/overview", requireAuth as any, async (req: Request, res: Response) => {
    if (!await requireProAnalytics(req, res)) return;
    const data = await storage.getAnalyticsOverview(req.session.userId!);
    return res.json(data);
  });

  /* ── analytics: daily (Pro only) ── */
  app.get("/api/analytics/daily", requireAuth as any, async (req: Request, res: Response) => {
    if (!await requireProAnalytics(req, res)) return;
    const data = await storage.getAnalyticsDaily(req.session.userId!);
    return res.json(data);
  });

  /* ── analytics: models (Pro only) ── */
  app.get("/api/analytics/models", requireAuth as any, async (req: Request, res: Response) => {
    if (!await requireProAnalytics(req, res)) return;
    const data = await storage.getAnalyticsModels(req.session.userId!);
    return res.json(data);
  });

  /* ── analytics: peak hours (Pro only) ── */
  app.get("/api/analytics/peak-hours", requireAuth as any, async (req: Request, res: Response) => {
    if (!await requireProAnalytics(req, res)) return;
    const data = await storage.getAnalyticsPeakHours(req.session.userId!);
    return res.json(data);
  });

  /* ── analytics: estimated cost (Pro only) ── */
  app.get("/api/analytics/cost", requireAuth as any, async (req: Request, res: Response) => {
    if (!await requireProAnalytics(req, res)) return;
    const data = await storage.getAnalyticsCost(req.session.userId!);
    return res.json(data);
  });

  /* ── analytics: top conversations (Pro only) ── */
  app.get("/api/analytics/top-conversations", requireAuth as any, async (req: Request, res: Response) => {
    if (!await requireProAnalytics(req, res)) return;
    const data = await storage.getAnalyticsTopConversations(req.session.userId!);
    return res.json(data);
  });

  /* ── analytics: monthly summary (Pro only) ── */
  app.get("/api/analytics/monthly-summary", requireAuth as any, async (req: Request, res: Response) => {
    if (!await requireProAnalytics(req, res)) return;
    const userId = req.session.userId!;
    const daily = await storage.getAnalyticsDaily(userId);
    const thisMonth = new Date().toISOString().slice(0, 7); // "2026-03"
    const monthRows = daily.filter(d => d.date.startsWith(thisMonth));
    const monthlyMessages = monthRows.reduce((s, r) => s + r.messageCount, 0);
    const monthlyTokens = monthRows.reduce((s, r) => s + r.tokenCount, 0);
    const overview = await storage.getAnalyticsOverview(userId);
    return res.json({
      thisMonth,
      monthlyMessages,
      monthlyTokens,
      totalMessages: overview.totalMessages,
      totalTokens: overview.totalTokens,
    });
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

  /* ── folders: reorder ── */
  app.put("/api/folders/reorder", requireAuth as any, async (req: Request, res: Response) => {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: "orderedIds must be an array" });
    await storage.reorderFolders(req.session.userId!, orderedIds as string[]);
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

  /* ── admin: feature activity stats ── */
  app.get("/api/admin/stats/features", requireAdmin as any, async (req: Request, res: Response) => {
    const stats = await storage.getFeatureStats();
    return res.json(stats);
  });

  app.get("/api/admin/stats/features/:feature/daily", requireAdmin as any, async (req: Request, res: Response) => {
    const { feature } = req.params as { feature: string };
    const days = Number(req.query.days) || 14;
    const stats = await storage.getFeatureStatsByDay(feature, days);
    return res.json(stats);
  });

  /* ── admin: list users ── */
  app.get("/api/admin/users", requireAdmin as any, async (req: Request, res: Response) => {
    const allUsers = await storage.getAllUsers();
    return res.json(allUsers.map((u) => ({
      id: u.id, username: u.username, isAdmin: u.isAdmin,
      plan: u.plan, planExpiresAt: u.planExpiresAt, createdAt: u.createdAt,
      apiEnabled: u.apiEnabled,
      email: u.email ?? null,
      apiDailyLimit: u.apiDailyLimit ?? null,
      apiMonthlyLimit: u.apiMonthlyLimit ?? null,
      apiWebhookUrl: u.apiWebhookUrl ?? null,
      apiRateLimitPerMin: u.apiRateLimitPerMin ?? null,
      apiBalance: u.apiBalance ?? 0,
      isFlagged: u.isFlagged,
      flagReason: u.flagReason ?? null,
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
    if (user.email) {
      sendEmail(user.email, `Your plan has been updated to ${plan === "pro" ? "Pro ✨" : "Free"}`, planChangedEmail(user.username, plan)).catch(() => {});
    }
    return res.json({ id: user.id, username: user.username, isAdmin: user.isAdmin, plan: user.plan, planExpiresAt: user.planExpiresAt });
  });

  /* ── admin: generate / revoke API key for a user ── */
  app.post("/api/admin/users/:id/api-key/generate", requireAdmin as any, async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const target = await storage.getUser(id);
    if (!target) return res.status(404).json({ error: "User not found" });
    const newKey = "sk-" + randomBytes(32).toString("hex");
    await storage.setApiKey(id, newKey);
    await storage.setApiEnabled(id, true);
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    if (target.email) {
      sendEmail(target.email, "API Access Granted", apiAccessGrantedEmail(target.username, baseUrl)).catch(() => {});
    }
    if (target.apiWebhookUrl) {
      fireWebhook(target.apiWebhookUrl, "api.access.granted", { username: target.username });
    }
    return res.json({ apiKey: newKey, apiEnabled: true });
  });

  app.post("/api/admin/users/:id/api-key/revoke", requireAdmin as any, async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const target = await storage.getUser(id);
    if (!target) return res.status(404).json({ error: "User not found" });
    await storage.setApiKey(id, null);
    await storage.setApiEnabled(id, false);
    if (target.email) {
      sendEmail(target.email, "API Access Revoked", apiAccessRevokedEmail(target.username)).catch(() => {});
    }
    if (target.apiWebhookUrl) {
      fireWebhook(target.apiWebhookUrl, "api.access.revoked", { username: target.username });
    }
    return res.json({ apiEnabled: false });
  });

  /* ── admin: update API settings for a user ── */
  app.patch("/api/admin/users/:id/api-settings", requireAdmin as any, async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const target = await storage.getUser(id);
    if (!target) return res.status(404).json({ error: "User not found" });
    const { apiDailyLimit, apiMonthlyLimit, apiWebhookUrl, apiRateLimitPerMin, email } = req.body;
    const user = await storage.setApiSettings(id, {
      apiDailyLimit: apiDailyLimit === "" || apiDailyLimit == null ? null : Number(apiDailyLimit),
      apiMonthlyLimit: apiMonthlyLimit === "" || apiMonthlyLimit == null ? null : Number(apiMonthlyLimit),
      apiWebhookUrl: apiWebhookUrl || null,
      apiRateLimitPerMin: apiRateLimitPerMin === "" || apiRateLimitPerMin == null ? null : Number(apiRateLimitPerMin),
      email: email || null,
    });
    return res.json(user);
  });

  /* ── admin: adjust user API balance ── */
  app.patch("/api/admin/users/:id/balance", requireAdmin as any, async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { delta } = req.body as { delta?: number };
    if (typeof delta !== "number" || isNaN(delta)) return res.status(400).json({ error: "delta (number) required" });
    const user = await storage.adjustApiBalance(id, delta);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ balance: user.apiBalance });
  });

  /* ── admin: get user API logs ── */
  app.get("/api/admin/users/:id/api-logs", requireAdmin as any, async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const limit = Math.min(parseInt(req.query.limit as string ?? "100"), 500);
    const logs = await storage.getApiLogs(id, limit);
    const stats = await storage.getApiStats(id);
    return res.json({ logs, stats });
  });

  /* ── admin: flag / unflag user ── */
  app.patch("/api/admin/users/:id/flag", requireAdmin as any, async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason?: string };
    await storage.flagUser(id, reason || "Manually flagged by admin");
    return res.json({ ok: true });
  });

  app.patch("/api/admin/users/:id/unflag", requireAdmin as any, async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    await storage.unflagUser(id);
    return res.json({ ok: true });
  });

  /* ── feature event tracking ── */
  app.post("/api/events/track", requireAuth as any, async (req: Request, res: Response) => {
    const userId = (req as any).session?.userId as string;
    const { feature } = req.body as { feature?: string };
    if (!feature || typeof feature !== "string") return res.status(400).json({ error: "feature required" });
    await storage.trackFeatureEvent(userId, feature.slice(0, 64));
    return res.json({ ok: true });
  });

  /* ── user: get own API key info ── */
  app.get("/api/me/api-key", requireAuth as any, async (req: Request, res: Response) => {
    const userId = (req as any).session?.userId as string;
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.apiEnabled) return res.status(403).json({ error: "API access not enabled" });
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const dailyUsed = (!user.apiDailyResetAt || user.apiDailyResetAt < today) ? 0 : (user.apiDailyCount ?? 0);
    const monthlyUsed = (!user.apiMonthlyResetAt || user.apiMonthlyResetAt < monthStart) ? 0 : (user.apiMonthlyCount ?? 0);
    const stats = await storage.getApiStats(userId);
    return res.json({
      apiKey: user.apiKey,
      apiEnabled: user.apiEnabled,
      dailyUsed,
      dailyLimit: user.apiDailyLimit ?? null,
      monthlyUsed,
      monthlyLimit: user.apiMonthlyLimit ?? null,
      rateLimitPerMin: user.apiRateLimitPerMin ?? null,
      webhookUrl: user.apiWebhookUrl ?? null,
      balance: user.apiBalance ?? 0,
      totalSpent: stats.totalSpent,
      todaySpent: stats.todaySpent,
      monthSpent: stats.monthSpent,
      byModel: stats.byModel,
    });
  });

  /* ── user: request API access (Pro only) ── */
  app.post("/api/me/api-access/request", requireAuth as any, async (req: Request, res: Response) => {
    const userId = (req as any).session?.userId as string;
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.plan !== "pro") return res.status(403).json({ error: "Pro plan required to request API access" });
    if (user.apiEnabled) return res.json({ ok: true, already: true });
    const admins = (await storage.getAllUsers()).filter((u) => u.isAdmin && u.email);
    for (const admin of admins) {
      if (admin.email) {
        sendEmail(admin.email, `API Access Request from ${user.username}`,
          `<p><strong>${user.username}</strong> (Pro) has requested API access.</p><p>Log in to the admin panel to enable it for them.</p>`);
      }
    }
    return res.json({ ok: true });
  });

  /* ── user: regenerate own API key ── */
  app.post("/api/me/api-key/regenerate", requireAuth as any, async (req: Request, res: Response) => {
    const userId = (req as any).session?.userId as string;
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.apiEnabled) return res.status(403).json({ error: "API access not enabled" });
    const newKey = "sk-" + randomBytes(32).toString("hex");
    await storage.setApiKey(userId, newKey);
    return res.json({ apiKey: newKey, apiEnabled: true });
  });

  /* ── user: API call history ── */
  app.get("/api/me/api-history", requireAuth as any, async (req: Request, res: Response) => {
    const userId = (req as any).session?.userId as string;
    const user = await storage.getUser(userId);
    if (!user || !user.apiEnabled) return res.status(403).json({ error: "API access not enabled" });
    const limit = Math.min(parseInt(req.query.limit as string ?? "50"), 100);
    const logs = await storage.getApiLogs(userId, limit);
    return res.json(logs);
  });

  /* ── user: update webhook URL ── */
  app.patch("/api/me/webhook", requireAuth as any, async (req: Request, res: Response) => {
    const userId = (req as any).session?.userId as string;
    const user = await storage.getUser(userId);
    if (!user || !user.apiEnabled) return res.status(403).json({ error: "API access not enabled" });
    const { webhookUrl } = req.body;
    await storage.setApiSettings(userId, { apiWebhookUrl: webhookUrl || null });
    return res.json({ webhookUrl: webhookUrl || null });
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
    const { messages, model = "auto", maxTokens: requestedTokens = 4096, webSearch = false } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }

    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ error: "User not found" });

    const pro = isProActive(user);

    /* ── Pro monthly token budget check ── */
    if (pro) {
      const now = new Date();
      let resetAt = user.monthlyTokensResetAt;
      let used    = user.monthlyOutputTokens ?? 0;
      if (!resetAt) {
        /* first Pro activation — set reset 30 days from now */
        resetAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const { db: dbConn } = await import("./db");
        await dbConn.execute(
          (await import("drizzle-orm")).sql`UPDATE users SET monthly_tokens_reset_at=${resetAt}, monthly_output_tokens=0 WHERE id=${user.id}`
        );
        used = 0;
      } else if (now >= resetAt) {
        /* reset period elapsed — clear counter */
        const nextReset = new Date(resetAt.getTime() + 30 * 24 * 60 * 60 * 1000);
        const { db: dbConn } = await import("./db");
        await dbConn.execute(
          (await import("drizzle-orm")).sql`UPDATE users SET monthly_tokens_reset_at=${nextReset}, monthly_output_tokens=0 WHERE id=${user.id}`
        );
        used = 0;
      }
      const PRO_MONTHLY_LIMIT = 2_200_000;
      if (used >= PRO_MONTHLY_LIMIT) {
        return res.status(429).json({
          error: `Monthly token limit reached (${PRO_MONTHLY_LIMIT.toLocaleString()} output tokens). Resets on ${resetAt!.toLocaleDateString()}.`,
          monthlyLimitReached: true,
          resetAt: resetAt!.toISOString(),
        });
      }
    }

    /* ── Model-specific token limits (server-authoritative, ignore client value) ── */
    const MODEL_TOKEN_LIMITS: Record<string, number> = {
      powerful:  32000,
      balanced:   8192,
      creative:   8192,
      auto:       8192,
      fast:       4096,
    };
    const maxTokens = pro
      ? (MODEL_TOKEN_LIMITS[model] ?? 8192)
      : 4096; /* free users always get Fast/4096 */

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

      /* ── abuse detection: track message & flag rapid exhaustion ── */
      await storage.trackFeatureEvent(user.id, "send_message");
      if (count + 1 >= FREE_DAILY_LIMIT && !user.isFlagged) {
        const dailyEvents = await storage.getFeatureStatsByDay("send_message", 1);
        const todayCount = dailyEvents.find((e) => e.date === today)?.count ?? 0;
        if (todayCount >= FREE_DAILY_LIMIT) {
          const minuteAgo30 = new Date(Date.now() - 30 * 60 * 1000);
          const { db: dbConn } = await import("./db");
          const { sql: drizzSql } = await import("drizzle-orm");
          const firstRows = await dbConn.execute(drizzSql`
            SELECT created_at FROM feature_events
            WHERE user_id = ${user.id} AND feature = 'send_message'
              AND created_at >= NOW() - INTERVAL '1 day'
            ORDER BY created_at ASC LIMIT 1
          `);
          if (firstRows.rows.length > 0) {
            const firstAt = new Date((firstRows.rows[0] as { created_at: string }).created_at);
            if (firstAt >= minuteAgo30) {
              await storage.flagUser(user.id, `Exhausted free daily limit (${FREE_DAILY_LIMIT} msgs) in under 30 minutes`);
            }
          }
        }
      }
    } else {
      /* track pro user messages too */
      void storage.trackFeatureEvent(user.id, "send_message");
    }

    /* ── load system prompt ── */
    const settings = await storage.getUserSettings(user.id);
    const nowBlock = `Current date and time: ${new Date().toLocaleString("en-US", { timeZone: "UTC", dateStyle: "full", timeStyle: "long" })} (UTC). When the user asks for the current time, date, or day, use this information to answer directly.`;
    /* Free plan: no custom system prompt, no memory, no custom instructions */
    let systemPrompt: string | undefined = undefined;
    if (pro) {
      systemPrompt = settings.systemPrompt?.trim() || undefined;
      if (settings.activePromptId) {
        const prompts = await storage.getSavedPrompts(user.id);
        const active = prompts.find((p) => p.id === settings.activePromptId);
        if (active) systemPrompt = active.content;
      }
    }
    systemPrompt = systemPrompt ? `${nowBlock}\n\n${systemPrompt}` : nowBlock;

    if (pro) {
      const customInstructions = settings.customInstructions?.trim();
      if (customInstructions) {
        systemPrompt = `${systemPrompt}\n\n${customInstructions}`;
      }
      const memories = await storage.getMemories(user.id);
      if (memories.length > 0) {
        const memBlock = `Remembered facts about the user:\n${memories.map((m) => `- ${m.content}`).join("\n")}`;
        systemPrompt = `${systemPrompt}\n\n${memBlock}`;
      }
    }

    if (settings.responseLanguage) {
      const langPrompt = `Always respond in ${settings.responseLanguage}, regardless of the language the user writes in.`;
      systemPrompt = systemPrompt ? `${systemPrompt}\n\n${langPrompt}` : langPrompt;
    }

    const selected = resolveModel(effectiveModel, messages as RawMessage[]);
    /* ── Context window: Free=6, Pro=20 ── */
    const contextWindow = pro ? 20 : 6;
    const recentMessages: RawMessage[] = (messages as RawMessage[]).slice(-contextWindow);

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

      // Smart routing: reorder providers based on query type
      const { sorted: smartProviders, category: routingCategory } = smartSortProviders(providerConfigs, recentMessages as RawMessage[]);

      // Model-key boosting: when user explicitly selects a model (not "auto"), prefer matching providers
      const finalProviders = effectiveModel !== "auto"
        ? boostProvidersForModelKey(smartProviders, effectiveModel)
        : smartProviders;

      if (routingCategory !== "general") {
        const topProvider = finalProviders.find((p) => {
          const isChatP = !((p.modelName ?? "").toLowerCase().includes("embed") || (p.apiUrl ?? "").toLowerCase().includes("embed") || (p.modelName ?? "").toLowerCase().includes("rerank") || (p.apiUrl ?? "").toLowerCase().includes("rerank"));
          return p.isEnabled && isChatP;
        });
        if (topProvider) {
          res.write(`data: ${JSON.stringify({ routingInfo: { category: routingCategory, model: topProvider.modelName ?? topProvider.name } })}\n\n`);
        }
      }

      const { inputTokens, outputTokens, modelName: usedModelName } = await streamWithFallback(finalProviders, {
        messages: recentMessages,
        systemPrompt: systemPrompt ?? undefined,
        maxTokens,
        useTools: webSearch,
        res,
      }, (failedProvider, reason) => {
        res.write(`data: ${JSON.stringify({ providerFallback: true, failedProvider, reason })}\n\n`);
      });
      if (usedModelName) {
        res.write(`data: ${JSON.stringify({ modelUsed: usedModelName })}\n\n`);
      }

      /* ── Monthly token accounting for Pro ── */
      if (pro && outputTokens && outputTokens > 0) {
        const { db: dbConn } = await import("./db");
        await dbConn.execute(
          (await import("drizzle-orm")).sql`UPDATE users SET monthly_output_tokens = COALESCE(monthly_output_tokens,0) + ${outputTokens} WHERE id=${user.id}`
        );
        const freshUser = await storage.getUser(user.id);
        const newUsed = freshUser?.monthlyOutputTokens ?? 0;
        const PRO_MONTHLY_LIMIT = 2_200_000;
        const warnAt = Math.floor(PRO_MONTHLY_LIMIT * 0.9);
        res.write(`data: ${JSON.stringify({ done: true, inputTokens, outputTokens, sources: searchSources, monthlyTokensUsed: newUsed, monthlyTokensLimit: PRO_MONTHLY_LIMIT, monthlyWarn: newUsed >= warnAt })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ done: true, inputTokens, outputTokens, sources: searchSources })}\n\n`);
      }
      res.end();
    } catch (primaryErr: unknown) {
      const err = primaryErr as Error;
      console.error(`[providers] stream failed:`, err.message);
      res.write(`data: ${JSON.stringify({ error: err.message || "Stream failed" })}\n\n`);
      res.end();
    }
  });

  /* ── messages: pin/unpin (Pro only) ── */
  app.patch("/api/conversations/:convId/messages/:msgId/pin", requireAuth as any, async (req: Request, res: Response) => {
    const u = await storage.getUser(req.session.userId!);
    if (!u || !isProActive(u)) return res.status(403).json({ error: "Pinning messages requires a Pro plan.", proRequired: true });
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

  /* ── folders: create (Pro only) ── */
  app.post("/api/folders", requireAuth as any, async (req: Request, res: Response) => {
    const u = await storage.getUser(req.session.userId!);
    if (!u || !isProActive(u)) return res.status(403).json({ error: "Folders require a Pro plan.", proRequired: true });
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

  /* ── memories: create (Pro only) ── */
  app.post("/api/memories", requireAuth as any, async (req: Request, res: Response) => {
    const u = await storage.getUser(req.session.userId!);
    if (!u || !isProActive(u)) return res.status(403).json({ error: "Memory requires a Pro plan.", proRequired: true });
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "content is required" });
    const mem = await storage.createMemory(req.session.userId!, content.trim());
    return res.status(201).json(mem);
  });

  /* ── memories: delete (Pro only) ── */
  app.delete("/api/memories/:id", requireAuth as any, async (req: Request, res: Response) => {
    const u = await storage.getUser(req.session.userId!);
    if (!u || !isProActive(u)) return res.status(403).json({ error: "Memory requires a Pro plan.", proRequired: true });
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
        BLUESMINDS_MODEL_ID,
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
        BLUESMINDS_MODEL_ID,
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
    const u = await storage.getUser(userId);
    const pro = u ? isProActive(u) : false;
    const kbLimit = pro ? 10 : 1;
    const existingKbs = await storage.getKnowledgeBases(userId);
    if (existingKbs.length >= kbLimit) {
      return res.status(403).json({
        error: pro
          ? `Knowledge base limit reached (${kbLimit} max on Pro).`
          : `Free plan allows only ${kbLimit} knowledge base. Upgrade to Pro for up to 10.`,
        proRequired: !pro,
      });
    }
    const { name, description = "" } = req.body as { name: string; description?: string };
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    const kb = await storage.createKnowledgeBase(userId, name.trim(), description.trim());
    res.status(201).json(kb);
  });

  app.delete("/api/kb/:id", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const { id } = req.params as { id: string };
    const kb = await storage.getKnowledgeBase(id);
    if (!kb || kb.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteKnowledgeBase(id);
    res.status(204).end();
  });

  /* ── kb: generate/remove share link ── */
  app.post("/api/kb/:id/share", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const { id } = req.params as { id: string };
    const kb = await storage.getKnowledgeBase(id);
    if (!kb || kb.userId !== userId) return res.status(404).json({ error: "Not found" });
    const token = kb.shareToken ?? crypto.randomUUID();
    const updated = await storage.updateKnowledgeBase(kb.id, { isPublic: true, shareToken: token });
    return res.json({ shareToken: token, shareUrl: `/kb/shared/${token}`, kb: updated });
  });

  app.delete("/api/kb/:id/share", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const { id } = req.params as { id: string };
    const kb = await storage.getKnowledgeBase(id);
    if (!kb || kb.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.updateKnowledgeBase(kb.id, { isPublic: false, shareToken: undefined });
    return res.json({ ok: true });
  });

  /* ── kb: view public shared kb (no auth required) ── */
  app.get("/api/kb/shared/:token", async (req, res) => {
    const { token } = req.params as { token: string };
    const kb = await storage.getKnowledgeBaseByToken(token);
    if (!kb || !kb.isPublic) return res.status(404).json({ error: "Knowledge base not found or not shared" });
    const docs = await storage.getKbDocuments(kb.id);
    return res.json({ kb: { id: kb.id, name: kb.name, description: kb.description }, docs });
  });

  /* ── kb: clone shared kb into own account ── */
  app.post("/api/kb/shared/:token/clone", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const { token } = req.params as { token: string };
    const sourceKb = await storage.getKnowledgeBaseByToken(token);
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
    const { id } = req.params as { id: string };
    const kb = await storage.getKnowledgeBase(id);
    if (!kb || kb.userId !== userId) return res.status(404).json({ error: "Not found" });
    const docs = await storage.getKbDocuments(id);
    res.json(docs);
  });

  app.post("/api/kb/:id/documents", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const { id } = req.params as { id: string };
    const kb = await storage.getKnowledgeBase(id);
    if (!kb || kb.userId !== userId) return res.status(404).json({ error: "Not found" });

    /* ── Document limit per KB ── */
    const u = await storage.getUser(userId);
    const pro = u ? isProActive(u) : false;
    const docLimit = pro ? 50 : 5;
    const existingDocs = await storage.getKbDocuments(id);
    if (existingDocs.length >= docLimit) {
      return res.status(403).json({
        error: pro
          ? `Document limit reached (${docLimit} per KB on Pro).`
          : `Free plan allows ${docLimit} documents per KB. Upgrade to Pro for up to 50.`,
        proRequired: !pro,
      });
    }

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
      kbId: id,
      userId,
      name: name.trim(),
      content: content.trim(),
      chunkCount: chunks.length,
    });

    await storage.createKbChunks(
      chunks.map((text, i) => ({
        docId: doc.id,
        kbId: id,
        content: text,
        embedding: embeddings[i],
        chunkIndex: i,
      }))
    );

    res.status(201).json(doc);
  });

  app.delete("/api/kb/:id/documents/:docId", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const { id, docId } = req.params as { id: string; docId: string };
    const kb = await storage.getKnowledgeBase(id);
    if (!kb || kb.userId !== userId) return res.status(404).json({ error: "Not found" });
    await storage.deleteKbChunksByDoc(docId);
    await storage.deleteKbDocument(docId);
    res.status(204).end();
  });

  app.post("/api/kb/:id/chat", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const { id } = req.params as { id: string };
    const kb = await storage.getKnowledgeBase(id);
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

    const allChunks = await storage.getKbChunks(id);
    if (allChunks.length === 0) return res.status(400).json({ error: "No documents in this knowledge base" });

    const docMap = new Map<string, string>();
    const kbDocs = await storage.getKbDocuments(id);
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
        answer = await callAPI(BLUESMINDS_MODEL_ID, kbSystemPrompt, kbUserPrompt, 1000);
      }

      if (!answer) throw new Error("Empty response from AI");
      res.json({ answer, sources });
    } catch (err) {
      console.error("[kb/chat] error:", err);
      res.status(500).json({ error: (err as Error).message });
    }
  });

  /* ── External API: /api/v1/chat (API key auth, balance-based) ── */

  // Pricing: $ per 1M tokens
  const API_PRICING: Record<string, { input: number; output: number }> = {
    powerful:  { input: 5.00,  output: 25.00 },
    fast:      { input: 0.80,  output: 4.00  },
    creative:  { input: 2.00,  output: 8.00  },
    balanced:  { input: 1.00,  output: 3.00  },
  };
  const API_MAX_TOKENS: Record<string, number> = {
    powerful: 32000,
    fast:     4096,
    creative: 8192,
    balanced: 8192,
  };
  const API_RATE_LIMIT = 30; // per minute, fixed
  const apiRateLimitMap = new Map<string, { count: number; resetAt: number }>();

  function checkApiV1RateLimit(apiKey: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const windowMs = 60_000;
    const entry = apiRateLimitMap.get(apiKey);
    if (!entry || now > entry.resetAt) {
      apiRateLimitMap.set(apiKey, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: API_RATE_LIMIT - 1, resetAt: now + windowMs };
    }
    if (entry.count >= API_RATE_LIMIT) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }
    entry.count++;
    return { allowed: true, remaining: API_RATE_LIMIT - entry.count, resetAt: entry.resetAt };
  }

  function computeCost(modelSlug: string, inputTokens: number, outputTokens: number): number {
    const rates = API_PRICING[modelSlug] ?? API_PRICING.balanced;
    return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
  }

  app.post("/api/v1/chat", async (req: Request, res: Response) => {
    const authHeader = req.headers["authorization"] as string | undefined;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Invalid API key" });
    }
    const apiKey = authHeader.slice(7).trim();
    const user = await storage.getUserByApiKey(apiKey);

    if (!user) return res.status(401).json({ error: "Invalid API key" });
    if (!user.apiEnabled) return res.status(403).json({ error: "API access not enabled. Contact admin to request access" });

    // Rate limit (hard 30/min)
    const rl = checkApiV1RateLimit(apiKey);
    if (!rl.allowed) {
      res.setHeader("Retry-After", "60");
      res.setHeader("X-Rate-Limit-Remaining", "0");
      res.setHeader("X-Rate-Limit-Reset", String(Math.ceil(rl.resetAt / 1000)));
      return res.status(429).json({ error: "Rate limit exceeded", retry_after: 60 });
    }

    // Balance check
    const currentBalance = user.apiBalance ?? 0;
    if (currentBalance <= 0) {
      return res.status(402).json({
        error: "Insufficient balance",
        balance_remaining: `$${currentBalance.toFixed(2)}`,
        message: "Please contact admin to add balance",
      });
    }

    const { messages: rawMessages, message, model: modelParam, systemPrompt, stream: wantStream, maxTokens: reqMaxTokens } = req.body;

    // Normalize model slug
    const modelSlug: string = ["powerful", "fast", "creative", "balanced"].includes(modelParam) ? modelParam : "balanced";

    let messages: { role: string; content: string }[] = [];
    if (Array.isArray(rawMessages) && rawMessages.length > 0) {
      messages = rawMessages.map((m: any) => ({ role: m.role, content: m.content }));
    } else if (typeof message === "string" && message.trim()) {
      messages = [{ role: "user", content: message.trim() }];
    } else {
      return res.status(400).json({ error: "Provide 'message' (string) or 'messages' (array)" });
    }

    // Resolve providers for the requested model
    const dbProviders = await storage.getActiveProviders();
    const patterns = getProviderPatterns(modelSlug as any);
    let selectedProviders = dbProviders.filter((p) =>
      p.isEnabled && p.isActive &&
      patterns.some((pat) => p.name.toLowerCase().includes(pat) || p.modelName.toLowerCase().includes(pat))
    );
    // Fallback: use any active provider
    if (selectedProviders.length === 0) selectedProviders = dbProviders.filter((p) => p.isEnabled && p.isActive);
    if (selectedProviders.length === 0) return res.status(503).json({ error: "No active AI providers configured" });

    const providerConfigs: ProviderConfig[] = selectedProviders.map((p) => ({
      id: p.id, name: p.name, providerType: p.providerType,
      apiUrl: p.apiUrl ?? null, apiKey: p.apiKey ?? null, modelName: p.modelName,
      headers: p.headers ?? null, httpMethod: p.httpMethod ?? "POST",
      authStyle: (p.authStyle ?? "bearer") as ProviderConfig["authStyle"],
      authHeaderName: p.authHeaderName ?? null,
      streamMode: (p.streamMode ?? "none") as ProviderConfig["streamMode"],
      bodyTemplate: p.bodyTemplate ?? null, responsePath: p.responsePath ?? null,
      isActive: p.isActive, isEnabled: p.isEnabled, priority: p.priority,
    }));

    const maxTokens = Math.min(reqMaxTokens ?? API_MAX_TOKENS[modelSlug], API_MAX_TOKENS[modelSlug]);
    const messagesJson = JSON.stringify(messages);
    const endpoint = "/api/v1/chat";

    // Helper: set standard response headers
    const setBalanceHeaders = (inputTok: number, outputTok: number, balanceAfter: number, cost: number) => {
      res.setHeader("X-Balance-Remaining", `$${balanceAfter.toFixed(2)}`);
      res.setHeader("X-Balance-Used", `$${cost.toFixed(6)}`);
      res.setHeader("X-Tokens-Input", String(inputTok));
      res.setHeader("X-Tokens-Output", String(outputTok));
      res.setHeader("X-Rate-Limit-Remaining", String(rl.remaining));
      res.setHeader("X-Rate-Limit-Reset", String(Math.ceil(rl.resetAt / 1000)));
    };

    // Also track daily/monthly call counts
    const usage = await storage.incrementApiUsage(user.id);
    if (!usage.allowed) {
      const limitType = usage.limitType!;
      const limit = limitType === "daily" ? usage.dailyLimit! : usage.monthlyLimit!;
      if (user.apiWebhookUrl) fireWebhook(user.apiWebhookUrl, `api.limit.${limitType}`, { username: user.username, limit, limitType });
      return res.status(429).json({ error: `${limitType === "daily" ? "Daily" : "Monthly"} request limit of ${limit} reached.` });
    }

    if (wantStream === true) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
      try {
        const { inputTokens, outputTokens } = await streamWithFallback(providerConfigs, {
          messages, systemPrompt: systemPrompt ?? undefined, maxTokens, useTools: false, res,
        });
        const cost = computeCost(modelSlug, inputTokens, outputTokens);
        const updatedUser = await storage.adjustApiBalance(user.id, -cost);
        const balanceAfter = updatedUser?.apiBalance ?? 0;
        setBalanceHeaders(inputTokens, outputTokens, balanceAfter, cost);
        storage.createApiLog({ userId: user.id, messages: messagesJson, response: null, inputTokens, outputTokens, modelUsed: modelSlug, endpoint, costDeducted: cost });
        if (user.apiWebhookUrl) fireWebhook(user.apiWebhookUrl, "api.message.sent", { username: user.username, inputTokens, outputTokens, cost, model: modelSlug, stream: true });
        res.write(`data: ${JSON.stringify({ done: true, inputTokens, outputTokens, model: modelSlug, balanceRemaining: balanceAfter, cost })}\n\n`);
        res.end();
      } catch (err: any) {
        res.write(`data: ${JSON.stringify({ error: err.message || "Stream failed" })}\n\n`);
        res.end();
      }
    } else {
      try {
        const sysPrompt = systemPrompt ?? "";
        const userPrompt = messages.map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`).join("\n");
        const text = await generateText(providerConfigs, sysPrompt, userPrompt, maxTokens);
        // Estimate tokens (rough: 1 token ≈ 4 chars)
        const inputTokens = Math.ceil(userPrompt.length / 4);
        const outputTokens = Math.ceil(text.length / 4);
        const cost = computeCost(modelSlug, inputTokens, outputTokens);
        const updatedUser = await storage.adjustApiBalance(user.id, -cost);
        const balanceAfter = updatedUser?.apiBalance ?? 0;
        setBalanceHeaders(inputTokens, outputTokens, balanceAfter, cost);
        storage.createApiLog({ userId: user.id, messages: messagesJson, response: text, inputTokens, outputTokens, modelUsed: modelSlug, endpoint, costDeducted: cost });
        if (user.apiWebhookUrl) fireWebhook(user.apiWebhookUrl, "api.message.sent", { username: user.username, cost, model: modelSlug, stream: false });
        return res.json({ content: text, model: modelSlug, balanceRemaining: balanceAfter, cost, inputTokens, outputTokens });
      } catch (err: any) {
        return res.status(500).json({ error: err.message || "Generation failed" });
      }
    }
  });

  return httpServer;
}
