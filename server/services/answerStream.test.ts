import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { streamAnswer, supportsStreaming } from "./answerStream";

/**
 * These run against a local HTTP server speaking the OpenAI streaming wire
 * format rather than against a mocked SDK. The thing worth testing is that the
 * chunks are unwrapped correctly and that a stream which stops mid-answer is
 * noticed — neither of which a mock of the SDK would exercise.
 *
 * The Azure branch is the one used, because it is the only one whose base URL
 * is configurable, and it shares its entire implementation with the OpenAI
 * branch.
 */
describe("streamAnswer over an OpenAI-compatible endpoint", () => {
  let server: http.Server | undefined;

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server!.close(resolve));
      server = undefined;
    }
  });

  async function serve(handler: (res: http.ServerResponse) => void): Promise<string> {
    server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      handler(res);
    });

    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const { port } = server!.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  const chunk = (content: string) =>
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

  function callWith(endpoint: string, onToken: (delta: string) => void) {
    return streamAnswer(
      {
        prompt: "Jaká je splatnost faktury?",
        model: "gpt-4o",
        apiKey: "test-key",
        temperature: 0.5,
        maxTokens: 128,
        azureEndpoint: endpoint,
      },
      "azure",
      onToken,
    );
  }

  it("reports which providers can stream", () => {
    expect(supportsStreaming("openai")).toBe(true);
    expect(supportsStreaming("azure")).toBe(true);
    expect(supportsStreaming("google")).toBe(true);
    expect(supportsStreaming("something-else")).toBe(false);
    expect(supportsStreaming(null)).toBe(false);
  });

  it("emits every piece of text and returns the whole answer", async () => {
    const endpoint = await serve((res) => {
      res.write(chunk("Splatnost"));
      res.write(chunk(" je"));
      res.write(chunk(" 30 dnů."));
      res.write("data: [DONE]\n\n");
      res.end();
    });

    const deltas: string[] = [];
    const answer = await callWith(endpoint, (delta) => deltas.push(delta));

    expect(deltas).toEqual(["Splatnost", " je", " 30 dnů."]);
    // The caller stores this, so it has to be the concatenation of the deltas
    // and not something reassembled differently.
    expect(answer).toBe("Splatnost je 30 dnů.");
  });

  it("ignores chunks that carry no text", async () => {
    const endpoint = await serve((res) => {
      // Role-only and finish-reason-only chunks are normal in this protocol and
      // must not reach the widget as empty tokens.
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}\n\n`);
      res.write(chunk("Ano"));
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });

    const deltas: string[] = [];
    const answer = await callWith(endpoint, (delta) => deltas.push(delta));

    expect(deltas).toEqual(["Ano"]);
    expect(answer).toBe("Ano");
  });

  it("propagates an error thrown by the token sink", async () => {
    // This is how the endpoint stops generating once the visitor has closed
    // the page, so the throw has to escape rather than be swallowed.
    const endpoint = await serve((res) => {
      res.write(chunk("první"));
      res.write(chunk("druhý"));
      res.write("data: [DONE]\n\n");
      res.end();
    });

    await expect(
      callWith(endpoint, () => {
        throw new Error("client gone");
      }),
    ).rejects.toThrow("client gone");
  });

  it("stops on the abort signal and keeps what already arrived", async () => {
    const endpoint = await serve((res) => {
      res.write(chunk("začátek"));
      // Never finishes, so only the abort can end this. Without the signal
      // being honoured the test would hang rather than fail.
    });

    const controller = new AbortController();
    const answer = await streamAnswer(
      {
        prompt: "x",
        model: "gpt-4o",
        apiKey: "test-key",
        temperature: 0.5,
        maxTokens: 128,
        azureEndpoint: endpoint,
        signal: controller.signal,
      },
      "azure",
      () => controller.abort(),
    );

    // Aborting ends the iteration rather than raising, so the partial answer is
    // returned. That is the useful behaviour: the caller decides whether half an
    // answer is worth keeping.
    expect(answer).toBe("začátek");
  });

  it("refuses to stream from Azure without an endpoint", async () => {
    await expect(
      streamAnswer(
        { prompt: "x", model: "gpt-4o", apiKey: "k", temperature: 0.5, maxTokens: 128 },
        "azure",
        () => {},
      ),
    ).rejects.toThrow(/endpoint/i);
  });
});
