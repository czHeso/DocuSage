import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Lead capture against a real PostgreSQL.
 *
 * Skipped unless TEST_DATABASE_URL points at a database whose schema has been
 * created with `npm run db:push`.
 *
 *   TEST_DATABASE_URL=postgresql://postgres:pw@127.0.0.1:5432/docusage_test npm test
 *
 * The database is written to, so never point this at anything you care about.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (TEST_DATABASE_URL) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
}

const runIntegration = TEST_DATABASE_URL ? describe : describe.skip;

runIntegration("leads against a real database", () => {
  let storage: typeof import("./storage").storage;
  let insertLeadSchema: typeof import("@shared/schema").insertLeadSchema;

  let ownerId: number;
  let otherUserId: number;
  let projectId: number;

  beforeAll(async () => {
    storage = (await import("./storage")).storage;
    insertLeadSchema = (await import("@shared/schema")).insertLeadSchema;

    const suffix = `${process.pid}_${Date.now().toString(36)}`;

    const owner = await storage.createUser({
      email: `leadowner_${suffix}@example.test`,
      username: `leadowner_${suffix}`,
      password: "irrelevant",
      isActive: true,
    } as any);
    ownerId = owner.id;

    const other = await storage.createUser({
      email: `leadother_${suffix}@example.test`,
      username: `leadother_${suffix}`,
      password: "irrelevant",
      isActive: true,
    } as any);
    otherUserId = other.id;

    const project = await storage.createProject({ name: `lead test ${suffix}` } as any, ownerId);
    projectId = project.id;
  });

  afterAll(async () => {
    // Projects, and therefore leads, cascade from the user.
    for (const id of [ownerId, otherUserId]) {
      if (id) await storage.deleteUser(id);
    }
  });

  it("stores a lead and returns it on the project", async () => {
    const lead = await storage.createLead({
      projectId,
      email: "zakaznik@example.test",
      name: "Jana Nováková",
      message: "Potřebuji poradit se smlouvou.",
      unansweredQuestion: "Jak vypovím smlouvu?",
    });

    expect(lead.id).toBeGreaterThan(0);
    // A fresh lead has been dealt with by nobody, and nobody has been told.
    expect(lead.status).toBe("new");
    expect(lead.notifiedAt).toBeNull();
    expect(lead.handledAt).toBeNull();

    const leads = await storage.getLeads(projectId);
    expect(leads.map((l) => l.id)).toContain(lead.id);
  });

  it("keeps the unanswered question, so the lead means something on its own", async () => {
    const lead = await storage.createLead({
      projectId,
      email: "otazka@example.test",
      unansweredQuestion: "Máte pobočku v Brně?",
    });

    const stored = await storage.getLead(lead.id);
    expect(stored.unansweredQuestion).toBe("Máte pobočku v Brně?");
  });

  it("returns the newest lead first", async () => {
    const first = await storage.createLead({ projectId, email: "first@example.test" });
    const second = await storage.createLead({ projectId, email: "second@example.test" });

    const leads = await storage.getLeads(projectId);
    const firstIndex = leads.findIndex((l) => l.id === first.id);
    const secondIndex = leads.findIndex((l) => l.id === second.id);

    expect(secondIndex).toBeLessThan(firstIndex);
  });

  it("counts only the leads nobody has picked up", async () => {
    const before = await storage.countNewLeads(projectId);
    const lead = await storage.createLead({ projectId, email: "counted@example.test" });

    expect(await storage.countNewLeads(projectId)).toBe(before + 1);

    await storage.updateLeadStatus(lead.id, "contacted", ownerId);
    expect(await storage.countNewLeads(projectId)).toBe(before);
  });

  it("records who moved a lead, and clears that when it goes back to new", async () => {
    const lead = await storage.createLead({ projectId, email: "status@example.test" });

    const contacted = await storage.updateLeadStatus(lead.id, "contacted", otherUserId);
    expect(contacted.status).toBe("contacted");
    expect(contacted.handledById).toBe(otherUserId);
    expect(contacted.handledAt).toBeInstanceOf(Date);

    // Reopening must not leave a timestamp claiming somebody dealt with
    // something that is open again.
    const reopened = await storage.updateLeadStatus(lead.id, "new", otherUserId);
    expect(reopened.status).toBe("new");
    expect(reopened.handledAt).toBeNull();
  });

  it("marks a lead as notified separately from being handled", async () => {
    const lead = await storage.createLead({ projectId, email: "notified@example.test" });

    await storage.markLeadNotified(lead.id);
    const stored = await storage.getLead(lead.id);

    expect(stored.notifiedAt).toBeInstanceOf(Date);
    // Being emailed about is not the same as being dealt with.
    expect(stored.status).toBe("new");
  });

  it("deletes a lead", async () => {
    const lead = await storage.createLead({ projectId, email: "gone@example.test" });

    await storage.deleteLead(lead.id);

    expect(await storage.getLead(lead.id)).toBeUndefined();
  });

  it("survives the conversation it came from being deleted", async () => {
    const session = await storage.createChatSession({ projectId, visitorId: "visitor_lead_test" });
    const lead = await storage.createLead({
      projectId,
      sessionId: session.id,
      email: "outlives@example.test",
      unansweredQuestion: "Kdy máte otevřeno?",
    });

    // Sessions are deleted after thirty days by the cleanup job. The lead is
    // the thing worth keeping, so the reference is nulled rather than cascaded.
    await storage.deleteChatSession(session.id);

    const stored = await storage.getLead(lead.id);
    expect(stored).toBeDefined();
    expect(stored.sessionId).toBeNull();
    expect(stored.unansweredQuestion).toBe("Kdy máte otevřeno?");
  });

  describe("validation, which is all there is for an anonymous submission", () => {
    const base = { projectId: 1, email: "someone@example.test" };

    it("requires an email address that looks like one", () => {
      expect(insertLeadSchema.safeParse(base).success).toBe(true);
      expect(insertLeadSchema.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
      expect(insertLeadSchema.safeParse({ ...base, email: "" }).success).toBe(false);
      expect(insertLeadSchema.safeParse({ projectId: 1 }).success).toBe(false);
    });

    it("accepts the optional fields as absent", () => {
      const parsed = insertLeadSchema.safeParse({ ...base, name: null, message: null });
      expect(parsed.success).toBe(true);
    });

    it("caps the free-text fields", () => {
      // Nothing else limits how much a stranger can write into the database.
      expect(insertLeadSchema.safeParse({ ...base, message: "x".repeat(2001) }).success).toBe(false);
      expect(insertLeadSchema.safeParse({ ...base, name: "x".repeat(201) }).success).toBe(false);
      expect(insertLeadSchema.safeParse({ ...base, email: `${"x".repeat(320)}@e.test` }).success).toBe(false);
    });

    it("ignores fields a submitter must not set", () => {
      const parsed = insertLeadSchema.safeParse({
        ...base,
        status: "closed",
        notifiedAt: new Date(),
        handledById: 1,
      });

      expect(parsed.success).toBe(true);
      // Omitted from the schema, so they cannot be smuggled in through the
      // public endpoint's body.
      expect(parsed.success && "status" in parsed.data).toBe(false);
      expect(parsed.success && "notifiedAt" in parsed.data).toBe(false);
      expect(parsed.success && "handledById" in parsed.data).toBe(false);
    });
  });
});
