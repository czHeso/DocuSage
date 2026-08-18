import { describe, it, expect } from "vitest";
import { buildNumberedContext, extractCitedIndices, collectCitedSources, type CitableChunk } from "./citations";

const chunk = (overrides: Partial<CitableChunk> = {}): CitableChunk => ({
  id: 1,
  pdfId: 10,
  filename: "prirucka.pdf",
  pageRange: "12",
  topic: "Fakturace",
  content: "Faktura je splatná do 30 dnů.",
  ...overrides,
});

describe("buildNumberedContext", () => {
  it("numbers the blocks from one and names their source", () => {
    const context = buildNumberedContext([
      chunk(),
      chunk({ id: 2, filename: "smlouva.pdf", pageRange: "3", topic: "Výpověď" }),
    ]);

    expect(context).toContain("[1] Fakturace (prirucka.pdf, p. 12):");
    expect(context).toContain("[2] Výpověď (smlouva.pdf, p. 3):");
  });

  it("keeps the block content intact", () => {
    expect(buildNumberedContext([chunk()])).toContain("Faktura je splatná do 30 dnů.");
  });

  it("copes with a document that has no name or page", () => {
    const context = buildNumberedContext([chunk({ filename: null, pageRange: null, topic: null })]);

    expect(context).toContain("[1] Document (unknown source):");
  });
});

describe("extractCitedIndices", () => {
  it("finds a single marker", () => {
    expect(extractCitedIndices("Splatnost je 30 dnů [1].", 3)).toEqual([1]);
  });

  it("finds several markers in one sentence", () => {
    expect(extractCitedIndices("Platí to obecně [1][3].", 3)).toEqual([1, 3]);
  });

  it("accepts the comma-separated form models produce anyway", () => {
    expect(extractCitedIndices("Platí to [1, 3].", 3)).toEqual([1, 3]);
  });

  it("returns each source once, in order of first use", () => {
    expect(extractCitedIndices("A [2]. B [1]. C [2] again.", 3)).toEqual([2, 1]);
  });

  it("ignores a number the model invented", () => {
    // Following a marker with no source behind it would attribute a claim to
    // the wrong document, which is worse than showing no citation at all.
    expect(extractCitedIndices("Podle [7] to platí.", 3)).toEqual([]);
    expect(extractCitedIndices("Podle [0] to platí.", 3)).toEqual([]);
  });

  it("ignores brackets that are not citations", () => {
    expect(extractCitedIndices("Cena je [asi] vysoká.", 3)).toEqual([]);
    expect(extractCitedIndices("Pole [] je prázdné.", 3)).toEqual([]);
  });

  it("returns nothing for an answer that cites nothing", () => {
    expect(extractCitedIndices("Splatnost je 30 dnů.", 3)).toEqual([]);
  });
});

describe("collectCitedSources", () => {
  it("maps markers back to the documents they came from", () => {
    const sources = collectCitedSources(
      [
        chunk({ id: 11, pdfId: 1, filename: "prirucka.pdf", pageRange: "12" }),
        chunk({ id: 22, pdfId: 2, filename: "smlouva.pdf", pageRange: "3" }),
      ],
      "Splatnost je 30 dnů [2].",
    );

    expect(sources).toEqual([
      { index: 2, chunkId: 22, pdfId: 2, filename: "smlouva.pdf", pageRange: "3" },
    ]);
  });

  it("lists nothing when the answer cited nothing", () => {
    // Listing every retrieved chunk would be a claim the answer does not make.
    expect(collectCitedSources([chunk()], "Splatnost je 30 dnů.")).toEqual([]);
  });

  it("names an unnamed document rather than returning null", () => {
    const [source] = collectCitedSources([chunk({ filename: null })], "Ano [1].");

    expect(source.filename).toBe("Document");
  });
});
