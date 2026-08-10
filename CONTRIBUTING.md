# Contributing to DocuSage

Bug reports, fixes and features are all welcome. This page covers what you need
to get a change merged.

**Security problems do not belong in issues or pull requests.** Report them
privately — see [SECURITY.md](SECURITY.md).

---

## Getting set up

You need Node.js 20 or newer and a PostgreSQL database. The
[README](README.md#quick-start-local) covers both, including how to run
PostgreSQL on Windows without Docker or an installer.

```bash
npm install
cp .env.example .env     # fill in DATABASE_URL and SESSION_SECRET
npm run db:push
npm run dev
```

The first account you register becomes an administrator.

---

## Before you open a pull request

Run all three. CI runs the same commands, so a failure here is a failure there:

```bash
npm run check    # TypeScript, must report zero errors
npm test         # unit tests
npm run build    # production build of client and server
```

### Tests

Unit tests live next to the code they cover, as `*.test.ts`. They must not need
a database — anything that does belongs in a `*.integration.test.ts` file, which
skips itself unless `TEST_DATABASE_URL` is set:

```bash
TEST_DATABASE_URL=postgresql://postgres:pw@127.0.0.1:5432/docusage_test npm test
```

Point that at a throwaway database. The tests write to it.

A bug fix should come with a test that fails without the fix. The way to know it
is worth having is to break the code again and watch the test go red — a test
that passes either way is documentation, not a guard.

---

## Working on the code

**Match the code around you.** Naming, comment density and structure vary
between parts of this codebase; the local style wins over any global preference.

**Comments explain why, not what.** The code already says what it does.

**Keep the language surface in English.** Interface strings, API responses, log
messages and comments are English. The Czech translation lives in the dictionary
in `client/src/hooks/use-language.tsx`. Two things must stay in both languages:

- the failure phrases in `server/services/failureDetection.ts`, which are matched
  against what the AI replies, and a Czech-configured model answers in Czech
- the filename repair table in `client/src/components/pdf-uploader.tsx`

**AI prompts live in `server/prompts.ts`.** One place, nowhere else — they used
to be copied across four files and drifted apart.

**Schema changes** go in `shared/schema.ts`. Say so in your pull request, so
operators know to run `npm run db:push` when they upgrade.

**Never commit secrets.** `.env` is git-ignored; keep it that way. If a key ever
reaches a commit, treat it as compromised and rotate it — removing it from the
history is not enough.

---

## Pull requests

Keep them focused: one change per pull request. A fix bundled with a refactor is
hard to review and harder to revert.

Describe what you verified and how. If part of it is untested, say which part —
that is more useful than a checked box that is not true.

---

## Releases

Maintainers only:

```bash
npm version minor          # bumps package.json and creates the tag
git push --follow-tags
```

The release workflow type-checks, tests and builds before publishing. The tag
has to match the version in `package.json` or it refuses to release.
