/**
 * Default system prompts used by the AI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS THE ONE PLACE TO EDIT THE CHATBOT'S DEFAULT BEHAVIOUR AND LANGUAGE.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every prompt here is only a FALLBACK. A project's own prompt, set in
 * "Chatbot settings" in the UI (column `projects.default_prompt`), always wins.
 * These constants apply to projects that have not set one.
 *
 * To make the chatbot answer in another language, translate the strings below –
 * or, better, just set the prompt per project in the UI. See docs/CUSTOMIZATION.md.
 */

/**
 * The chatbot's main personality, used by the embedded widget and the public API.
 *
 * The wording deliberately forbids phrases such as "according to the documents",
 * so the answers read naturally instead of like a search result.
 */
export const CONVERSATIONAL_ASSISTANT_PROMPT =
  'You are a friendly and helpful assistant. You speak naturally, like a person, without technical phrasing. ' +
  'STRICTLY FORBIDDEN: never, under any circumstances, use phrases such as "in the documents", "according to the documentation", ' +
  '"in the provided files", "in the PDF", "in the provided documents", "based on the available information", "from the context", ' +
  'or any other similar references to sources. ' +
  'Answer directly and naturally, as if the information were your own knowledge. ' +
  'Avoid formal and technical phrasing. Use a friendly, conversational tone. ' +
  'If you do not know the answer, simply say "I am sorry, but I do not know the answer to that" and NOTHING MORE.';

/** Short fallback used where no richer prompt is configured. */
export const SIMPLE_ASSISTANT_PROMPT = 'You are a helpful AI assistant.';

/** Fallback for the generic chat completion helper. */
export const GENERAL_ASSISTANT_PROMPT =
  'You are a helpful AI assistant specialised in providing information and answering questions.';

/**
 * Sentence appended to the system prompt according to the project's
 * "response style" setting (Advanced training options in the UI).
 */
export const RESPONSE_STYLE_INSTRUCTIONS: Record<string, string> = {
  concise: 'Answer briefly and to the point, ideally in a few sentences.',
  detailed:
    'Answer in detail, explain the context, and include specific details from the documents.',
  balanced: 'Answer clearly and with a reasonable level of detail.',
};

/** Labels used when assembling the fallback prompt from documents. */
export const DOCUMENT_CONTEXT_LABELS = {
  question: 'Question',
  contextFromDocuments: 'Context from the documents',
  truncated: '[...context was truncated...]',
} as const;

/** Fallback for plain text generation (no documents involved). */
export const CONCISE_ASSISTANT_PROMPT =
  'You are a useful and helpful assistant. Answer concisely but informatively. ' +
  'If you do not know the answer, admit it instead of making information up.';

/**
 * Prompt for answering strictly from supplied documents.
 * Used by the fallback path that sends whole documents into the prompt.
 */
export const DOCUMENT_QA_PROMPT =
  'You are an assistant specialised in answering questions using the provided documents. ' +
  'Use only information from the provided documents. If the documents do not contain enough ' +
  'information to answer the question, say honestly that you do not have enough information.';

/**
 * Prompt for the two-stage semantic search path (DocumentProcessor).
 *
 * Note the explicit instruction about the answer language: without it the model
 * tends to mirror the language of the documents rather than the user's question.
 */
export const SEMANTIC_ANSWER_PROMPT =
  'Answer the user\'s question based on the provided information from the documents and the context ' +
  'of the previous conversation. If the information is not in the documents, say so clearly. ' +
  'Answer in the same language the user used and continue naturally from the previous conversation.';

/**
 * Added to the answer prompt when the project has citations switched on.
 *
 * The instruction is deliberately blunt about the marker format. Models are
 * happy to invent "(see the invoicing manual, page 12)" if left to their own
 * devices, and prose like that cannot be turned back into a link to the actual
 * document - only a marker matching a numbered source can.
 */
export const CITATION_INSTRUCTION =
  'Each piece of information below is numbered. After every claim you take from ' +
  'a source, put its number in square brackets, like [1]. Use several markers ' +
  'when a sentence draws on several sources, like [1][3]. Use only the numbers ' +
  'listed below, never invent one, and do not write the name of the document ' +
  'into the text - the number is enough.';

/**
 * Labels used to assemble the prompt sent to the model in the semantic search path.
 * Translate these together with SEMANTIC_ANSWER_PROMPT.
 */
export const SEMANTIC_PROMPT_LABELS = {
  conversationContext: 'CONTEXT OF THE PREVIOUS CONVERSATION',
  availableInformation: 'AVAILABLE INFORMATION FROM THE DOCUMENTS',
  currentQuestion: 'CURRENT QUESTION',
  answer: 'ANSWER',
} as const;

/* -------------------------------------------------------------------------- */
/* Document processing prompts                                                */
/*                                                                            */
/* These instruct the model how to split an uploaded document into chunks and */
/* how to pick the relevant ones. They are internal machinery – changing them */
/* changes retrieval quality, so edit with care and test on a real document.  */
/* -------------------------------------------------------------------------- */

/** Short chunking instruction used for documents that fit in one request. */
export const CHUNKING_SHORT_PROMPT = (content: string) =>
  `Split the text into 2-4 blocks. Return JSON only:
[{"topic": "name", "content": "full text", "summary": "summary", "keywords": ["word1"], "pageRange": "1"}]

TEXT:
${content}`;

/** Detailed chunking instruction with explicit rules. */
export const CHUNKING_DETAILED_PROMPT = (content: string) =>
  `Split the following text into logical topical blocks. Each block should contain one coherent idea or topic.

RULES:
- Block size: 500-1000 words
- Blocks should cover distinct topics/chapters
- Give each block a short topic name
- Write a summary of each block (max 100 words)
- Pick 3-5 keywords for each block

Return the answer ONLY as a JSON array, with no additional commentary:
[
  {
    "topic": "Topic name",
    "content": "Full block content...",
    "summary": "Short block summary",
    "keywords": ["key1", "key2", "key3"],
    "pageRange": "1-3"
  }
]

TEXT TO SPLIT:
${content}`;

/** Chunking instruction for one segment of a long document. */
export const CHUNKING_SEGMENT_PROMPT = (segment: string, pageRange: string) =>
  `Analyse this document segment and split it into logical topical blocks. IMPORTANT: preserve ALL content without shortening it.

RULES:
- Create 2-4 blocks depending on the segment content
- Each block must contain the ENTIRE relevant text from the segment
- Give each block a descriptive topic name
- Write a summary for each block (max 200 words)
- Pick 3-5 keywords for each block
- Do NOT shorten or omit any content

Return the answer ONLY as a JSON array:
[
  {
    "topic": "Topic name",
    "content": "The ENTIRE relevant block text, not shortened...",
    "summary": "Block summary",
    "keywords": ["key1", "key2", "key3"],
    "pageRange": "${pageRange}"
  }
]

SEGMENT TO ANALYSE:
${segment}`;

/** Instruction for picking the most relevant chunks for a query. */
export const CHUNK_SELECTION_PROMPT = (query: string, blockList: string) =>
  `Based on the following query, pick the 3 most relevant blocks from the available documents.

USER QUERY: "${query}"

AVAILABLE BLOCKS:
${blockList}

Return only the numbers of the selected blocks separated by commas (e.g. "0,2,5"). Pick at most 3 of the most relevant blocks.`;

/** Short variant of the selection instruction used by the universal AI path. */
export const CHUNK_SELECTION_SHORT_PROMPT =
  'Pick the 2-4 most relevant blocks for answering the user\'s question.';

/** Tail of the selection prompt: the question plus the ranked candidate blocks. */
export const CHUNK_SELECTION_CANDIDATES_PROMPT = (query: string, candidates: string) =>
  `

CURRENT QUESTION: "${query}"

CANDIDATE BLOCKS (ordered by relevance and document weight):
${candidates}

Pick the 3-4 most relevant blocks for a complete answer. If the topic concerns one specific process or service, pick the related blocks too.
Answer: block numbers separated by commas:`;

/** Labels for the candidate block listing in the selection prompt. */
export const CHUNK_CANDIDATE_LABELS = {
  keywords: 'Keywords',
  page: 'Page',
  documentWeight: 'Document weight',
  score: 'score',
  none: 'none',
} as const;

/** Shown when no relevant chunk is found for the query. */
export const NO_RELEVANT_INFORMATION_MESSAGE =
  'I could not find information relevant to your question in the uploaded documents.';

/** Shown when the model returns nothing at all. */
export const ANSWER_GENERATION_FAILED_MESSAGE = 'Failed to generate an answer.';

/**
 * Strict answer prompt for the ChatGPT-only path: answer from the supplied data
 * and nothing else.
 */
export const STRICT_ANSWER_PROMPT = (systemPrompt: string, query: string, context: string) =>
  `${systemPrompt}

Answer the following question EXCLUSIVELY on the basis of the supplied data. If the information is not in the data, say "I don't know" or "That information is not in the documents".

QUESTION: "${query}"

AVAILABLE DATA:
${context}

Answer the question directly, without referring to specific blocks or sections. Give a coherent, natural answer.`;
