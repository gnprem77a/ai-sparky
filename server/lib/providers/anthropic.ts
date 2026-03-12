/**
 * Anthropic native Messages API adapter.
 * Uses Anthropic's own SSE streaming format.
 */
import { executeTool } from "../../tools";
import type { ProviderAdapter, ProviderConfig, StreamOptions, TestResult, UsageResult } from "./types";

export class AnthropicAdapter implements ProviderAdapter {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private get baseUrl(): string {
    return (this.config.apiUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
  }

  private buildHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.config.apiKey ?? "",
      "anthropic-version": "2023-06-01",
    };
    if (this.config.headers) {
      try { Object.assign(h, JSON.parse(this.config.headers)); } catch {}
    }
    return h;
  }

  private buildAnthropicTools() {
    return [
      { name: "web_search", description: "Search the web.", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
      { name: "calculator", description: "Evaluate math.", input_schema: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] } },
      { name: "get_weather", description: "Get weather.", input_schema: { type: "object", properties: { location: { type: "string" } }, required: ["location"] } },
      { name: "fetch_url", description: "Fetch a URL.", input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
    ];
  }

  async testConnection(): Promise<TestResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.config.modelName,
          max_tokens: 5,
          messages: [{ role: "user", content: "Say OK" }],
        }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        const errMsg = ((data as { error?: { message?: string } }).error?.message) ?? res.statusText;
        return { success: false, latencyMs: Date.now() - start, message: errMsg };
      }
      return { success: true, latencyMs: Date.now() - start, message: "Connection successful" };
    } catch (e: unknown) {
      return { success: false, latencyMs: Date.now() - start, message: (e as Error).message };
    }
  }

  async stream({ messages, systemPrompt, maxTokens, useTools, res }: StreamOptions): Promise<UsageResult> {
    let inputTokens = 0;
    let outputTokens = 0;

    const anthropicMessages = messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    for (let round = 0; round < 6; round++) {
      const body: Record<string, unknown> = {
        model: this.config.modelName,
        max_tokens: maxTokens,
        messages: anthropicMessages,
        stream: true,
      };
      if (systemPrompt) body.system = systemPrompt;
      if (useTools) body.tools = this.buildAnthropicTools();

      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Anthropic error ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finishReason: string | null = null;
      const pendingToolUse: Record<string, { id: string; name: string; input: string }> = {};

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const ev = JSON.parse(line.slice(6)) as {
                type?: string;
                index?: number;
                delta?: { type?: string; text?: string; partial_json?: string };
                content_block?: { type?: string; id?: string; name?: string };
                message?: { usage?: { input_tokens?: number; output_tokens?: number } };
                usage?: { input_tokens?: number; output_tokens?: number };
              };

              if (ev.type === "message_start" && ev.message?.usage) {
                inputTokens = ev.message.usage.input_tokens ?? 0;
              }
              if (ev.type === "message_delta" && ev.usage) {
                outputTokens = ev.usage.output_tokens ?? 0;
              }
              if (ev.type === "message_stop") {
                finishReason = "stop";
              }
              if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") {
                const idx = String(ev.index ?? 0);
                pendingToolUse[idx] = { id: ev.content_block.id ?? idx, name: ev.content_block.name ?? "", input: "" };
              }
              if (ev.type === "content_block_delta") {
                const idx = String(ev.index ?? 0);
                if (ev.delta?.type === "text_delta" && ev.delta.text) {
                  res.write(`data: ${JSON.stringify({ delta: ev.delta.text })}\n\n`);
                }
                if (ev.delta?.type === "input_json_delta" && ev.delta.partial_json) {
                  if (pendingToolUse[idx]) pendingToolUse[idx].input += ev.delta.partial_json;
                }
              }
              if (ev.type === "content_block_stop") {
                finishReason = Object.keys(pendingToolUse).length > 0 ? "tool_use" : finishReason;
              }
            } catch {}
          }
        }
      }

      if (finishReason !== "tool_use" || !Object.keys(pendingToolUse).length) break;

      for (const tc of Object.values(pendingToolUse)) {
        let input: Record<string, string> = {};
        try { input = JSON.parse(tc.input); } catch {}
        res.write(`data: ${JSON.stringify({ toolCall: { name: tc.name, input } })}\n\n`);
        const result = await executeTool(tc.name, input);
        res.write(`data: ${JSON.stringify({ toolResult: { name: tc.name, input, result } })}\n\n`);
        anthropicMessages.push(
          { role: "assistant", content: [{ type: "tool_use", id: tc.id, name: tc.name, input }] as unknown as string },
          { role: "user", content: [{ type: "tool_result", tool_use_id: tc.id, content: result }] as unknown as string }
        );
      }
    }

    return { inputTokens, outputTokens };
  }
}
