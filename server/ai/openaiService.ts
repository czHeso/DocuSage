/**
 * Fallback answer generation via OpenAI.
 *
 * Used where the main path through `services/documentProcessor` fails or is
 * unavailable (semantic search over chunks) — typically
 * when the project has no API key of its own or no relevant chunks could be found.
 * chunks. Unlike the main path, it sends the entire document content into the prompt
 * truncated to `contextSize`.
 */
import { getOpenAIClient } from "../openaiModel";
import { recordUsage, tokensFromOpenAI } from "../services/usage";
import { DOCUMENT_QA_PROMPT, RESPONSE_STYLE_INSTRUCTIONS, DOCUMENT_CONTEXT_LABELS } from "../prompts";

type ChatRole = "system" | "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** A history message as returned by `storage.getChatMessages()`. */
interface StoredChatMessage {
  content: string;
  isFromUser: boolean;
}

export interface OpenAIGenerateOptions {
  /** Influences the length and level of detail of the answer. */
  responseStyle?: "concise" | "detailed" | "balanced" | string;
  /** Custom system prompt; takes precedence over the default. */
  customPrompt?: string | null;
  /** Maximum number of context characters taken from the documents. */
  contextSize?: number;
  /** 0–1; defaults to 0.5. */
  temperature?: number;
  /** Conversation history for follow-up questions. */
  chatHistory?: StoredChatMessage[];
  /** Enables including `chatHistory` in the prompt. */
  useConversationalMode?: boolean;
  /** The project's API key; without it, OPENAI_API_KEY from the environment is used. */
  apiKey?: string;
  model?: string;
}

const DEFAULT_CONTEXT_SIZE = 2000;
const MAX_HISTORY_MESSAGES = 10;

const STYLE_INSTRUCTIONS = RESPONSE_STYLE_INSTRUCTIONS;

/**
 * Builds the context from documents and truncates it to `contextSize` characters.
 * Accepts both a map `{ fileName: content }` and a plain array of texts.
 */
function buildContext(
  documents: Record<string, string> | string[],
  contextSize: number,
): string {
  const parts = Array.isArray(documents)
    ? documents.filter(Boolean)
    : Object.entries(documents)
        .filter(([, content]) => Boolean(content))
        .map(([filename, content]) => `--- ${filename} ---\n${content}`);

  const context = parts.join("\n\n");
  if (context.length <= contextSize) {
    return context;
  }
  return `${context.slice(0, contextSize)}\n\n${DOCUMENT_CONTEXT_LABELS.truncated}`;
}

/**
 * Generates an answer to a query using the document contents.
 *
 * @param query User query
 * @param documents Document contents – a map `name -> text` or an array of texts
 * @returns The answer text
 * @throws When the OpenAI call fails (missing key, network, quota)
 */
export async function openaiGenerateResponse(
  query: string,
  documents: Record<string, string> | string[],
  options: OpenAIGenerateOptions = {},
): Promise<string> {
  const {
    responseStyle = "balanced",
    customPrompt,
    contextSize = DEFAULT_CONTEXT_SIZE,
    temperature = 0.5,
    chatHistory = [],
    useConversationalMode = false,
    apiKey,
    model = "gpt-3.5-turbo",
  } = options;

  const client = getOpenAIClient(apiKey);
  const context = buildContext(documents, contextSize);

  const systemPrompt =
    customPrompt ||
    [
      DOCUMENT_QA_PROMPT,
      STYLE_INSTRUCTIONS[responseStyle] || STYLE_INSTRUCTIONS.balanced,
    ].join(" ");

  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }];

  if (useConversationalMode && chatHistory.length > 0) {
    for (const message of chatHistory.slice(-MAX_HISTORY_MESSAGES)) {
      messages.push({
        role: message.isFromUser ? "user" : "assistant",
        content: message.content,
      });
    }
  }

  messages.push({
    role: "user",
    content: context
      ? `${DOCUMENT_CONTEXT_LABELS.question}: ${query}\n\n${DOCUMENT_CONTEXT_LABELS.contextFromDocuments}:\n${context}`
      : `${DOCUMENT_CONTEXT_LABELS.question}: ${query}`,
  });

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: 1500,
    });

    await recordUsage({
      provider: "openai",
      model: response.model || "unknown",
      kind: "conversation",
      tokens: tokensFromOpenAI(response),
    });

    return response.choices[0]?.message?.content || "";
  } catch (error: any) {
    console.error(
      "Error generating an answer via OpenAI (fallback):",
      error.message,
    );
    throw new Error(`Failed to generate an answer: ${error.message}`);
  }
}
