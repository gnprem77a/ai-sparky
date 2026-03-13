const BLUESMINDS_API_URL = "https://api.bluesminds.com/v1";

export function chunkText(text: string, chunkSize = 800, overlap = 100): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).trim());
    if (end === text.length) break;
    start += chunkSize - overlap;
  }
  return chunks.filter(c => c.length > 20);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface EmbedProviderConfig {
  url: string;
  apiKey: string;
  providerType: string;
  modelName: string;
}

export interface RerankProviderConfig {
  url: string;
  apiKey: string;
  providerType: string;
  modelName: string;
}

function authHeaders(providerType: string, apiKey: string): Record<string, string> {
  const t = providerType.toLowerCase();
  if (t === "azure") return { "api-key": apiKey };
  return { "Authorization": `Bearer ${apiKey}` };
}

function buildEmbedUrl(baseUrl: string, modelName: string): string {
  const url = baseUrl.replace(/\/$/, "");
  if (url.endsWith("/embed")) return url;
  if (url.endsWith("/embeddings")) return url;
  // Azure AI Foundry / OpenAI-compat endpoint: /openai/v1 → /openai/v1/embeddings
  if (url.endsWith("/v1") || url.includes("/openai/v1")) return `${url}/embeddings`;
  // Azure AI Inference (Cohere-style): /models → /models/{model}/embed
  if (url.endsWith("/models")) return `${url}/${modelName}/embed`;
  return `${url}/embeddings`;
}

function parseEmbeddingResponse(json: unknown): number[] {
  const j = json as Record<string, unknown>;

  // OpenAI format: { data: [{ embedding: [...] }] }
  if (Array.isArray(j.data) && (j.data[0] as Record<string,unknown>)?.embedding) {
    return (j.data[0] as { embedding: number[] }).embedding;
  }

  // Cohere V2 format: { embeddings: { float: [[...]] } }
  const embs = j.embeddings;
  if (embs && typeof embs === "object") {
    const e = embs as Record<string, unknown>;
    if (Array.isArray(e.float) && e.float.length > 0) {
      return e.float[0] as number[];
    }
    // Cohere V1 array format: { embeddings: [[...]] }
    if (Array.isArray(embs) && embs.length > 0) {
      return embs[0] as number[];
    }
  }

  throw new Error(`Unknown embedding response: ${JSON.stringify(j).slice(0, 300)}`);
}

export async function generateEmbedding(text: string, config?: EmbedProviderConfig): Promise<number[]> {
  let url: string;
  let headers: Record<string, string>;
  let body: Record<string, unknown>;

  // Try configured embed provider first, then fall back to Bluesminds
  if (config) {
    url = buildEmbedUrl(config.url, config.modelName);
    headers = authHeaders(config.providerType, config.apiKey);
    // Use OpenAI format for /embeddings endpoints, Cohere format for /embed endpoints
    if (url.endsWith("/embeddings")) {
      body = { input: [text], model: config.modelName };
    } else {
      body = { texts: [text], input_type: "search_document" };
    }
    const authType = headers["api-key"] ? "api-key" : "Bearer";
    console.log(`[embed] Using provider "${config.modelName}" at ${url} (auth: ${authType})`);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const rawText = await res.text();
      if (!res.ok) {
        console.error(`[embed] provider error ${res.status}: ${rawText.slice(0, 300)}`);
        throw new Error(`Embedding API error ${res.status}: ${rawText.slice(0, 200)}`);
      }
      const json = JSON.parse(rawText);
      return parseEmbeddingResponse(json);
    } catch (err) {
      console.warn(`[embed] configured provider failed: ${(err as Error).message} — falling back to Bluesminds`);
    }
  }

  // Bluesminds fallback — try embed-v-4-0 (Cohere) format first, then OpenAI format
  const apiKey = process.env.BLUESMINDS_API_KEY;
  if (!apiKey) throw new Error("No embed provider configured and BLUESMINDS_API_KEY not set");

  // Try Cohere-style endpoint
  try {
    const cohereUrl = `${BLUESMINDS_API_URL}/v2/embed`;
    const cohereHeaders = { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" };
    const cohereBody = { model: "embed-v-4-0", texts: [text], input_type: "search_document" };
    console.log(`[embed] Trying Bluesminds Cohere fallback at ${cohereUrl}`);
    const cohereRes = await fetch(cohereUrl, { method: "POST", headers: cohereHeaders, body: JSON.stringify(cohereBody) });
    if (cohereRes.ok) {
      const j = await cohereRes.json();
      return parseEmbeddingResponse(j);
    }
  } catch { /* try next */ }

  url = `${BLUESMINDS_API_URL}/embeddings`;
  headers = { "Authorization": `Bearer ${apiKey}` };
  body = { model: "embed-v-4-0", input: [text] };
  console.log(`[embed] Using Bluesminds fallback (embed-v-4-0, OpenAI format)`);
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API error ${res.status}: ${err}`);
  }
  const json = await res.json();
  return parseEmbeddingResponse(json);
}

export async function generateEmbeddings(texts: string[], config?: EmbedProviderConfig): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    results.push(await generateEmbedding(text, config));
  }
  return results;
}

export interface RankedChunk {
  content: string;
  docName: string;
  docId: string;
  similarity: number;
  rerankScore?: number;
}

export async function rerankChunks(
  query: string,
  chunks: RankedChunk[],
  topN = 5,
  config?: RerankProviderConfig
): Promise<RankedChunk[]> {
  if (chunks.length === 0) return [];

  let url: string;
  let headers: Record<string, string>;

  if (config) {
    url = config.url;
    headers = authHeaders(config.providerType, config.apiKey);
    console.log(`[rerank] Using provider "${config.modelName}" at ${url}`);
  } else {
    const apiKey = process.env.BLUESMINDS_API_KEY;
    if (!apiKey) {
      console.warn("[rerank] No provider configured, skipping reranking");
      return chunks.slice(0, topN);
    }
    url = `${BLUESMINDS_API_URL}/rerank`;
    headers = { "Authorization": `Bearer ${apiKey}` };
    console.log(`[rerank] Using Bluesminds fallback`);
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config?.modelName ?? "Cohere-rerank-v4.0-pro",
        query,
        documents: chunks.map(c => c.content),
        top_n: topN,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Rerank API error ${res.status}: ${err}`);
    }

    const json = await res.json() as { results: { index: number; relevance_score: number }[] };
    return json.results.map(r => ({
      ...chunks[r.index],
      rerankScore: r.relevance_score,
    }));
  } catch (err) {
    console.warn("[rerank] failed, falling back to cosine order:", err instanceof Error ? err.message : err);
    return chunks.slice(0, topN);
  }
}
