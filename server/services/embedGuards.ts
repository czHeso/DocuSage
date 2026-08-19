/**
 * Deciding whether a widget request is allowed to cost the owner money.
 *
 * The embed endpoints authenticate with a token that is, by design, in the page
 * source of every site that embeds the widget. Anyone who views source has it.
 * The per-IP rate limit stops one address hammering the endpoint; it does
 * nothing about the same token being used from a thousand addresses, or from
 * somebody else's website.
 *
 * Two guards, both off by default so that no existing project changes
 * behaviour: a list of domains allowed to embed, and a cap on messages per
 * calendar month.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db.js";
import { chatMessages, chatSessions } from "../../shared/schema.js";

/** Parses the stored comma-separated list into hostnames. */
export function parseAllowedDomains(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .map(stripToHost);
}

/**
 * Reduces whatever somebody typed to a hostname.
 *
 * People paste "https://example.com/", "example.com:443" and "www.example.com"
 * interchangeably, and a setting that silently fails because of a trailing
 * slash is worse than no setting.
 */
function stripToHost(entry: string): string {
  let host = entry;

  const schemeEnd = host.indexOf("://");
  if (schemeEnd !== -1) host = host.slice(schemeEnd + 3);

  host = host.split("/")[0];
  // A port is not part of the identity of a site for this purpose, and a
  // wildcard entry has no port anyway.
  host = host.split(":")[0];

  return host;
}

/**
 * Whether `origin` is covered by one of the allowed entries.
 *
 * An entry may be an exact hostname or a `*.example.com` wildcard. A bare
 * `example.com` also covers `www.example.com`, because writing one and meaning
 * the other is the single most likely way to configure this wrongly, and the
 * two are the same site in every practical sense.
 */
export function isOriginAllowed(origin: string | undefined | null, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  if (!origin) return false;

  // A page opened from the filesystem sends the literal string "null". Once a
  // project has an allowlist, that is not on it.
  if (origin === "null") return false;

  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    host = stripToHost(origin.toLowerCase());
  }

  if (!host) return false;

  return allowed.some((entry) => {
    if (entry.startsWith("*.")) {
      const suffix = entry.slice(1); // ".example.com"
      return host.endsWith(suffix);
    }

    return host === entry || host === `www.${entry}`;
  });
}

/**
 * The origin a widget request came from.
 *
 * Origin is the header to trust: browsers set it on cross-origin POSTs and a
 * page cannot forge it. Referer is the fallback for the rare client that omits
 * Origin, and it is only ever used to *find* a host, never to grant something
 * Origin denied.
 */
export function requestOrigin(headers: Record<string, any>): string | undefined {
  const origin = headers["origin"];
  if (typeof origin === "string" && origin) return origin;

  const referer = headers["referer"] ?? headers["referrer"];
  return typeof referer === "string" && referer ? referer : undefined;
}

/** Visitor messages this project has taken since the first of the month. */
export async function messagesThisMonth(projectId: number): Promise<number> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatMessages)
    .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
    .where(
      and(
        eq(chatSessions.projectId, projectId),
        // Only what visitors sent. Counting the chatbot's replies too would
        // halve everybody's limit for no reason anyone could guess.
        eq(chatMessages.isFromUser, true),
        gte(chatMessages.createdAt, monthStart),
      ),
    );

  return Number(row?.count ?? 0);
}

export type EmbedRejection =
  | { status: 403; message: string }
  | { status: 429; message: string };

/**
 * Checks only where the request came from.
 *
 * Split out of checkEmbedRequest for the endpoints that are not messages: a
 * contact form submission should be refused from a site the project does not
 * allow, but it must not count against - or be refused by - the monthly message
 * limit, which is there to cap what the chatbot costs to answer.
 */
export function checkEmbedOrigin(
  project: { allowedDomains?: string | null },
  headers: Record<string, any>,
): EmbedRejection | null {
  const allowed = parseAllowedDomains(project.allowedDomains);

  if (allowed.length > 0 && !isOriginAllowed(requestOrigin(headers), allowed)) {
    return {
      status: 403,
      // Deliberately vague to the caller. Naming the allowed domains would hand
      // somebody probing the token the list of places it does work.
      message: "This chatbot is not available on this website.",
    };
  }

  return null;
}

/**
 * Checks a widget request against the project's guards.
 *
 * Returns null when the request may proceed. Both checks are skipped entirely
 * when the project has not configured them, so a project that never opens these
 * settings behaves exactly as it did before.
 */
export async function checkEmbedRequest(
  project: { id: number; allowedDomains?: string | null; monthlyMessageLimit?: number | null },
  headers: Record<string, any>,
): Promise<EmbedRejection | null> {
  const originRejection = checkEmbedOrigin(project, headers);

  if (originRejection) {
    return originRejection;
  }

  const limit = project.monthlyMessageLimit ?? 0;

  if (limit > 0 && (await messagesThisMonth(project.id)) >= limit) {
    return {
      status: 429,
      message: "This chatbot has reached its message limit for this month.",
    };
  }

  return null;
}
