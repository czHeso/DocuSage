# What this changes

<!-- One or two sentences. Link the issue it closes, if there is one. -->

Closes #

## Why

<!-- The problem being solved, not a restatement of the diff. -->

## How it was verified

<!-- What you actually ran, and what it produced. "Should work" is not a
     verification. If something is untested, say so — that is useful too. -->

- [ ] `npm run check` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] Tried it in a running application

## Anything reviewers should look at closely

<!-- Trade-offs, parts you were unsure about, things you deliberately left out. -->

---

- [ ] No API keys, connection strings or other secrets are in the diff
- [ ] `.env.example` and the docs are updated if configuration changed
- [ ] Schema changes in `shared/schema.ts` are noted so operators know to run `npm run db:push`
