import { db } from "../db";
import { failedResponses } from "@shared/schema";

// Universal detection of unsuccessful answers
/**
 * Phrases that mark an answer as unsuccessful.
 *
 * These are matched as case-insensitive substrings against the model's answer,
 * so they must be written in the language the chatbot actually replies in.
 * Both English and Czech are listed because the answer language follows the
 * prompt (see server/prompts.ts) and differs per deployment.
 *
 * ADDING A LANGUAGE: append the equivalent phrases below. Keep them lowercase
 * and short enough to match reliably, but specific enough not to fire on
 * ordinary answers.
 *
 * BE SPECIFIC. A phrase that appears in successful answers fills the
 * failed_responses table with noise and hides the real failures. A bare
 * "kontaktovat" used to be listed here, so "You can contact us at
 * support@example.com" – a perfectly good answer – counted as a failure. Bare
 * apologies had the same problem: an answer can open with "I'm sorry to hear
 * that" and still answer the question. Both are now matched only in the forms
 * that actually signal a refusal.
 */
export const FAILURE_INDICATORS = [
  // English
  "i don't know",
  "i do not know",
  "i don't have enough information",
  "i do not have enough information",
  "not in the documents",
  "is not mentioned",
  "no information",
  "i cannot help",
  "i can't help",
  "i am unable to answer",
  "i'm unable to answer",
  "i apologize, but",
  "i'm sorry, but i",
  "i am sorry, but i",
  "information is not available",
  "outside my database",
  "cannot perform a live search",
  "i recommend contacting",

  // Czech
  "nemám dostatečné informace",
  "nejsou uvedeny informace",
  "není v dokumentech",
  "neposkytuje informace",
  "není možné odpovědět",
  "nejsou k dispozici údaje",
  "nemám přístup",
  "není zmíněno",
  "chybí informace",
  "nemohu provádět živé vyhledávání",
  "nemohu získávat aktuální informace",
  "mimo svou databázi",
  "doporučuji se obrátit",
  "nemám informace",
  "nejsou dostupné informace",
  "nelze najít údaje",
  "informace nejsou k dispozici",
  "omlouvám se, ale",
  "nemohu vám pomoci",
  "nedokážu odpovědět",
  "tuto informaci nemám",
  "žádné informace"
];

/**
 * The application's own fallback answers.
 *
 * FAILURE_INDICATORS above are phrases a *model* writes when it cannot answer.
 * These are the strings DocuSage itself substitutes when there is nothing to
 * answer from, the model returned nothing, or the provider call threw - and none
 * of them matched any indicator, which is worth stating plainly: the platform
 * did not recognise its own failure messages as failures.
 *
 * They are kept separate rather than appended to the list above for one
 * concrete reason: findRelevantChunksAndRespond already records a failure
 * explicitly before returning the no-information message, so treating that
 * message as an indicator too would write the same failure twice.
 *
 * Sourced from server/prompts.ts and documentProcessor. Change them there and
 * here together.
 */
export const OWN_FALLBACK_ANSWERS = [
  'i could not find information relevant to your question',
  'failed to generate an answer',
  'an error occurred while generating the answer',
];

/**
 * Checks whether the answer contains failure indicators
 */
export function isFailedResponse(response: string): boolean {
  const lowerResponse = response.toLowerCase();
  return FAILURE_INDICATORS.some(indicator => 
    lowerResponse.includes(indicator.toLowerCase())
  );
}

/**
 * Whether the visitor got an answer they can use.
 *
 * Broader than isFailedResponse, which only covers phrases the model produced.
 * This also catches the application's own fallbacks, because from the visitor's
 * side "I could not find that" and "an error occurred" are the same event: they
 * asked something and got nothing.
 *
 * Used to decide whether to offer a contact form. Not used for the failure log,
 * which would double-count - see the note on OWN_FALLBACK_ANSWERS.
 */
export function isUnhelpfulAnswer(response: string): boolean {
  if (isFailedResponse(response)) return true;

  const lowerResponse = response.toLowerCase();
  return OWN_FALLBACK_ANSWERS.some((phrase) => lowerResponse.includes(phrase));
}

/**
 * Derives the failure reason from the answer
 */
export function getFailureReason(response: string): string {
  const lowerResponse = response.toLowerCase();
  const matches = (...phrases: string[]) =>
    phrases.some((phrase) => lowerResponse.includes(phrase));

  // Ordered from most specific to least, in every supported language.
  if (matches("not in the documents", "is not mentioned", "není v dokumentech", "chybí informace")) {
    return "missing_in_documents";
  }
  if (matches("no information", "i don't have enough information", "i do not have enough information",
              "information is not available", "nemám informace", "nemám přístup")) {
    return "insufficient_information";
  }
  if (matches("i cannot help", "i can't help", "i am unable to answer", "i'm unable to answer",
              "i don't know", "i do not know", "nemohu", "nedokážu")) {
    return "unable_to_respond";
  }
  if (matches("i apologize, but", "i'm sorry, but i", "i am sorry, but i", "omlouvám se, ale")) {
    return "apologetic_response";
  }

  return "general_failure";
}

/**
 * Records an unsuccessful answer in the database
 */
export async function logFailedResponse(
  projectId: number,
  sessionId: number | undefined,
  userQuery: string,
  aiResponse: string,
  chunksFound: number = 0,
  documentsSearched: number = 0
): Promise<void> {
  try {
    const failureReason = getFailureReason(aiResponse);
    
    await db.insert(failedResponses).values({
      projectId,
      sessionId: sessionId || null,
      userQuery,
      aiResponse,
      failureReason,
      chunksFound,
      documentsSearched,
      isResolved: false,
      createdAt: new Date()
    });
    
    console.log(`[FailureDetection] Recorded an unsuccessful answer for project ${projectId}: ${failureReason}`);
  } catch (error) {
    console.error('[FailureDetection] Error recording the unsuccessful answer:', error);
  }
}

/**
 * Checks the answer and records it as unsuccessful if appropriate
 */
export async function checkAndLogFailedResponse(
  response: string,
  projectId: number,
  sessionId: number | undefined,
  userQuery: string,
  chunksFound: number = 0,
  documentsSearched: number = 0
): Promise<void> {
  console.log(`[FAILURE DETECTION] Checking: "${response.substring(0, 100)}..."`);
  console.log(`[FAILURE DETECTION] Project: ${projectId}, Session: ${sessionId}`);
  
  const isFailed = isFailedResponse(response);
  console.log(`[FAILURE DETECTION] Is it unsuccessful? ${isFailed}`);
  
  if (isFailed) {
    console.log(`[FAILURE DETECTION] ✅ RECORDED as an unsuccessful answer!`);
    await logFailedResponse(projectId, sessionId, userQuery, response, chunksFound, documentsSearched);
  } else {
    console.log(`[FAILURE DETECTION] ❌ The answer is considered successful`);
  }
}