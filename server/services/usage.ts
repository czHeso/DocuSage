/**
 * Recording what the chatbot spends.
 *
 * The project owner pays their provider directly with their own key. Before
 * this, nothing in DocuSage recorded how many tokens that took: `api_calls`
 * logs the public API's HTTP traffic, `query_performance` logs latency, and
 * neither of them logs the number that turns into money.
 *
 * Two decisions worth stating up front.
 *
 * **Tokens are stored, money is not.** Prices change, and a stored figure
 * silently becomes a claim about history nobody can check. The price table below
 * is applied when a report is read, and it is dated.
 *
 * **The project is carried in async context, not through 21 function
 * signatures.** Provider calls happen in three files, from functions that mostly
 * do not know which project they are serving - `processWithOpenAI(prompt, model,
 * apiKey)` has no idea. Threading an id through all of them would be several
 * hundred lines of plumbing, and any site missed would under-report silently.
 * AsyncLocalStorage means each call site needs one line and a missed *entry*
 * point degrades to "unattributed", which is visible, rather than to a wrong
 * total, which is not.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db.js";
import { usageEvents } from "../../shared/schema.js";

/** What a provider call was for. */
export type UsageKind =
  | "chunking"
  | "chunk_selection"
  | "answer"
  | "embedding"
  | "conversation"
  | "other";

export interface UsageTokens {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface UsageContext {
  projectId: number;
}

const usageContext = new AsyncLocalStorage<UsageContext>();

/**
 * Runs `body` with provider usage attributed to a project.
 *
 * Wrap request handlers and background jobs in this. Anything inside — however
 * deep, however many awaits — records against this project.
 */
export function withUsageTracking<T>(projectId: number, body: () => Promise<T>): Promise<T> {
  return usageContext.run({ projectId }, body);
}

/**
 * Attributes provider usage to a project for the rest of this request.
 *
 * The one-line alternative to wrapping a handler body in withUsageTracking.
 * `enterWith` sets the store for the remainder of the current synchronous
 * execution and everything asynchronous that follows from it, which in an
 * Express handler means "this request" - each request runs in its own async
 * context chain, so one request cannot see another's.
 *
 * Use withUsageTracking instead for background work, where there is no request
 * boundary to rely on.
 */
export function attributeUsageTo(projectId: number): void {
  usageContext.enterWith({ projectId });
}

/** The project usage is currently attributed to, if any. */
export function currentUsageProjectId(): number | undefined {
  return usageContext.getStore()?.projectId;
}

/**
 * Prices per million tokens, in US dollars.
 *
 * **Checked against provider pricing pages in August 2026.** They will go out of
 * date; every figure a report shows is labelled an estimate for that reason, and
 * this is the one table to edit. A model that is not listed contributes tokens to
 * the totals and nothing to the cost, which is why a report says how many of its
 * tokens it could price.
 *
 * Keys are matched by longest prefix, so "gpt-4o-2026-01-01" is priced as
 * "gpt-4o" without needing a row per dated release.
 */
export const MODEL_PRICES_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4": { input: 30, output: 60 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
  "gemini-1.5-pro": { input: 1.25, output: 5 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  "gemini-pro": { input: 0.5, output: 1.5 },
};

/** The date the price table was last checked, shown alongside every estimate. */
export const PRICES_CHECKED = "2026-08";

/**
 * Records one provider call.
 *
 * Never throws and never blocks the answer: a failure to write a usage row must
 * not fail the request that earned it. Returns false when there was nothing to
 * record or nowhere to record it against.
 */
export async function recordUsage(options: {
  provider: string;
  model: string;
  kind: UsageKind;
  tokens: UsageTokens | null;
  /** Overrides the async context, for callers that already know the project. */
  projectId?: number;
}): Promise<boolean> {
  const projectId = options.projectId ?? currentUsageProjectId();

  if (!projectId || !options.tokens) return false;

  const { promptTokens, completionTokens, totalTokens } = options.tokens;
  if (totalTokens <= 0 && promptTokens <= 0 && completionTokens <= 0) return false;

  try {
    await db.insert(usageEvents).values({
      projectId,
      provider: options.provider || "unknown",
      model: options.model || "unknown",
      kind: options.kind,
      promptTokens,
      completionTokens,
      totalTokens: totalTokens || promptTokens + completionTokens,
    });
    return true;
  } catch (error) {
    console.warn("[usage] Could not record provider usage:", error);
    return false;
  }
}

/**
 * Reads the token counts out of an OpenAI-compatible response.
 *
 * Azure speaks the same shape. Returns null when the field is absent, which
 * happens on streamed responses unless usage is explicitly requested - better
 * to record nothing than to record zeros that look like a free call.
 */
export function tokensFromOpenAI(response: any): UsageTokens | null {
  const usage = response?.usage;
  if (!usage) return null;

  const promptTokens = Number(usage.prompt_tokens ?? 0);
  const completionTokens = Number(usage.completion_tokens ?? 0);

  return {
    promptTokens,
    completionTokens,
    totalTokens: Number(usage.total_tokens ?? promptTokens + completionTokens),
  };
}

/** Reads the token counts out of a Google Generative AI response. */
export function tokensFromGoogle(result: any): UsageTokens | null {
  const usage = result?.response?.usageMetadata ?? result?.usageMetadata;
  if (!usage) return null;

  const promptTokens = Number(usage.promptTokenCount ?? 0);
  const completionTokens = Number(usage.candidatesTokenCount ?? 0);

  return {
    promptTokens,
    completionTokens,
    totalTokens: Number(usage.totalTokenCount ?? promptTokens + completionTokens),
  };
}

/**
 * The price of a model, by longest matching prefix.
 *
 * Azure deployment names are chosen by whoever created the deployment and often
 * contain the model name, so the same prefix match usually works there too.
 */
export function priceFor(model: string): { input: number; output: number } | null {
  const normalized = (model || "").toLowerCase();

  const match = Object.keys(MODEL_PRICES_PER_MILLION)
    .filter((key) => normalized.includes(key))
    .sort((a, b) => b.length - a.length)[0];

  return match ? MODEL_PRICES_PER_MILLION[match] : null;
}

/** Dollar cost of one row, or null when the model is not in the table. */
export function estimateCost(row: {
  model: string;
  promptTokens: number;
  completionTokens: number;
}): number | null {
  const price = priceFor(row.model);
  if (!price) return null;

  return (
    (row.promptTokens / 1_000_000) * price.input +
    (row.completionTokens / 1_000_000) * price.output
  );
}

export interface UsageBreakdownRow {
  model: string;
  provider: string;
  kind: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
  /** Null when the model is not in the price table. */
  estimatedCostUsd: number | null;
}

export interface UsageReport {
  days: number;
  since: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  calls: number;
  /** Summed over the rows that could be priced. */
  estimatedCostUsd: number;
  /**
   * Tokens belonging to models the price table does not know. Reported so the
   * cost figure can be read as "at least this much" rather than as a total.
   */
  unpricedTokens: number;
  pricesCheckedOn: string;
  byKind: UsageBreakdownRow[];
  daily: Array<{ date: string; totalTokens: number; estimatedCostUsd: number }>;
}

/**
 * Token usage and estimated cost for a project over the last `days` days.
 */
export async function usageReport(projectId: number, days = 30): Promise<UsageReport> {
  const boundedDays = Math.min(365, Math.max(1, Math.floor(days)));
  const since = new Date(Date.now() - boundedDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      provider: usageEvents.provider,
      model: usageEvents.model,
      kind: usageEvents.kind,
      promptTokens: sql<number>`sum(${usageEvents.promptTokens})::int`,
      completionTokens: sql<number>`sum(${usageEvents.completionTokens})::int`,
      totalTokens: sql<number>`sum(${usageEvents.totalTokens})::int`,
      calls: sql<number>`count(*)::int`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.projectId, projectId), gte(usageEvents.createdAt, since)))
    .groupBy(usageEvents.provider, usageEvents.model, usageEvents.kind);

  const byKind: UsageBreakdownRow[] = rows.map((row) => ({
    ...row,
    estimatedCostUsd: estimateCost(row),
  }));

  const dailyRows = await db
    .select({
      date: sql<string>`to_char(date_trunc('day', ${usageEvents.createdAt}), 'YYYY-MM-DD')`,
      model: usageEvents.model,
      promptTokens: sql<number>`sum(${usageEvents.promptTokens})::int`,
      completionTokens: sql<number>`sum(${usageEvents.completionTokens})::int`,
      totalTokens: sql<number>`sum(${usageEvents.totalTokens})::int`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.projectId, projectId), gte(usageEvents.createdAt, since)))
    .groupBy(sql`date_trunc('day', ${usageEvents.createdAt})`, usageEvents.model)
    .orderBy(sql`date_trunc('day', ${usageEvents.createdAt})`);

  // Grouped by model in SQL so each day's cost uses the right price, then
  // collapsed to one entry per day for the chart.
  const dailyByDate = new Map<string, { totalTokens: number; estimatedCostUsd: number }>();
  for (const row of dailyRows) {
    const entry = dailyByDate.get(row.date) ?? { totalTokens: 0, estimatedCostUsd: 0 };
    entry.totalTokens += row.totalTokens;
    entry.estimatedCostUsd += estimateCost(row) ?? 0;
    dailyByDate.set(row.date, entry);
  }

  return {
    days: boundedDays,
    since: since.toISOString(),
    totalTokens: byKind.reduce((sum, row) => sum + row.totalTokens, 0),
    promptTokens: byKind.reduce((sum, row) => sum + row.promptTokens, 0),
    completionTokens: byKind.reduce((sum, row) => sum + row.completionTokens, 0),
    calls: byKind.reduce((sum, row) => sum + row.calls, 0),
    estimatedCostUsd: byKind.reduce((sum, row) => sum + (row.estimatedCostUsd ?? 0), 0),
    unpricedTokens: byKind
      .filter((row) => row.estimatedCostUsd === null)
      .reduce((sum, row) => sum + row.totalTokens, 0),
    pricesCheckedOn: PRICES_CHECKED,
    byKind,
    // Array.from rather than a spread: without an explicit ES2015+ target,
    // TypeScript will not iterate a Map.
    daily: Array.from(dailyByDate.entries()).map(([date, entry]) => ({ date, ...entry })),
  };
}
