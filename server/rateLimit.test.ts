import { describe, it, expect, afterEach } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { embedChatRateLimit } from "./rateLimit";

/**
 * The limiter is exercised through a real Express app rather than by calling
 * the middleware with fake objects. What is worth checking is the configuration
 * - the window, the limit, the headers it advertises - and that only shows up
 * once the library is actually wired into a route.
 */
describe("embedChatRateLimit", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server!.close(resolve));
      server = undefined;
    }
  });

  async function start(): Promise<string> {
    const app = express();
    // Matches the application: exactly one trusted hop. `true` would let any
    // caller set X-Forwarded-For and hand themselves a fresh counter, and
    // express-rate-limit rejects that configuration outright.
    app.set("trust proxy", 1);
    app.post("/chat", embedChatRateLimit, (_req, res) => {
      res.json({ ok: true });
    });

    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server!.once("listening", resolve));
    const { port } = server!.address() as AddressInfo;
    return `http://127.0.0.1:${port}/chat`;
  }

  /** Each caller needs a distinct IP: the counter is shared across tests. */
  const post = (url: string, ip: string) =>
    fetch(url, { method: "POST", headers: { "X-Forwarded-For": ip } });

  it("allows a normal conversation through", async () => {
    const url = await start();

    // Well inside the limit of 20 a minute - nobody types this fast, but a
    // handful of quick follow-up questions must not be blocked.
    for (let i = 0; i < 5; i++) {
      const response = await post(url, "203.0.113.1");
      expect(response.status).toBe(200);
    }
  });

  it("blocks a caller that keeps going, and says when to retry", async () => {
    const url = await start();
    const ip = "203.0.113.2";

    let blocked: Response | undefined;
    for (let i = 0; i < 25; i++) {
      const response = await post(url, ip);
      if (response.status === 429) {
        blocked = response;
        break;
      }
    }

    expect(blocked).toBeDefined();
    expect(await blocked!.json()).toMatchObject({ message: expect.stringContaining("Too many") });
    expect(blocked!.headers.get("retry-after")).toBeTruthy();
  });

  it("counts each caller separately", async () => {
    const url = await start();

    // Exhaust one address entirely.
    for (let i = 0; i < 25; i++) {
      await post(url, "203.0.113.3");
    }

    // A visitor on a different address must be unaffected by that traffic.
    const other = await post(url, "203.0.113.4");
    expect(other.status).toBe(200);
  });

  it("advertises the limit in the standard headers", async () => {
    const url = await start();
    const response = await post(url, "203.0.113.5");

    // draft-8 puts both in one RateLimit header rather than the older
    // X-RateLimit-* trio.
    expect(response.headers.get("ratelimit")).toContain("r=");
    expect(response.headers.get("ratelimit-policy")).toBeTruthy();
  });
});
