/**
 * Text extraction from PDF files.
 *
 * The text produced by this service is stored in the `pdfs.content` column and is the
 * only source from which chunks and embeddings are built. The binary PDF is
 * never read directly – this extracted text is always used instead.
 */
import fs from "fs";
import { PDFParse } from "pdf-parse";

// pdf-parse 2 is a rewrite with real ESM exports. Version 1 needed a
// createRequire() reaching into pdf-parse/lib/pdf-parse.js, because its
// index.js carried a debug block that read a test PDF from inside its own
// package and crashed under a bundler. None of that is necessary any more.

export interface ExtractedPdf {
  /** The extracted document text. */
  text: string;
  /** Number of pages in the document. */
  pages: number;
}

/**
 * Extracts text from a PDF supplied as a buffer.
 * @throws When the file is corrupted or is not a PDF
 */
export async function extractTextFromBuffer(buffer: Buffer): Promise<ExtractedPdf> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return {
      text: normalizeWhitespace(result.text || ""),
      pages: result.total || 0,
    };
  } finally {
    // Releases the worker the parser holds; without it a long-running server
    // leaks one per uploaded document.
    await parser.destroy();
  }
}

/**
 * Extracts text from a PDF stored on disk.
 * @throws When the file does not exist or cannot be read
 */
export async function extractTextFromFile(filePath: string): Promise<ExtractedPdf> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`PDF soubor nebyl nalezen: ${filePath}`);
  }
  const buffer = await fs.promises.readFile(filePath);
  return extractTextFromBuffer(buffer);
}

/**
 * Normalises line endings and drops redundant blank lines so that as much useful
 * text as possible fits into the prompt.
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
