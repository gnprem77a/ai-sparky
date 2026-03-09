import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";

/* ─── model registry ─────────────────────────────────────────── */
type ModelKey = "balanced" | "powerful" | "creative" | "fast";

interface ModelEntry {
  bedrockId: string;
  displayName: string;
  provider: "anthropic" | "meta";
}

const MODELS: Record<ModelKey, ModelEntry> = {
  balanced: {
    bedrockId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    displayName: "Balanced",
    provider: "anthropic",
  },
  powerful: {
    bedrockId: "anthropic.claude-opus-4-1-20250805-v1:0",
    displayName: "Powerful",
    provider: "anthropic",
  },
  creative: {
    bedrockId: "meta.llama3-70b-instruct-v1:0",
    displayName: "Creative",
    provider: "meta",
  },
  fast: {
    bedrockId: "anthropic.claude-3-haiku-20240307-v1:0",
    displayName: "Fast",
    provider: "anthropic",
  },
};

const FALLBACK: ModelEntry = MODELS.balanced;

/* ─── auto-routing ───────────────────────────────────────────── */
const CODING_KEYWORDS = [
  "code", "debug", "error", "function", "class", "algorithm", "api",
  "database", "sql", "typescript", "javascript", "python", "bug", "fix",
  "refactor", "architecture", "implement", "compiler", "runtime", "regex",
  "async", "promise", "import", "export", "syntax", "library", "framework",
];

const CREATIVE_KEYWORDS = [
  "story", "creative", "write a", "poem", "brainstorm", "imagine", "fiction",
  "character", "novel", "song", "lyrics", "narrative", "plot", "screenplay",
  "metaphor", "describe", "invent", "fantasy", "roleplay",
];

function autoSelectModel(messages: RawMessage[]): ModelEntry {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = (lastUser?.content ?? "").toLowerCase().trim();

  if (text.length < 50) return MODELS.fast;
  if (CODING_KEYWORDS.some((k) => text.includes(k))) return MODELS.powerful;
  if (CREATIVE_KEYWORDS.some((k) => text.includes(k))) return MODELS.creative;
  return MODELS.balanced;
}

function resolveModel(requestedModel: string, messages: RawMessage[]): ModelEntry {
  if (requestedModel === "auto") return autoSelectModel(messages);
  return MODELS[requestedModel as ModelKey] ?? MODELS.balanced;
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

type ClaudeBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

/* ─── request builders ───────────────────────────────────────── */
function buildClaudeContent(msg: RawMessage): string | ClaudeBlock[] {
  const textAttachments = msg.attachments?.filter((a) => a.type === "text") ?? [];
  let text = msg.content;
  if (textAttachments.length > 0) {
    text += textAttachments
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
    const textAttachments = msg.attachments?.filter((a) => a.type === "text") ?? [];
    let text = msg.content;
    if (textAttachments.length > 0) {
      text += textAttachments
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
  entry: ModelEntry,
  messages: RawMessage[],
  maxTokens: number,
  res: Response,
  firstChunk: boolean,
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

  if (firstChunk) {
    res.write(`data: ${JSON.stringify({ modelUsed: entry.displayName })}\n\n`);
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
  app.post("/api/chat", async (req: Request, res: Response) => {
    const { messages, model = "auto", maxTokens = 4096 } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      return res.status(500).json({
        error: "AWS credentials not configured. Add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION to Secrets.",
      });
    }

    const selectedModel = resolveModel(model, messages);
    const recentMessages: RawMessage[] = messages.slice(-6);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const client = getClient();

    try {
      await streamModel(client, selectedModel, recentMessages, maxTokens, res, true);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (primaryErr: unknown) {
      const err = primaryErr as Error;
      console.error(`[bedrock] ${selectedModel.displayName} failed:`, err.message);

      if (selectedModel.bedrockId !== FALLBACK.bedrockId) {
        console.log("[bedrock] Falling back to Balanced (Sonnet)…");
        try {
          await streamModel(client, FALLBACK, recentMessages, maxTokens, res, false);
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
