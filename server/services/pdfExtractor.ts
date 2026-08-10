/**
 * Text extraction from PDF files.
 *
 * The text produced by this service is stored in the `pdfs.content` column and is the
 * only source from which chunks and embeddings are built. The binary PDF is
 * never read directly – this extracted text is always used instead.
 */
import fs from "fs";
import { createRequire } from "module";

// pdf-parse is CommonJS and its `index.js` contains a debug block which, when
// loaded by a bundler, tries to read a test PDF from its own package and crashes.
// Importing the `lib/pdf-parse.js` submodule bypasses that block.
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  dataBuffer: Buffer,
  options?: Record<string, unknown>,
) => Promise<{ text: string; numpages: number; info?: unknown }>;

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
  const result = await pdfParse(buffer);
  return {
    text: normalizeWhitespace(result.text || ""),
    pages: result.numpages || 0,
  };
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
