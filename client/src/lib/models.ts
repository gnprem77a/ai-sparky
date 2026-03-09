/**
 * Re-export from the shared model registry for use within the client.
 * To update model versions, edit shared/models.ts only.
 */
export type { ModelKey, ModelDefinition } from "@shared/models";
export { MODEL_REGISTRY, FALLBACK_MODEL, getModel } from "@shared/models";
