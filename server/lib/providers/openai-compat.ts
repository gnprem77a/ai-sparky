/**
 * OpenAI-compatible streaming adapter.
 * Covers: OpenAI, Azure OpenAI, Google Gemini (compat endpoint),
 *         Bluesminds, and any other OpenAI-compatible API.
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
    if (this.config.providerType === "bluesminds") return "https://api.bluesminds.com/v1";
    return "https://api.openai.com/v1";
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (this.config.providerType === "azure") {
      headers["api-key"] = this.config.apiKey ?? "";
    } else {
      headers["Authorization"] = `Bearer ${this.config.apiKey ?? ""}`;
    }

    if (this.config.headers) {
      try {
        const extra = JSON.parse(this.config.headers);
        Object.assign(headers, extra);
      } catch {}
    }
    return headers;
  }

  async testConnection(): Promise<TestResult> {
    const start = Date.now();
    try {
      const endpoint = this.config.providerType === "azure"
        ? `${this.baseUrl}/chat/completions?api-version=2024-02-01`
        : `${this.baseUrl}/chat/completions`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.config.modelName,
          messages: [{ role: "user", content: "Say OK" }],
          max_tokens: 5,
          stream: false,
        }),
      });
      // Read as text first — some endpoints return plain-text errors (not JSON)
      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(rawText); } catch { /* not JSON */ }

      if (!res.ok) {
        const isAuthError = res.status === 401 || res.status === 403;
        const errMsg = isAuthError
          ? "Invalid API key or unauthorized"
          : ((data as { error?: { message?: string } }).error?.message ?? (rawText.slice(0, 120) || `HTTP ${res.status}`));
        return { success: false, latencyMs: Date.now() - start, statusCode: res.status, message: errMsg };
      }
      return { success: true, latencyMs: Date.now() - start, message: "Connection successful" };
    } catch (e: unknown) {
      return { success: false, latencyMs: Date.now() - start, message: (e as Error).message };
    }
  }

  async generate({ systemPrompt, userPrompt, maxTokens = 2048 }: import("./types").GenerateOptions): Promise<string> {
    const endpoint = this.config.providerType === "azure"
      ? `${this.baseUrl}/chat/completions?api-version=2024-02-01`
      : `${this.baseUrl}/chat/completions`;
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

  async stream({ messages, systemPrompt, maxTokens, useTools, res }: StreamOptions): Promise<UsageResult> {
    const endpoint = this.config.providerType === "azure"
      ? `${this.baseUrl}/chat/completions?api-version=2024-02-01`
      : `${this.baseUrl}/chat/completions`;

    let inputTokens = 0;
    let outputTokens = 0;
    let conversationMessages = buildMessages(messages, systemPrompt);

    for (let round = 0; round < 6; round++) {
      const body: Record<string, unknown> = {
        model: this.config.modelName,
        messages: conversationMessages,
        max_tokens: maxTokens,
        stream: true,
      };
      if (useTools) {
        body.tools = TOOL_DEFINITIONS_OPENAI;
        body.tool_choice = "auto";
      }

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
