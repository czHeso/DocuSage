import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * The monthly message cap against a real PostgreSQL.
 *
 * Skipped unless TEST_DATABASE_URL points at a database whose schema has been
 * created with `npm run db:push`.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (TEST_DATABASE_URL) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const runIntegration = TEST_DATABASE_URL ? describe : describe.skip;

runIntegration("embed guards against a real database", () => {
  let storage: typeof import("../storage").storage;
  let db: typeof import("../db").db;
  let sql: typeof import("drizzle-orm").sql;
  let guards: typeof import("./embedGuards");

  let userId: number;
  let projectId: number;
  let sessionId: number;

  beforeAll(async () => {
    storage = (await import("../storage")).storage;
    db = (await import("../db")).db;
    sql = (await import("drizzle-orm")).sql;
    guards = await import("./embedGuards");

    const suffix = `${process.pid}_${Date.now().toString(36)}`;

    const user = await storage.createUser({
      email: `guards_${suffix}@example.test`,
      username: `guards_${suffix}`,
      password: "irrelevant",
      isActive: true,
    } as any);
    userId = user.id;

    const project = await storage.createProject({ name: `guards ${suffix}` } as any, userId);
    projectId = project.id;

    const session = await storage.createChatSession({ projectId, visitorId: "guard_visitor" });
    sessionId = session.id;
  });

  afterAll(async () => {
    if (userId) await storage.deleteUser(userId);
  });

  it("counts visitor messages and ignores the chatbot's replies", async () => {
    await storage.createChatMessage({ sessionId, content: "Otázka?", isFromUser: true });
    await storage.createChatMessage({ sessionId, content: "Odpověď.", isFromUser: false });
    await storage.createChatMessage({ sessionId, content: "Další otázka?", isFromUser: true });

    // Counting replies as well would halve everybody's limit for a reason
    // nobody could guess from the setting's name.
    expect(await guards.messagesThisMonth(projectId)).toBe(2);
  });

  it("ignores messages from a previous month", async () => {
    await db.execute(sql`
      INSERT INTO chat_messages (session_id, content, is_from_user, created_at)
      VALUES (${sessionId}, 'Loňská otázka', true, now() - interval '45 days')
    `);

    expect(await guards.messagesThisMonth(projectId)).toBe(2);
  });

  it("counts nothing for a project with no conversations", async () => {
    const other = await storage.createProject({ name: "guards empty" } as any, userId);
    expect(await guards.messagesThisMonth(other.id)).toBe(0);
  });

  it("lets a request through when the project configured nothing", async () => {
    // The default for every project that exists today. It must not start
    // failing because this code shipped.
    const rejection = await guards.checkEmbedRequest(
      { id: projectId, allowedDomains: null, monthlyMessageLimit: 0 },
      { origin: "https://anywhere.example" },
    );

    expect(rejection).toBeNull();
  });

  it("refuses a request from a domain that is not on the list", async () => {
    const rejection = await guards.checkEmbedRequest(
      { id: projectId, allowedDomains: "example.com", monthlyMessageLimit: 0 },
      { origin: "https://someone-elses-site.test" },
    );

    expect(rejection?.status).toBe(403);
    // Naming the allowed domains would hand somebody probing the token the list
    // of places it does work.
    expect(rejection?.message).not.toContain("example.com");
  });

  it("allows a request from a listed domain", async () => {
    expect(
      await guards.checkEmbedRequest(
        { id: projectId, allowedDomains: "example.com", monthlyMessageLimit: 0 },
        { origin: "https://www.example.com" },
      ),
    ).toBeNull();
  });

  it("refuses once the monthly limit is reached", async () => {
    const rejection = await guards.checkEmbedRequest(
      { id: projectId, allowedDomains: null, monthlyMessageLimit: 2 },
      { origin: "https://example.com" },
    );

    // Two visitor messages exist, and the limit is two.
    expect(rejection?.status).toBe(429);
  });

  it("allows a request while the project is under its limit", async () => {
    expect(
      await guards.checkEmbedRequest(
        { id: projectId, allowedDomains: null, monthlyMessageLimit: 100 },
        { origin: "https://example.com" },
      ),
    ).toBeNull();
  });

  it("checks the domain before spending a query on the count", async () => {
    // A rejected origin should not cost a database round trip, and more
    // importantly the 403 must win: telling a stranger which of the two limits
    // they hit is more than they need to know.
    const rejection = await guards.checkEmbedRequest(
      { id: projectId, allowedDomains: "example.com", monthlyMessageLimit: 1 },
      { origin: "https://someone-elses-site.test" },
    );

    expect(rejection?.status).toBe(403);
  });
});
