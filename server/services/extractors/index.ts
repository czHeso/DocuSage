/**
 * Document text extraction, by format.
 *
 * Everything downstream — chunking, embeddings, retrieval, answers — works on
 * plain text and has never cared where that text came from. Only the upload
 * path cared, and only because it hardcoded PDF. This is the seam: add a format
 * to shared/documentFormats and an extractor here, and the whole pipeline
 * accepts it.
 *
 * The database table is still called `pdfs`. Renaming it means a migration for
 * every existing installation in exchange for a better word, so the name stays
 * and the code around it talks about documents.
 */
import fs from "fs";
import {
  DOCUMENT_FORMATS,
  describeAcceptedFormats,
  extensionOf,
  findFormatInfo,
  type DocumentFormatInfo,
} from "@shared/documentFormats";

export { isSupportedDocument, describeAcceptedFormats, acceptedExtensions } from "@shared/documentFormats";

export interface ExtractedDocument {
  /** The document's text, whitespace normalised. */
  text: string;
  /**
   * Page count, where the format has pages. Formats that do not — a text file,
   * a web page — report 0 rather than inventing a number, and the citation
   * machinery treats that as "no page to cite".
   */
  pages: number;
  /** A title found inside the document, when it carries one. */
  title?: string | null;
}

type Extractor = (buffer: Buffer) => Promise<ExtractedDocument>;

/**
 * One extractor per format id.
 *
 * All of them import lazily. mammoth and pdf-parse are both substantial, and an
 * installation that only ever receives PDFs should not pay to load a Word
 * parser at startup.
 */
const EXTRACTORS: Record<DocumentFormatInfo["id"], Extractor> = {
  async pdf(buffer) {
    const { extractTextFromBuffer } = await import("../pdfExtractor.js");
    const result = await extractTextFromBuffer(buffer);
    return { text: result.text, pages: result.pages };
  },

  async docx(buffer) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { text: normalizeWhitespace(result.value), pages: 0 };
  },

  async text(buffer) {
    return { text: normalizeWhitespace(decodeText(buffer)), pages: 0 };
  },

  async markdown(buffer) {
    // Markdown is kept as it is rather than rendered down to prose. The syntax
    // is small, models read it fine, and its headings are structure the chunker
    // can use.
    return { text: normalizeWhitespace(decodeText(buffer)), pages: 0 };
  },

  async html(buffer) {
    const { extractTextFromHtml } = await import("./html.js");
    const result = extractTextFromHtml(decodeText(buffer));
    return { text: result.text, pages: 0, title: result.title };
  },
};

// Fails the build if a format is added to the shared list without an extractor.
const MISSING_EXTRACTORS = DOCUMENT_FORMATS.filter((format) => !EXTRACTORS[format.id]);
if (MISSING_EXTRACTORS.length > 0) {
  throw new Error(
    `No extractor for document format(s): ${MISSING_EXTRACTORS.map((f) => f.id).join(", ")}`,
  );
}

/**
 * Extracts the text of an uploaded document.
 * @throws When the format is not supported, or the file cannot be parsed.
 */
export async function extractDocumentFromBuffer(
  buffer: Buffer,
  filename: string,
  mimeType?: string,
): Promise<ExtractedDocument> {
  const format = findFormatInfo(filename, mimeType);

  if (!format) {
    throw new Error(
      `Unsupported file type "${extensionOf(filename) || filename}". Accepted formats: ${describeAcceptedFormats()}.`,
    );
  }

  return EXTRACTORS[format.id](buffer);
}

/**
 * Extracts the text of a document stored on disk.
 * @throws When the file is missing, unsupported, or cannot be parsed.
 */
export async function extractDocumentFromFile(filePath: string, mimeType?: string): Promise<ExtractedDocument> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Document not found: ${filePath}`);
  }

  const buffer = await fs.promises.readFile(filePath);
  return extractDocumentFromBuffer(buffer, filePath, mimeType);
}

/**
 * Decodes a text buffer, honouring a UTF-8 byte order mark.
 *
 * A BOM survives decoding as U+FEFF and then travels into the first chunk,
 * where it attaches itself to the first word and stops it matching anything.
 * Windows editors write one by default, so this is not a rare case.
 */
function decodeText(buffer: Buffer): string {
  const text = buffer.toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
