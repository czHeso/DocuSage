import { describe, it, expect } from "vitest";
import { isValidEmailShape } from "./auth";

/**
 * The check that replaced a regular expression on the unauthenticated
 * registration endpoint. The cases below are the ones the old pattern was
 * written for, so a change here that starts rejecting a real address would show
 * up rather than being discovered by a user who cannot sign up.
 */
describe("isValidEmailShape", () => {
  it("accepts ordinary addresses", () => {
    for (const address of [
      "someone@example.com",
      "first.last@example.co.uk",
      "user+tag@example.org",
      "jana@sub.domain.example.cz",
    ]) {
      expect(isValidEmailShape(address), address).toBe(true);
    }
  });

  it("rejects what is not an address", () => {
    for (const value of ["", "no-at-sign", "two@@example.com", "spaced out@example.com", "@example.com", "user@"]) {
      expect(isValidEmailShape(value), JSON.stringify(value)).toBe(false);
    }
  });

  it("rejects a value that is not a string at all", () => {
    // A request body can carry anything. The old pattern test coerced these to
    // strings first, so `{}` became "[object Object]" and was compared as text.
    for (const value of [undefined, null, 42, {}, [], { toString: () => "a@b.cz" }]) {
      expect(isValidEmailShape(value), JSON.stringify(value)).toBe(false);
    }
  });

  it("rejects an address over the length limit", () => {
    const long = `${"a".repeat(310)}@example.com`;
    expect(long.length).toBeGreaterThan(320);
    expect(isValidEmailShape(long)).toBe(false);
  });

  it("returns promptly on the input the old pattern backtracked on", () => {
    // The shape that made /^[^\s@]+@[^\s@]+\.[^\s@]+$/ quadratic: an @, then a
    // long run of dots, then a character the pattern cannot accept, so the two
    // adjacent [^\s@]+ groups have to try every way of splitting the run before
    // giving up. Measured against the old pattern: 8.6 ms at 2,000 dots, 33 ms
    // at 4,000, 133 ms at 8,000. The request body limit is 200 kb, so a single
    // field could carry enough to hold the event loop for over a minute.
    const adversarial = `!@${".".repeat(40_000)} `;

    const started = process.hrtime.bigint();
    expect(isValidEmailShape(adversarial)).toBe(false);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    // The old pattern needs roughly three seconds on this input. A length check
    // needs none of it, and 250 ms leaves room for a slow CI machine.
    expect(elapsedMs).toBeLessThan(250);
  });
});
