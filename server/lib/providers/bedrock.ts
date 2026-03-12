/**
 * AWS Bedrock adapter.
 * Uses AWS Signature V4 to call the Bedrock Converse API.
 * Requires: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION env vars.
 */
import crypto from "crypto";
import type { ProviderAdapter, ProviderConfig, StreamOptions, TestResult, UsageResult } from "./types";

function getEnv(key: string) { return process.env[key] ?? ""; }

function hmacSHA256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function signRequest(method: string, url: string, headers: Record<string, string>, body: string): Record<string, string> {
  const region = getEnv("AWS_REGION") || "us-east-1";
  const service = "bedrock";
  const now = new Date();
  const datestamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzdate = now.toISOString().replace(/[:-]/g, "").slice(0, 15) + "Z";

  const u = new URL(url);
  const signedHeaders = ["content-type", "host", "x-amz-date"].join(";");
  const bodyHash = crypto.createHash("sha256").update(body, "utf8").digest("hex");
  const canonicalRequest = [method, u.pathname, u.search.slice(1), `content-type:${headers["content-type"]}\nhost:${u.host}\nx-amz-date:${amzdate}\n`, signedHeaders, bodyHash].join("\n");
  const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzdate, credentialScope, crypto.createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
  const signingKey = hmacSHA256(hmacSHA256(hmacSHA256(hmacSHA256(`AWS4${getEnv("AWS_SECRET_ACCESS_KEY")}`, datestamp), region), service), "aws4_request");
  const signature = hmacSHA256(signingKey, stringToSign).toString("hex");
  const authHeader = `AWS4-HMAC-SHA256 Credential=${getEnv("AWS_ACCESS_KEY_ID")}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { ...headers, "x-amz-date": amzdate, "Authorization": authHeader };
}

export class BedrockAdapter implements ProviderAdapter {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private get region(): string {
    return getEnv("AWS_REGION") || "us-east-1";
  }

  private get modelId(): string {
    return this.config.modelName || "anthropic.claude-3-haiku-20240307-v1:0";
  }

  async testConnection(): Promise<TestResult> {
    const start = Date.now();
    try {
      const url = `https://bedrock-runtime.${this.region}.amazonaws.com/model/${encodeURIComponent(this.modelId)}/converse`;
      const body = JSON.stringify({
        messages: [{ role: "user", content: [{ text: "Say OK" }] }],
        inferenceConfig: { maxTokens: 5 },
      });
      const headers = signRequest("POST", url, { "content-type": "application/json", host: `bedrock-runtime.${this.region}.amazonaws.com` }, body);
      const res = await fetch(url, { method: "POST", headers, body });
      if (!res.ok) {
        const text = await res.text();
        return { success: false, latencyMs: Date.now() - start, message: text.slice(0, 200) };
      }
      return { success: true, latencyMs: Date.now() - start, message: "Bedrock connection successful" };
    } catch (e: unknown) {
      return { success: false, latencyMs: Date.now() - start, message: (e as Error).message };
    }
  }

  async stream({ messages, systemPrompt, maxTokens, res }: StreamOptions): Promise<UsageResult> {
    const url = `https://bedrock-runtime.${this.region}.amazonaws.com/model/${encodeURIComponent(this.modelId)}/converse-stream`;

    const bedrockMessages = messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: [{ text: m.content }],
    }));

    const bodyObj: Record<string, unknown> = {
      messages: bedrockMessages,
      inferenceConfig: { maxTokens },
    };
    if (systemPrompt) bodyObj.system = [{ text: systemPrompt }];

    const body = JSON.stringify(bodyObj);
    const headers = signRequest("POST", url, {
      "content-type": "application/json",
      host: `bedrock-runtime.${this.region}.amazonaws.com`,
    }, body);

    const response = await fetch(url, { method: "POST", headers, body });
    if (!response.ok || !response.body) {
      const text = await response.text();
      throw new Error(`Bedrock error ${response.status}: ${text.slice(0, 200)}`);
    }

    let inputTokens = 0;
    let outputTokens = 0;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      const jsonMatches = buf.match(/\{[^{}]*"contentBlockDelta"[^{}]*\}/g) ?? [];
      for (const match of jsonMatches) {
        try {
          const ev = JSON.parse(match) as { contentBlockDelta?: { delta?: { text?: string } } };
          if (ev.contentBlockDelta?.delta?.text) {
            res.write(`data: ${JSON.stringify({ delta: ev.contentBlockDelta.delta.text })}\n\n`);
          }
        } catch {}
      }

      const usageMatches = buf.match(/\{[^{}]*"inputTokens"[^{}]*\}/g) ?? [];
      for (const match of usageMatches) {
        try {
          const ev = JSON.parse(match) as { inputTokens?: number; outputTokens?: number };
          if (ev.inputTokens) inputTokens = ev.inputTokens;
          if (ev.outputTokens) outputTokens = ev.outputTokens;
        } catch {}
      }
    }

    return { inputTokens, outputTokens };
  }
}
