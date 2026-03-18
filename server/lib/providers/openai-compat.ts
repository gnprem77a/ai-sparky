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
   * Otherwise append the standard /chat/completions path.
   */
  private chatEndpoint(): string {
    const rawUrl = (this.config.apiUrl ?? "").replace(/\/$/, "");

    // If the URL has a meaningful path (not just "/"), use it as-is.
    // This covers /chat/completions, /openai/responses, /models/chat/completions, etc.
    try {
      const parsed = new URL(rawUrl);
      if (parsed.pathname.length > 1) return rawUrl;
    } catch {}

    // Base URL only — append the standard chat completions path.
    // Legacy Azure OpenAI (.openai.azure.com) also needs api-version.
    const isLegacyAzure = this.config.providerType === "azure" &&
      rawUrl.includes(".openai.azure.com");
    return isLegacyAzure
      ? `${this.baseUrl}/chat/completions?api-version=2024-02-01`
      : `${this.baseUrl}/chat/completions`;
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

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      let res: globalThis.Response;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: this.buildHeaders(),
          body: JSON.stringify(testBody),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      let rawText = await res.text();
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(rawText); } catch { /* not JSON */ }

      // Some newer models (o-series, gpt-5) reject max_tokens — auto-retry with max_completion_tokens
      const errMsg0 = (data as { error?: { message?: string } }).error?.message ?? rawText;
      if (!res.ok && errMsg0.toLowerCase().includes("max_tokens")) {
        const retryBody = { ...testBody, max_completion_tokens: (testBody as Record<string, unknown>).max_tokens };
        delete (retryBody as Record<string, unknown>).max_tokens;
        const controller2 = new AbortController();
        const timeout2 = setTimeout(() => controller2.abort(), 15_000);
        try {
          res = await fetch(endpoint, {
            method: "POST",
            headers: this.buildHeaders(),
            body: JSON.stringify(retryBody),
            signal: controller2.signal,
          });
        } finally {
          clearTimeout(timeout2);
        }
        rawText = await res.text();
        try { data = JSON.parse(rawText); } catch { /* not JSON */ }
      }

      if (!res.ok) {
        const isAuthError = res.status === 401 || res.status === 403;
        const errMsg = isAuthError
          ? "Invalid API key or unauthorized"
          : ((data as { error?: { message?: string } }).error?.message ?? (rawText.slice(0, 120) || `HTTP ${res.status}`));
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

  async stream({ messages, systemPrompt, maxTokens, useTools, res }: StreamOptions): Promise<UsageResult> {
    const endpoint = this.chatEndpoint();

    if (this.isAnthropicApi) {
      return this.streamAnthropicApi(endpoint, messages, systemPrompt, maxTokens, useTools, res);
    }

    if (this.isResponsesApi) {
      return this.streamResponsesApi(endpoint, messages, systemPrompt, maxTokens, res);
    }

    return this.streamChatCompletions(endpoint, messages, systemPrompt, maxTokens, useTools, res);
  }

  // ---------------------------------------------------------------------------
  // Anthropic Messages API streaming (Azure /anthropic/v1/messages endpoint)
  // ---------------------------------------------------------------------------

  private async streamAnthropicApi(
    endpoint: string,
    messages: RawMessage[],
    systemPrompt: string | undefined,
    maxTokens: number,
    useTools: boolean,
    res: Response,
  ): Promise<UsageResult> {
    const anthropicMessages = messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    let inputTokens = 0;
    let outputTokens = 0;

    const body: Record<string, unknown> = {
      model: this.config.modelName,
      max_tokens: maxTokens,
      messages: anthropicMessages,
      stream: true,
    };
    if (systemPrompt) body.system = systemPrompt;

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
            message?: { usage?: { input_tokens?: number; output_tokens?: number } };
            usage?: { input_tokens?: number; output_tokens?: number };
          };

          if (ev.type === "message_start" && ev.message?.usage) {
            inputTokens = ev.message.usage.input_tokens ?? 0;
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

    return { inputTokens, outputTokens };
  }

  // ---------------------------------------------------------------------------
  // Responses API streaming
  // ---------------------------------------------------------------------------

  private async streamResponsesApi(
    endpoint: string,
    messages: RawMessage[],
    systemPrompt: string | undefined,
    maxTokens: number,
    res: Response,
  ): Promise<UsageResult> {
    const builtMsgs = buildMessages(messages, systemPrompt);
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
  ): Promise<UsageResult> {
    let inputTokens = 0;
    let outputTokens = 0;
    let conversationMessages = buildMessages(messages, systemPrompt);
    // Some models (o-series, gpt-5+) require max_completion_tokens instead of max_tokens.
    // We detect this on first failure and switch permanently for this request.
    let tokenParam: "max_tokens" | "max_completion_tokens" = "max_tokens";

    for (let round = 0; round < 6; round++) {
      const body: Record<string, unknown> = {
        model: this.config.modelName,
        messages: conversationMessages,
        [tokenParam]: maxTokens,
        stream: true,
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
              usage?: { prompt_tokens?: number; completion_tokens?: number };
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
              inputTokens = chunk.usage.prompt_tokens ?? 0;
              outputTokens = chunk.usage.completion_tokens ?? 0;
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

    return { inputTokens, outputTokens };
  }
}
