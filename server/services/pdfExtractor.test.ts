import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { extractTextFromBuffer, extractTextFromFile } from "./pdfExtractor";

/**
 * PDF text extraction did not exist at all – the extracted content was always an
 * empty string, so chunking never ran and the chatbot answered "I don't know" to
 * everything. These tests pin the behaviour down against a real PDF file.
 *
 * The fixture is a hand-built two-page PDF committed alongside these tests. It
 * used to be a sample taken from inside the pdf-parse package; pdf-parse 2 no
 * longer ships one, and reaching into another package's internals was fragile
 * regardless.
 */
const fixture = path.resolve(import.meta.dirname, "__fixtures__/sample.pdf");

describe("PDF text extraction", () => {
  it("pulls the text and the page count out of a PDF", async () => {
    const result = await extractTextFromBuffer(fs.readFileSync(fixture));

    expect(result.pages).toBe(2);
    expect(result.text).toContain("DocuSage test document");
    expect(result.text).toContain("This is page 1 of the extraction fixture.");
    expect(result.text).toContain("This is page 2 of the extraction fixture.");
  });

  it("reads from a path the same way it reads from a buffer", async () => {
    const fromFile = await extractTextFromFile(fixture);
    const fromBuffer = await extractTextFromBuffer(fs.readFileSync(fixture));

    expect(fromFile.text).toBe(fromBuffer.text);
    expect(fromFile.pages).toBe(fromBuffer.pages);
  });

  it("normalises whitespace instead of returning the raw layout", async () => {
    const { text } = await extractTextFromFile(fixture);

    expect(text).toBe(text.trim());
    expect(text).not.toMatch(/\n{3,}/);
    expect(text).not.toMatch(/[ \t]+\n/);
  });

  it("rejects data that is not a PDF instead of returning empty text", async () => {
    await expect(
      extractTextFromBuffer(Buffer.from("this is plainly not a PDF")),
    ).rejects.toThrow();
  });

  it("reports a missing file rather than failing silently", async () => {
    await expect(
      extractTextFromFile(path.resolve(import.meta.dirname, "__fixtures__/does-not-exist.pdf")),
    ).rejects.toThrow();
  });
});
