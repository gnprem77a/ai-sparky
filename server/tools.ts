import { evaluate } from "mathjs";

/* ── Tool Definitions (Anthropic format) ───────────────────── */
export const TOOL_DEFINITIONS = [
  {
    name: "web_search",
    description:
      "Search the web for current information, recent news, real-time facts, prices, or anything not in your training data. Use this whenever you are unsure about recent or factual information.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to look up",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "calculator",
    description:
      "Evaluate a mathematical expression precisely. Use for arithmetic, algebra, unit conversions, or numerical computations. Supports +, -, *, /, ^, sqrt(), sin(), cos(), log(), pi, e, and more.",
    input_schema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "The mathematical expression to evaluate, e.g. '2 + 2', 'sqrt(144)', '2^10', 'sin(pi/2)'",
        },
      },
      required: ["expression"],
    },
  },
];

/* ── Calculator ────────────────────────────────────────────── */
export async function executeCalculator(expression: string): Promise<string> {
  try {
    const result = evaluate(expression);
    const formatted = typeof result === "number"
      ? (Number.isInteger(result) ? result.toString() : result.toPrecision(10).replace(/\.?0+$/, ""))
      : String(result);
    return `${expression} = ${formatted}`;
  } catch (e) {
    return `Could not evaluate "${expression}": ${(e as Error).message}`;
  }
}

/* ── Web Search (DuckDuckGo, no API key required) ──────────── */
export async function executeWebSearch(query: string): Promise<string> {
  try {
    const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=aichat`;
    const res = await fetch(apiUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AI-Chat/1.0)" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as Record<string, unknown>;

    const parts: string[] = [];

    if (data.Answer) {
      parts.push(`Answer: ${data.Answer}`);
    }
    if (data.Abstract && typeof data.Abstract === "string" && data.Abstract.length > 0) {
      parts.push(`Summary: ${data.Abstract}`);
      if (data.AbstractURL) parts.push(`Source: ${data.AbstractURL}`);
    }
    if (data.Definition && typeof data.Definition === "string" && data.Definition.length > 0) {
      parts.push(`Definition: ${data.Definition}`);
      if (data.DefinitionURL) parts.push(`Source: ${data.DefinitionURL}`);
    }

    const topics = (data.RelatedTopics as Array<{ Text?: string; FirstURL?: string; Topics?: Array<{Text?: string; FirstURL?: string}> }> | undefined) ?? [];
    const topicResults: string[] = [];
    for (const topic of topics.slice(0, 6)) {
      if (topic.Text) {
        topicResults.push(`• ${topic.Text}${topic.FirstURL ? ` — ${topic.FirstURL}` : ""}`);
      } else if (topic.Topics) {
        for (const sub of topic.Topics.slice(0, 3)) {
          if (sub.Text) topicResults.push(`• ${sub.Text}${sub.FirstURL ? ` — ${sub.FirstURL}` : ""}`);
        }
      }
    }
    if (topicResults.length > 0) {
      parts.push(`Related Results:\n${topicResults.join("\n")}`);
    }

    if (parts.length === 0) {
      return `No direct results found for "${query}". The AI should answer from its training knowledge.`;
    }

    return parts.join("\n\n");
  } catch (e) {
    return `Web search failed: ${(e as Error).message}. Please answer from training knowledge.`;
  }
}

/* ── Dispatch a tool call by name ──────────────────────────── */
export async function executeTool(name: string, input: Record<string, string>): Promise<string> {
  if (name === "web_search") return executeWebSearch(input.query);
  if (name === "calculator") return executeCalculator(input.expression);
  return `Unknown tool: ${name}`;
}
