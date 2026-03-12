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

export function buildAdapter(config: ProviderConfig): ProviderAdapter {
  switch (config.providerType) {
    case "openai":
    case "azure":
    case "gemini":
    case "bluesminds":
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
): Promise<UsageResult> {
  const enabledProviders = providers.filter((p) => p.isEnabled).sort((a, b) => a.priority - b.priority);

  let lastError: Error | null = null;

  for (const prov of enabledProviders) {
    try {
      const adapter = buildAdapter(prov);
      const result = await adapter.stream(opts);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[Provider] "${prov.name}" failed: ${lastError.message} — trying next`);
    }
  }

  if (enabledProviders.length > 0) {
    throw lastError ?? new Error("All providers failed");
  }

  const fallbackConfig: ProviderConfig = {
    id: "builtin",
    name: "Bluesminds (built-in)",
    providerType: "bluesminds",
    apiUrl: "https://api.bluesminds.com/v1",
    apiKey: process.env.BLUESMINDS_API_KEY ?? "",
    modelName: "claude-sonnet-4-6",
    headers: null,
    bodyTemplate: null,
    responsePath: null,
    isActive: true,
    isEnabled: true,
    priority: 0,
  };

  return buildAdapter(fallbackConfig).stream(opts);
}
