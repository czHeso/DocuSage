import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRateLimiter } from "./rateLimit";
import { forLog } from "./logSafe";
import type { Request, Response, NextFunction } from "express";

function call(limiter: ReturnType<typeof createRateLimiter>, ip: string) {
  const headers: Record<string, string> = {};
  let status = 0;
  let body: any;
  let passed = false;

  const req = { ip } as Request;
  const res = {
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as unknown as Response;

  limiter(req, res, (() => {
    passed = true;
  }) as NextFunction);

  return { headers, status, body, passed };
}

describe("createRateLimiter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("lets through exactly the allowed number of requests", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });

    expect(call(limiter, "1.1.1.1").passed).toBe(true);
    expect(call(limiter, "1.1.1.1").passed).toBe(true);
    expect(call(limiter, "1.1.1.1").passed).toBe(true);

    const blocked = call(limiter, "1.1.1.1");
    expect(blocked.passed).toBe(false);
    expect(blocked.status).toBe(429);
  });

  it("counts each caller separately", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

    expect(call(limiter, "1.1.1.1").passed).toBe(true);
    // A second visitor must not be blocked by the first one's traffic.
    expect(call(limiter, "2.2.2.2").passed).toBe(true);
    expect(call(limiter, "1.1.1.1").passed).toBe(false);
  });

  it("starts a fresh window once the old one has passed", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });

    expect(call(limiter, "1.1.1.1").passed).toBe(true);
    expect(call(limiter, "1.1.1.1").passed).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(call(limiter, "1.1.1.1").passed).toBe(true);
  });

  it("tells the caller what the limit is and when it resets", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });

    const first = call(limiter, "1.1.1.1");
    expect(first.headers["RateLimit-Limit"]).toBe("2");
    expect(first.headers["RateLimit-Remaining"]).toBe("1");

    call(limiter, "1.1.1.1");
    const blocked = call(limiter, "1.1.1.1");

    expect(blocked.headers["RateLimit-Remaining"]).toBe("0");
    expect(Number(blocked.headers["Retry-After"])).toBeGreaterThan(0);
  });

  it("can key on something other than the IP", () => {
    // The per-project quota work will need this: one busy site must not use up
    // another site's allowance just because they share a proxy.
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 1,
      keyOf: (req) => (req as any).body?.token ?? "none",
    });

    const withToken = (token: string) => {
      const req = { ip: "1.1.1.1", body: { token } } as unknown as Request;
      let passed = false;
      limiter(req, { setHeader() {}, status() { return this; }, json() { return this; } } as unknown as Response, (() => {
        passed = true;
      }) as NextFunction);
      return passed;
    };

    expect(withToken("a")).toBe(true);
    expect(withToken("b")).toBe(true);
    expect(withToken("a")).toBe(false);
  });

  it("forgets callers whose window has expired", () => {
    const limiter = createRateLimiter({ windowMs: 1_000, max: 1 });

    for (let i = 0; i < 100; i++) {
      call(limiter, `10.0.0.${i}`);
    }

    vi.advanceTimersByTime(61_000);

    // Nothing observable to assert on directly - the point is that the sweep
    // runs without throwing and the limiter still works afterwards.
    expect(call(limiter, "10.0.0.1").passed).toBe(true);
  });
});

describe("forLog", () => {
  it("keeps ordinary text as it is", () => {
    expect(forLog("Jaká je splatnost faktury?")).toBe("Jaká je splatnost faktury?");
  });

  it("stops a forged log line", () => {
    // Without escaping, this writes what looks like a second log entry.
    const forged = forLog('x\n2026-01-01 [express] POST /api/admin/users 200');

    expect(forged).not.toContain("\n");
    expect(forged).toContain("\\n");
  });

  it("handles every newline convention", () => {
    expect(forLog("a\r\nb")).toBe("a\\nb");
    expect(forLog("a\rb")).toBe("a\\nb");
    expect(forLog("a\nb")).toBe("a\\nb");
  });

  it("removes control characters that would rewrite a terminal", () => {
    // An ANSI escape sequence in a question would otherwise be interpreted by
    // whatever terminal is tailing the log.
    expect(forLog("a\u001B[2Kb")).toBe("a[2Kb");
    expect(forLog("a\u0000b")).toBe("ab");
    expect(forLog("a\u007Fb")).toBe("ab");
  });

  it("truncates a very long value", () => {
    const long = "a".repeat(500);
    const result = forLog(long);

    expect(result.length).toBeLessThanOrEqual(201);
    expect(result.endsWith("…")).toBe(true);
  });

  it("survives values that are not strings", () => {
    expect(forLog(null)).toBe("null");
    expect(forLog(undefined)).toBe("undefined");
    expect(forLog(42)).toBe("42");
  });
});
