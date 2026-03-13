const BLUESMINDS_API_URL = "https://api.bluesminds.com/v1";
const EMBED_MODEL = "embed-v-4-0";
const RERANK_MODEL = "Cohere-rerank-v4.0-pro";

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

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.BLUESMINDS_API_KEY;
  if (!apiKey) throw new Error("BLUESMINDS_API_KEY not set");

  const res = await fetch(`${BLUESMINDS_API_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API error ${res.status}: ${err}`);
  }

  const json = await res.json() as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    const emb = await generateEmbedding(text);
    results.push(emb);
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
  topN = 5
): Promise<RankedChunk[]> {
  if (chunks.length === 0) return [];

  try {
    const apiKey = process.env.BLUESMINDS_API_KEY;
    if (!apiKey) throw new Error("No API key");

    const res = await fetch(`${BLUESMINDS_API_URL}/rerank`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: RERANK_MODEL,
        query,
        documents: chunks.map(c => c.content),
        top_n: topN,
      }),
    });

    if (!res.ok) throw new Error(`Rerank API error ${res.status}`);

    const json = await res.json() as { results: { index: number; relevance_score: number }[] };
    return json.results.map(r => ({
      ...chunks[r.index],
      rerankScore: r.relevance_score,
    }));
  } catch (err) {
    console.warn("[rerank] fallback to cosine similarity:", err instanceof Error ? err.message : err);
    return chunks.slice(0, topN);
  }
}
