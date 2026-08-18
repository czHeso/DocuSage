import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Hand-written answers against a real PostgreSQL.
 *
 * Skipped unless TEST_DATABASE_URL points at a database whose schema has been
 * created with `npm run db:push`.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:pw@127.0.0.1:5432/docusage_test npm test
 *
 * No AI provider is configured, so embedding returns null throughout - which is
 * the interesting case: the answer still has to become findable.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (TEST_DATABASE_URL) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const runIntegration = TEST_DATABASE_URL ? describe : describe.skip;

runIntegration("saving an answer as knowledge", () => {
  let storage: typeof import("../storage").storage;
  let db: typeof import("../db").db;
  let sql: typeof import("drizzle-orm").sql;
  let saveAnswerAsKnowledge: typeof import("./knowledgeAnswers").saveAnswerAsKnowledge;
  let KNOWLEDGE_DOCUMENT_FILENAME: string;
  let KNOWLEDGE_DOCUMENT_WEIGHT: number;

  let userId: number;
  let projectId: number;

  beforeAll(async () => {
    storage = (await import("../storage")).storage;
    db = (await import("../db")).db;
    sql = (await import("drizzle-orm")).sql;

    const knowledge = await import("./knowledgeAnswers");
    saveAnswerAsKnowledge = knowledge.saveAnswerAsKnowledge;
    KNOWLEDGE_DOCUMENT_FILENAME = knowledge.KNOWLEDGE_DOCUMENT_FILENAME;
    KNOWLEDGE_DOCUMENT_WEIGHT = knowledge.KNOWLEDGE_DOCUMENT_WEIGHT;

    const suffix = `${process.pid}_${Date.now().toString(36)}`;

    const user = await storage.createUser({
      email: `knowledge_${suffix}@example.test`,
      username: `knowledge_${suffix}`,
      password: "irrelevant",
      isActive: true,
    } as any);
    userId = user.id;

    const project = await storage.createProject({ name: `knowledge test ${suffix}` } as any, userId);
    projectId = project.id;
  });

  afterAll(async () => {
    if (userId) await storage.deleteUser(userId);
  });

  it("creates the answers document on the first answer, and reuses it after", async () => {
    const first = await saveAnswerAsKnowledge({
      projectId,
      question: "Máte pobočku v Brně?",
      answer: "Ano, na Masarykově 12, otevřeno 9-17.",
    });

    const second = await saveAnswerAsKnowledge({
      projectId,
      question: "Kdy máte otevřeno?",
      answer: "Po-Pá 9-17.",
    });

    // One document per project, not one per answer - otherwise the document
    // list fills up with a row per question ever asked.
    expect(second.pdfId).toBe(first.pdfId);
    expect(second.chunkId).not.toBe(first.chunkId);
    expect(second.totalAnswers).toBe(2);

    const documents = await storage.getPdfs(projectId);
    const knowledgeDocuments = documents.filter((d) => d.filename === KNOWLEDGE_DOCUMENT_FILENAME);
    expect(knowledgeDocuments).toHaveLength(1);
    expect(knowledgeDocuments[0].weight).toBe(KNOWLEDGE_DOCUMENT_WEIGHT);
    // No file behind it, which is what lets the delete route skip the filesystem.
    expect(knowledgeDocuments[0].storagePath).toBeNull();
  });

  it("puts the question in the chunk, not only the answer", async () => {
    const saved = await saveAnswerAsKnowledge({
      projectId,
      question: "Jak vypovím smlouvu?",
      answer: "Písemně na adresu sídla, s výpovědní dobou dva měsíce.",
    });

    const rows: any = await db.execute(sql`
      SELECT content, topic, summary, context_type, confidence, page_range
      FROM document_chunks WHERE id = ${saved.chunkId}
    `);
    const chunk = (rows.rows ?? rows)[0];

    // Somebody asking the same thing in different words needs the question's
    // own wording to match against.
    expect(chunk.content).toContain("Jak vypovím smlouvu?");
    expect(chunk.content).toContain("výpovědní dobou dva měsíce");
    expect(chunk.topic).toBe("Jak vypovím smlouvu?");
    expect(chunk.context_type).toBe("answer");
    // A person read the question and wrote the answer; there is nothing to be
    // uncertain about the way there is with an automatic split.
    expect(chunk.confidence).toBe(100);
    // No page to cite - it did not come from a document with pages.
    expect(chunk.page_range).toBeNull();
  });

  it("numbers the chunks in order rather than colliding on index 0", async () => {
    const rows: any = await db.execute(sql`
      SELECT chunk_index FROM document_chunks
      WHERE project_id = ${projectId} AND context_type = 'answer'
      ORDER BY chunk_index
    `);
    const indexes = (rows.rows ?? rows).map((r: any) => Number(r.chunk_index));

    expect(indexes).toEqual(indexes.map((_: number, i: number) => i));
  });

  it("keeps the document's own content in step, for the no-chunks fallback", async () => {
    const documents = await storage.getPdfs(projectId);
    const knowledgeDocument = documents.find((d) => d.filename === KNOWLEDGE_DOCUMENT_FILENAME)!;

    // The content column is what the fallback path uses when a project has no
    // chunks at all, and what the document list sizes itself from.
    expect(knowledgeDocument.content).toContain("Máte pobočku v Brně?");
    expect(knowledgeDocument.content).toContain("Po-Pá 9-17.");
    expect(knowledgeDocument.fileSize).toBeGreaterThan(0);
  });

  it("stores the answer without an embedding when no provider is configured", async () => {
    const saved = await saveAnswerAsKnowledge({
      projectId,
      question: "Kolik stojí doprava?",
      answer: "Doprava je zdarma nad 1000 Kč.",
    });

    const rows: any = await db.execute(sql`
      SELECT embedding FROM document_chunks WHERE id = ${saved.chunkId}
    `);

    // Not fatal and not silently dropped: without a key there is no embedding,
    // and the chunk is still found by text search.
    expect((rows.rows ?? rows)[0].embedding).toBeNull();
  });

  it("refuses an empty question or answer", async () => {
    await expect(
      saveAnswerAsKnowledge({ projectId, question: "  ", answer: "něco" }),
    ).rejects.toThrow(/required/i);

    await expect(
      saveAnswerAsKnowledge({ projectId, question: "něco?", answer: "   " }),
    ).rejects.toThrow(/required/i);
  });

  it("refuses a project that does not exist", async () => {
    await expect(
      saveAnswerAsKnowledge({ projectId: 999_999_999, question: "a?", answer: "b" }),
    ).rejects.toThrow(/not found/i);
  });

  it("does not mix one project's answers into another's", async () => {
    const other = await storage.createProject({ name: "knowledge other" } as any, userId);

    await saveAnswerAsKnowledge({
      projectId: other.id,
      question: "Otázka jiného projektu?",
      answer: "Odpověď jiného projektu.",
    });

    const rows: any = await db.execute(sql`
      SELECT count(*)::int AS count FROM document_chunks
      WHERE project_id = ${other.id} AND context_type = 'answer'
    `);

    expect((rows.rows ?? rows)[0].count).toBe(1);
  });
});
