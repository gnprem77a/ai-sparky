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
        query: { type: "string", description: "The search query to look up" },
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
  {
    name: "get_weather",
    description:
      "Get current weather conditions and forecast for any city or location. Use when the user asks about weather, temperature, rain, wind, or climate for a specific place.",
    input_schema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City name or location, e.g. 'London', 'New York', 'Tokyo, Japan'",
        },
      },
      required: ["location"],
    },
  },
  {
    name: "fetch_url",
    description:
      "Fetch and read the content of any publicly accessible web page or URL. Use when the user shares a link and wants you to read, summarize, or analyze its content.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL to fetch, e.g. 'https://example.com/article'",
        },
      },
      required: ["url"],
    },
  },
];

/* ── Calculator ────────────────────────────────────────────── */
export async function executeCalculator(expression: string): Promise<string> {
  try {
    const result = evaluate(expression);
    const formatted =
      typeof result === "number"
        ? Number.isInteger(result)
          ? result.toString()
          : result.toPrecision(10).replace(/\.?0+$/, "")
        : String(result);
    return `${expression} = ${formatted}`;
  } catch (e) {
    return `Could not evaluate "${expression}": ${(e as Error).message}`;
  }
}

/* ── Web Search (DuckDuckGo, no API key required) ──────────── */
interface DdgTopic { Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }
interface DdgData {
  Answer?: string; Abstract?: string; AbstractURL?: string; AbstractTitle?: string;
  Definition?: string; DefinitionURL?: string; RelatedTopics?: DdgTopic[];
}

export interface WebSource { title: string; url: string; snippet?: string }

export interface WebSearchResult { context: string; sources: WebSource[] }

export async function executeWebSearchStructured(query: string): Promise<WebSearchResult> {
  try {
    const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=aichat`;
    const res = await fetch(apiUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AI-Chat/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as DdgData;

    const parts: string[] = [];
    const sources: WebSource[] = [];

    if (data.Answer) parts.push(`Quick Answer: ${data.Answer}`);

    if (data.Abstract && data.Abstract.length > 0) {
      parts.push(`Summary: ${data.Abstract}`);
      if (data.AbstractURL) {
        sources.push({ title: data.AbstractTitle || "Wikipedia", url: data.AbstractURL, snippet: data.Abstract.slice(0, 120) });
      }
    }
    if (data.Definition && data.Definition.length > 0) {
      parts.push(`Definition: ${data.Definition}`);
      if (data.DefinitionURL) {
        sources.push({ title: "Definition", url: data.DefinitionURL, snippet: data.Definition.slice(0, 120) });
      }
    }

    const topics = data.RelatedTopics ?? [];
    const topicLines: string[] = [];
    for (const topic of topics.slice(0, 8)) {
      if (topic.Text && topic.FirstURL) {
        topicLines.push(`• ${topic.Text}`);
        const label = topic.Text.split(" — ")[0]?.trim().slice(0, 60) || "Result";
        if (!sources.find(s => s.url === topic.FirstURL)) {
          sources.push({ title: label, url: topic.FirstURL, snippet: topic.Text.slice(0, 120) });
        }
      } else if (topic.Topics) {
        for (const sub of topic.Topics.slice(0, 3)) {
          if (sub.Text && sub.FirstURL) {
            topicLines.push(`• ${sub.Text}`);
            const label = sub.Text.split(" — ")[0]?.trim().slice(0, 60) || "Result";
            if (!sources.find(s => s.url === sub.FirstURL)) {
              sources.push({ title: label, url: sub.FirstURL, snippet: sub.Text.slice(0, 120) });
            }
          }
        }
      }
    }
    if (topicLines.length > 0) parts.push(`Related:\n${topicLines.join("\n")}`);

    const context = parts.length > 0
      ? `Web search results for "${query}":\n\n${parts.join("\n\n")}`
      : `No direct results found for "${query}". Answer from your training knowledge.`;

    return { context, sources: sources.slice(0, 6) };
  } catch (e) {
    return {
      context: `Web search unavailable: ${(e as Error).message}. Answer from training knowledge.`,
      sources: [],
    };
  }
}

export async function executeWebSearch(query: string): Promise<string> {
  const { context } = await executeWebSearchStructured(query);
  return context;
}

/* ── Weather (wttr.in, no API key required) ────────────────── */
export async function executeGetWeather(location: string): Promise<string> {
  try {
    const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AI-Chat/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as {
      current_condition?: Array<{
        temp_C?: string; temp_F?: string; weatherDesc?: Array<{ value?: string }>;
        humidity?: string; windspeedKmph?: string; winddir16Point?: string; FeelsLikeC?: string;
        visibility?: string;
      }>;
      weather?: Array<{
        date?: string;
        maxtempC?: string; mintempC?: string;
        hourly?: Array<{ weatherDesc?: Array<{ value?: string }>; tempC?: string; time?: string }>;
      }>;
      nearest_area?: Array<{ areaName?: Array<{ value?: string }>; country?: Array<{ value?: string }> }>;
    };

    const curr = data.current_condition?.[0];
    const area = data.nearest_area?.[0];
    const areaName = area?.areaName?.[0]?.value ?? location;
    const country = area?.country?.[0]?.value ?? "";
    const desc = curr?.weatherDesc?.[0]?.value ?? "Unknown";

    const lines: string[] = [
      `Weather for ${areaName}${country ? `, ${country}` : ""}:`,
      `• Conditions: ${desc}`,
      `• Temperature: ${curr?.temp_C ?? "?"}°C / ${curr?.temp_F ?? "?"}°F (feels like ${curr?.FeelsLikeC ?? "?"}°C)`,
      `• Humidity: ${curr?.humidity ?? "?"}%`,
      `• Wind: ${curr?.windspeedKmph ?? "?"} km/h ${curr?.winddir16Point ?? ""}`,
      `• Visibility: ${curr?.visibility ?? "?"} km`,
    ];

    const forecast = data.weather?.slice(0, 3) ?? [];
    if (forecast.length > 0) {
      lines.push("\nForecast:");
      for (const day of forecast) {
        const dayDesc = day.hourly?.[4]?.weatherDesc?.[0]?.value ?? "—";
        lines.push(`• ${day.date}: ${dayDesc}, ${day.mintempC}–${day.maxtempC}°C`);
      }
    }

    return lines.join("\n");
  } catch (e) {
    return `Could not fetch weather for "${location}": ${(e as Error).message}`;
  }
}

/* ── URL Fetcher ───────────────────────────────────────────── */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function executeFetchUrl(url: string): Promise<string> {
  try {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return `Invalid URL: must start with http:// or https://`;
    }
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AI-Chat/1.0)",
        "Accept": "text/html,application/xhtml+xml,text/plain",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const contentType = res.headers.get("content-type") ?? "";
    let text = "";

    if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
      const html = await res.text();
      /* Try to extract title */
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : "";
      text = (title ? `Title: ${title}\n\n` : "") + stripHtml(html);
    } else if (contentType.includes("text/")) {
      text = await res.text();
    } else {
      return `Cannot read content of type "${contentType}" — only HTML and text pages are supported.`;
    }

    /* Limit to 8000 chars to avoid token overload */
    if (text.length > 8000) {
      text = text.substring(0, 8000) + "\n\n[Content truncated — showing first 8000 characters]";
    }
    return `URL: ${url}\n\n${text}`;
  } catch (e) {
    return `Could not fetch "${url}": ${(e as Error).message}`;
  }
}

/* ── Dispatch a tool call by name ──────────────────────────── */
export async function executeTool(name: string, input: Record<string, string>): Promise<string> {
  if (name === "web_search") return executeWebSearch(input.query);
  if (name === "calculator") return executeCalculator(input.expression);
  if (name === "get_weather") return executeGetWeather(input.location);
  if (name === "fetch_url") return executeFetchUrl(input.url);
  return `Unknown tool: ${name}`;
}
