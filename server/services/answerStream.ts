/**
 * Token streaming for answer generation.
 *
 * The answer to a grounded question takes a while: retrieval, a selection call,
 * then generation. Waiting for all of it before showing anything means five to
 * ten seconds of a blinking cursor. Streaming does not make it faster, it makes
 * the wait legible — the visitor sees the answer being written.
 *
 * Only the final generation step streams. Retrieval and chunk selection produce
 * no text worth showing, and streaming them would leak the internals of the
 * search into the widget.
 */
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

/** Called for every piece of text the model produces. */
export type TokenSink = (delta: string) => void;

export interface StreamOptions {
  prompt: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  /** Required for Azure, ignored elsewhere. */
  azureEndpoint?: string | null;
  /** Aborts the provider call when the client goes away mid-answer. */
  signal?: AbortSignal;
}

/**
 * How long a stream may produce nothing before it is treated as dead.
 *
 * The non-streaming path uses a single 180 s deadline for the whole call, which
 * cannot be reused here: a long answer legitimately takes longer than a short
 * one, and the thing actually worth detecting is a provider that has stopped
 * sending. Measuring the gap between chunks does that and puts no ceiling on
 * the total length.
 */
const IDLE_TIMEOUT_MS = 60_000;

/** Providers that can stream. Anything else falls back to a single response. */
export function supportsStreaming(provider: string | null | undefined): boolean {
  return provider === "openai" || provider === "azure" || provider === "google";
}

/**
 * Streams an answer, calling `onToken` as text arrives.
 *
 * Resolves with the complete text once the provider is done, so the caller can
 * store the answer without having to reassemble it from the callback.
 */
export async function streamAnswer(options: StreamOptions, provider: string, onToken: TokenSink): Promise<string> {
  switch (provider) {
    case "azure":
      return streamOpenAICompatible(azureClient(options), options, onToken);
    case "google":
      return streamGoogle(options, onToken);
    case "openai":
    default:
      return streamOpenAICompatible(new OpenAI({ apiKey: options.apiKey }), options, onToken);
  }
}

function azureClient(options: StreamOptions): OpenAI {
  if (!options.azureEndpoint) {
    throw new Error("The Azure provider needs an endpoint to stream from.");
  }

  return new OpenAI({
    apiKey: options.apiKey,
    baseURL: `${options.azureEndpoint}/openai/deployments/${options.model}`,
    defaultQuery: { "api-version": "2024-02-15-preview" },
    defaultHeaders: { "api-key": options.apiKey },
  });
}

async function streamOpenAICompatible(client: OpenAI, options: StreamOptions, onToken: TokenSink): Promise<string> {
  const stream = await client.chat.completions.create(
    {
      // Same substitution the non-streaming path makes: 'gpt-4' is the value
      // stored by older projects and is not a current model id.
      model: options.model === "gpt-4" ? "gpt-4o" : options.model,
      messages: [{ role: "user", content: options.prompt }],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
    },
    { signal: options.signal },
  );

  let answer = "";

  await withIdleTimeout(async (touch) => {
    for await (const part of stream) {
      const delta = part.choices[0]?.delta?.content;
      if (!delta) continue;
      answer += delta;
      onToken(delta);
      touch();
    }
  });

  return answer;
}

async function streamGoogle(options: StreamOptions, onToken: TokenSink): Promise<string> {
  const genAI = new GoogleGenerativeAI(options.apiKey);
  const model = genAI.getGenerativeModel({
    model: options.model === "gemini-pro" ? "gemini-1.5-pro" : options.model,
    generationConfig: {
      temperature: options.temperature,
      maxOutputTokens: options.maxTokens,
    },
  });

  const result = await model.generateContentStream(options.prompt);

  let answer = "";

  await withIdleTimeout(async (touch) => {
    for await (const part of result.stream) {
      const delta = part.text();
      if (!delta) continue;
      answer += delta;
      onToken(delta);
      touch();
    }
  });

  return answer;
}

/**
 * Runs `body`, rejecting if it goes IDLE_TIMEOUT_MS without calling `touch`.
 *
 * The timer is not cancelled by the body finishing — `Promise.race` leaves the
 * loser running — so it is cleared in a finally block. Without that a finished
 * request would keep a timer alive for a minute.
 */
async function withIdleTimeout(body: (touch: () => void) => Promise<void>): Promise<void> {
  let timer: NodeJS.Timeout;
  let rejectIdle: (error: Error) => void;

  const idle = new Promise<never>((_, reject) => {
    rejectIdle = reject;
  });

  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => rejectIdle(new Error("The AI provider stopped sending data.")), IDLE_TIMEOUT_MS);
  };

  touch();

  try {
    await Promise.race([body(touch), idle]);
  } finally {
    clearTimeout(timer!);
  }
}
