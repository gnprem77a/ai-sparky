/**
 * Central model registry — update model IDs here to upgrade all versions app-wide.
 * Imported by both the backend (server/routes.ts) and frontend (via @shared/models).
 *
 * Chat models:
 *   powerful  → Claude Opus 4.6      (claude-opus-4-6)
 *   sonnet    → Claude Sonnet 4.5    (claude-sonnet-4-5)
 *   balanced  → Mistral Large 3      (Mistral-Large-3)
 *   creative  → GPT 5.3              (gpt-5.3-chat)
 *   fast      → Claude Haiku         (claude-haiku-prod2)
 *
 * Search / KB models (not chat — handled automatically):
 *   embed-v-4-0            → vector embeddings for Knowledge Base
 *   Cohere-rerank-v4.0-pro → result reranking for Knowledge Base search
 */

export type ModelKey = "auto" | "balanced" | "powerful" | "creative" | "fast" | "sonnet" | "minimax" | "kimi";

export interface ModelDefinition {
  key: ModelKey;
  friendlyName: string;
  exactName: string;
  apiModelId: string;
  providerType: string;
  description: string;
  badgeLabel: string;
  /** If true, this model is only accessible via the external API — not in the chat UI */
  apiOnly?: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
}

export const MODEL_REGISTRY: Record<Exclude<ModelKey, "auto">, ModelDefinition> = {
  powerful: {
    key: "powerful",
    friendlyName: "Powerful",
    exactName: "Claude Opus 4.6",
    apiModelId: "claude-opus-1715",        // Azure deployment name
    providerType: "azure",
    description: "Most intelligent model, complex reasoning",
    badgeLabel: "Opus 4.6",
  },
  sonnet: {
    key: "sonnet",
    friendlyName: "Sonnet",
    exactName: "Claude Sonnet 4.5",
    apiModelId: "claude-sonnet-4-5",
    providerType: "anthropic",
    description: "Smart and efficient, great for most tasks",
    badgeLabel: "Sonnet 4.5",
  },
  balanced: {
    key: "balanced",
    friendlyName: "Balanced",
    exactName: "Mistral Large 3",
    apiModelId: "Mistral-Large-3",
    providerType: "openai-compat",
    description: "Great for coding, math & analysis",
    badgeLabel: "Mistral L3",
  },
  creative: {
    key: "creative",
    friendlyName: "Creative",
    exactName: "GPT 5.3",
    apiModelId: "gpt-5.3-chat",
    providerType: "openai-compat",
    description: "Creative writing, research & ideas",
    badgeLabel: "GPT 5.3",
  },
  fast: {
    key: "fast",
    friendlyName: "Fast",
    exactName: "Claude Haiku",
    apiModelId: "claude-haiku-prod2",
    providerType: "anthropic",
    description: "Instant responses for quick tasks",
    badgeLabel: "Haiku",
  },
  minimax: {
    key: "minimax",
    friendlyName: "MiniMax",
    exactName: "MiniMax-M2.5",
    apiModelId: "FW-MiniMax-M2.5",
    providerType: "azure",
    description: "1M context window, great for long documents",
    badgeLabel: "MiniMax M2.5",
    contextWindow: 1_000_000,
    maxOutputTokens: 16_384,
  },
  kimi: {
    key: "kimi",
    friendlyName: "Kimi",
    exactName: "Kimi-K2.5",
    apiModelId: "Kimi-K2.5",
    providerType: "azure",
    description: "Long context reasoning and analysis",
    badgeLabel: "Kimi K2.5",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
  },
};

/** Fallback for provider-based chat routing. */
export const FALLBACK_MODEL = MODEL_REGISTRY.powerful;


/** Returns the ModelDefinition for a given key, defaulting to balanced. */
export function getModel(key: string): ModelDefinition {
  return MODEL_REGISTRY[key as Exclude<ModelKey, "auto">] ?? FALLBACK_MODEL;
}

/**
 * Returns provider name/modelName patterns to prefer for a given model key.
 * Used by the server to boost matching providers to the top of the fallback chain.
 */
export function getProviderPatterns(modelKey: string): string[] {
  const map: Record<string, string[]> = {
    // "powerful" slot — Claude Opus, GPT-4o, top-tier models
    powerful: [
      "powerful", "opus", "claude-opus", "claude-3-opus",
      "gpt-4o", "gpt4o", "gpt-4-turbo", "gpt-4-32k", "gpt-4",
      "gemini-1.5-pro", "gemini-pro", "gemini-2.5-pro",
      "llama-3.1-405", "llama-405",
    ],
    // "sonnet" slot — Claude Sonnet, mid-large models
    sonnet: [
      "sonnet", "claude-sonnet", "claude-3-5-sonnet", "claude-3-sonnet",
      "gemini-1.5-flash-8b",
    ],
    // "balanced" slot — Mistral, mid-range models
    balanced: [
      "balanced", "mistral", "mixtral", "mistral-large", "mistral-medium",
      "llama-3.1-70b", "llama-70b", "llama3-70b",
      "qwen", "deepseek",
    ],
    // "creative" slot — GPT family, creative models
    creative: [
      "creative", "gpt-3.5", "gpt3.5", "gpt-3",
      "o1", "o3", "o4",
    ],
    // "fast" slot — Claude Haiku, small/fast models
    fast: [
      "fast", "haiku", "claude-haiku", "claude-3-haiku",
      "gemini-flash", "gemini-1.5-flash", "gemini-2.0-flash",
      "llama-3.1-8b", "llama-8b", "llama3-8b",
      "phi-3", "phi3",
    ],
    auto:    [],
    minimax: ["minimax", "m2.5", "fw-minimax"],
    kimi:    ["kimi", "moonshot"],
  };
  return map[modelKey] ?? [];
}
