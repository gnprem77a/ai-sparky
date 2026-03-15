/**
 * Provider registry.
 * Selects the right adapter based on providerType.
 * Handles the fallback chain when a provider fails.
 */
import type { Response } from "express";
import { OpenAICompatAdapter } from "./openai-compat";
import { AnthropicAdapter } from "./anthropic";
import { BedrockAdapter } from "./bedrock";
import { CustomAdapter } from "./custom";
import type { ProviderConfig, ProviderAdapter, StreamOptions, UsageResult, TestResult } from "./types";

export * from "./types";

export { resolvePath } from "./custom";

export function buildAdapter(config: ProviderConfig): ProviderAdapter {
  switch (config.providerType) {
    case "openai":
    case "azure":
    case "gemini":
    case "bluesminds":
    case "openai-compatible":
      return new OpenAICompatAdapter(config);
    case "anthropic":
      return new AnthropicAdapter(config);
    case "bedrock":
      return new BedrockAdapter(config);
    case "custom":
    default:
      return new CustomAdapter(config);
  }
}

export async function testProvider(config: ProviderConfig): Promise<TestResult> {
  const adapter = buildAdapter(config);
  return adapter.testConnection();
}

/**
 * Stream through an ordered list of providers, trying each in priority order.
 * If a provider fails, we emit nothing and try the next one.
 * Falls back to the built-in bluesminds config if all DB providers fail or list is empty.
 */
export async function streamWithFallback(
  providers: ProviderConfig[],
  opts: Omit<StreamOptions, "res"> & { res: Response },
  onFallback?: (failedProvider: string, reason: string) => void,
): Promise<UsageResult> {
  const isChatProvider = (p: ProviderConfig) => {
    const modelLower = (p.modelName ?? "").toLowerCase();
    const urlLower = (p.apiUrl ?? "").toLowerCase();
    return !modelLower.includes("embed") && !urlLower.includes("embed")
        && !modelLower.includes("rerank") && !urlLower.includes("rerank");
  };

  const enabledProviders = providers
    .filter((p) => p.isEnabled && isChatProvider(p))
    .sort((a, b) => a.priority - b.priority);

  let lastError: Error | null = null;

  for (const prov of enabledProviders) {
    try {
      const adapter = buildAdapter(prov);
      const result = await adapter.stream(opts);
      return { ...result, modelName: prov.modelName ?? prov.name };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRateLimit = lastError.message.includes("429") || lastError.message.toLowerCase().includes("rate limit");
      const reason = isRateLimit ? "rate_limited" : "error";
      console.error(`[Provider] "${prov.name}" failed (${reason}): ${lastError.message} — trying next`);
      onFallback?.(prov.name, reason);
    }
  }

  if (enabledProviders.length > 0) {
    throw lastError ?? new Error("All configured providers failed. Please check your provider settings in the admin panel.");
  }

  throw new Error("No AI providers are configured. Please add a provider in the admin panel.");
}

/**
 * Generate a single text response (non-streaming) from the best available provider.
 * Routes through the proper adapter for each provider type (respects custom body templates, response paths, etc.)
 * Used for study features: summaries, quizzes, flashcards.
 */
export async function generateText(
  providers: ProviderConfig[],
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 2048,
): Promise<string> {
  const isChatProvider = (p: ProviderConfig) => {
    const modelLower = (p.modelName ?? "").toLowerCase();
    const urlLower = (p.apiUrl ?? "").toLowerCase();
    return !modelLower.includes("embed") && !urlLower.includes("embed")
        && !modelLower.includes("rerank") && !urlLower.includes("rerank");
  };

  const candidates = [...providers.filter((p) => p.isEnabled && isChatProvider(p)).sort((a, b) => a.priority - b.priority)];

  const fallback: ProviderConfig = {
    id: "builtin",
    name: "Bluesminds (built-in)",
    providerType: "bluesminds",
    apiUrl: "https://api.bluesminds.com/v1",
    apiKey: process.env.BLUESMINDS_API_KEY ?? "",
    modelName: "claude-sonnet-4-6",
    headers: null,
    httpMethod: "POST",
    authStyle: "bearer",
    authHeaderName: null,
    streamMode: "none",
    bodyTemplate: null,
    responsePath: null,
    isActive: true,
    isEnabled: true,
    priority: 999,
  };

  candidates.push(fallback);

  for (const prov of candidates) {
    try {
      const adapter = buildAdapter(prov);
      const text = await adapter.generate({ systemPrompt, userPrompt, maxTokens });
      return text;
    } catch (err) {
      console.error(`[generateText] provider "${prov.name}" failed:`, err);
    }
  }

  throw new Error("All providers failed for generateText");
}
