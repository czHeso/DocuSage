/**
 * Locating an uploaded document on disk.
 *
 * multer generates the stored name itself, from a project id parsed as an
 * integer and an original name stripped of everything but letters and digits,
 * so a traversal should not be constructible. This module re-derives the path
 * from those two values and checks the result anyway: "should not be
 * constructible" is an argument about code somewhere else, and the cost of
 * being wrong is reading an arbitrary file off the server and handing it to
 * whoever asked.
 */
import path from "path";

/** Where uploaded documents live, relative to the working directory. */
export const UPLOAD_ROOT = "pdfs";

/**
 * Builds the path of an uploaded document, refusing to leave its project folder.
 * @throws When the resulting path escapes the folder.
 */
export function uploadedFilePath(projectId: number, storedFilename: string): string {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error("Invalid project id for an uploaded file.");
  }

  const projectDir = path.resolve(UPLOAD_ROOT, String(projectId));
  const resolved = path.resolve(projectDir, storedFilename);

  // The directory itself is not a file, so an exact match is a failure too -
  // it means the name resolved to nothing.
  if (resolved === projectDir || !resolved.startsWith(projectDir + path.sep)) {
    throw new Error("The uploaded file is outside the project folder.");
  }

  return resolved;
}
