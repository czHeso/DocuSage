/**
 * Turning retrieved chunks into citable sources.
 *
 * The project setting `enableCitationGeneration` has existed in the schema and
 * in the project UI since before this module - it was stored, and then nothing
 * read it. This is the part that reads it.
 *
 * The approach is numbering rather than trusting the model to describe its
 * sources. Asked to attribute in prose, a model writes "(see the invoicing
 * manual, page 12)", which reads well and cannot be turned back into a link to
 * anything. A marker matching a numbered list can.
 */

export interface CitableChunk {
  id: number;
  pdfId: number;
  filename: string | null;
  pageRange: string | null;
  topic: string | null;
  content: string;
}

export interface AnswerSource {
  /** The number the model was told to cite, starting at 1. */
  index: number;
  chunkId: number;
  pdfId: number;
  /** Falls back to a placeholder when the document row has no filename. */
  filename: string;
  pageRange: string | null;
}

/**
 * Formats the chunks as a numbered list for the prompt.
 *
 * The document name and page go in the header of each entry as well as into the
 * returned source list. It costs a few tokens and it means the model can answer
 * "which document says that?" directly, without the widget having to.
 */
export function buildNumberedContext(chunks: CitableChunk[]): string {
  return chunks
    .map((chunk, position) => {
      const number = position + 1;
      const where = describeSource(chunk);
      return `[${number}] ${chunk.topic ?? "Document"} (${where}):\n${chunk.content}`;
    })
    .join("\n\n");
}

/**
 * Finds the source numbers the model actually cited.
 *
 * Returns them in order of first appearance, deduplicated, and ignores numbers
 * outside the range it was given - a model that writes [7] when it had four
 * sources has made something up, and following it would attribute a claim to
 * the wrong document, which is worse than showing no citation at all.
 */
export function extractCitedIndices(answer: string, sourceCount: number): number[] {
  const cited: number[] = [];
  const seen = new Set<number>();

  // Matches [1] and the individual numbers in [1][3]. A comma-separated form
  // like [1, 3] is also accepted because models produce it regardless of the
  // instruction.
  const pattern = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

  for (const match of answer.matchAll(pattern)) {
    for (const part of match[1].split(",")) {
      const index = Number(part.trim());
      if (!Number.isInteger(index) || index < 1 || index > sourceCount) continue;
      if (seen.has(index)) continue;
      seen.add(index);
      cited.push(index);
    }
  }

  return cited;
}

/**
 * Builds the source list for the chunks the answer actually cited.
 *
 * An answer citing nothing produces an empty list rather than every chunk that
 * was retrieved. Listing sources the answer did not use would be a claim the
 * answer does not support.
 */
export function collectCitedSources(chunks: CitableChunk[], answer: string): AnswerSource[] {
  return extractCitedIndices(answer, chunks.length).map((index) => {
    const chunk = chunks[index - 1];
    return {
      index,
      chunkId: chunk.id,
      pdfId: chunk.pdfId,
      filename: chunk.filename ?? "Document",
      pageRange: chunk.pageRange,
    };
  });
}

/** "manual.pdf, p. 12", or just the page when the document has no name. */
function describeSource(chunk: CitableChunk): string {
  const page = chunk.pageRange ? `p. ${chunk.pageRange}` : null;
  return [chunk.filename, page].filter(Boolean).join(", ") || "unknown source";
}
