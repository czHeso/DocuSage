# DocuSage Security

This document describes the application's security model, what you must configure
before going live, and how to report a vulnerability.

> DocuSage is open-source software. Responsibility for the security of any given
> instance lies with its **operator**, not with the authors. See [LICENSE](LICENSE).

---

## Pre-launch checklist

Go through this before you make the instance available to anyone else:

- [ ] `NODE_ENV=production` — without it the session cookie is not marked `secure`
- [ ] The application is served **over HTTPS only**
- [ ] The reverse proxy forwards `X-Forwarded-Proto` (the app has `trust proxy` enabled)
- [ ] `SESSION_SECRET` is a long random string, unique to this environment
- [ ] `ALLOWED_ORIGINS` contains only your administration domain
- [ ] `ALLOW_PUBLIC_REGISTRATION=false` unless you want open registration
- [ ] The first (admin) account exists and has a strong password
- [ ] `.env` is not in the repository or in the container image
- [ ] The database is not reachable from the internet
- [ ] The database is backed up
- [ ] `DEBUG_AUTH` is off
- [ ] Your AI API keys have a spending limit set with the provider
- [ ] For every published widget, **Project → Chatbot settings → Limits** has an
      allowed-domain list and a monthly message cap set

---

## Security model

### Authentication

| Zone | Verification | Notes |
| --- | --- | --- |
| Administration, project management | Session cookie (`docusage.sid`) | httpOnly, sameSite=lax, secure in production |
| Public REST API | `X-API-Key` header | Key is bound to a project and has a daily limit |
| Embed widget | Project token in the request body | No cookies |

Passwords are hashed with **scrypt** using a random 16-byte salt and compared in
constant time (`timingSafeEqual`). Passwords in any other format are treated as
invalid — such an account must go through the password reset flow.

After a successful login the **session ID is regenerated** (session fixation
protection). Failed logins are counted per IP address; after `LOGIN_MAX_ATTEMPTS`
(default 10) attempts within 15 minutes, logging in is temporarily blocked.

> **Limitation:** the attempt counter lives in process memory. If you run multiple
> instances, add protection at the reverse proxy or WAF level as well.

### Rate limiting

| Scope | Default | Variable |
| --- | --- | --- |
| Any `/api` route | 300 requests per minute per IP | `API_RATE_LIMIT_PER_MINUTE` |
| Widget chat, including the streaming endpoint | 20 per minute per IP | `EMBED_RATE_LIMIT_PER_MINUTE` |
| Contact form | 3 per ten minutes per IP | `LEAD_RATE_LIMIT_PER_10_MINUTES` |

The `/api` ceiling is a backstop, not a policy — it exists so that no route is
completely unlimited, and it applies to authenticated routes too, because a leaked
session cookie or a runaway client script costs the same as an anonymous one.

> **Limitation:** the same one as above. The counters are in process memory, so with
> several instances the effective limit is multiplied by the instance count and a
> restart forgets them. Swapping in a shared store is one option passed to
> `server/rateLimit.ts`.

### Who may run the widget

The widget authenticates with a project token that is visible in the page source of
every site embedding it, so anyone who views source can run the chatbot on their own
page. Two per-project settings close that off, both off by default so that existing
projects are unaffected:

- **Allowed domains** — a comma-separated list. A bare `example.com` also covers
  `www.example.com`; `*.example.com` covers all subdomains. Once a list exists, a
  request with no `Origin` at all is refused too: a browser always sends one on a
  cross-origin POST, so something that does not is not the widget. The refusal
  deliberately does not name the allowed domains.
- **Messages per month** — a cap per calendar month, `0` for no limit. This is the
  backstop behind the per-IP limit, which does nothing against traffic spread over
  many addresses. The contact form is exempt: a project that has spent its allowance
  should still be able to collect the question it could not answer.

### Roles

| Role | Permissions |
| --- | --- |
| `admin` | Manage all users and projects |
| `unlimited` / `vip` / `user` | Own projects, differing quotas |

Within a project there are team roles `owner`, `editor`, and `viewer`.
A `viewer` may not delete documents or change settings.

### CORS — two separate zones

The application deliberately runs two different CORS policies:

**Public zone** (`/api/chat-embed`, `/api/p/*`, `/bot-icon`) runs on third-party
domains, so it permits all origins — but with **`credentials: false`**, meaning the
browser never attaches the session cookie to it. It authenticates with a project
token or `X-API-Key`.

**Private zone** (the rest of the API) uses the session cookie, so it permits
**only origins listed in `ALLOWED_ORIGINS`** (or `APP_URL`). In development,
`localhost` is additionally allowed automatically.

> Never combine `origin: true` with `credentials: true`. Reflecting an arbitrary
> origin while allowing cookies turns every third-party website into a trusted
> source of requests made on behalf of the logged-in user.

### XSS protection in the embed widget

The widget runs on other people's websites, so an XSS hole in it would hit their
visitors. Every piece of text coming from a visitor, from documents, or from the AI
therefore passes through `escapeHtml()` **before** it is inserted into `innerHTML`.
Markdown formatting (bold, code, tables, links) is applied to the already-escaped text.

If you modify the widget, keep that order: **escape first, then format.**

### File uploads

- Only files with MIME type `application/pdf` and a `.pdf` extension are accepted
- The check happens in `fileFilter`, i.e. **before** the file is written to disk
- Limit of 10 MB, one file per request
- The project ID is coerced to an integer in the destination path (path traversal protection)
- Files are stored under a generated name; the original name only goes to the database

### Outbound requests (SSRF)

The Azure OpenAI endpoint is supplied by the user and the server calls it directly.
Only HTTPS addresses on `*.openai.azure.com` and `*.cognitiveservices.azure.com`
are accepted — both when verifying the key and when saving the project.

### Database

All queries go through Drizzle ORM with parameterised values. Lists of IDs are
passed via `inArray()` and never concatenated into a string.

### Data in API responses

User objects pass through `toPublicUser()`, which strips the password hash, the
activation token, and the password reset token.

---

## What you must handle yourself

These are things the application cannot solve for you:

**Document contents are sent to an AI provider.** The text of uploaded documents and
users' questions are sent to the provider you choose (OpenAI, Google, Azure), which
may be outside the EEA. Do not upload documents you have no rights to, and tell your
users about it.

**Prompt injection.** A document may contain instructions designed to manipulate the
chatbot's answers. Only upload material you trust. Never put secrets into documents
assuming the chatbot "won't reveal them" — answering from them is precisely its job.

**Uploaded documents are not isolated.** Anyone with access to a project can reach
the contents of its documents through the chatbot. Set team permissions accordingly.

**AI costs.** The embed widget is public. The rate limits and the per-project caps
above make abuse harder and the monthly cap puts a ceiling on it, but none of them is
a substitute for a spending cap set with OpenAI/Google/Azure — that is the only limit
the provider itself enforces. The **Token usage** card on the project page shows what
each project has spent so far, in tokens and as an estimated cost.

**Ephemeral storage.** On Cloud Run and similar environments the `pdfs/` and `icons/`
directories are emptied on restart. The extracted text is in the database; the
original files are not.

---

## Reporting vulnerabilities

Found a security issue? **Please do not open a public issue.**

Contact the repository maintainer through
[GitHub Security Advisories](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
(*Security* tab → *Report a vulnerability*), or by private message.

Please include a description of the impact and steps to reproduce. We will get back
to you as soon as we can.
