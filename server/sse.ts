/**
 * Server-sent events.
 *
 * SSE rather than WebSockets: the traffic is one-directional (the answer flows
 * to the browser, the question arrives as an ordinary POST), it survives proxies
 * that do not upgrade connections, and it needs no new dependency. A widget
 * running on somebody else's site behind their CDN is exactly the case where a
 * WebSocket upgrade tends not to survive.
 */
import type { Response } from "express";

export interface SseStream {
  /** Sends one named event with a JSON payload. Returns false once the client is gone. */
  send(event: string, data: unknown): boolean;
  /** Sends a terminating event and closes the connection. */
  close(event?: string, data?: unknown): void;
  /** True once the client has disconnected. */
  closed(): boolean;
}

/**
 * How often to send a comment line when nothing else is being sent.
 *
 * Proxies and load balancers close connections they consider idle, and the gap
 * between the question arriving and the first token can be several seconds of
 * retrieval. A comment is ignored by EventSource but keeps the socket warm.
 */
const HEARTBEAT_MS = 15_000;

export function openSseStream(res: Response): SseStream {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // nginx buffers proxied responses by default, which holds the whole answer
  // back until it is complete and makes streaming look exactly like not
  // streaming. This header is how you tell it not to.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let closed = false;

  const heartbeat = setInterval(() => {
    if (closed) return;
    res.write(": keep-alive\n\n");
  }, HEARTBEAT_MS);

  const finish = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
  };

  res.on("close", finish);

  return {
    send(event, data) {
      if (closed) return false;
      // Every line of a multi-line payload needs its own `data:` prefix, so the
      // JSON is serialised without newlines rather than pretty-printed.
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    },
    close(event, data) {
      if (closed) return;
      if (event) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data ?? {})}\n\n`);
      }
      finish();
      res.end();
    },
    closed() {
      return closed;
    },
  };
}
