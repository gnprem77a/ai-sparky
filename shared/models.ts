/**
 * Central model registry — update model IDs here to upgrade all versions app-wide.
 * Imported by both the backend (server/routes.ts) and frontend (via @shared/models).
 */

export type ModelKey = "auto" | "balanced" | "powerful" | "creative" | "fast";

export interface ModelDefinition {
  key: ModelKey;
  friendlyName: string;
  exactName: string;
  apiModelId: string;
  provider: "anthropic";
  description: string;
  badgeLabel: string;
}

export const MODEL_REGISTRY: Record<Exclude<ModelKey, "auto">, ModelDefinition> = {
  balanced: {
    key: "balanced",
    friendlyName: "Balanced",
    exactName: "Claude Sonnet 4.6",
    apiModelId: "claude-sonnet-4-6",
    provider: "anthropic",
    description: "Fast & capable everyday model",
    badgeLabel: "Sonnet 4.6",
  },
  powerful: {
    key: "powerful",
    friendlyName: "Powerful",
    exactName: "Claude Opus 4.6",
    apiModelId: "claude-opus-4-6",
    provider: "anthropic",
    description: "Most intelligent, complex reasoning",
    badgeLabel: "Opus 4.6",
  },
  creative: {
    key: "creative",
    friendlyName: "Creative",
    exactName: "Claude Sonnet 4.6",
    apiModelId: "claude-sonnet-4-6",
    provider: "anthropic",
    description: "Imaginative writing & brainstorming",
    badgeLabel: "Sonnet 4.6",
  },
  fast: {
    key: "fast",
    friendlyName: "Fast",
    exactName: "Claude Haiku",
    apiModelId: "claude-haiku-prod2",
    provider: "anthropic",
    description: "Instant responses for quick tasks",
    badgeLabel: "Haiku",
  },
};

export const FALLBACK_MODEL = MODEL_REGISTRY.balanced;

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
    balanced: ["sonnet"],
    creative: ["sonnet", "claude"],
    fast:     ["haiku", "fast", "mini"],
    auto:     [],
  };
  return map[modelKey] ?? [];
}
