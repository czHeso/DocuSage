import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { extractDocumentFromBuffer } from "./index";
import { extractTextFromHtml } from "./html";
import {
  findFormatInfo,
  isSupportedDocument,
  extensionOf,
  acceptAttribute,
  listAcceptedExtensions,
} from "@shared/documentFormats";

const fixturePath = (name: string) => path.resolve(import.meta.dirname, "..", "__fixtures__", name);

/**
 * Reads a fixture and extracts it the way the upload route does - buffer in,
 * name for format detection. Nothing in the application passes a path to the
 * extractors; the route reads the file itself, behind the containment check in
 * services/uploadPaths.
 */
const extractFixture = (name: string) =>
  extractDocumentFromBuffer(fs.readFileSync(fixturePath(name)), name);

describe("format detection", () => {
  it("recognises a file by its extension", () => {
    expect(findFormatInfo("prirucka.pdf")?.id).toBe("pdf");
    expect(findFormatInfo("smlouva.docx")?.id).toBe("docx");
    expect(findFormatInfo("poznamky.md")?.id).toBe("markdown");
    expect(findFormatInfo("export.csv")?.id).toBe("text");
    expect(findFormatInfo("stranka.html")?.id).toBe("html");
  });

  it("does not care about the case of the extension", () => {
    expect(findFormatInfo("PRIRUCKA.PDF")?.id).toBe("pdf");
    expect(findFormatInfo("Smlouva.DocX")?.id).toBe("docx");
  });

  it("trusts the extension over a contradicting MIME type", () => {
    // Operating systems send application/octet-stream for .docx routinely.
    // Refusing a valid file over a header nobody controls would be wrong.
    expect(findFormatInfo("smlouva.docx", "application/octet-stream")?.id).toBe("docx");
  });

  it("falls back to the MIME type when the name has no useful extension", () => {
    expect(findFormatInfo("upload", "application/pdf")?.id).toBe("pdf");
    expect(findFormatInfo("blob", "text/html; charset=utf-8")?.id).toBe("html");
  });

  it("rejects a format nothing can read", () => {
    expect(isSupportedDocument("archiv.zip")).toBe(false);
    expect(isSupportedDocument("prezentace.pptx")).toBe(false);
    expect(isSupportedDocument("obrazek.png", "image/png")).toBe(false);
    expect(isSupportedDocument("nic")).toBe(false);
  });

  it("does not mistake part of a path or a dotfile for an extension", () => {
    expect(extensionOf("/var/data/my.folder/README")).toBe("");
    expect(extensionOf(".gitignore")).toBe("");
    expect(extensionOf("archive.tar.gz")).toBe(".gz");
  });

  it("offers the same list to the file input and to the help text", () => {
    expect(acceptAttribute()).toContain(".pdf");
    expect(acceptAttribute()).toContain("application/pdf");
    expect(listAcceptedExtensions()).toContain(".docx");
  });
});

describe("extracting each format", () => {
  it("reads a PDF, with its page count", async () => {
    const result = await extractFixture("sample.pdf");

    expect(result.text.length).toBeGreaterThan(0);
    expect(result.pages).toBeGreaterThan(0);
  });

  it("reads a Word document", async () => {
    const result = await extractFixture("sample.docx");

    expect(result.text).toContain("Fakturace");
    expect(result.text).toContain("Faktura je splatná do 30 dnů od vystavení.");
    // A .docx has no page count until it is laid out, and inventing one would
    // put a wrong page number in a citation.
    expect(result.pages).toBe(0);
  });

  it("reads a text file, dropping the byte order mark", async () => {
    const result = await extractFixture("sample.txt");

    // A surviving BOM attaches itself to the first word and stops it matching
    // anything in search.
    expect(result.text.charCodeAt(0)).not.toBe(0xfeff);
    expect(result.text.startsWith("Faktura")).toBe(true);
    // CRLF from a Windows editor is normalised.
    expect(result.text).not.toContain("\r");
  });

  it("reads Markdown and keeps its structure", async () => {
    const result = await extractFixture("sample.md");

    // The syntax is left in place: models read it fine and the headings are
    // structure the chunker can use.
    expect(result.text).toContain("# Fakturace");
    expect(result.text).toContain("**30 dnů**");
  });

  it("reads a web page as its visible text", async () => {
    const result = await extractFixture("sample.html");

    expect(result.text).toContain("Fakturace");
    expect(result.text).toContain("Faktura je splatná do 30 dnů.");
    expect(result.title).toBe("Fakturace – nápověda");
  });

  it("refuses a format nothing can read, and names what it accepts", async () => {
    await expect(extractDocumentFromBuffer(Buffer.from("x"), "archiv.zip")).rejects.toThrow(
      /Accepted formats/,
    );
  });

  it("reports a corrupt file rather than returning empty text", async () => {
    // A .pdf that is not a PDF is what a truncated upload looks like.
    await expect(extractDocumentFromBuffer(Buffer.from("not a pdf"), "broken.pdf")).rejects.toThrow();
  });
});

describe("extractTextFromHtml", () => {
  it("drops scripts, styles and comments", () => {
    const { text } = extractTextFromHtml(`
      <html><head><style>p { color: red }</style></head>
      <body><script>var x = "hidden";</script><!-- also hidden --><p>Viditelné</p></body></html>
    `);

    expect(text).toBe("Viditelné");
  });

  it("keeps paragraphs apart", () => {
    // Without block handling these run together as "PrvníDruhý" and the
    // chunker has nothing to split on. A paragraph boundary comes out as a
    // blank line, which is what it is.
    expect(extractTextFromHtml("<p>První</p><p>Druhý</p>").text).toBe("První\n\nDruhý");

    // A line break inside one paragraph stays a single newline.
    expect(extractTextFromHtml("<p>První<br>Druhý</p>").text).toBe("První\nDruhý");
  });

  it("decodes the entities that turn up in prose", () => {
    const { text } = extractTextFromHtml("<p>30&nbsp;dn&#367; &ndash; v&#x161;e &amp; nic</p>");

    expect(text).toBe("30 dnů – vše & nic");
  });

  it("leaves an entity it does not know rather than mangling the text", () => {
    const { text } = extractTextFromHtml("<p>&zwnj;x</p>");

    expect(text).toContain("&zwnj;");
  });

  it("finds the title, and copes with a page that has none", () => {
    expect(extractTextFromHtml("<title>N&aacute;pov&#283;da</title><p>x</p>").title).toBe("Nápověda");
    expect(extractTextFromHtml("<p>x</p>").title).toBeNull();
  });

  it("survives markup that is not well formed", () => {
    // A page saved from the web is frequently not valid, and an exception here
    // would fail the upload rather than produce slightly worse text.
    const { text } = extractTextFromHtml("<p>Text<div><span>více<script>var x=1;");

    expect(text).toContain("Text");
    expect(text).toContain("více");
    expect(text).not.toContain("var x");
  });

  it("returns nothing for an empty document", () => {
    expect(extractTextFromHtml("").text).toBe("");
  });
});
