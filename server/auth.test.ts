import { describe, it, expect, beforeEach } from "vitest";
import {
  hashPassword,
  comparePasswords,
  toPublicUser,
  isEmailDomainAllowed,
  recordFailedLogin,
  clearFailedLogins,
  loginRateLimiter,
} from "./auth";

describe("password hashing", () => {
  it("accepts the password it was given", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await comparePasswords("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await comparePasswords("Correct horse battery staple", stored)).toBe(false);
    expect(await comparePasswords("", stored)).toBe(false);
  });

  it("salts each hash, so the same password stores differently twice", async () => {
    const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
    expect(a).not.toBe(b);
    expect(await comparePasswords("same", a)).toBe(true);
    expect(await comparePasswords("same", b)).toBe(true);
  });

  it("produces the documented <hash>.<salt> shape", async () => {
    const stored = await hashPassword("whatever");
    expect(stored).toMatch(/^[0-9a-f]{128}\.[0-9a-f]{32}$/);
  });

  /**
   * Regression guard. Registration used to hash the password and then hand it
   * to storage.createUser, which hashed it a second time. The account was
   * created and the response looked fine, but no later login could ever match.
   */
  it("does not match a password that was hashed twice", async () => {
    const once = await hashPassword("secret123");
    const twice = await hashPassword(once);
    expect(await comparePasswords("secret123", twice)).toBe(false);
  });

  /**
   * Logins used to fall back to a plaintext comparison, which meant a stored
   * value of "admin123" let anyone in with that password. Only the salted
   * format may ever be accepted.
   */
  it("refuses every format other than <hash>.<salt>", async () => {
    for (const legacy of ["admin123", "", "no-dot-here", ".", "abc.", ".def"]) {
      expect(await comparePasswords("admin123", legacy)).toBe(false);
    }
  });

  it("survives a stored hash of the wrong length instead of throwing", async () => {
    // timingSafeEqual throws on mismatched buffer lengths; the guard must catch it.
    await expect(comparePasswords("x", "abcd.0123456789abcdef0123456789ab")).resolves.toBe(false);
  });
});

describe("toPublicUser", () => {
  it("strips every secret before a user reaches an API response", () => {
    const user = {
      id: 1,
      username: "someone",
      email: "someone@example.com",
      password: "9f8e7d.0123456789abcdef",
      role: "admin",
      isActive: true,
      activationToken: "activation-token",
      resetPasswordToken: "reset-token",
      resetPasswordExpires: new Date(),
    } as any;

    const publicUser = toPublicUser(user) as Record<string, unknown>;

    for (const secret of ["password", "activationToken", "resetPasswordToken", "resetPasswordExpires"]) {
      expect(publicUser).not.toHaveProperty(secret);
    }
    expect(publicUser.username).toBe("someone");
    expect(publicUser.role).toBe("admin");
  });
});

describe("isEmailDomainAllowed", () => {
  it("allows anything when no restriction is configured", () => {
    // ALLOWED_EMAIL_DOMAINS is empty unless the env var is set.
    expect(isEmailDomainAllowed("anyone@anywhere.example")).toBe(true);
  });
});

/** Minimal Express stand-ins – the limiter only reads the IP and writes a status. */
function fakeReq(ip: string) {
  return { ip, headers: {}, socket: { remoteAddress: ip } } as any;
}
function fakeRes() {
  const res: any = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined,
    setHeader(k: string, v: string) { res.headers[k] = v; },
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.body = payload; return res; },
  };
  return res;
}

describe("login rate limiting", () => {
  beforeEach(() => {
    clearFailedLogins(fakeReq("10.0.0.1"));
    clearFailedLogins(fakeReq("10.0.0.2"));
  });

  it("lets attempts through below the limit", () => {
    const req = fakeReq("10.0.0.1");
    for (let i = 0; i < 9; i++) recordFailedLogin(req);

    let passed = false;
    loginRateLimiter(req, fakeRes(), () => { passed = true; });
    expect(passed).toBe(true);
  });

  it("blocks with 429 and a Retry-After header once the limit is reached", () => {
    const req = fakeReq("10.0.0.1");
    for (let i = 0; i < 10; i++) recordFailedLogin(req);

    const res = fakeRes();
    let passed = false;
    loginRateLimiter(req, res, () => { passed = true; });

    expect(passed).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.headers["Retry-After"]).toMatch(/^\d+$/);
  });

  it("counts per IP, so one attacker cannot lock everyone out", () => {
    const attacker = fakeReq("10.0.0.1");
    for (let i = 0; i < 10; i++) recordFailedLogin(attacker);

    let innocentPassed = false;
    loginRateLimiter(fakeReq("10.0.0.2"), fakeRes(), () => { innocentPassed = true; });
    expect(innocentPassed).toBe(true);
  });

  it("forgets the failures after a successful login", () => {
    const req = fakeReq("10.0.0.1");
    for (let i = 0; i < 10; i++) recordFailedLogin(req);
    clearFailedLogins(req);

    let passed = false;
    loginRateLimiter(req, fakeRes(), () => { passed = true; });
    expect(passed).toBe(true);
  });
});
