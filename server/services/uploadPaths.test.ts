import { describe, it, expect } from "vitest";
import path from "path";
import { uploadedFilePath, UPLOAD_ROOT } from "./uploadPaths";

describe("uploadedFilePath", () => {
  const projectDir = path.resolve(UPLOAD_ROOT, "7");

  it("builds the path of a file inside the project folder", () => {
    expect(uploadedFilePath(7, "prirucka-123456.pdf")).toBe(
      path.join(projectDir, "prirucka-123456.pdf"),
    );
  });

  it("refuses a name that climbs out of the folder", () => {
    // The cost of getting this wrong is reading an arbitrary file off the
    // server and handing its contents to whoever asked for it.
    expect(() => uploadedFilePath(7, "../8/secret.pdf")).toThrow(/outside/i);
    expect(() => uploadedFilePath(7, "../../etc/passwd")).toThrow(/outside/i);
    expect(() => uploadedFilePath(7, "sub/../../escape.pdf")).toThrow(/outside/i);
  });

  it("refuses an absolute path", () => {
    // path.resolve would otherwise discard the project folder entirely.
    expect(() => uploadedFilePath(7, "/etc/passwd")).toThrow(/outside/i);
  });

  it("refuses a name that resolves to the folder itself", () => {
    expect(() => uploadedFilePath(7, ".")).toThrow(/outside/i);
    expect(() => uploadedFilePath(7, "")).toThrow(/outside/i);
  });

  it("refuses a project id that is not a positive integer", () => {
    expect(() => uploadedFilePath(0, "x.pdf")).toThrow(/project id/i);
    expect(() => uploadedFilePath(-1, "x.pdf")).toThrow(/project id/i);
    expect(() => uploadedFilePath(1.5, "x.pdf")).toThrow(/project id/i);
    expect(() => uploadedFilePath(NaN, "x.pdf")).toThrow(/project id/i);
  });

  it("allows a subdirectory inside the project folder", () => {
    // Nothing creates these today, but staying inside the folder is the rule
    // being enforced, not a flat layout.
    expect(uploadedFilePath(7, "nested/file.pdf")).toBe(path.join(projectDir, "nested", "file.pdf"));
  });
});
