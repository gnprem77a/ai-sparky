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

export type ModelKey = "auto" | "balanced" | "powerful" | "creative" | "fast" | "sonnet";

export interface ModelDefinition {
  key: ModelKey;
  friendlyName: string;
  exactName: string;
  apiModelId: string;
  providerType: string;
  description: string;
  badgeLabel: string;
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
    powerful: ["opus"],
    sonnet:   ["sonnet"],
    balanced: ["mistral"],
    creative: ["gpt"],
    fast:     ["haiku"],
    auto:     [],
    minimax:  ["minimax", "m2.5", "fw-minimax"],
    kimi:     ["kimi", "moonshot"],
  };
  return map[modelKey] ?? [];
}
