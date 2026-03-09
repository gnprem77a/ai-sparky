import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { MODEL_REGISTRY, FALLBACK_MODEL, getModel, type ModelDefinition } from "../shared/models";
import { storage } from "./storage";
import bcrypt from "bcrypt";
import { insertUserSchema } from "../shared/schema";

/* ─── auth middleware ─────────────────────────────────────────── */
function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

async function requireAdmin(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
  const user = await storage.getUser(req.session.userId);
  if (!user?.isAdmin) return res.status(403).json({ error: "Forbidden" });
  next();
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

function buildClaudeBody(messages: RawMessage[], maxTokens: number) {
  return {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    messages: messages.map((m) => ({ role: m.role, content: buildClaudeContent(m) })),
  };
}

function buildLlamaPrompt(messages: RawMessage[]): string {
  let prompt = "<|begin_of_text|>";
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

function buildLlamaBody(messages: RawMessage[], maxTokens: number) {
  return {
    prompt: buildLlamaPrompt(messages),
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
): Promise<void> {
  const body = entry.provider === "anthropic"
    ? buildClaudeBody(messages, maxTokens)
    : buildLlamaBody(messages, maxTokens);

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
    if (!parsed.success) {
      return res.status(400).json({ error: "Username and password are required." });
    }
    const { username, password } = parsed.data;

    const existing = await storage.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: "Username already taken." });
    }

    const hashed = await bcrypt.hash(password, 12);
    // First registered user becomes admin automatically
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
    if (!parsed.success) {
      return res.status(400).json({ error: "Username and password are required." });
    }
    const { username, password } = parsed.data;

    const user = await storage.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

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
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not logged in" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: "User not found" });
    }
    return res.json({ id: user.id, username: user.username, isAdmin: user.isAdmin, plan: user.plan, planExpiresAt: user.planExpiresAt });
  });

  /* ── admin: list users ── */
  app.get("/api/admin/users", requireAdmin as any, async (req: Request, res: Response) => {
    const allUsers = await storage.getAllUsers();
    return res.json(allUsers.map((u) => ({
      id: u.id,
      username: u.username,
      isAdmin: u.isAdmin,
      plan: u.plan,
      planExpiresAt: u.planExpiresAt,
      createdAt: u.createdAt,
    })));
  });

  /* ── admin: toggle admin ── */
  app.patch("/api/admin/users/:id/admin", requireAdmin as any, async (req: Request, res: Response) => {
    const { id } = req.params;
    if (id === req.session.userId) {
      return res.status(400).json({ error: "Cannot change your own admin status." });
    }
    const { isAdmin } = req.body;
    const user = await storage.setAdmin(id, Boolean(isAdmin));
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ id: user.id, username: user.username, isAdmin: user.isAdmin });
  });

  /* ── admin: delete user ── */
  app.delete("/api/admin/users/:id", requireAdmin as any, async (req: Request, res: Response) => {
    const { id } = req.params;
    if (id === req.session.userId) {
      return res.status(400).json({ error: "Cannot delete your own account." });
    }
    await storage.deleteUser(id);
    return res.json({ ok: true });
  });

  /* ── admin: set plan ── */
  app.patch("/api/admin/users/:id/plan", requireAdmin as any, async (req: Request, res: Response) => {
    const { id } = req.params;
    const { plan, expiresAt } = req.body; // plan: 'free'|'pro', expiresAt: ISO string | null
    if (!["free", "pro"].includes(plan)) {
      return res.status(400).json({ error: "plan must be 'free' or 'pro'" });
    }
    const expiry = expiresAt ? new Date(expiresAt) : null;
    const user = await storage.setPlan(id, plan, expiry);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({
      id: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      plan: user.plan,
      planExpiresAt: user.planExpiresAt,
    });
  });

  /* ── chat (protected) ── */
  app.post("/api/chat", requireAuth, async (req: Request, res: Response) => {
    const { messages, model = "auto", maxTokens = 4096 } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      return res.status(500).json({
        error: "AWS credentials not configured. Add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION to Secrets.",
      });
    }

    const selected = resolveModel(model, messages as RawMessage[]);
    const recentMessages: RawMessage[] = (messages as RawMessage[]).slice(-6);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const client = getClient();

    try {
      await streamModel(client, selected, recentMessages, maxTokens, res, true);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (primaryErr: unknown) {
      const err = primaryErr as Error;
      console.error(`[bedrock] ${selected.exactName} failed:`, err.message);

      if (selected.bedrockId !== FALLBACK_MODEL.bedrockId) {
        console.log(`[bedrock] Falling back to ${FALLBACK_MODEL.exactName}…`);
        try {
          await streamModel(client, FALLBACK_MODEL, recentMessages, maxTokens, res, false);
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
