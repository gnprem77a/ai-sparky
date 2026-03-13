import type { Response } from "express";

export interface RawMessage {
  role: string;
  content: string;
  attachments?: Array<{ type: string; name: string; mimeType: string; data: string }>;
}

export interface StreamOptions {
  messages: RawMessage[];
  systemPrompt: string | undefined;
  maxTokens: number;
  useTools: boolean;
  res: Response;
}

export interface UsageResult {
  inputTokens: number;
  outputTokens: number;
}

export interface TestResult {
  success: boolean;
  latencyMs: number;
  message: string;
  statusCode?: number;
}

export interface GenerateOptions {
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
}

export interface ProviderAdapter {
  testConnection(): Promise<TestResult>;
  stream(opts: StreamOptions): Promise<UsageResult>;
  generate(opts: GenerateOptions): Promise<string>;
}

export interface ProviderConfig {
  id: string;
  name: string;
  providerType: string;
  apiUrl: string | null;
  apiKey: string | null;
  modelName: string;
  headers: string | null;
  httpMethod: string;
  bodyTemplate: string | null;
  responsePath: string | null;
  isActive: boolean;
  isEnabled: boolean;
  priority: number;
}

export const PROVIDER_TYPES = [
  { value: "bluesminds",  label: "Bluesminds (current)",  requiresKey: true },
  { value: "openai",      label: "OpenAI",                requiresKey: true },
  { value: "anthropic",   label: "Anthropic",             requiresKey: true },
  { value: "azure",       label: "Azure OpenAI",          requiresKey: true },
  { value: "gemini",      label: "Google Gemini",         requiresKey: true },
  { value: "bedrock",     label: "AWS Bedrock",           requiresKey: false },
  { value: "custom",      label: "Custom Provider",       requiresKey: false },
] as const;

export type ProviderType = typeof PROVIDER_TYPES[number]["value"];

export const TOOL_DEFINITIONS_OPENAI = [
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Search the web for current information.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search query" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "calculator",
      description: "Evaluate a mathematical expression.",
      parameters: {
        type: "object",
        properties: { expression: { type: "string", description: "Math expression" } },
        required: ["expression"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_weather",
      description: "Get current weather for a location.",
      parameters: {
        type: "object",
        properties: { location: { type: "string", description: "City name" } },
        required: ["location"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "fetch_url",
      description: "Fetch and read a web page URL.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "URL to fetch" } },
        required: ["url"],
      },
    },
  },
];
