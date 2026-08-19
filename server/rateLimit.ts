/**
 * Rate limiting.
 *
 * These endpoints are open by necessity: the widget runs on any domain and
 * authenticates with a token that is visible in the page source of every site
 * that embeds it. Anyone who views source can replay it, and every replay
 * spends the project owner's tokens with their own provider key. A limit is
 * what stands between that and an unbounded bill.
 *
 * express-rate-limit rather than a hand-rolled counter. The counter is twenty
 * lines and was written first, but a well-known library brings the standard
 * RateLimit headers, a store interface for the day this needs to be shared
 * between instances, and recognition by static analysis - CodeQL identifies
 * rate limiting by library, so a bespoke implementation reads to it as no
 * limiting at all.
 */
import rateLimit from "express-rate-limit";

/**
 * The ceiling on every request under /api, whoever is making it.
 *
 * A backstop, not a policy: the embed endpoints have their own much tighter
 * limits below, and this exists so that no route is completely unlimited. The
 * dashboard is chatty - opening a project fires a dozen or so requests at once -
 * so the number is high enough that a person clicking around will not reach it
 * and low enough that a script hammering an endpoint will.
 *
 * Applies to authenticated routes too. An account is not a reason to trust a
 * request rate: a leaked session cookie or a runaway client script costs the
 * same either way, and several of these routes read files or run a query per
 * call.
 */
export const apiRateLimit = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.API_RATE_LIMIT_PER_MINUTE) || 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many requests in a short time. Please wait a moment and try again.",
  },
});

/**
 * The limit applied to the widget chat endpoints.
 *
 * Generous on purpose. A person having a conversation sends a message every few
 * seconds at most, so twenty a minute is far above normal use and only bites on
 * a script.
 *
 * The default store keeps its counters in memory. That is a real limitation:
 * with several application instances the effective limit is multiplied by the
 * instance count, and a restart forgets everything. It is chosen anyway,
 * because the alternative is a Redis dependency in a project whose premise is
 * that it runs on one VPS. A shared store belongs with the per-project quota
 * work, and swapping one in means passing `store` here and nothing else.
 */
export const embedChatRateLimit = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.EMBED_RATE_LIMIT_PER_MINUTE) || 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many messages in a short time. Please wait a moment and try again.",
  },
});

/**
 * The limit for leaving contact details.
 *
 * Much tighter than the chat limit, because the shape of the abuse is
 * different: nobody legitimately submits a contact form five times a minute,
 * and every submission is a row in the database and an email in somebody's
 * inbox.
 */
export const leadRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  limit: Number(process.env.LEAD_RATE_LIMIT_PER_10_MINUTES) || 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many submissions. Please try again later.",
  },
});
