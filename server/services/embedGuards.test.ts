import { describe, it, expect } from "vitest";
import { parseAllowedDomains, isOriginAllowed, requestOrigin } from "./embedGuards";

describe("parseAllowedDomains", () => {
  it("splits a comma-separated list", () => {
    expect(parseAllowedDomains("example.com, example.org")).toEqual(["example.com", "example.org"]);
  });

  it("copes with how people actually type a domain", () => {
    // A setting that silently fails because of a trailing slash is worse than
    // no setting at all.
    expect(parseAllowedDomains("https://example.com/")).toEqual(["example.com"]);
    expect(parseAllowedDomains("http://example.com:8080/path")).toEqual(["example.com"]);
    expect(parseAllowedDomains("  EXAMPLE.COM  ")).toEqual(["example.com"]);
  });

  it("accepts newlines and spaces as separators too", () => {
    expect(parseAllowedDomains("example.com\nexample.org example.net")).toEqual([
      "example.com",
      "example.org",
      "example.net",
    ]);
  });

  it("treats empty as no list", () => {
    expect(parseAllowedDomains("")).toEqual([]);
    expect(parseAllowedDomains(null)).toEqual([]);
    expect(parseAllowedDomains(undefined)).toEqual([]);
    expect(parseAllowedDomains(" , , ")).toEqual([]);
  });
});

describe("isOriginAllowed", () => {
  it("allows anything when no list is configured", () => {
    // Every existing project has no list, and none of them may start failing.
    expect(isOriginAllowed("https://anywhere.example", [])).toBe(true);
    expect(isOriginAllowed(undefined, [])).toBe(true);
  });

  it("allows a listed domain", () => {
    expect(isOriginAllowed("https://example.com", ["example.com"])).toBe(true);
    expect(isOriginAllowed("https://example.com:443", ["example.com"])).toBe(true);
    expect(isOriginAllowed("http://example.com/page", ["example.com"])).toBe(true);
  });

  it("treats www as the same site", () => {
    // Writing one and meaning the other is the likeliest way to configure this
    // wrongly, and they are the same site in every practical sense.
    expect(isOriginAllowed("https://www.example.com", ["example.com"])).toBe(true);
  });

  it("does not treat a lookalike domain as the same site", () => {
    expect(isOriginAllowed("https://notexample.com", ["example.com"])).toBe(false);
    expect(isOriginAllowed("https://example.com.evil.test", ["example.com"])).toBe(false);
    expect(isOriginAllowed("https://evil.test/?x=example.com", ["example.com"])).toBe(false);
  });

  it("does not let a bare entry cover arbitrary subdomains", () => {
    // Only www is folded in. A customer's staging subdomain is a decision for
    // whoever wrote the list, not for this function.
    expect(isOriginAllowed("https://shop.example.com", ["example.com"])).toBe(false);
  });

  it("covers subdomains when asked to", () => {
    expect(isOriginAllowed("https://shop.example.com", ["*.example.com"])).toBe(true);
    expect(isOriginAllowed("https://deep.shop.example.com", ["*.example.com"])).toBe(true);
    expect(isOriginAllowed("https://example.com", ["*.example.com"])).toBe(false);
    expect(isOriginAllowed("https://notexample.com", ["*.example.com"])).toBe(false);
  });

  it("refuses a page opened from the filesystem once a list exists", () => {
    // Browsers send the literal string "null" for a file:// page. It is not on
    // anybody's allowlist.
    expect(isOriginAllowed("null", ["example.com"])).toBe(false);
  });

  it("refuses a request with no origin at all once a list exists", () => {
    // A browser always sends one on a cross-origin POST. Something that does
    // not is not the widget, and the point of the list is to stop exactly that.
    expect(isOriginAllowed(undefined, ["example.com"])).toBe(false);
    expect(isOriginAllowed("", ["example.com"])).toBe(false);
  });

  it("checks every entry, not only the first", () => {
    expect(isOriginAllowed("https://example.org", ["example.com", "example.org"])).toBe(true);
  });
});

describe("requestOrigin", () => {
  it("prefers the Origin header", () => {
    expect(
      requestOrigin({ origin: "https://example.com", referer: "https://elsewhere.test/page" }),
    ).toBe("https://example.com");
  });

  it("falls back to Referer when Origin is missing", () => {
    expect(requestOrigin({ referer: "https://example.com/page" })).toBe("https://example.com/page");
  });

  it("returns nothing when neither is present", () => {
    expect(requestOrigin({})).toBeUndefined();
    expect(requestOrigin({ origin: "" })).toBeUndefined();
  });
});
