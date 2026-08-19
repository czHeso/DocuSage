/**
 * Search index bootstrap.
 *
 * Retrieval needs two things the Drizzle schema cannot express:
 *
 *   - A `vector` column. It only exists once the pgvector extension is
 *     installed, and declaring it in `shared/schema.ts` would make
 *     `npm run db:push` fail outright on every PostgreSQL without it.
 *   - Expression indexes (`to_tsvector(...)`), which Drizzle Kit does not model.
 *
 * Both are therefore created here at startup, idempotently, and every step is
 * allowed to fail without stopping the server. A database without pgvector is
 * still fully usable: `pgvectorAvailable()` stays false and retrieval computes
 * cosine similarity in the process instead. Slower, same answers.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { EMBEDDING_DIMENSIONS } from "./embeddings.js";

export interface SearchIndexStatus {
  /** pgvector is installed and the vector column is queryable. */
  pgvector: boolean;
  /** The full-text index exists. */
  fullText: boolean;
  /** Rows copied from the jsonb `embedding` column into the vector column. */
  backfilled: number;
}

let status: SearchIndexStatus = { pgvector: false, fullText: false, backfilled: 0 };
let initialised = false;

/** True when vector search can run inside PostgreSQL. */
export function pgvectorAvailable(): boolean {
  return status.pgvector;
}

/** True when the full-text index is in place. */
export function fullTextAvailable(): boolean {
  return status.fullText;
}

export function searchIndexStatus(): SearchIndexStatus {
  return { ...status };
}

/**
 * Creates the extension, column and indexes retrieval relies on.
 *
 * Safe to call more than once and safe to call against a database that already
 * has everything. Never throws — the caller is the server's startup path and a
 * degraded search is better than a server that will not boot.
 */
export async function initSearchIndex(): Promise<SearchIndexStatus> {
  if (initialised) return searchIndexStatus();
  initialised = true;

  if (process.env.SEARCH_PGVECTOR === "off") {
    console.log("[search] SEARCH_PGVECTOR=off - vector search will run in the application process.");
  } else {
    status.pgvector = await enablePgvector();
  }

  status.fullText = await createFullTextIndex();
  await createProjectIndex();

  if (status.pgvector) {
    status.backfilled = await backfillVectors();
  }

  console.log(
    `[search] pgvector: ${status.pgvector ? "yes" : "no"}, full-text index: ${
      status.fullText ? "yes" : "no"
    }${status.backfilled ? `, backfilled ${status.backfilled} vectors` : ""}`,
  );

  return searchIndexStatus();
}

async function enablePgvector(): Promise<boolean> {
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  } catch (error) {
    // The usual cause is a managed PostgreSQL where the extension is not on the
    // allow-list, or a server where nobody ran `apt install postgresql-16-pgvector`.
    console.warn(
      "[search] pgvector is not available, falling back to in-process vector search. " +
        "Install the extension for faster search on large projects. Reason:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }

  try {
    await db.execute(
      sql`ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding_vec vector(${sql.raw(
        String(EMBEDDING_DIMENSIONS),
      )})`,
    );

    // HNSW rather than IVFFlat: it needs no training pass over existing data,
    // which matters here because the column starts out empty and fills up as
    // documents are uploaded.
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS document_chunks_embedding_vec_idx
          ON document_chunks USING hnsw (embedding_vec vector_cosine_ops)`,
    );
    return true;
  } catch (error) {
    console.warn(
      "[search] pgvector is installed but the vector column could not be prepared:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

/**
 * The `simple` text-search configuration is deliberate. PostgreSQL ships no
 * Czech dictionary, and `english` would stem Czech words wrongly rather than
 * not at all. Morphology is instead handled at query time by prefix matching —
 * see buildPrefixTsQuery in retrieval.ts.
 */
async function createFullTextIndex(): Promise<boolean> {
  try {
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS document_chunks_fts_idx
          ON document_chunks USING gin (
            to_tsvector('simple',
              coalesce(topic, '') || ' ' ||
              coalesce(summary, '') || ' ' ||
              coalesce(content, ''))
          )`,
    );
    return true;
  } catch (error) {
    console.warn(
      "[search] The full-text index could not be created, search will fall back to a sequential scan:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

/** Every retrieval query filters by project, and the schema declares no index for it. */
async function createProjectIndex(): Promise<void> {
  try {
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS document_chunks_project_id_idx ON document_chunks (project_id)`,
    );
  } catch (error) {
    console.warn(
      "[search] The project index could not be created:",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * Copies embeddings that predate the vector column out of jsonb.
 *
 * Only vectors of the expected width are copied; anything else is left behind
 * rather than crashing the cast, because a differently sized vector cannot be
 * compared with the others anyway.
 */
async function backfillVectors(): Promise<number> {
  try {
    const result: any = await db.execute(
      sql`UPDATE document_chunks
          SET embedding_vec = (embedding::text)::vector
          WHERE embedding IS NOT NULL
            AND embedding_vec IS NULL
            AND jsonb_typeof(embedding) = 'array'
            AND jsonb_array_length(embedding) = ${EMBEDDING_DIMENSIONS}`,
    );
    return Number(result?.rowCount ?? result?.rows?.length ?? 0);
  } catch (error) {
    console.warn(
      "[search] Backfilling the vector column failed:",
      error instanceof Error ? error.message : error,
    );
    return 0;
  }
}

/**
 * Writes a freshly generated embedding into the vector column.
 *
 * Called right after a chunk is inserted. A failure here is not fatal: the
 * jsonb copy is still stored, so the next startup backfills it.
 */
export async function storeChunkVector(chunkId: number, embedding: number[] | null | undefined): Promise<void> {
  if (!status.pgvector || !embedding || embedding.length !== EMBEDDING_DIMENSIONS) return;

  try {
    await db.execute(
      sql`UPDATE document_chunks
          SET embedding_vec = ${JSON.stringify(embedding)}::vector
          WHERE id = ${chunkId}`,
    );
  } catch (error) {
    console.warn(`[search] Could not store the vector for chunk ${chunkId}:`, error);
  }
}

/** Test seam: lets integration tests re-run the bootstrap against a fresh database. */
export function resetSearchIndexForTests(): void {
  initialised = false;
  status = { pgvector: false, fullText: false, backfilled: 0 };
}
