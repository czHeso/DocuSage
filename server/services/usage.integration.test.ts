import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Usage recording and reporting against a real PostgreSQL.
 *
 * Skipped unless TEST_DATABASE_URL points at a database whose schema has been
 * created with `npm run db:push`.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (TEST_DATABASE_URL) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const runIntegration = TEST_DATABASE_URL ? describe : describe.skip;

runIntegration("usage recording and reporting", () => {
  let storage: typeof import("../storage").storage;
  let db: typeof import("../db").db;
  let sql: typeof import("drizzle-orm").sql;
  let usage: typeof import("./usage");

  let userId: number;
  let projectId: number;
  let otherProjectId: number;

  beforeAll(async () => {
    storage = (await import("../storage")).storage;
    db = (await import("../db")).db;
    sql = (await import("drizzle-orm")).sql;
    usage = await import("./usage");

    const suffix = `${process.pid}_${Date.now().toString(36)}`;

    const user = await storage.createUser({
      email: `usage_${suffix}@example.test`,
      username: `usage_${suffix}`,
      password: "irrelevant",
      isActive: true,
    } as any);
    userId = user.id;

    projectId = (await storage.createProject({ name: `usage ${suffix}` } as any, userId)).id;
    otherProjectId = (await storage.createProject({ name: `usage other ${suffix}` } as any, userId)).id;
  });

  afterAll(async () => {
    if (userId) await storage.deleteUser(userId);
  });

  it("records a call against the project in context, without being told which", async () => {
    const recorded = await usage.withUsageTracking(projectId, async () => {
      // No projectId passed - this is the point of the async context.
      return usage.recordUsage({
        provider: "openai",
        model: "gpt-4o",
        kind: "answer",
        tokens: { promptTokens: 1000, completionTokens: 200, totalTokens: 1200 },
      });
    });

    expect(recorded).toBe(true);

    const report = await usage.usageReport(projectId);
    expect(report.totalTokens).toBe(1200);
    expect(report.calls).toBe(1);
  });

  it("records nothing when there is no project in context", async () => {
    const recorded = await usage.recordUsage({
      provider: "openai",
      model: "gpt-4o",
      kind: "answer",
      tokens: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });

    // Better an unattributed call that is not recorded than a call recorded
    // against the wrong project.
    expect(recorded).toBe(false);
  });

  it("records nothing when the provider reported no usage", async () => {
    const recorded = await usage.withUsageTracking(projectId, () =>
      usage.recordUsage({ provider: "openai", model: "gpt-4o", kind: "answer", tokens: null }),
    );

    expect(recorded).toBe(false);
  });

  it("breaks the total down by what the tokens were spent on", async () => {
    await usage.withUsageTracking(projectId, async () => {
      await usage.recordUsage({
        provider: "openai",
        model: "gpt-4o",
        kind: "chunking",
        tokens: { promptTokens: 5000, completionTokens: 1000, totalTokens: 6000 },
      });
      await usage.recordUsage({
        provider: "openai",
        model: "text-embedding-3-small",
        kind: "embedding",
        tokens: { promptTokens: 800, completionTokens: 0, totalTokens: 800 },
      });
    });

    const report = await usage.usageReport(projectId);
    const kinds = report.byKind.map((row) => row.kind);

    // "Why is this expensive" is usually answered by "uploading documents",
    // which is a one-off, rather than "answering questions", which is not.
    expect(kinds).toContain("chunking");
    expect(kinds).toContain("embedding");
    expect(kinds).toContain("answer");
  });

  it("prices each model at its own rate", async () => {
    const report = await usage.usageReport(projectId);

    const answer = report.byKind.find((row) => row.kind === "answer")!;
    const embedding = report.byKind.find((row) => row.kind === "embedding")!;

    expect(answer.estimatedCostUsd).toBeGreaterThan(0);
    // An embedding of comparable size costs orders of magnitude less, and the
    // report has to show that rather than one blended rate.
    expect(embedding.estimatedCostUsd!).toBeLessThan(answer.estimatedCostUsd!);
    expect(report.estimatedCostUsd).toBeGreaterThan(0);
  });

  it("counts tokens it cannot price separately, so the total is not understated silently", async () => {
    await usage.withUsageTracking(projectId, () =>
      usage.recordUsage({
        provider: "openai",
        model: "some-model-nobody-has-priced",
        kind: "answer",
        tokens: { promptTokens: 10_000, completionTokens: 10_000, totalTokens: 20_000 },
      }),
    );

    const report = await usage.usageReport(projectId);

    expect(report.unpricedTokens).toBe(20_000);
    // The cost figure reads as "at least this much" and the report says why.
    expect(report.totalTokens).toBeGreaterThan(report.unpricedTokens);
  });

  it("keeps one project's spend out of another's report", async () => {
    await usage.withUsageTracking(otherProjectId, () =>
      usage.recordUsage({
        provider: "google",
        model: "gemini-1.5-pro",
        kind: "answer",
        tokens: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
      }),
    );

    const other = await usage.usageReport(otherProjectId);
    expect(other.totalTokens).toBe(200);

    const mine = await usage.usageReport(projectId);
    expect(mine.byKind.some((row) => row.provider === "google")).toBe(false);
  });

  it("returns an empty report for a project that has spent nothing", async () => {
    const empty = await usage.usageReport(await freshProjectId());

    expect(empty.totalTokens).toBe(0);
    expect(empty.calls).toBe(0);
    expect(empty.estimatedCostUsd).toBe(0);
    expect(empty.byKind).toEqual([]);
    expect(empty.daily).toEqual([]);
  });

  it("groups by day and says which prices it used", async () => {
    const report = await usage.usageReport(projectId, 7);

    expect(report.days).toBe(7);
    expect(report.daily.length).toBeGreaterThan(0);
    expect(report.daily[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Shown next to every figure, because the figure is only as good as this.
    expect(report.pricesCheckedOn).toMatch(/^\d{4}-\d{2}$/);
  });

  it("clamps a silly day count instead of scanning everything", async () => {
    expect((await usage.usageReport(projectId, 0)).days).toBe(1);
    expect((await usage.usageReport(projectId, 99_999)).days).toBe(365);
  });

  it("ignores rows older than the window", async () => {
    await db.execute(sql`
      INSERT INTO usage_events (project_id, provider, model, kind, prompt_tokens, completion_tokens, total_tokens, created_at)
      VALUES (${projectId}, 'openai', 'gpt-4o', 'answer', 999999, 999999, 1999998, now() - interval '40 days')
    `);

    const report = await usage.usageReport(projectId, 30);
    expect(report.totalTokens).toBeLessThan(1_000_000);

    const wider = await usage.usageReport(projectId, 60);
    expect(wider.totalTokens).toBeGreaterThan(1_000_000);
  });

  async function freshProjectId(): Promise<number> {
    const project = await storage.createProject({ name: "usage empty" } as any, userId);
    return project.id;
  }
});
