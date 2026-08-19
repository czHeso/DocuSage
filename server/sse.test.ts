import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openSseStream } from "./sse";
import type { Response } from "express";

/**
 * A stand-in for an Express response that records what was written, so the
 * framing can be asserted byte for byte. Getting the framing subtly wrong is
 * the failure mode worth guarding: a missing blank line does not throw, it just
 * means the browser never fires the event.
 */
function fakeResponse() {
  const written: string[] = [];
  const listeners: Record<string, Array<() => void>> = {};

  const res = {
    headers: {} as Record<string, string>,
    ended: false,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    flushHeaders: vi.fn(),
    write(chunk: string) {
      written.push(chunk);
      return true;
    },
    end() {
      this.ended = true;
    },
    on(event: string, handler: () => void) {
      (listeners[event] ??= []).push(handler);
    },
  };

  return {
    res: res as unknown as Response,
    written,
    output: () => written.join(""),
    emit: (event: string) => (listeners[event] ?? []).forEach((handler) => handler()),
    raw: res,
  };
}

describe("openSseStream", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sets the headers that keep a stream a stream", () => {
    const fake = fakeResponse();
    openSseStream(fake.res);

    expect(fake.raw.headers["Content-Type"]).toBe("text/event-stream; charset=utf-8");
    expect(fake.raw.headers["Cache-Control"]).toContain("no-cache");
    // Without this, nginx buffers the whole answer and streaming silently
    // degrades into a slow non-streamed response.
    expect(fake.raw.headers["X-Accel-Buffering"]).toBe("no");
    expect(fake.raw.flushHeaders).toHaveBeenCalled();
  });

  it("frames an event as a name, a payload and a blank line", () => {
    const fake = fakeResponse();
    const stream = openSseStream(fake.res);

    stream.send("delta", { text: "ahoj" });

    expect(fake.output()).toBe('event: delta\ndata: {"text":"ahoj"}\n\n');
  });

  it("keeps a payload containing newlines on one data line", () => {
    // A multi-line `data:` field is legal SSE but means something different -
    // the newline is stripped by the parser. JSON.stringify escapes it, and this
    // asserts the encoded payload stays a single line.
    const fake = fakeResponse();
    const stream = openSseStream(fake.res);

    stream.send("delta", { text: "první\ndruhý" });

    const body = fake.output();
    expect(body.split("\n").filter((line) => line.startsWith("data:"))).toHaveLength(1);
    expect(body).toContain("\\n");
  });

  it("sends a terminating event and ends the response", () => {
    const fake = fakeResponse();
    const stream = openSseStream(fake.res);

    stream.close("done", { sessionId: 7 });

    expect(fake.output()).toContain('event: done\ndata: {"sessionId":7}');
    expect(fake.raw.ended).toBe(true);
    expect(stream.closed()).toBe(true);
  });

  it("reports the client leaving, so the caller can stop generating", () => {
    const fake = fakeResponse();
    const stream = openSseStream(fake.res);

    expect(stream.send("delta", { text: "a" })).toBe(true);
    fake.emit("close");

    expect(stream.closed()).toBe(true);
    expect(stream.send("delta", { text: "b" })).toBe(false);
  });

  it("writes a keep-alive comment while nothing else is being sent", () => {
    const fake = fakeResponse();
    openSseStream(fake.res);

    vi.advanceTimersByTime(31_000);

    // Comments start with ':' and are ignored by EventSource - they exist only
    // to stop a proxy dropping a connection that is waiting on retrieval.
    expect(fake.written.filter((chunk) => chunk.startsWith(":"))).toHaveLength(2);
  });

  it("stops the keep-alive once the stream is closed", () => {
    const fake = fakeResponse();
    const stream = openSseStream(fake.res);

    stream.close();
    vi.advanceTimersByTime(60_000);

    expect(fake.written.filter((chunk) => chunk.startsWith(":"))).toHaveLength(0);
  });
});
