import { describe, it, expect } from "vitest";
import { isFailedResponse, getFailureReason, FAILURE_INDICATORS } from "./failureDetection";

/**
 * These phrases are substring-matched against what the AI actually replies, so
 * they are data, not user-visible copy. When the interface was translated the
 * English wording was added alongside the Czech rather than replacing it –
 * a Czech-configured model still answers in Czech.
 */
describe("failure detection", () => {
  it("recognises an English refusal", () => {
    expect(isFailedResponse("I'm sorry, I don't know the answer to that.")).toBe(true);
    expect(isFailedResponse("I do not have enough information to answer.")).toBe(true);
  });

  it("still recognises a Czech refusal", () => {
    expect(isFailedResponse("Omlouvám se, na to nemám informace.")).toBe(true);
    expect(isFailedResponse("Bohužel nedokážu odpovědět.")).toBe(true);
  });

  it("does not flag a genuine answer as a failure", () => {
    expect(isFailedResponse("The warranty lasts 24 months from the date of purchase.")).toBe(false);
    expect(isFailedResponse("Záruka trvá 24 měsíců od data nákupu.")).toBe(false);
  });

  it("matches regardless of letter case", () => {
    expect(isFailedResponse("I DON'T KNOW")).toBe(true);
  });

  it("classifies the reason in both languages alike", () => {
    expect(getFailureReason("That is not in the documents.")).toBe("missing_in_documents");
    expect(getFailureReason("Tato informace není v dokumentech.")).toBe("missing_in_documents");

    expect(getFailureReason("I have no information about that.")).toBe("insufficient_information");
    expect(getFailureReason("Nemám informace o tom.")).toBe("insufficient_information");

    expect(getFailureReason("I don't know.")).toBe("unable_to_respond");
    expect(getFailureReason("Nedokážu na to odpovědět.")).toBe("unable_to_respond");
  });

  it("falls back to a general reason for an unrecognised failure", () => {
    expect(getFailureReason("Something went sideways.")).toBe("general_failure");
  });

  it("keeps the indicator list non-empty and free of blank entries", () => {
    // A blank entry would make every answer look like a failure.
    expect(FAILURE_INDICATORS.length).toBeGreaterThan(0);
    for (const indicator of FAILURE_INDICATORS) {
      expect(indicator.trim()).not.toBe("");
    }
  });
});
