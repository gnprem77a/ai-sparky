/**
 * Custom provider adapter.
 * Supports any HTTP API with configurable body template, response path, and HTTP method.
 * Template variables: {{prompt}}, {{lastMessage}}, {{messages}}, {{model}}, {{systemPrompt}}, {{maxTokens}}
 */
import type { ProviderAdapter, ProviderConfig, StreamOptions, TestResult, UsageResult, RawMessage, GenerateOptions } from "./types";

export function resolvePath(obj: unknown, path: string): string {
  if (!path) return typeof obj === "string" ? obj : JSON.stringify(obj);
  try {
    const parts = path.split(/[\.\[\]]+/).filter(Boolean);
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined) break;
      if (typeof current === "object") {
        current = (current as Record<string, unknown>)[part];
      } else {
        break;
      }
    }
    if (typeof current === "string") return current;
    return JSON.stringify(current);
  } catch {
    return JSON.stringify(obj);
  }
}

function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key];
    if (val === undefined) return "";
    if (typeof val === "string") return val;
    return JSON.stringify(val);
  });
}

function buildDefaultBody(messages: RawMessage[], model: string, maxTokens: number, systemPrompt?: string): unknown {
  const oaiMessages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) oaiMessages.push({ role: "system", content: systemPrompt });
  for (const m of messages) oaiMessages.push({ role: m.role, content: m.content });
  return { model, messages: oaiMessages, max_tokens: maxTokens };
}

export class CustomAdapter implements ProviderAdapter {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private buildHeaders(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) h["Authorization"] = `Bearer ${this.config.apiKey}`;
    if (this.config.headers) {
      try { Object.assign(h, JSON.parse(this.config.headers)); } catch {}
    }
    return h;
  }

  private get method(): string {
    return (this.config.httpMethod ?? "POST").toUpperCase();
  }

  private buildBody(messages: RawMessage[], maxTokens: number, systemPrompt?: string): string {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    if (this.config.bodyTemplate) {
      const vars: Record<string, unknown> = {
        model: this.config.modelName,
        messages: JSON.stringify(messages.map((m) => ({ role: m.role, content: m.content }))),
        prompt: lastUserMsg,
        lastMessage: lastUserMsg,
        systemPrompt: systemPrompt ?? "",
        maxTokens,
      };
      return renderTemplate(this.config.bodyTemplate, vars);
    }
    return JSON.stringify(buildDefaultBody(messages, this.config.modelName, maxTokens, systemPrompt));
  }

  private buildGenerateBody(systemPrompt: string | undefined, userPrompt: string, maxTokens: number): string {
    if (this.config.bodyTemplate) {
      const vars: Record<string, unknown> = {
        model: this.config.modelName,
        messages: JSON.stringify([
          ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
          { role: "user", content: userPrompt },
        ]),
        prompt: userPrompt,
        lastMessage: userPrompt,
        systemPrompt: systemPrompt ?? "",
        maxTokens,
      };
      return renderTemplate(this.config.bodyTemplate, vars);
    }
    const msgs: Array<{ role: string; content: string }> = [];
    if (systemPrompt) msgs.push({ role: "system", content: systemPrompt });
    msgs.push({ role: "user", content: userPrompt });
    return JSON.stringify({ model: this.config.modelName, messages: msgs, max_tokens: maxTokens });
  }

  async testConnection(): Promise<TestResult> {
    const start = Date.now();
    const url = this.config.apiUrl;
    if (!url) return { success: false, latencyMs: 0, message: "API URL is required for custom providers" };
    try {
      const hasBody = this.method !== "GET" && this.method !== "HEAD";
      const body = hasBody
        ? JSON.stringify({ model: this.config.modelName, messages: [{ role: "user", content: "Say OK" }], max_tokens: 5 })
        : undefined;
      const res = await fetch(url, { method: this.method, headers: this.buildHeaders(), body });
      if (!res.ok) {
        const text = await res.text();
        const isAuthError = res.status === 401 || res.status === 403;
        return {
          success: false,
          latencyMs: Date.now() - start,
          statusCode: res.status,
          message: isAuthError ? "Invalid API key or unauthorized" : `HTTP ${res.status}: ${text.slice(0, 150)}`,
        };
      }
      return { success: true, latencyMs: Date.now() - start, message: "Connection successful" };
    } catch (e: unknown) {
      return { success: false, latencyMs: Date.now() - start, message: (e as Error).message };
    }
  }

  async generate({ systemPrompt, userPrompt, maxTokens = 2048 }: GenerateOptions): Promise<string> {
    const url = this.config.apiUrl;
    if (!url) throw new Error("Custom provider: API URL not configured");
    const hasBody = this.method !== "GET" && this.method !== "HEAD";
    const response = await fetch(url, {
      method: this.method,
      headers: this.buildHeaders(),
      body: hasBody ? this.buildGenerateBody(systemPrompt, userPrompt, maxTokens) : undefined,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Custom provider error ${response.status}: ${text.slice(0, 200)}`);
    }
    const data: unknown = await response.json();
    const text = resolvePath(data, this.config.responsePath ?? "choices.0.message.content");
    if (!text) throw new Error("Empty response from custom provider");
    return text;
  }

  async stream({ messages, systemPrompt, maxTokens, res }: StreamOptions): Promise<UsageResult> {
    const url = this.config.apiUrl;
    if (!url) throw new Error("Custom provider: API URL not configured");

    const hasBody = this.method !== "GET" && this.method !== "HEAD";
    const response = await fetch(url, {
      method: this.method,
      headers: this.buildHeaders(),
      body: hasBody ? this.buildBody(messages, maxTokens, systemPrompt) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Custom provider error ${response.status}: ${text.slice(0, 200)}`);
    }

    const data: unknown = await response.json();
    const text = resolvePath(data, this.config.responsePath ?? "choices.0.message.content");

    res.write(`data: ${JSON.stringify({ text })}\n\n`);
    return { inputTokens: 0, outputTokens: 0 };
  }
}
