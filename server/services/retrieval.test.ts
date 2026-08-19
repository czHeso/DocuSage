import { describe, it, expect } from "vitest";
import {
  sanitizeQueryTerms,
  buildPrefixTsQuery,
  reciprocalRankFusion,
  documentWeightMultiplier,
  cosineSimilarity,
} from "./retrieval";

describe("sanitizeQueryTerms", () => {
  it("drops punctuation instead of choking on it", () => {
    // The previous implementation built `new RegExp(word)` from the raw query,
    // so this exact question threw a SyntaxError on "(v" and returned a 500.
    const terms = sanitizeQueryTerms("Kolik to stojí (v Kč)?");

    expect(terms).toContain("kolik");
    expect(terms).toContain("stojí");
    expect(terms).toContain("kč");
    expect(terms.join(" ")).not.toMatch(/[()?]/);
  });

  it("leaves no regular-expression metacharacter in the output", () => {
    const terms = sanitizeQueryTerms("a+++ [b] (c) *d* \\e | f & g:h!");
    expect(terms.every((term) => /^[\p{L}\p{N}]+$/u.test(term))).toBe(true);
  });

  it("keeps diacritics", () => {
    expect(sanitizeQueryTerms("příloha smlouvy")).toEqual(["příloha", "smlouvy"]);
  });

  it("removes stop words and single characters", () => {
    expect(sanitizeQueryTerms("jak je to s tou fakturou")).toEqual(["tou", "fakturou"]);
  });

  it("deduplicates repeated words", () => {
    expect(sanitizeQueryTerms("faktura faktura faktura")).toEqual(["faktura"]);
  });

  it("honours the project's own stop words", () => {
    expect(sanitizeQueryTerms("reklamace produktu", "reklamace")).toEqual(["produktu"]);
    expect(sanitizeQueryTerms("reklamace produktu", "reklamace, záruka")).toEqual(["produktu"]);
  });

  it("caps the number of terms", () => {
    const long = Array.from({ length: 60 }, (_, i) => `slovo${i}`).join(" ");
    expect(sanitizeQueryTerms(long)).toHaveLength(24);
  });

  it("returns nothing for a query made only of stop words", () => {
    expect(sanitizeQueryTerms("a to je co")).toEqual([]);
  });
});

describe("buildPrefixTsQuery", () => {
  it("reduces Czech inflections of one word to a shared prefix", () => {
    const forms = ["faktura", "faktury", "fakturou", "fakturami"];
    const prefixes = forms.map((form) => buildPrefixTsQuery([form]));

    // Every form has to produce a prefix that the others' text would match.
    for (const prefix of prefixes) {
      expect("fakturami").toContain(prefix.replace(":*", ""));
    }
  });

  it("ORs the terms together", () => {
    expect(buildPrefixTsQuery(["smlouva", "výpověď"])).toBe("smlou:* | výpov:*");
  });

  it("does not truncate short words into a match-everything prefix", () => {
    expect(buildPrefixTsQuery(["dům"])).toBe("dům:*");
    expect(buildPrefixTsQuery(["cena"])).toBe("cena:*");
    expect(buildPrefixTsQuery(["cenik"])).toBe("ceni:*");
  });

  it("produces an empty query for no terms", () => {
    expect(buildPrefixTsQuery([])).toBe("");
  });
});

describe("reciprocalRankFusion", () => {
  it("ranks a chunk both legs agree on above one only a single leg found", () => {
    const fused = reciprocalRankFusion([
      [10, 20, 30],
      [40, 10, 50],
    ]);

    expect(fused.get(10)!).toBeGreaterThan(fused.get(20)!);
    expect(fused.get(10)!).toBeGreaterThan(fused.get(40)!);
  });

  it("preserves the order within a single ranking", () => {
    const fused = reciprocalRankFusion([[1, 2, 3]]);
    expect(fused.get(1)!).toBeGreaterThan(fused.get(2)!);
    expect(fused.get(2)!).toBeGreaterThan(fused.get(3)!);
  });

  it("handles an empty leg", () => {
    const fused = reciprocalRankFusion([[1, 2], []]);
    expect([...fused.keys()]).toEqual([1, 2]);
  });

  it("gives a smaller k a sharper falloff", () => {
    const sharp = reciprocalRankFusion([[1, 2]], 1);
    const flat = reciprocalRankFusion([[1, 2]], 1000);

    expect(sharp.get(1)! / sharp.get(2)!).toBeGreaterThan(flat.get(1)! / flat.get(2)!);
  });
});

describe("documentWeightMultiplier", () => {
  it("increases with the weight", () => {
    expect(documentWeightMultiplier(10)).toBeGreaterThan(documentWeightMultiplier(5));
    expect(documentWeightMultiplier(5)).toBeGreaterThan(documentWeightMultiplier(1));
  });

  it("stays within a range that cannot overrule relevance outright", () => {
    for (const weight of [1, 3, 5, 7, 10]) {
      expect(documentWeightMultiplier(weight)).toBeGreaterThanOrEqual(0.7);
      expect(documentWeightMultiplier(weight)).toBeLessThanOrEqual(1.3);
    }
  });

  it("treats a missing or out-of-range weight as the default", () => {
    expect(documentWeightMultiplier(null)).toBe(documentWeightMultiplier(5));
    expect(documentWeightMultiplier(undefined)).toBe(documentWeightMultiplier(5));
    expect(documentWeightMultiplier(99)).toBe(documentWeightMultiplier(10));
    expect(documentWeightMultiplier(-4)).toBe(documentWeightMultiplier(1));
  });
});

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("is 1 for vectors differing only in magnitude", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("is -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1);
  });

  it("returns 0 rather than NaN for degenerate input", () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });
});
