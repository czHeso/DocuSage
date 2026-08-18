/**
 * Making untrusted text safe to put in a log line.
 *
 * Anything a visitor types reaches the logs: their question, the Origin header
 * their browser sent. A newline in that text starts what looks like a new log
 * entry, so a question containing
 *
 *   "\n2026-01-01 00:00:00 [express] POST /api/admin/users 200"
 *
 * writes a plausible-looking line that nobody sent. That is enough to hide a
 * real event from whoever is reading the log, or to mislead anything parsing
 * it. Control characters can also rewrite a terminal's display.
 */

/** Longest fragment of untrusted text worth keeping in a log line. */
const DEFAULT_MAX_LENGTH = 200;

/**
 * Returns a single-line, printable version of `value`, truncated.
 *
 * Newlines become the literal `\n` rather than being dropped, so the text still
 * reads correctly and it stays obvious that a line break was there.
 */
export function forLog(value: unknown, maxLength = DEFAULT_MAX_LENGTH): string {
  if (value === null || value === undefined) return String(value);

  const text = typeof value === "string" ? value : String(value);

  // Each character is replaced on its own rather than through one alternating
  // pattern. It reads the same, and it is the shape static analysis recognises
  // as neutralising a newline - an alternation is not matched by CodeQL's
  // sanitiser model, so the tidier version leaves the alert standing.
  const escaped = text
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    // Everything else below 0x20, plus DEL and the C1 range - none of it has a
    // legitimate reason to appear in a question, and some of it rewrites a
    // terminal's display.
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

  return escaped.length > maxLength ? `${escaped.slice(0, maxLength)}…` : escaped;
}
