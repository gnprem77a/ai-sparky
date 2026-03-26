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
    const url = (this.config.apiUrl ?? "https://api.anthropic.com").replace(/\/$/, "");
    // Strip trailing /v1/messages if the user pasted the full endpoint URL
    return url.replace(/\/v1\/messages$/, "");
  }

  private buildHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    };
    const key = this.config.apiKey ?? "";
    const style = this.config.authStyle ?? "x-api-key";
    if (style === "bearer") {
      h["Authorization"] = `Bearer ${key}`;
    } else if (style === "api-key") {
      h["api-key"] = key;
    } else {
      // default: Anthropic native style
      h["x-api-key"] = key;
    }
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

  /** Convert OpenAI-format tools array → Anthropic tools array */
  private static oaiToolsToAnthropic(tools: any[]): any[] {
    return tools.map((t: any) => ({
      name: t.function?.name ?? t.name,
      description: t.function?.description ?? t.description ?? "",
      input_schema: t.function?.parameters ?? t.parameters ?? { type: "object", properties: {} },
    }));
  }

  /**
   * Convert an array of OpenAI-format messages to Anthropic messages format.
   * Handles role:"tool" (tool results) and assistant messages with tool_calls.
   * Merges consecutive same-role messages as required by Anthropic.
   */
  private static oaiMessagesToAnthropic(msgs: any[]): any[] {
    const out: { role: "user" | "assistant"; content: any }[] = [];

    for (const m of msgs) {
      if (m.role === "system") continue; // handled separately

      if (m.role === "tool") {
        // Tool result — must be inside a "user" turn
        const block = { type: "tool_result", tool_use_id: m.tool_call_id ?? "", content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) };
        if (out.length > 0 && out[out.length - 1].role === "user" && Array.isArray(out[out.length - 1].content)) {
          out[out.length - 1].content.push(block);
        } else {
          out.push({ role: "user", content: [block] });
        }
        continue;
      }

      if (m.role === "assistant" && m.tool_calls?.length) {
        // Assistant requested tool calls
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

      // Regular user/assistant message — may contain text + image blocks
      const role = m.role === "assistant" ? "assistant" : "user";

      let content: string | any[];
      if (Array.isArray(m.content)) {
        content = m.content.map((block: any) => {
          if (block.type === "text") return { type: "text", text: block.text ?? "" };
          if (block.type === "image_url") {
            const url: string = block.image_url?.url ?? "";
            if (url.startsWith("data:")) {
              // data:image/jpeg;base64,<data>
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

      // Merge consecutive same-role plain-text messages (Anthropic restriction)
      if (out.length > 0 && out[out.length - 1].role === role && typeof out[out.length - 1].content === "string" && typeof content === "string") {
        out[out.length - 1].content += "\n" + content;
      } else {
        out.push({ role, content });
      }
    }

    return out;
  }

  async testConnection(): Promise<TestResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.config.modelName,
          max_tokens: 16,
          messages: [{ role: "user", content: "Say OK" }],
        }),
      });
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
    const body: Record<string, unknown> = {
      model: this.config.modelName,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: userPrompt }],
    };
    if (systemPrompt) body.system = systemPrompt;
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Anthropic error ${res.status}`);
    const data = await res.json() as { content?: Array<{ type?: string; text?: string }> };
    const text = data.content?.find((b) => b.type === "text")?.text ?? "";
    if (!text) throw new Error("Empty response from Anthropic");
    return text;
  }

  async stream({ messages, systemPrompt, maxTokens, useTools, res, externalTools, oaiMessages }: StreamOptions): Promise<UsageResult> {
    let inputTokens = 0;
    let outputTokens = 0;

    const isExternal = Array.isArray(externalTools) && externalTools.length > 0;

    // Use oaiMessages conversion whenever oaiMessages is provided — it properly converts
    // role:"tool" → tool_result blocks. Also always filter role:"tool" from the fallback
    // path so a stale history entry never causes a 400 from Anthropic.
    const anthropicMessages: any[] = oaiMessages
      ? AnthropicAdapter.oaiMessagesToAnthropic(oaiMessages)
      : messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    for (let round = 0; round < 6; round++) {
      const body: Record<string, unknown> = {
        model: this.config.modelName,
        max_tokens: maxTokens,
        messages: anthropicMessages,
        stream: true,
      };
      if (systemPrompt) body.system = systemPrompt;
      if (isExternal) {
        body.tools = AnthropicAdapter.oaiToolsToAnthropic(externalTools!);
      } else if (useTools) {
        body.tools = this.buildAnthropicTools();
      }

      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok || !response.body) {
        const errBody = await response.text().catch(() => "");
        let errMsg = `Anthropic error ${response.status}`;
        try {
          const errJson = JSON.parse(errBody);
          errMsg += `: ${errJson?.error?.message ?? errBody.slice(0, 300)}`;
        } catch { if (errBody) errMsg += `: ${errBody.slice(0, 300)}`; }
        console.error(`[Anthropic] Stream failed — ${errMsg}`);
        throw new Error(errMsg);
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
                if (isExternal) {
                  // Emit OpenAI SSE tool_call start chunk
                  res.write(`data: ${JSON.stringify({ oai_tool_call_start: { index: ev.index ?? 0, id: ev.content_block.id ?? idx, name: ev.content_block.name ?? "" } })}\n\n`);
                }
              }
              if (ev.type === "content_block_delta") {
                const idx = String(ev.index ?? 0);
                if (ev.delta?.type === "text_delta" && ev.delta.text) {
                  res.write(`data: ${JSON.stringify({ text: ev.delta.text })}\n\n`);
                }
                if (ev.delta?.type === "input_json_delta" && ev.delta.partial_json) {
                  if (pendingToolUse[idx]) {
                    pendingToolUse[idx].input += ev.delta.partial_json;
                    if (isExternal) {
                      // Stream arguments delta in OpenAI SSE format
                      res.write(`data: ${JSON.stringify({ oai_tool_call_delta: { index: ev.index ?? 0, arguments: ev.delta.partial_json } })}\n\n`);
                    }
                  }
                }
              }
              if (ev.type === "content_block_stop") {
                finishReason = Object.keys(pendingToolUse).length > 0 ? "tool_use" : finishReason;
              }
            } catch {}
          }
        }
      }

      // External callers (Cline) handle tool execution themselves — return after emitting tool_calls
      if (isExternal) {
        if (finishReason === "tool_use" && Object.keys(pendingToolUse).length > 0) {
          res.write(`data: ${JSON.stringify({ oai_finish_reason: "tool_calls" })}\n\n`);
        }
        break;
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
