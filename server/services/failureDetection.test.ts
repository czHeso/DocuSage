import { describe, it, expect } from "vitest";
import { isFailedResponse, isUnhelpfulAnswer, getFailureReason, FAILURE_INDICATORS } from "./failureDetection";
import { NO_RELEVANT_INFORMATION_MESSAGE, ANSWER_GENERATION_FAILED_MESSAGE } from "../prompts";

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

  /**
   * A bare "kontaktovat" used to be an indicator, so any answer pointing the
   * customer at support counted as a failure. Bare apologies did the same to
   * answers that merely opened politely.
   */
  it("does not flag an answer that offers a contact or opens politely", () => {
    expect(isFailedResponse("Můžete nás kontaktovat na podpora@firma.cz.")).toBe(false);
    expect(isFailedResponse("You can contact us at support@example.com.")).toBe(false);
    expect(isFailedResponse("I'm sorry to hear that. The warranty covers this repair.")).toBe(false);
    expect(isFailedResponse("Omlouvám se za potíže. Záruka tuto opravu pokrývá.")).toBe(false);
  });

  it("still flags an apology that refuses to answer", () => {
    expect(isFailedResponse("I'm sorry, but I could not find that in the documents.")).toBe(true);
    expect(isFailedResponse("Omlouvám se, ale tuto informaci v dokumentech nemám.")).toBe(true);
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

describe("isUnhelpfulAnswer", () => {
  it("recognises the phrases a model writes", () => {
    expect(isUnhelpfulAnswer("I don't know the answer to that.")).toBe(true);
    expect(isUnhelpfulAnswer("Nemám dostatečné informace.")).toBe(true);
  });

  it("recognises the application's own fallback answers", () => {
    // None of these matched isFailedResponse, which is the point: DocuSage did
    // not recognise its own failure messages, so the most common failure of all
    // - retrieval finding nothing - looked like a successful answer.
    expect(isUnhelpfulAnswer(NO_RELEVANT_INFORMATION_MESSAGE)).toBe(true);
    expect(isUnhelpfulAnswer(ANSWER_GENERATION_FAILED_MESSAGE)).toBe(true);
    expect(isUnhelpfulAnswer("I am sorry, an error occurred while generating the answer.")).toBe(true);
  });

  it("leaves a real answer alone", () => {
    expect(isUnhelpfulAnswer("Splatnost faktury je 30 dnů od vystavení.")).toBe(false);
    expect(isUnhelpfulAnswer("You can contact us at support@example.com.")).toBe(false);
  });

  it("does not change what counts for the failure log", () => {
    // isFailedResponse stays narrower on purpose: the no-information case is
    // already logged explicitly before that message is returned, so counting it
    // here as well would record the same failure twice.
    expect(isFailedResponse(NO_RELEVANT_INFORMATION_MESSAGE)).toBe(false);
    expect(isUnhelpfulAnswer(NO_RELEVANT_INFORMATION_MESSAGE)).toBe(true);
  });
});
