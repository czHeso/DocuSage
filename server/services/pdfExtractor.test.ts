import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { extractTextFromBuffer, extractTextFromFile } from "./pdfExtractor";

/**
 * PDF text extraction did not exist at all – the extracted content was always an
 * empty string, so chunking never ran and the chatbot answered "I don't know" to
 * everything. These tests pin the behaviour down against real PDF files.
 */
const samples = path.resolve(import.meta.dirname, "../../node_modules/pdf-parse/test/data");
const validPdf = path.join(samples, "01-valid.pdf");

describe("PDF text extraction", () => {
  it("pulls real text and a page count out of a PDF", async () => {
    const result = await extractTextFromBuffer(fs.readFileSync(validPdf));

    expect(result.pages).toBeGreaterThan(0);
    expect(result.text.length).toBeGreaterThan(1000);
    // The sample is a paper on trace-based JIT compilation.
    expect(result.text).toContain("Trace-based Just-in-Time");
  });

  it("reads from a path the same way it reads from a buffer", async () => {
    const fromFile = await extractTextFromFile(validPdf);
    const fromBuffer = await extractTextFromBuffer(fs.readFileSync(validPdf));

    expect(fromFile.text).toBe(fromBuffer.text);
    expect(fromFile.pages).toBe(fromBuffer.pages);
  });

  it("rejects data that is not a PDF instead of returning empty text", async () => {
    await expect(
      extractTextFromBuffer(Buffer.from("this is plainly not a PDF")),
    ).rejects.toThrow();
  });
});
