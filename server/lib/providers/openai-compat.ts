/**
 * OpenAI-compatible streaming adapter.
 * Covers: OpenAI, Azure OpenAI (Chat Completions + Responses API),
 *         Google Gemini (compat endpoint), and any other OpenAI-compatible API.
 */
import type { Response } from "express";
import { executeTool } from "../../tools";
import type { ProviderAdapter, ProviderConfig, StreamOptions, TestResult, UsageResult, RawMessage } from "./types";
import { TOOL_DEFINITIONS_OPENAI } from "./types";

interface ToolCallAccum {
  id: string;
  name: string;
  args: string;
}

function buildMessages(
  messages: RawMessage[],
  systemPrompt?: string,
): Array<{ role: string; content: unknown }> {
  const out: Array<{ role: string; content: unknown }> = [];
  if (systemPrompt) out.push({ role: "system", content: systemPrompt });
  for (const m of messages) {
    if (!m.attachments?.length) {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const parts: unknown[] = [{ type: "text", text: m.content || " " }];
    for (const att of m.attachments) {
      if (att.type === "image") {
        parts.push({ type: "image_url", image_url: { url: att.data } });
      } else if (att.type === "text" || att.type === "file") {
        parts.push({ type: "text", text: `[File: ${att.name}]\n${att.data}` });
      }
    }
    out.push({ role: m.role, content: parts });
  }
  return out;
}

export class OpenAICompatAdapter implements ProviderAdapter {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private get baseUrl(): string {
    if (this.config.apiUrl) return this.config.apiUrl.replace(/\/$/, "");
    if (this.config.providerType === "openai") return "https://api.openai.com/v1";
    if (this.config.providerType === "gemini") return "https://generativelanguage.googleapis.com/v1beta/openai";
    return "https://api.openai.com/v1";
  }

  /**
   * Whether this provider uses the OpenAI/Azure Responses API
   * (POST /responses) instead of Chat Completions (POST /chat/completions).
   */
  private get isResponsesApi(): boolean {
    return (this.config.apiUrl ?? "").includes("/responses");
  }

  /**
   * Whether this provider uses the Anthropic Messages API format
   * (e.g. Azure AI Foundry's /anthropic/v1/messages endpoint).
   */
  private get isAnthropicApi(): boolean {
    return (this.config.apiUrl ?? "").includes("/anthropic/");
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    const apiUrl = this.config.apiUrl ?? "";

    if (this.config.providerType === "azure") {
      // Azure AI Foundry (services.ai.azure.com / inference.ai.azure.com) → Bearer token
      // Legacy Azure OpenAI (openai.azure.com / cognitiveservices.azure.com) → api-key
      if (apiUrl.includes("services.ai.azure.com") || apiUrl.includes(".inference.ai.azure.com")) {
        headers["Authorization"] = `Bearer ${this.config.apiKey ?? ""}`;
      } else {
        headers["api-key"] = this.config.apiKey ?? "";
      }
    } else {
      headers["Authorization"] = `Bearer ${this.config.apiKey ?? ""}`;
    }

    // Anthropic Messages API (including Azure's /anthropic/ endpoint) requires this header
    if (this.isAnthropicApi) {
      headers["anthropic-version"] = "2023-06-01";
    }

    if (this.config.headers) {
      try {
        const extra = JSON.parse(this.config.headers);
        Object.assign(headers, extra);
      } catch {}
    }
    return headers;
  }

  /**
   * Returns the full endpoint URL.
   * If the user already provided a URL with a meaningful path, use it as-is.
   * Otherwise append the standard chat completions path.
   * For openai-compatible providers with a bare domain, defaults to /v1/chat/completions
   * since that is the OpenAI-standard convention followed by most third-party APIs.
   */
  private chatEndpoint(): string {
    const rawUrl = (this.config.apiUrl ?? "").replace(/\/$/, "");

    // If the URL has a meaningful path (not just "/"), use it as-is.
    // This covers /chat/completions, /v1/chat/completions, /openai/responses, etc.
    try {
      const parsed = new URL(rawUrl);
      if (parsed.pathname.length > 1) return rawUrl;
    } catch {}

    // Base URL only — append the standard chat completions path.
    // Legacy Azure OpenAI (.openai.azure.com) also needs api-version.
    const isLegacyAzure = this.config.providerType === "azure" &&
      rawUrl.includes(".openai.azure.com");
    if (isLegacyAzure) return `${this.baseUrl}/chat/completions?api-version=2024-02-01`;

    // For openai-compatible providers with a bare domain, use /v1/chat/completions
    // (the OpenAI-standard path used by virtually all third-party compatible APIs).
    if (this.config.providerType === "openai-compatible") {
      return `${this.baseUrl}/v1/chat/completions`;
    }

    return `${this.baseUrl}/chat/completions`;
  }

  // ---------------------------------------------------------------------------
  // Responses API helpers (OpenAI / Azure OpenAI Responses API)
  // ---------------------------------------------------------------------------

  private buildResponsesBody(
    messages: Array<{ role: string; content: unknown }>,
    maxTokens: number,
    stream: boolean,
  ): Record<string, unknown> {
    // System message becomes an extra top-level "instructions" field
    const systemMsg = messages.find(m => m.role === "system");
    const inputMsgs = messages.filter(m => m.role !== "system");

    const body: Record<string, unknown> = {
      model: this.config.modelName,
      input: inputMsgs,
      max_output_tokens: maxTokens,
      stream,
    };
    if (systemMsg) body.instructions = systemMsg.content;
    return body;
  }

  /** Parse non-streaming Responses API response → plain text */
  private parseResponsesOutput(data: unknown): string {
    const d = data as {
      output?: Array<{
        type?: string;
        content?: Array<{ type?: string; text?: string }>;
      }>;
    };
    for (const item of d.output ?? []) {
      for (const part of item.content ?? []) {
        if (part.type === "output_text" && part.text) return part.text;
      }
    }
    return "";
  }

  // ---------------------------------------------------------------------------
  // testConnection
  // ---------------------------------------------------------------------------

  async testConnection(): Promise<TestResult> {
    const start = Date.now();
    try {
      const modelLower = (this.config.modelName ?? "").toLowerCase();
      const urlLower = (this.config.apiUrl ?? "").toLowerCase();
      const isEmbedModel = modelLower.includes("embed") || urlLower.includes("embed");
      const isRerankModel = modelLower.includes("rerank") || urlLower.includes("rerank");

      let endpoint: string;
      let testBody: Record<string, unknown>;

      if (isRerankModel) {
        endpoint = this.config.apiUrl ?? "";
        testBody = {
          model: this.config.modelName,
          query: "test connection",
          documents: ["hello world"],
        };
      } else if (isEmbedModel) {
        const base = (this.config.apiUrl ?? "").replace(/\/$/, "");
        endpoint = base.endsWith("/embeddings") ? base : `${base}/embeddings`;
        testBody = { model: this.config.modelName, input: ["test"] };
      } else if (this.isAnthropicApi) {
        // Anthropic Messages API format (no stream field for non-streaming)
        endpoint = this.chatEndpoint();
        testBody = {
          model: this.config.modelName,
          messages: [{ role: "user", content: "Say OK" }],
          max_tokens: 16,
        };
      } else if (this.isResponsesApi) {
        endpoint = this.chatEndpoint();
        testBody = {
          model: this.config.modelName,
          input: [{ role: "user", content: "Say OK" }],
          max_output_tokens: 16,
          stream: false,
        };
      } else {
        endpoint = this.chatEndpoint();
        testBody = {
          model: this.config.modelName,
          messages: [{ role: "user", content: "Say OK" }],
          max_tokens: 16,
          stream: false,
        };
      }

      /* ── Helper: attempt one fetch with a 15s timeout ── */
      const attemptFetch = async (url: string, body: Record<string, unknown>) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15_000);
        try {
          const r = await fetch(url, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(body),
            signal: ctrl.signal,
          });
          const text = await r.text();
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(text); } catch { /* not JSON */ }
          return { r, rawText: text, data: parsed };
        } finally {
          clearTimeout(t);
        }
      };

      let { r: res, rawText, data } = await attemptFetch(endpoint, testBody);

      // Some newer models (o-series, gpt-5) reject max_tokens — auto-retry with max_completion_tokens
      const errMsg0 = (data as { error?: { message?: string } }).error?.message ?? rawText;
      if (!res.ok && errMsg0.toLowerCase().includes("max_tokens")) {
        const retryBody = { ...testBody, max_completion_tokens: (testBody as Record<string, unknown>).max_tokens };
        delete (retryBody as Record<string, unknown>).max_tokens;
        ({ r: res, rawText, data } = await attemptFetch(endpoint, retryBody));
      }

      // If the endpoint has no /v1/ path and the request failed, auto-retry with /v1/chat/completions.
      // Many OpenAI-compatible APIs use /v1/chat/completions but users often enter just the base domain.
      if (!res.ok && !isRerankModel && !isEmbedModel && !this.isAnthropicApi && !this.isResponsesApi) {
        const endpointHasPath = (() => {
          try { return new URL(endpoint).pathname.length > 1; } catch { return false; }
        })();
        const alreadyHasV1 = endpoint.includes("/v1");
        if (!alreadyHasV1 || !endpointHasPath) {
          const base = (this.config.apiUrl ?? "").replace(/\/$/, "");
          const v1Endpoint = `${base}/v1/chat/completions`;
          const v1Result = await attemptFetch(v1Endpoint, testBody);
          if (v1Result.r.ok) {
            return { success: true, latencyMs: Date.now() - start, message: "Connection successful" };
          }
          // If v1 also fails, keep the original response for error reporting
        }
      }

      if (!res.ok) {
        const isAuthError = res.status === 401 || res.status === 403;
        const apiErrMsg = (data as { error?: { message?: string } }).error?.message;
        const errMsg = isAuthError && !apiErrMsg
          ? `Invalid API key or unauthorized (HTTP ${res.status}). Check your API key and ensure the provider URL is correct (e.g. https://api.example.com/v1/chat/completions).`
          : (apiErrMsg ?? (rawText.slice(0, 200) || `HTTP ${res.status}`));
        return { success: false, latencyMs: Date.now() - start, statusCode: res.status, message: errMsg };
      }
      return { success: true, latencyMs: Date.now() - start, message: "Connection successful" };
    } catch (e: unknown) {
      const isTimeout = (e as Error).name === "AbortError";
      const msg = isTimeout ? "Connection timed out after 15s — check the URL and firewall settings" : (e as Error).message;
      return { success: false, latencyMs: Date.now() - start, message: msg };
    }
  }

  // ---------------------------------------------------------------------------
  // generate (non-streaming, used for knowledge base / summaries)
  // ---------------------------------------------------------------------------

  async generate({ systemPrompt, userPrompt, maxTokens = 2048 }: import("./types").GenerateOptions): Promise<string> {
    const endpoint = this.chatEndpoint();

    if (this.isAnthropicApi) {
      const body: Record<string, unknown> = {
        model: this.config.modelName,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: userPrompt }],
      };
      if (systemPrompt) body.system = systemPrompt;
      const res = await fetch(endpoint, { method: "POST", headers: this.buildHeaders(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`Provider error ${res.status}`);
      const data = await res.json() as { content?: Array<{ type?: string; text?: string }> };
      const text = data.content?.find((b) => b.type === "text")?.text ?? "";
      if (!text) throw new Error("Empty response from provider");
      return text;
    }

    if (this.isResponsesApi) {
      const msgs: Array<{ role: string; content: string }> = [];
      msgs.push({ role: "user", content: userPrompt });
      const body = this.buildResponsesBody(
        systemPrompt ? [{ role: "system", content: systemPrompt }, ...msgs] : msgs,
        maxTokens,
        false,
      );
      const res = await fetch(endpoint, { method: "POST", headers: this.buildHeaders(), body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`Provider error ${res.status}`);
      const data = await res.json();
      const text = this.parseResponsesOutput(data);
      if (!text) throw new Error("Empty response from provider");
      return text;
    }

    // Standard Chat Completions
    const msgs: Array<{ role: string; content: string }> = [];
    if (systemPrompt) msgs.push({ role: "system", content: systemPrompt });
    msgs.push({ role: "user", content: userPrompt });
    const res = await fetch(endpoint, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify({ model: this.config.modelName, messages: msgs, max_tokens: maxTokens, stream: false }),
    });
    if (!res.ok) throw new Error(`Provider error ${res.status}`);
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("Empty response from provider");
    return text;
  }

  // ---------------------------------------------------------------------------
  // stream
  // ---------------------------------------------------------------------------

  async stream({ messages, systemPrompt, maxTokens, useTools, res, oaiMessages, externalTools }: StreamOptions): Promise<UsageResult> {
    const endpoint = this.chatEndpoint();

    if (this.isAnthropicApi) {
      return this.streamAnthropicApi(endpoint, messages, systemPrompt, maxTokens, useTools, res, oaiMessages, externalTools);
    }

    if (this.isResponsesApi) {
      return this.streamResponsesApi(endpoint, messages, systemPrompt, maxTokens, res);
    }

    return this.streamChatCompletions(endpoint, messages, systemPrompt, maxTokens, useTools, res, oaiMessages);
  }

  // ---------------------------------------------------------------------------
  // Anthropic Messages API streaming (Azure /anthropic/v1/messages endpoint)
  // ---------------------------------------------------------------------------

  /**
   * Convert an array of OpenAI-format messages to Anthropic messages format.
   * Handles role:"tool" (tool results) and assistant messages with tool_calls.
   * Merges consecutive same-role messages as required by Anthropic.
   */
  private static oaiMessagesToAnthropic(msgs: any[]): any[] {
    const out: { role: "user" | "assistant"; content: any }[] = [];

    for (const m of msgs) {
      if (m.role === "system") continue;

      if (m.role === "tool") {
        const block = {
          type: "tool_result",
          tool_use_id: m.tool_call_id ?? "",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        };
        if (out.length > 0 && out[out.length - 1].role === "user" && Array.isArray(out[out.length - 1].content)) {
          out[out.length - 1].content.push(block);
        } else {
          out.push({ role: "user", content: [block] });
        }
        continue;
      }

      if (m.role === "assistant" && m.tool_calls?.length) {
        const blocks: any[] = [];
        if (m.content) blocks.push({ type: "text", text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) });
        for (const tc of m.tool_calls) {
          let input: Record<string, unknown> = {};
          try { input = JSON.parse(tc.function?.arguments ?? "{}"); } catch {}
          blocks.push({ type: "tool_use", id: tc.id, name: tc.function?.name ?? tc.name, input });
        }
        out.push({ role: "assistant", content: blocks });
        continue;
      }

      const role = m.role === "assistant" ? "assistant" : "user";

      let content: string | any[];
      if (Array.isArray(m.content)) {
        content = m.content.map((block: any) => {
          if (block.type === "text") return { type: "text", text: block.text ?? "" };
          if (block.type === "image_url") {
            const url: string = block.image_url?.url ?? "";
            if (url.startsWith("data:")) {
              const semi = url.indexOf(";");
              const comma = url.indexOf(",");
              const mediaType = semi !== -1 ? url.slice(5, semi) : "image/jpeg";
              const data = comma !== -1 ? url.slice(comma + 1) : "";
              return { type: "image", source: { type: "base64", media_type: mediaType, data } };
            }
            return { type: "image", source: { type: "url", url } };
          }
          return { type: "text", text: JSON.stringify(block) };
        });
      } else {
        content = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
      }

      if (out.length > 0 && out[out.length - 1].role === role && typeof out[out.length - 1].content === "string" && typeof content === "string") {
        out[out.length - 1].content += "\n" + content;
      } else {
        out.push({ role, content });
      }
    }

    return out;
  }

  // Build Anthropic-format content blocks for a single message, including images.
  private static buildAnthropicContent(m: RawMessage): unknown {
    const images = (m.attachments ?? []).filter((a) => a.type === "image");
    const textAtts = (m.attachments ?? []).filter((a) => a.type !== "image");

    if (images.length === 0 && textAtts.length === 0) return m.content;

    const parts: unknown[] = [];

    // Text content (with any text attachments appended)
    let text = m.content || "";
    for (const att of textAtts) {
      text += `\n\n--- File: ${att.name} ---\n${att.data}\n--- End of ${att.name} ---`;
    }
    if (text.trim()) parts.push({ type: "text", text });

    // Image content blocks in Anthropic format
    for (const att of images) {
      let mediaType = att.mimeType || "image/jpeg";
      let b64 = att.data;
      // Strip data URL prefix: "data:image/jpeg;base64," → just base64
      if (b64.startsWith("data:")) {
        const comma = b64.indexOf(",");
        if (comma !== -1) {
          const header = b64.slice(5, comma); // e.g. "image/jpeg;base64"
          mediaType = header.split(";")[0] || mediaType;
          b64 = b64.slice(comma + 1);
        }
      }
      parts.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: b64 },
      });
    }

    return parts;
  }

  private async streamAnthropicApi(
    endpoint: string,
    messages: RawMessage[],
    systemPrompt: string | undefined,
    maxTokens: number,
    useTools: boolean,
    res: Response,
    oaiMessages?: any[],
    externalTools?: any[],
  ): Promise<UsageResult> {
    // Use oaiMessages conversion whenever provided — converts role:"tool" → tool_result blocks.
    // Also filter role:"tool" from fallback so stale history never causes Anthropic 400.
    const anthropicMessages = Array.isArray(oaiMessages) && oaiMessages.length > 0
      ? OpenAICompatAdapter.oaiMessagesToAnthropic(oaiMessages!)
      : messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: OpenAICompatAdapter.buildAnthropicContent(m),
          }));
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheCreationTokens = 0;

    // Wrap system prompt with cache_control so the Azure Anthropic endpoint caches it
    const systemContent = systemPrompt
      ? [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }]
      : undefined;

    const body: Record<string, unknown> = {
      model: this.config.modelName,
      max_tokens: maxTokens,
      messages: anthropicMessages,
      stream: true,
    };
    if (systemContent) body.system = systemContent;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      const err = await response.text();
      throw new Error(`Provider error ${response.status}: ${err.slice(0, 200)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          const ev = JSON.parse(raw) as {
            type?: string;
            index?: number;
            delta?: { type?: string; text?: string };
            message?: { usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } };
            usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
          };

          if (ev.type === "message_start" && ev.message?.usage) {
            inputTokens       = ev.message.usage.input_tokens ?? 0;
            cacheReadTokens     = ev.message.usage.cache_read_input_tokens ?? 0;
            cacheCreationTokens = ev.message.usage.cache_creation_input_tokens ?? 0;
          }
          if (ev.type === "message_delta" && ev.usage) {
            outputTokens = ev.usage.output_tokens ?? 0;
          }
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
            res.write(`data: ${JSON.stringify({ text: ev.delta.text })}\n\n`);
          }
        } catch {}
      }
    }

    return { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens };
  }

  // ---------------------------------------------------------------------------
  // Responses API streaming
  // ---------------------------------------------------------------------------

  // Build input messages for the OpenAI Responses API.
  // Uses "input_text" / "input_image" content types (different from Chat Completions).
  private static buildResponsesMessages(
    messages: RawMessage[],
    systemPrompt?: string,
  ): Array<{ role: string; content: unknown }> {
    const out: Array<{ role: string; content: unknown }> = [];
    if (systemPrompt) out.push({ role: "system", content: systemPrompt });
    for (const m of messages) {
      const images = (m.attachments ?? []).filter((a) => a.type === "image");
      const textAtts = (m.attachments ?? []).filter((a) => a.type !== "image");

      if (images.length === 0 && textAtts.length === 0) {
        out.push({ role: m.role, content: m.content });
        continue;
      }

      const parts: unknown[] = [];
      let text = m.content || "";
      for (const att of textAtts) {
        text += `\n\n--- File: ${att.name} ---\n${att.data}\n--- End of ${att.name} ---`;
      }
      if (text.trim()) parts.push({ type: "input_text", text });

      for (const att of images) {
        // Responses API expects "input_image" with a plain string URL (not nested object)
        const url = att.data.startsWith("data:") ? att.data : `data:${att.mimeType};base64,${att.data}`;
        parts.push({ type: "input_image", image_url: url, detail: "auto" });
      }

      out.push({ role: m.role, content: parts });
    }
    return out;
  }

  private async streamResponsesApi(
    endpoint: string,
    messages: RawMessage[],
    systemPrompt: string | undefined,
    maxTokens: number,
    res: Response,
  ): Promise<UsageResult> {
    const builtMsgs = OpenAICompatAdapter.buildResponsesMessages(messages, systemPrompt);
    const body = this.buildResponsesBody(builtMsgs, maxTokens, true);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      const err = await response.text();
      throw new Error(`Provider error ${response.status}: ${err.slice(0, 200)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let inputTokens = 0;
    let outputTokens = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        // Responses API uses both "event:" lines and "data:" lines
        if (line.startsWith("data: ")) {
          const raw = line.slice(6).trim();
          if (!raw || raw === "[DONE]") continue;
          try {
            const chunk = JSON.parse(raw) as {
              type?: string;
              delta?: string;
              response?: {
                usage?: { input_tokens?: number; output_tokens?: number };
              };
            };

            if (chunk.type === "response.output_text.delta" && chunk.delta) {
              res.write(`data: ${JSON.stringify({ text: chunk.delta })}\n\n`);
            }

            if (chunk.type === "response.completed" && chunk.response?.usage) {
              inputTokens = chunk.response.usage.input_tokens ?? 0;
              outputTokens = chunk.response.usage.output_tokens ?? 0;
            }
          } catch {}
        }
      }
    }

    return { inputTokens, outputTokens };
  }

  // ---------------------------------------------------------------------------
  // Standard Chat Completions streaming (with tool-call loop)
  // ---------------------------------------------------------------------------

  private async streamChatCompletions(
    endpoint: string,
    messages: RawMessage[],
    systemPrompt: string | undefined,
    maxTokens: number,
    useTools: boolean,
    res: Response,
    oaiMessages?: any[],
  ): Promise<UsageResult> {
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    // When oaiMessages are provided (external/Cline path), use them directly —
    // they're already in proper OAI format with role:"tool" tool results.
    // Standard OpenAI Chat Completions endpoints support role:"tool" natively.
    let conversationMessages: Array<{ role: string; content: unknown }> =
      Array.isArray(oaiMessages) && oaiMessages.length > 0
        ? oaiMessages
        : buildMessages(messages, systemPrompt);
    // Some models (o-series, gpt-5+) require max_completion_tokens instead of max_tokens.
    // We detect this on first failure and switch permanently for this request.
    let tokenParam: "max_tokens" | "max_completion_tokens" = "max_tokens";

    for (let round = 0; round < 6; round++) {
      const body: Record<string, unknown> = {
        model: this.config.modelName,
        messages: conversationMessages,
        [tokenParam]: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      };
      if (useTools) {
        body.tools = TOOL_DEFINITIONS_OPENAI;
        body.tool_choice = "auto";
      }

      let response = await fetch(endpoint, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      });

      // Auto-detect max_tokens rejection and retry with max_completion_tokens
      if (!response.ok && tokenParam === "max_tokens") {
        const errText = await response.text();
        if (errText.toLowerCase().includes("max_tokens")) {
          tokenParam = "max_completion_tokens";
          const retryBody: Record<string, unknown> = { ...body, max_completion_tokens: maxTokens };
          delete retryBody.max_tokens;
          response = await fetch(endpoint, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(retryBody),
          });
        } else {
          throw new Error(`Provider error ${response.status}: ${errText.slice(0, 200)}`);
        }
      }

      if (!response.ok || !response.body) {
        const err = await response.text();
        throw new Error(`Provider error ${response.status}: ${err.slice(0, 200)}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistantText = "";
      let finishReason: string | null = null;
      const pendingTools: Record<string, ToolCallAccum> = {};

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") { finishReason = finishReason ?? "stop"; continue; }
          try {
            const chunk = JSON.parse(raw) as {
              usage?: {
                prompt_tokens?: number;
                completion_tokens?: number;
                prompt_tokens_details?: { cached_tokens?: number };
                prompt_cache_hit_tokens?: number;
              };
              choices?: Array<{
                finish_reason?: string;
                delta?: {
                  content?: string;
                  tool_calls?: Array<{
                    index?: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
              }>;
            };

            if (chunk.usage) {
              inputTokens      = chunk.usage.prompt_tokens ?? 0;
              outputTokens     = chunk.usage.completion_tokens ?? 0;
              // OpenAI: prompt_tokens_details.cached_tokens
              // Some Azure / other providers: prompt_cache_hit_tokens
              cacheReadTokens  = chunk.usage.prompt_tokens_details?.cached_tokens
                              ?? chunk.usage.prompt_cache_hit_tokens
                              ?? cacheReadTokens;
            }

            const choice = chunk.choices?.[0];
            if (!choice) continue;
            if (choice.finish_reason) finishReason = choice.finish_reason;

            const delta = choice.delta;
            if (delta?.content) {
              assistantText += delta.content;
              res.write(`data: ${JSON.stringify({ text: delta.content })}\n\n`);
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = String(tc.index ?? 0);
                if (!pendingTools[idx]) {
                  pendingTools[idx] = { id: tc.id ?? idx, name: tc.function?.name ?? "", args: "" };
                }
                if (tc.function?.name) pendingTools[idx].name = tc.function.name;
                if (tc.function?.arguments) pendingTools[idx].args += tc.function.arguments;
              }
            }
          } catch {}
        }
      }

      if (finishReason !== "tool_calls") break;

      const toolEntries = Object.values(pendingTools);
      if (!toolEntries.length) break;

      const toolMessages: Array<{ role: string; content: string; tool_call_id: string }> = [];
      const assistantToolCalls = toolEntries.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.args },
      }));

      conversationMessages.push({ role: "assistant", content: assistantToolCalls as unknown as string });

      for (const tc of toolEntries) {
        let input: Record<string, string> = {};
        try { input = JSON.parse(tc.args); } catch {}
        res.write(`data: ${JSON.stringify({ toolCall: { name: tc.name, input } })}\n\n`);
        const result = await executeTool(tc.name, input);
        res.write(`data: ${JSON.stringify({ toolResult: { name: tc.name, input, result } })}\n\n`);
        toolMessages.push({ role: "tool", content: result, tool_call_id: tc.id });
      }

      conversationMessages = [...conversationMessages, ...toolMessages as unknown as typeof conversationMessages];
    }

    return { inputTokens, outputTokens, cacheReadTokens };
  }
}
