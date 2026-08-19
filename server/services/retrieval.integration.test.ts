import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Retrieval against a real PostgreSQL.
 *
 * Skipped unless TEST_DATABASE_URL points at a database whose schema has been
 * created with `npm run db:push`. The pgvector parts skip themselves again if
 * the extension is not installed, so the suite is meaningful on a plain
 * PostgreSQL and more thorough on one with the extension.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:pw@127.0.0.1:5432/docusage_test npm test
 *
 * The database is written to, so never point this at anything you care about.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (TEST_DATABASE_URL) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const runIntegration = TEST_DATABASE_URL ? describe : describe.skip;

/**
 * A deterministic unit vector of the width the schema expects. `seed` rotates
 * the weight between the first two dimensions, so two vectors built with nearby
 * seeds are nearly parallel and two with distant seeds are nearly orthogonal —
 * enough structure to tell whether the vector leg ordered anything.
 */
function syntheticEmbedding(seed: number, dimensions = 1536): number[] {
  const angle = (seed % 360) * (Math.PI / 180);
  const vector = new Array(dimensions).fill(0);
  vector[0] = Math.cos(angle);
  vector[1] = Math.sin(angle);
  return vector;
}

runIntegration("hybrid retrieval against a real database", () => {
  let db: typeof import("../db").db;
  let sql: typeof import("drizzle-orm").sql;
  let retrieval: typeof import("./retrieval");
  let searchIndex: typeof import("./searchIndex");

  let userId: number;
  let projectId: number;
  let pdfId: number;
  let lowWeightPdfId: number;
  let pgvector = false;

  /** No provider is configured, so embedText returns null and only the text leg runs. */
  const project = { aiProvider: "openai", openaiApiKey: null, azureEndpoint: null };

  beforeAll(async () => {
    db = (await import("../db")).db;
    sql = (await import("drizzle-orm")).sql;
    retrieval = await import("./retrieval");
    searchIndex = await import("./searchIndex");

    const status = await searchIndex.initSearchIndex();
    pgvector = status.pgvector;

    const suffix = `${process.pid}_${Date.now().toString(36)}`;

    const user: any = await db.execute(sql`
      INSERT INTO users (email, username, password, is_active)
      VALUES (${`retrieval_${suffix}@example.test`}, ${`retrieval_${suffix}`}, 'x', true)
      RETURNING id
    `);
    userId = Number((user.rows ?? user)[0].id);

    const proj: any = await db.execute(sql`
      INSERT INTO projects (name, owner_id) VALUES (${`retrieval test ${suffix}`}, ${userId}) RETURNING id
    `);
    projectId = Number((proj.rows ?? proj)[0].id);

    const pdf: any = await db.execute(sql`
      INSERT INTO pdfs (project_id, filename, content, weight)
      VALUES (${projectId}, 'prirucka.pdf', '', 8) RETURNING id
    `);
    pdfId = Number((pdf.rows ?? pdf)[0].id);

    const lowPdf: any = await db.execute(sql`
      INSERT INTO pdfs (project_id, filename, content, weight)
      VALUES (${projectId}, 'archiv.pdf', '', 1) RETURNING id
    `);
    lowWeightPdfId = Number((lowPdf.rows ?? lowPdf)[0].id);

    const chunks = [
      {
        pdf: pdfId,
        index: 0,
        topic: "Fakturace",
        summary: "Jak vystavit fakturu a kdy je splatná",
        // Note the singular: a query asking about "faktury" has no substring
        // match here, which is exactly what the old scoring got wrong.
        content: "Faktura se vystavuje do patnácti dnů. Splatnost faktury je třicet dnů od vystavení.",
        seed: 0,
      },
      {
        pdf: pdfId,
        index: 1,
        topic: "Doprava",
        summary: "Možnosti dopravy a dodací lhůty",
        content: "Zásilku doručujeme do tří pracovních dnů. Osobní odběr je zdarma.",
        seed: 90,
      },
      {
        pdf: lowWeightPdfId,
        index: 2,
        topic: "Fakturace archiv",
        summary: "Starší pravidla pro faktury",
        content: "Faktura byla dříve splatná do šedesáti dnů podle staré smlouvy.",
        seed: 5,
      },
    ];

    for (const chunk of chunks) {
      const inserted: any = await db.execute(sql`
        INSERT INTO document_chunks (pdf_id, project_id, chunk_index, content, topic, summary, keywords, page_range, embedding)
        VALUES (${chunk.pdf}, ${projectId}, ${chunk.index}, ${chunk.content}, ${chunk.topic}, ${chunk.summary},
                ${JSON.stringify([chunk.topic.toLowerCase()])}::jsonb, '1',
                ${JSON.stringify(syntheticEmbedding(chunk.seed))}::jsonb)
        RETURNING id
      `);
      await searchIndex.storeChunkVector(Number((inserted.rows ?? inserted)[0].id), syntheticEmbedding(chunk.seed));
    }
  });

  afterAll(async () => {
    if (userId) {
      // projects, pdfs and chunks all cascade from the user.
      await db.execute(sql`DELETE FROM users WHERE id = ${userId}`);
    }
  });

  it("creates the full-text index", () => {
    expect(searchIndex.searchIndexStatus().fullText).toBe(true);
  });

  it("finds a chunk whose wording is inflected differently from the question", async () => {
    // "faktury" never appears in the chunk, which says "faktura" and "faktury"
    // only as part of "splatnost faktury" — prefix matching is what connects them.
    const results = await retrieval.findRelevantChunks({
      projectId,
      query: "Jaká je splatnost faktury?",
      project,
      queryEmbedding: null,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].topic).toBe("Fakturace");
    expect(results[0].matchedBy).toContain("text");
  });

  it("matches a plural question against singular text", async () => {
    const results = await retrieval.findRelevantChunks({
      projectId,
      query: "faktury",
      project,
      queryEmbedding: null,
    });

    expect(results.map((r) => r.topic)).toContain("Fakturace");
  });

  it("does not return unrelated chunks", async () => {
    const results = await retrieval.findRelevantChunks({
      projectId,
      query: "splatnost faktury",
      project,
      queryEmbedding: null,
    });

    expect(results.map((r) => r.topic)).not.toContain("Doprava");
  });

  it("survives a question full of punctuation", async () => {
    // The old scorer compiled the query into a regular expression and threw here.
    await expect(
      retrieval.findRelevantChunks({
        projectId,
        query: "Kolik to stojí (v Kč)? [a+++] *",
        project,
        queryEmbedding: null,
      }),
    ).resolves.toBeInstanceOf(Array);
  });

  it("returns nothing for a project with no matching content", async () => {
    const results = await retrieval.findRelevantChunks({
      projectId,
      query: "hydroponické pěstování ananasu",
      project,
      queryEmbedding: null,
    });

    expect(results).toEqual([]);
  });

  it("prefers the higher-weighted document when two chunks are equally relevant", async () => {
    const results = await retrieval.findRelevantChunks({
      projectId,
      query: "faktura splatnost",
      project,
      queryEmbedding: null,
    });

    const main = results.find((r) => r.pdfId === pdfId);
    const archive = results.find((r) => r.pdfId === lowWeightPdfId);

    expect(main).toBeDefined();
    if (archive) {
      expect(main!.score).toBeGreaterThan(archive.score);
    }
  });

  it("ranks by vector distance when only the vector leg has input", async () => {
    const results = await retrieval.findRelevantChunks({
      projectId,
      // No usable search terms, so the text leg contributes nothing and the
      // ordering comes entirely from the embedding.
      query: "a to je co",
      project,
      queryEmbedding: syntheticEmbedding(2),
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].matchedBy).toEqual(["vector"]);

    // Compare the two chunks from the same document, so the weight multiplier
    // is identical and only the vector distance separates them. Seed 0 sits
    // next to the query at seed 2; seed 90 is orthogonal to it.
    const byTopic = new Map(results.map((r) => [r.topic, r]));
    expect(byTopic.get("Fakturace")!.score).toBeGreaterThan(byTopic.get("Doprava")!.score);

    // The archive chunk is the second-closest vector but sits in a weight-1
    // document, and that is enough to push it below a weight-8 chunk that is
    // further away. This is the weight doing what it is for.
    expect(byTopic.get("Fakturace archiv")!.score).toBeLessThan(byTopic.get("Doprava")!.score);
  });

  it("combines both legs when both have input", async () => {
    const results = await retrieval.findRelevantChunks({
      projectId,
      query: "splatnost faktury",
      project,
      queryEmbedding: syntheticEmbedding(0),
    });

    const top = results[0];
    expect(top.topic).toBe("Fakturace");
    expect(top.matchedBy).toContain("text");
    expect(top.matchedBy).toContain("vector");
  });

  it("produces the same ordering with and without pgvector", async () => {
    if (!pgvector) {
      // Nothing to compare against — the fallback is the only path here.
      expect(searchIndex.pgvectorAvailable()).toBe(false);
      return;
    }

    const withExtension = await retrieval.findRelevantChunks({
      projectId,
      query: "a to je co",
      project,
      queryEmbedding: syntheticEmbedding(2),
    });

    searchIndex.resetSearchIndexForTests();
    process.env.SEARCH_PGVECTOR = "off";
    await searchIndex.initSearchIndex();

    try {
      const inProcess = await retrieval.findRelevantChunks({
        projectId,
        query: "a to je co",
        project,
        queryEmbedding: syntheticEmbedding(2),
      });

      expect(inProcess.map((r) => r.id)).toEqual(withExtension.map((r) => r.id));
    } finally {
      delete process.env.SEARCH_PGVECTOR;
      searchIndex.resetSearchIndexForTests();
      await searchIndex.initSearchIndex();
    }
  });
});
