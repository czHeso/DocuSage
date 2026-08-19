import { describe, it, expect } from "vitest";
import {
  tokensFromOpenAI,
  tokensFromGoogle,
  priceFor,
  estimateCost,
  MODEL_PRICES_PER_MILLION,
  withUsageTracking,
  currentUsageProjectId,
} from "./usage";

describe("tokensFromOpenAI", () => {
  it("reads the counts a completion reports", () => {
    expect(
      tokensFromOpenAI({ usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 } }),
    ).toEqual({ promptTokens: 120, completionTokens: 45, totalTokens: 165 });
  });

  it("adds the two up when the total is missing", () => {
    expect(tokensFromOpenAI({ usage: { prompt_tokens: 10, completion_tokens: 5 } })?.totalTokens).toBe(15);
  });

  it("reads an embedding response, which reports no completion tokens", () => {
    expect(tokensFromOpenAI({ usage: { prompt_tokens: 8, total_tokens: 8 } })).toEqual({
      promptTokens: 8,
      completionTokens: 0,
      totalTokens: 8,
    });
  });

  it("returns null rather than zeros when there is no usage field", () => {
    // A streamed response has no usage unless it is asked for. Recording zeros
    // would show up as a call that cost nothing, which is worse than no row.
    expect(tokensFromOpenAI({ choices: [] })).toBeNull();
    expect(tokensFromOpenAI(null)).toBeNull();
    expect(tokensFromOpenAI(undefined)).toBeNull();
  });
});

describe("tokensFromGoogle", () => {
  it("reads usageMetadata from a wrapped response", () => {
    expect(
      tokensFromGoogle({
        response: { usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 60, totalTokenCount: 260 } },
      }),
    ).toEqual({ promptTokens: 200, completionTokens: 60, totalTokens: 260 });
  });

  it("reads it from a plain response body too", () => {
    // The SDK wraps it in `response`; the raw REST call in openaiModel does not.
    expect(
      tokensFromGoogle({ usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 } })?.totalTokens,
    ).toBe(6);
  });

  it("returns null when the field is absent", () => {
    expect(tokensFromGoogle({ candidates: [] })).toBeNull();
  });
});

describe("priceFor", () => {
  it("finds a model by its exact name", () => {
    expect(priceFor("gpt-4o")).toEqual(MODEL_PRICES_PER_MILLION["gpt-4o"]);
  });

  it("prices a dated release as its base model", () => {
    // Otherwise the table needs a row per release and goes stale immediately.
    expect(priceFor("gpt-4o-2026-01-01")).toEqual(MODEL_PRICES_PER_MILLION["gpt-4o"]);
  });

  it("prefers the longest match, so mini is not priced as gpt-4o", () => {
    expect(priceFor("gpt-4o-mini")).toEqual(MODEL_PRICES_PER_MILLION["gpt-4o-mini"]);
    expect(priceFor("gpt-4o-mini")?.input).toBeLessThan(priceFor("gpt-4o")!.input);
  });

  it("prices an Azure deployment named after its model", () => {
    // Deployment names are chosen by whoever created them and usually contain
    // the model name.
    expect(priceFor("prod-gpt-4o-eu")).toEqual(MODEL_PRICES_PER_MILLION["gpt-4o"]);
  });

  it("returns null for a model it does not know", () => {
    expect(priceFor("llama-3-70b")).toBeNull();
    expect(priceFor("")).toBeNull();
  });
});

describe("estimateCost", () => {
  it("charges input and output at their own rates", () => {
    const cost = estimateCost({ model: "gpt-4o", promptTokens: 1_000_000, completionTokens: 1_000_000 });

    expect(cost).toBeCloseTo(MODEL_PRICES_PER_MILLION["gpt-4o"].input + MODEL_PRICES_PER_MILLION["gpt-4o"].output);
  });

  it("charges nothing for an embedding's non-existent output", () => {
    const cost = estimateCost({
      model: "text-embedding-3-small",
      promptTokens: 1_000_000,
      completionTokens: 0,
    });

    expect(cost).toBeCloseTo(MODEL_PRICES_PER_MILLION["text-embedding-3-small"].input);
  });

  it("returns null for an unknown model rather than pretending it was free", () => {
    // Null is what makes the report able to say "these tokens are not in the
    // total", instead of quietly understating the bill.
    expect(estimateCost({ model: "mistral-large", promptTokens: 1000, completionTokens: 1000 })).toBeNull();
  });

  it("scales linearly", () => {
    const small = estimateCost({ model: "gpt-4o", promptTokens: 1000, completionTokens: 500 })!;
    const big = estimateCost({ model: "gpt-4o", promptTokens: 2000, completionTokens: 1000 })!;

    expect(big).toBeCloseTo(small * 2);
  });
});

describe("usage attribution", () => {
  it("carries the project through nested async calls", async () => {
    const seen = await withUsageTracking(42, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const deeper = async () => {
        await Promise.resolve();
        return currentUsageProjectId();
      };
      return deeper();
    });

    // The whole point: a provider call five frames down records against the
    // project without anybody passing an id to it.
    expect(seen).toBe(42);
  });

  it("keeps concurrent projects apart", async () => {
    const [first, second] = await Promise.all([
      withUsageTracking(1, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return currentUsageProjectId();
      }),
      withUsageTracking(2, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return currentUsageProjectId();
      }),
    ]);

    expect(first).toBe(1);
    expect(second).toBe(2);
  });

  it("has no project outside any context", () => {
    expect(currentUsageProjectId()).toBeUndefined();
  });
});
