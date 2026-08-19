/**
 * Chunk retrieval.
 *
 * Replaces the previous approach, which loaded every chunk of a project into
 * memory and scored it by counting substring occurrences of the query words.
 * That had three problems: it was O(all chunks) per question, it never used the
 * embeddings the upload pipeline had already paid to generate, and substring
 * matching does not survive Czech inflection — "faktury" simply does not occur
 * inside a chunk that says "faktura".
 *
 * What runs instead is a hybrid: a vector leg and a full-text leg, combined
 * with reciprocal rank fusion. Either leg alone is enough to produce results,
 * which matters because both can legitimately be unavailable — a project with
 * no usable OpenAI key has no embeddings, and a database without pgvector has
 * no vector index.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { embedText, EMBEDDING_DIMENSIONS, type EmbeddingProviderConfig } from "./embeddings.js";
import { pgvectorAvailable } from "./searchIndex.js";

export interface RetrievedChunk {
  id: number;
  pdfId: number;
  topic: string | null;
  summary: string | null;
  content: string;
  keywords: unknown;
  pageRange: string | null;
  /** Name of the document the chunk came from, as the uploader named it. */
  filename: string | null;
  /** Source weight of the document the chunk came from, 1-10. */
  weight: number;
  /** Fused relevance score. Comparable within one result set, not across queries. */
  score: number;
  /** Which legs found this chunk — useful when explaining a result. */
  matchedBy: Array<"vector" | "text">;
}

export interface RetrievalOptions {
  projectId: number;
  query: string;
  project: EmbeddingProviderConfig;
  /** How many chunks to return. */
  limit?: number;
  /** Extra stop words, from the project's training options. */
  customStopWords?: string | null;
  /**
   * A ready-made query embedding. Skips the embedding call when the caller
   * already has one, and lets tests exercise the vector leg without a provider.
   */
  queryEmbedding?: number[] | null;
}

/** How deep each leg searches before fusion. Wider than `limit` so fusion has room to disagree. */
const LEG_DEPTH = 40;

/** Rows pulled per batch when cosine similarity has to be computed in the process. */
const FALLBACK_BATCH_SIZE = 500;

/**
 * Words carrying no retrieval signal. Kept deliberately short: an aggressive
 * list removes terms that are meaningful in a document search ("cena", "kdy"),
 * and the ranking already discounts words that appear in every chunk.
 */
const STOP_WORDS = new Set([
  // Czech
  "a", "aby", "ale", "ani", "ano", "asi", "az", "až", "bez", "by", "byl", "byla", "bylo", "být",
  "co", "což", "či", "do", "ho", "i", "jak", "jako", "je", "jeho", "jen", "ještě", "ji", "jsem",
  "jsi", "jsou", "již", "k", "kde", "kdy", "když", "ke", "která", "které", "který", "ku", "má",
  "mají", "me", "mě", "mi", "mít", "muze", "může", "na", "nad", "nebo", "než", "ní", "nic", "no",
  "o", "od", "on", "ona", "oni", "pak", "po", "pod", "pokud", "pro", "proc", "proč", "před", "při",
  "s", "se", "si", "sve", "své", "svůj", "ta", "tak", "také", "tato", "te", "tě", "tedy", "ten",
  "tento", "této", "tím", "to", "toho", "tom", "tomu", "ty", "u", "už", "v", "vám", "vas", "váš",
  "ve", "více", "však", "všech", "z", "za", "ze", "že",
  // English
  "a", "an", "and", "any", "are", "as", "at", "be", "but", "by", "can", "do", "does", "for", "from",
  "has", "have", "how", "i", "if", "in", "is", "it", "its", "may", "me", "my", "of", "on", "or",
  "our", "should", "that", "the", "their", "them", "there", "these", "they", "this", "to", "was",
  "we", "were", "what", "when", "where", "which", "who", "why", "will", "with", "would", "you",
  "your",
]);

/**
 * Splits a question into search terms.
 *
 * Everything that is not a letter or a digit is dropped, which is also what
 * makes the result safe to hand to `to_tsquery` — no operator character can
 * survive. The previous code built `new RegExp(word)` straight from user input,
 * so a question containing "(" threw a SyntaxError and returned a 500.
 */
export function sanitizeQueryTerms(query: string, customStopWords?: string | null): string[] {
  const extra = new Set(
    (customStopWords ?? "")
      .split(/[,\s]+/)
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean),
  );

  const seen = new Set<string>();
  const terms: string[] = [];

  for (const raw of query.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)) {
    const term = raw.trim();
    if (term.length < 2) continue;
    if (STOP_WORDS.has(term) || extra.has(term)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
    // A question longer than this is not a question, and tsquery cost grows with it.
    if (terms.length >= 24) break;
  }

  return terms;
}

/**
 * Turns terms into a prefix tsquery: `faktur:* | splatnost:*`.
 *
 * PostgreSQL has no Czech stemmer, and the `english` one would mangle Czech
 * rather than help. Truncating the inflected tail and matching on the prefix
 * gets most of the benefit for the cost of one string operation: "fakturami",
 * "faktury" and "faktura" all reduce to the prefix "faktur".
 *
 * The terms are OR-ed rather than AND-ed. Requiring every word would return
 * nothing for most natural questions; ts_rank already rewards chunks that match
 * more of them.
 */
export function buildPrefixTsQuery(terms: string[]): string {
  return terms.map((term) => `${truncateForPrefix(term)}:*`).join(" | ");
}

function truncateForPrefix(term: string): string {
  // Czech inflection is almost entirely in the last one or two characters.
  // Below five characters there is not enough left to truncate safely — "dům"
  // would become "d" and match everything.
  if (term.length >= 6) return term.slice(0, term.length - 2);
  if (term.length === 5) return term.slice(0, 4);
  return term;
}

/**
 * Reciprocal rank fusion.
 *
 * Combines rankings by position rather than by score, which is what makes it
 * usable here: cosine similarity (0-1, clustered near 0.8) and ts_rank
 * (unbounded, usually below 0.1) are not on a common scale, and normalising
 * them would need per-corpus calibration that nobody is going to maintain.
 *
 * `k` damps the influence of the top positions; 60 is the value from the
 * original paper and behaves sensibly at these result sizes.
 */
export function reciprocalRankFusion(rankings: number[][], k = 60): Map<number, number> {
  const fused = new Map<number, number>();

  for (const ranking of rankings) {
    ranking.forEach((id, index) => {
      fused.set(id, (fused.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }

  return fused;
}

/**
 * Turns a document's 1-10 weight into a score multiplier.
 *
 * The previous code added `weight * 0.5` to a raw occurrence count, which meant
 * the weight mattered enormously on short documents and not at all on long
 * ones. A multiplier is scale-free: a weight-10 document outranks a weight-1
 * one at equal relevance, and never outranks a genuinely better match.
 */
export function documentWeightMultiplier(weight: number | null | undefined): number {
  const clamped = Math.min(10, Math.max(1, weight ?? 5));
  return 0.7 + ((clamped - 1) / 9) * 0.6;
}

/** Cosine similarity of two equal-length vectors. Returns 0 for degenerate input. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface ChunkRow {
  id: number;
  pdf_id: number;
  topic: string | null;
  summary: string | null;
  content: string;
  keywords: unknown;
  page_range: string | null;
  weight: number | null;
  filename: string | null;
}

function toRetrieved(row: ChunkRow, score: number, matchedBy: Array<"vector" | "text">): RetrievedChunk {
  return {
    id: Number(row.id),
    pdfId: Number(row.pdf_id),
    topic: row.topic,
    summary: row.summary,
    content: row.content,
    keywords: row.keywords,
    pageRange: row.page_range,
    filename: row.filename,
    weight: Number(row.weight ?? 5),
    score,
    matchedBy,
  };
}

function rowsOf(result: any): any[] {
  return result?.rows ?? (Array.isArray(result) ? result : []);
}

/**
 * Finds the chunks most likely to answer a question.
 *
 * Returns an empty array when the project has no chunks at all, or when neither
 * leg matched anything — the caller treats that as "no relevant information"
 * rather than guessing.
 */
export async function findRelevantChunks(options: RetrievalOptions): Promise<RetrievedChunk[]> {
  const { projectId, query, project, limit = 15, customStopWords } = options;

  const terms = sanitizeQueryTerms(query, customStopWords);
  const queryEmbedding =
    options.queryEmbedding !== undefined ? options.queryEmbedding : await embedText(query, project);

  const [vectorHits, textHits] = await Promise.all([
    queryEmbedding ? vectorSearch(projectId, queryEmbedding) : Promise.resolve([]),
    terms.length > 0 ? fullTextSearch(projectId, terms) : Promise.resolve([]),
  ]);

  if (vectorHits.length === 0 && textHits.length === 0) {
    console.log(
      `[retrieval] No candidates for project ${projectId} (embedding: ${
        queryEmbedding ? "yes" : "no"
      }, terms: ${terms.length})`,
    );
    return [];
  }

  const byId = new Map<number, ChunkRow>();
  const matchedBy = new Map<number, Array<"vector" | "text">>();

  for (const [leg, hits] of [["vector", vectorHits], ["text", textHits]] as const) {
    for (const row of hits) {
      const id = Number(row.id);
      byId.set(id, row);
      matchedBy.set(id, [...(matchedBy.get(id) ?? []), leg]);
    }
  }

  const fused = reciprocalRankFusion([
    vectorHits.map((row) => Number(row.id)),
    textHits.map((row) => Number(row.id)),
  ]);

  const ranked = [...fused.entries()]
    .map(([id, rrfScore]) => {
      const row = byId.get(id)!;
      return toRetrieved(row, rrfScore * documentWeightMultiplier(row.weight), matchedBy.get(id) ?? []);
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  console.log(
    `[retrieval] project ${projectId}: ${vectorHits.length} vector + ${textHits.length} text candidates -> ${ranked.length} returned`,
  );

  return ranked;
}

const CHUNK_COLUMNS = sql`c.id, c.pdf_id, c.topic, c.summary, c.content, c.keywords, c.page_range,
  COALESCE(p.weight, 5) AS weight, p.filename`;

async function vectorSearch(projectId: number, embedding: number[]): Promise<ChunkRow[]> {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    console.warn(
      `[retrieval] The query embedding has ${embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}. Skipping vector search.`,
    );
    return [];
  }

  if (pgvectorAvailable()) {
    try {
      const literal = JSON.stringify(embedding);
      const result = await db.execute(sql`
        SELECT ${CHUNK_COLUMNS}
        FROM document_chunks c
        LEFT JOIN pdfs p ON p.id = c.pdf_id
        WHERE c.project_id = ${projectId} AND c.embedding_vec IS NOT NULL
        ORDER BY c.embedding_vec <=> ${literal}::vector
        LIMIT ${LEG_DEPTH}
      `);
      return rowsOf(result) as ChunkRow[];
    } catch (error) {
      console.warn("[retrieval] Vector search failed, falling back to in-process scoring:", error);
    }
  }

  return inProcessVectorSearch(projectId, embedding);
}

/**
 * Cosine similarity computed in Node, for databases without pgvector.
 *
 * Reads in batches and keeps only the running top-N so that a large project
 * does not put every embedding in memory at once — at 1536 floats per chunk
 * that adds up quickly.
 */
async function inProcessVectorSearch(projectId: number, embedding: number[]): Promise<ChunkRow[]> {
  const best: Array<{ row: ChunkRow; score: number }> = [];
  let offset = 0;

  for (;;) {
    const result = await db.execute(sql`
      SELECT ${CHUNK_COLUMNS}, c.embedding
      FROM document_chunks c
      LEFT JOIN pdfs p ON p.id = c.pdf_id
      WHERE c.project_id = ${projectId} AND c.embedding IS NOT NULL
      ORDER BY c.id
      LIMIT ${FALLBACK_BATCH_SIZE} OFFSET ${offset}
    `);

    const rows = rowsOf(result);
    if (rows.length === 0) break;

    for (const row of rows) {
      const stored = row.embedding;
      if (!Array.isArray(stored)) continue;

      const score = cosineSimilarity(embedding, stored as number[]);
      if (best.length < LEG_DEPTH) {
        best.push({ row, score });
        if (best.length === LEG_DEPTH) best.sort((a, b) => b.score - a.score);
      } else if (score > best[best.length - 1].score) {
        best[best.length - 1] = { row, score };
        best.sort((a, b) => b.score - a.score);
      }
    }

    if (rows.length < FALLBACK_BATCH_SIZE) break;
    offset += FALLBACK_BATCH_SIZE;
  }

  return best.sort((a, b) => b.score - a.score).map((entry) => entry.row);
}

async function fullTextSearch(projectId: number, terms: string[]): Promise<ChunkRow[]> {
  const tsquery = buildPrefixTsQuery(terms);

  try {
    // The to_tsvector expression is written exactly as in the index definition
    // in searchIndex.ts; any difference and PostgreSQL plans a sequential scan.
    const result = await db.execute(sql`
      SELECT ${CHUNK_COLUMNS},
             ts_rank(
               to_tsvector('simple',
                 coalesce(c.topic, '') || ' ' ||
                 coalesce(c.summary, '') || ' ' ||
                 coalesce(c.content, '')),
               to_tsquery('simple', ${tsquery})
             ) AS rank
      FROM document_chunks c
      LEFT JOIN pdfs p ON p.id = c.pdf_id
      WHERE c.project_id = ${projectId}
        AND to_tsvector('simple',
              coalesce(c.topic, '') || ' ' ||
              coalesce(c.summary, '') || ' ' ||
              coalesce(c.content, '')) @@ to_tsquery('simple', ${tsquery})
      ORDER BY rank DESC
      LIMIT ${LEG_DEPTH}
    `);
    return rowsOf(result) as ChunkRow[];
  } catch (error) {
    console.warn("[retrieval] Full-text search failed:", error);
    return [];
  }
}
