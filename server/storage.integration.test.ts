import { describe, it, expect, afterAll } from "vitest";

/**
 * Integration tests against a real PostgreSQL.
 *
 * Skipped unless TEST_DATABASE_URL points at a database whose schema has been
 * created with `npm run db:push`. CI provides one as a service container; to run
 * these locally, export the variable yourself:
 *
 *   TEST_DATABASE_URL=postgresql://postgres:pw@127.0.0.1:5432/docusage_test npm test
 *
 * The database is written to, so never point this at anything you care about.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

// server/db.ts reads DATABASE_URL when it is first imported, so it has to be set
// before any import below pulls it in.
if (TEST_DATABASE_URL) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const runIntegration = TEST_DATABASE_URL ? describe : describe.skip;

runIntegration("storage against a real database", () => {
  let storage: typeof import("./storage").storage;
  let comparePasswords: typeof import("./auth").comparePasswords;
  const createdUserIds: number[] = [];

  const unique = () => `test_${process.pid}_${createdUserIds.length}_${performance.now().toString(36).replace(".", "")}`;

  async function load() {
    if (!storage) {
      storage = (await import("./storage")).storage;
      comparePasswords = (await import("./auth")).comparePasswords;
    }
  }

  afterAll(async () => {
    if (!storage) return;
    for (const id of createdUserIds) {
      await storage.deleteUser(id).catch(() => undefined);
    }
  });

  /**
   * The bug this exists for: /api/register hashed the password and then handed
   * the result to storage.createUser, which hashed it again. Registration
   * returned 201 and the session from it worked, so nothing looked wrong — but
   * the stored value was hash(hash(password)) and the account could never log
   * in again. Only a round trip through the real storage layer catches it.
   */
  it("stores a password that the login comparison then accepts", async () => {
    await load();

    const username = unique();
    const plainPassword = "a-password-worth-keeping-42";

    const user = await storage.createUser({
      username,
      email: `${username}@example.test`,
      password: plainPassword,
      role: "user",
      isActive: true,
    });
    createdUserIds.push(user.id);

    expect(user.password).not.toBe(plainPassword);
    expect(user.password).toMatch(/^[0-9a-f]{128}\.[0-9a-f]{32}$/);
    expect(await comparePasswords(plainPassword, user.password)).toBe(true);
    expect(await comparePasswords("something else", user.password)).toBe(false);
  });

  it("keeps a changed password usable and retires the old one", async () => {
    await load();

    const username = unique();
    const user = await storage.createUser({
      username,
      email: `${username}@example.test`,
      password: "first-password-1",
      role: "user",
      isActive: true,
    });
    createdUserIds.push(user.id);

    expect(await storage.changeUserPassword(user.id, "second-password-2")).toBe(true);

    const updated = await storage.getUser(user.id);
    expect(updated).toBeDefined();
    expect(await comparePasswords("second-password-2", updated!.password)).toBe(true);
    expect(await comparePasswords("first-password-1", updated!.password)).toBe(false);
  });

  it("finds a user by username and by email alike, as login does", async () => {
    await load();

    const username = unique();
    const email = `${username}@example.test`;
    const user = await storage.createUser({
      username,
      email,
      password: "lookup-password-3",
      role: "user",
      isActive: true,
    });
    createdUserIds.push(user.id);

    expect((await storage.getUserByUsername(username))?.id).toBe(user.id);
    expect((await storage.getUserByEmail(email))?.id).toBe(user.id);
  });
});
