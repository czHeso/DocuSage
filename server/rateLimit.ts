/**
 * Rate limiting for the public embed endpoints.
 *
 * These endpoints are open by necessity: the widget runs on any domain and
 * authenticates with a token that is visible in the page source of every site
 * that embeds it. Anyone who views source can replay it, and every replay
 * either spends the project owner's provider credit or writes a row nobody
 * asked for. A limit is what stands between that and an unbounded bill or an
 * inbox full of junk.
 *
 * express-rate-limit rather than a hand-rolled counter: it brings the standard
 * RateLimit headers, a store interface for the day these counters need to be
 * shared between instances, and recognition by static analysis, which
 * identifies rate limiting by library.
 *
 * The default store keeps its counters in memory. With several application
 * instances the effective limit is multiplied by the instance count, and a
 * restart forgets everything. That is chosen anyway, because the alternative is
 * requiring Redis in a project whose premise is that it runs on one VPS.
 * Swapping in a shared store means passing `store` here and nothing else.
 */
import rateLimit from "express-rate-limit";

/**
 * The limit for the widget chat endpoints.
 *
 * Generous on purpose: a person in a conversation sends a message every few
 * seconds at most, so twenty a minute only bites on a script.
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
