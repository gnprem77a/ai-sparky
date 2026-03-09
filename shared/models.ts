/**
 * Central model registry — update model IDs here to upgrade all versions app-wide.
 * Imported by both the backend (server/routes.ts) and frontend (via @shared/models).
 */

export type ModelKey = "auto" | "balanced" | "powerful" | "creative" | "fast";

export interface ModelDefinition {
  key: ModelKey;
  friendlyName: string;
  exactName: string;
  bedrockId: string;
  provider: "anthropic" | "meta";
  description: string;
  badgeLabel: string;
}

export const MODEL_REGISTRY: Record<Exclude<ModelKey, "auto">, ModelDefinition> = {
  balanced: {
    key: "balanced",
    friendlyName: "Balanced",
    exactName: "Claude Sonnet 3.5",
    bedrockId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    provider: "anthropic",
    description: "Fast & capable everyday model",
    badgeLabel: "Sonnet 3.5",
  },
  powerful: {
    key: "powerful",
    friendlyName: "Powerful",
    exactName: "Claude Opus 4.5",
    bedrockId: "anthropic.claude-opus-4-5-20251101-v1:0",
    provider: "anthropic",
    description: "Most intelligent, complex reasoning",
    badgeLabel: "Opus 4.5",
  },
  creative: {
    key: "creative",
    friendlyName: "Creative",
    exactName: "Llama 3.1 70B",
    bedrockId: "meta.llama3-1-70b-instruct-v1:0",
    provider: "meta",
    description: "Imaginative writing & brainstorming",
    badgeLabel: "Llama 3.1",
  },
  fast: {
    key: "fast",
    friendlyName: "Fast",
    exactName: "Claude Haiku 3",
    bedrockId: "anthropic.claude-3-haiku-20240307-v1:0",
    provider: "anthropic",
    description: "Instant responses for quick tasks",
    badgeLabel: "Haiku 3",
  },
};

export const FALLBACK_MODEL = MODEL_REGISTRY.balanced;

/** Returns the ModelDefinition for a given key, defaulting to balanced. */
export function getModel(key: string): ModelDefinition {
  return MODEL_REGISTRY[key as Exclude<ModelKey, "auto">] ?? FALLBACK_MODEL;
}
