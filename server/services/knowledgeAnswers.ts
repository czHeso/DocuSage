/**
 * Turning an answer somebody wrote by hand into something the chatbot can find.
 *
 * The failure log has always been a list of questions the documents did not
 * cover, and the only thing to do with an entry was tick it as resolved. The
 * knowledge stayed in whoever ticked it. This closes that: the answer is written
 * once, stored as a retrievable chunk, and the next visitor asking the same
 * thing gets it from the chatbot.
 *
 * The chunk is written directly rather than run through the AI chunker. A
 * question and its answer are already one coherent block - splitting them would
 * be worse, and paying a provider to decide that would be strange.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db.js";
import { documentChunks, pdfs, projects } from "../../shared/schema.js";

/**
 * Filename of the per-project document that holds hand-written answers.
 *
 * A real row in `pdfs` with no file behind it, so the answers appear in the
 * document list, count towards the project's chunk statistics, and can be
 * deleted like anything else. The delete route already skips the filesystem
 * when storagePath is null.
 */
export const KNOWLEDGE_DOCUMENT_FILENAME = "Answers written by your team";

/**
 * Source weight for hand-written answers.
 *
 * Higher than the default of 5: somebody looked at a question their documents
 * could not answer and wrote the answer themselves, which is a better source
 * than a paragraph that happened to mention the topic. Not the maximum, so a
 * document deliberately weighted 9 or 10 still wins.
 */
export const KNOWLEDGE_DOCUMENT_WEIGHT = 8;

export interface SavedAnswer {
  chunkId: number;
  pdfId: number;
  /** How many hand-written answers the project now has. */
  totalAnswers: number;
}

/**
 * Stores a question and its hand-written answer as a searchable chunk.
 *
 * @throws When the project does not exist.
 */
export async function saveAnswerAsKnowledge(options: {
  projectId: number;
  question: string;
  answer: string;
}): Promise<SavedAnswer> {
  const { projectId } = options;
  const question = options.question.trim();
  const answer = options.answer.trim();

  if (!question || !answer) {
    throw new Error("Both the question and the answer are required.");
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const knowledgeDocumentId = await ensureKnowledgeDocument(projectId);

  // Retrieval matches against the chunk's text, so the question has to be in it
  // - somebody asking the same thing in different words needs the question's own
  // wording to match against, not only the answer's.
  const content = `${question}\n\n${answer}`;

  const nextIndex = await nextChunkIndex(knowledgeDocumentId);

  // Generated with the project's own provider so it lands in the same vector
  // space as every other chunk. A failure here is not fatal: the chunk is still
  // found by full-text search, it just loses the semantic leg.
  let embedding: number[] | null = null;
  try {
    const { DocumentProcessor } = await import("./documentProcessor.js");
    embedding = await DocumentProcessor.embedChunkContent(content, project);
  } catch (error) {
    console.warn("[knowledge] Could not embed a hand-written answer:", error);
  }

  const [chunk] = await db
    .insert(documentChunks)
    .values({
      pdfId: knowledgeDocumentId,
      projectId,
      chunkIndex: nextIndex,
      content,
      topic: truncate(question, 120),
      summary: truncate(answer, 200),
      keywords: keywordsFrom(question),
      pageRange: null,
      tokenCount: Math.ceil(content.length / 4),
      contextType: "answer",
      // Written by a person who read the question, so there is nothing to be
      // uncertain about in the way there is with an automatic split.
      confidence: 100,
      embedding,
      processedAt: new Date(),
    })
    .returning({ id: documentChunks.id });

  await refreshKnowledgeDocument(knowledgeDocumentId);

  return {
    chunkId: chunk.id,
    pdfId: knowledgeDocumentId,
    totalAnswers: nextIndex + 1,
  };
}

/** Finds the project's answers document, creating it on first use. */
async function ensureKnowledgeDocument(projectId: number): Promise<number> {
  const [existing] = await db
    .select({ id: pdfs.id })
    .from(pdfs)
    .where(and(eq(pdfs.projectId, projectId), eq(pdfs.filename, KNOWLEDGE_DOCUMENT_FILENAME)));

  if (existing) return existing.id;

  const [created] = await db
    .insert(pdfs)
    .values({
      projectId,
      filename: KNOWLEDGE_DOCUMENT_FILENAME,
      // No file on disk. The delete route checks for this before touching the
      // filesystem, so the document can be removed like any other.
      storagePath: null,
      content: "",
      totalPages: null,
      fileSize: 0,
      processingStatus: "completed",
      weight: KNOWLEDGE_DOCUMENT_WEIGHT,
      processedAt: new Date(),
    })
    .returning({ id: pdfs.id });

  return created.id;
}

async function nextChunkIndex(pdfId: number): Promise<number> {
  const [row] = await db
    .select({ maxIndex: sql<number | null>`max(${documentChunks.chunkIndex})` })
    .from(documentChunks)
    .where(eq(documentChunks.pdfId, pdfId));

  return row?.maxIndex === null || row?.maxIndex === undefined ? 0 : Number(row.maxIndex) + 1;
}

/**
 * Keeps the answers document's own content in step with its chunks.
 *
 * The `content` column is what the fallback path uses when a project has no
 * chunks, and what the document list shows a size from. Leaving it empty would
 * make the answers invisible to both.
 */
async function refreshKnowledgeDocument(pdfId: number): Promise<void> {
  const rows = await db
    .select({ content: documentChunks.content })
    .from(documentChunks)
    .where(eq(documentChunks.pdfId, pdfId))
    .orderBy(documentChunks.chunkIndex);

  const combined = rows.map((row) => row.content).join("\n\n---\n\n");

  await db
    .update(pdfs)
    .set({
      content: combined,
      fileSize: Buffer.byteLength(combined, "utf8"),
      processedAt: new Date(),
    })
    .where(eq(pdfs.id, pdfId));
}

function truncate(text: string, length: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > length ? `${collapsed.slice(0, length - 1)}…` : collapsed;
}

/**
 * The distinctive words of the question, for the keyword field.
 *
 * Crude on purpose. The field is a hint used when expanding a selection to
 * related chunks, not something retrieval depends on, and a question is short
 * enough that "the longest few words" is as good as anything cleverer.
 */
function keywordsFrom(question: string): string[] {
  return Array.from(
    new Set(
      question
        .toLowerCase()
        // Split on anything that is not a letter or a digit. The ranges cover
        // Latin-1 and Latin Extended-A, which is what Czech needs; \p{L} would
        // read better but requires a Unicode-aware flag the project's
        // TypeScript target does not allow yet.
        .split(/[^0-9a-zà-öø-ÿā-ž]+/)
        .filter((word) => word.length > 3),
    ),
  )
    .sort((a, b) => b.length - a.length)
    .slice(0, 8);
}
