/**
 * Which file formats can be uploaded.
 *
 * Shared rather than server-only so the upload control, its help text and the
 * server's validation cannot disagree. They did disagree in the PDF-only days -
 * the input accepted `.pdf`, the multer filter checked the MIME type as well,
 * and the route checked the extension a third time - and each place had to be
 * remembered separately.
 *
 * The extraction itself lives in server/services/extractors, keyed by the `id`
 * below. This file is metadata only, so the browser can import it.
 */

export interface DocumentFormatInfo {
  /** Stable key, used to attach an extractor on the server. */
  id: "pdf" | "docx" | "text" | "markdown" | "html";
  /** Human-readable name, used in error messages and help text. */
  label: string;
  /** Lower-case, with the dot. */
  extensions: string[];
  /**
   * MIME types browsers send for this format.
   *
   * Several per format on purpose: what arrives depends on the operating system
   * and the browser, and for text formats it is frequently
   * `application/octet-stream` or nothing at all. The extension is the reliable
   * signal; the MIME type is corroboration.
   */
  mimeTypes: string[];
}

export const DOCUMENT_FORMATS: DocumentFormatInfo[] = [
  {
    id: "pdf",
    label: "PDF",
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
  },
  {
    id: "docx",
    label: "Word document",
    extensions: [".docx"],
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  },
  {
    id: "text",
    label: "plain text",
    extensions: [".txt", ".text", ".log", ".csv"],
    mimeTypes: ["text/plain", "text/csv"],
  },
  {
    id: "markdown",
    label: "Markdown",
    extensions: [".md", ".markdown"],
    mimeTypes: ["text/markdown", "text/x-markdown"],
  },
  {
    id: "html",
    label: "web page",
    extensions: [".html", ".htm"],
    mimeTypes: ["text/html", "application/xhtml+xml"],
  },
];

/** Every accepted extension. */
export function acceptedExtensions(): string[] {
  return DOCUMENT_FORMATS.flatMap((format) => format.extensions);
}

/** The value for a file input's `accept` attribute. */
export function acceptAttribute(): string {
  return [...acceptedExtensions(), ...DOCUMENT_FORMATS.flatMap((f) => f.mimeTypes)].join(",");
}

/** "PDF, Word document, plain text, Markdown, web page" */
export function describeAcceptedFormats(): string {
  return DOCUMENT_FORMATS.map((format) => format.label).join(", ");
}

/** ".pdf, .docx, .txt, …", for help text where the extensions matter more. */
export function listAcceptedExtensions(): string {
  return acceptedExtensions().join(", ");
}

/** The extension of a file name, lower-cased and including the dot. */
export function extensionOf(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  const lastSlash = Math.max(filename.lastIndexOf("/"), filename.lastIndexOf("\\"));

  // A dot before the last separator belongs to a directory, not the file, and a
  // dot at position 0 makes a dotfile rather than an extension.
  if (lastDot <= 0 || lastDot < lastSlash + 1) return "";

  return filename.slice(lastDot).toLowerCase();
}

/**
 * Picks the format for a file.
 *
 * The extension decides. A MIME type that contradicts a known extension is
 * ignored rather than treated as a conflict: browsers get this wrong routinely,
 * and refusing a .docx because the operating system called it
 * `application/octet-stream` would be rejecting a valid file over a header
 * nobody controls.
 */
export function findFormatInfo(filename: string, mimeType?: string): DocumentFormatInfo | null {
  const extension = extensionOf(filename);

  const byExtension = DOCUMENT_FORMATS.find((format) => format.extensions.includes(extension));
  if (byExtension) return byExtension;

  if (mimeType) {
    const normalized = mimeType.split(";")[0].trim().toLowerCase();
    return DOCUMENT_FORMATS.find((format) => format.mimeTypes.includes(normalized)) ?? null;
  }

  return null;
}

export function isSupportedDocument(filename: string, mimeType?: string): boolean {
  return findFormatInfo(filename, mimeType) !== null;
}
