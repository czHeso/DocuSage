/**
 * Embedding generation.
 *
 * Extracted from documentProcessor so that indexing and querying use the same
 * model — an embedding is only comparable with other embeddings produced by the
 * same model, so a query embedded with a different one would return noise.
 */
import OpenAI from "openai";

/**
 * The model every embedding in the database was produced with. Changing it
 * invalidates every stored vector: the old and new ones live in different
 * spaces and their cosine similarity is meaningless. A change here has to be
 * followed by re-embedding every chunk.
 */
export const EMBEDDING_MODEL = "text-embedding-3-small";

/** Output size of EMBEDDING_MODEL. The pgvector column is declared with it. */
export const EMBEDDING_DIMENSIONS = 1536;

/** The subset of a project row that embedding needs. */
export interface EmbeddingProviderConfig {
  aiProvider?: string | null;
  openaiApiKey?: string | null;
  azureEndpoint?: string | null;
}

/**
 * Embeds a single piece of text with the project's provider.
 *
 * Returns null instead of throwing: a project can be perfectly usable without
 * embeddings — retrieval falls back to full-text search — so a missing or
 * rejected API key must not take the whole request down.
 */
export async function embedText(
  content: string,
  project: EmbeddingProviderConfig,
): Promise<number[] | null> {
  const { aiProvider, openaiApiKey, azureEndpoint } = project;

  if (!openaiApiKey) {
    return null;
  }

  try {
    if (aiProvider === "azure") {
      if (!azureEndpoint) {
        console.warn("[embeddings] The Azure provider has no endpoint configured, skipping the embedding.");
        return null;
      }
      return await embedWithAzure(content, openaiApiKey, azureEndpoint);
    }

    // Google Generative AI exposes no embedding endpoint that matches the stored
    // vectors, so those projects fall back to OpenAI — which only works if the
    // key they configured is in fact an OpenAI key. When it is not, the call
    // fails and the caller degrades to full-text search.
    return await embedWithOpenAI(content, openaiApiKey);
  } catch (error) {
    console.error("[embeddings] Failed to generate an embedding:", error);
    return null;
  }
}

async function embedWithOpenAI(content: string, apiKey: string): Promise<number[]> {
  const openai = new OpenAI({ apiKey });
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: content,
  });
  return response.data[0].embedding;
}

async function embedWithAzure(content: string, apiKey: string, endpoint: string): Promise<number[]> {
  const azureOpenai = new OpenAI({
    apiKey,
    baseURL: `${endpoint}/openai/deployments/${EMBEDDING_MODEL}`,
    defaultQuery: { "api-version": "2024-02-15-preview" },
    defaultHeaders: { "api-key": apiKey },
  });

  const response = await azureOpenai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: content,
  });
  return response.data[0].embedding;
}
