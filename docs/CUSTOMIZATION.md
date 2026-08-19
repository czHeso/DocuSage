# Customization guide

Everything you are likely to want to change after forking DocuSage, and exactly
where to change it.

Each section says whether the change is made **in the UI** (no code, applies to
one project) or **in the code** (applies to the whole instance).

---

## Contents

- [Quick reference table](#quick-reference-table)
- [1. How the chatbot answers (AI prompts)](#1-how-the-chatbot-answers-ai-prompts)
- [2. The language the chatbot answers in](#2-the-language-the-chatbot-answers-in)
- [3. Interface language](#3-interface-language)
- [4. Chat widget appearance](#4-chat-widget-appearance)
- [5. Branding and name](#5-branding-and-name)
- [6. AI provider and model](#6-ai-provider-and-model)
- [7. Retrieval quality](#7-retrieval-quality)
- [7b. Adding a file format](#7b-adding-a-file-format)
- [8. Colours and theme](#8-colours-and-theme)
- [9. Marketing pages and legal text](#9-marketing-pages-and-legal-text)
- [10. Registration and access](#10-registration-and-access)
- [After making changes](#after-making-changes)

---

## Quick reference table

| I want to change… | Where | Scope |
| --- | --- | --- |
| What the chatbot sounds like | UI → project → Chatbot settings | one project |
| Default personality for all projects | [`server/prompts.ts`](../server/prompts.ts) | whole instance |
| Language of the answers | prompt (UI or `server/prompts.ts`) | project / instance |
| Interface language | [`client/src/hooks/use-language.tsx`](../client/src/hooks/use-language.tsx) | whole instance |
| Widget colour, name, welcome text | UI → project → Embed settings | one project |
| Widget layout / behaviour | `client/public/embed*.js` | whole instance |
| Application name "DocuSage" | see [section 5](#5-branding-and-name) | whole instance |
| AI provider (OpenAI/Google/Azure) | UI → project → AI settings | one project |
| Chunk size, retrieval | [`server/prompts.ts`](../server/prompts.ts) + training options | whole instance |
| Accepted upload formats | [`shared/documentFormats.ts`](../shared/documentFormats.ts) + `server/services/extractors` | whole instance |
| Model prices for cost estimates | [`server/services/usage.ts`](../server/services/usage.ts) | whole instance |
| Whether answers cite their sources | UI → project → Advanced Training Options → Enable Citation Generation | one project |
| Whether a failed answer offers a contact form | UI → project → Chatbot settings | one project |
| Which domains may embed the widget, monthly message cap | UI → project → Chatbot settings → Limits | one project |
| Request limits | `.env` → `API_RATE_LIMIT_PER_MINUTE`, `EMBED_RATE_LIMIT_PER_MINUTE`, `LEAD_RATE_LIMIT_PER_10_MINUTES` | whole instance |
| Whether answers stream token by token | not configurable — the widget asks for a stream and falls back on its own | whole instance |
| Colour palette of the app | [`client/src/index.css`](../client/src/index.css) | whole instance |
| Privacy policy | [`client/src/pages/privacy-page.tsx`](../client/src/pages/privacy-page.tsx) | whole instance |
| Who may register | `.env` → `ALLOW_PUBLIC_REGISTRATION` | whole instance |

---

## 1. How the chatbot answers (AI prompts)

There are two levels, and **the project-level prompt always wins**.

### Per project (recommended, no code)

Open the project → **Chatbot settings** → *Default prompt*. This is stored in the
database (`projects.default_prompt`) and overrides everything below. Use this when
different projects need different tones, or answers in different languages.

### For the whole instance

All fallback prompts live in a single file: **[`server/prompts.ts`](../server/prompts.ts)**.
That file is the only place you need to touch.

| Constant | Used when |
| --- | --- |
| `CONVERSATIONAL_ASSISTANT_PROMPT` | The main personality of the embed widget and public API. Forbids phrases like "according to the documents" so answers read naturally. |
| `SIMPLE_ASSISTANT_PROMPT` | Short fallback and the default for newly created projects. |
| `GENERAL_ASSISTANT_PROMPT` | Generic chat completion helper. |
| `CONCISE_ASSISTANT_PROMPT` | Plain text generation with no documents involved. |
| `DOCUMENT_QA_PROMPT` | Strict "answer only from these documents" mode. |
| `SEMANTIC_ANSWER_PROMPT` | The main two-stage semantic search path. **This is the one most answers go through.** |
| `SEMANTIC_PROMPT_LABELS` | Section headings inside the prompt (`CURRENT QUESTION`, `ANSWER`, …). |

**Example — make the assistant more formal:**

```ts
// server/prompts.ts
export const CONVERSATIONAL_ASSISTANT_PROMPT =
  'You are a formal, precise assistant. Use complete sentences and a professional register. ' +
  'If you do not know the answer, say so plainly.';
```

> **Careful:** `SIMPLE_ASSISTANT_PROMPT` is also written into `projects.default_prompt`
> when a project is created. Changing it affects only projects created afterwards;
> existing projects keep the value already stored in the database.

---

## 2. The language the chatbot answers in

The answer language is driven **entirely by the prompt**, not by a setting.

`SEMANTIC_ANSWER_PROMPT` currently instructs the model to *"Answer in the same
language the user used"*. That is usually what you want: a visitor writing in
German gets German, even if the documents are in English.

**To force one fixed language**, replace that sentence:

```ts
// server/prompts.ts
export const SEMANTIC_ANSWER_PROMPT =
  'Answer the user\'s question based on the provided information from the documents ' +
  'and the context of the previous conversation. If the information is not in the ' +
  'documents, say so clearly. Always answer in German.';   // ← here
```

For a single project, do the same in the UI prompt instead — no redeploy needed.

> The AI's answer language is independent of the interface language (section 3).
> A German visitor can use an English interface and still get German answers.

---

## 3. Interface language

The app ships with a Czech/English dictionary in
**[`client/src/hooks/use-language.tsx`](../client/src/hooks/use-language.tsx)**.

**Default language** — one line:

```ts
/** English is the default language of the application. */
const DEFAULT_LANGUAGE: Language = 'en';   // ← change to 'cs' for Czech
```

The user's choice is remembered in `localStorage` under `docusage.language`.
When a key is missing from the active dictionary, `t()` falls back to English
rather than printing the raw key.

**Adding a language** — add a third key to the `translations` object and extend
the `Language` type:

```ts
type Language = 'cs' | 'en' | 'de';

const translations: Record<Language, Record<string, string>> = {
  cs: { /* … */ },
  en: { /* … */ },
  de: { 'nav.features': 'Funktionen', /* … */ },
};
```

### What is and is not translatable

The application ships **entirely in English**: interface, API responses, log
messages, emails, and the default AI prompts.

The Czech translation is still selectable, but it is **partial**. Only strings
that go through the `t()` helper switch language; most component text is written
in English directly in the JSX. Switching to Czech therefore gives you a mixed
interface.

**To make another language complete**, move the hardcoded strings into the
dictionary as you go:

```tsx
// before
<CardTitle>Chatbot settings</CardTitle>

// after
const { t } = useLanguage();
<CardTitle>{t('chatbot.settings.title')}</CardTitle>
```

Two things to watch for:

- Components that do not use `useLanguage()` yet must import and call it.
- Strings inside **module-level zod schemas** sit outside the component, where
  `t()` is not available. Move the schema inside the component (or into a
  factory function that takes `t`) before translating those.

### Text that must not be translated

Some Czech in the codebase is deliberate — changing it breaks behaviour:

| Location | Why |
| --- | --- |
| `server/services/failureDetection.ts` | Phrases matched against the AI's answer. They must exist in every language the chatbot replies in — **add**, never replace. |
| `client/src/components/pdf-uploader.tsx` | A repair table for filenames that arrive as broken UTF-8. These are character mappings, not text. |
| `privacy-page.tsx`, `document-processing-page.tsx` | The Czech branch of these bilingual pages. |
| `use-language.tsx` | The Czech dictionary itself. |

---

## 4. Chat widget appearance

### Per project (no code)

Project → **Embed settings**. You can change the style (classic / advanced /
premium), colour, chatbot name, welcome message, disclaimer text, the bot icon,
notifications, and conversation rating. The generated `<script>` snippet carries
these as `data-*` attributes:

```html
<script src="https://your-domain.com/embed.js"
  data-token="<project-token>"
  data-color="blue"
  data-style="classic"
  data-chatbot-name="DocuSage Assistant"
  data-welcome-message="Hello, how can I help you?"
  data-disclaimer-text="Answers are generated by AI and may not always be accurate."
></script>
```

### Layout and behaviour (code)

Three standalone files, one per style — plain JavaScript, no build step:

| File | Style |
| --- | --- |
| [`client/public/embed.js`](../client/public/embed.js) | `classic` |
| [`client/public/embed-advanced.js`](../client/public/embed-advanced.js) | `advanced` |
| [`client/public/embed-premium.js`](../client/public/embed-premium.js) | `premium` |

Each begins with a `createStyles()` function holding all the CSS. Editing them
takes effect on reload — no rebuild needed, they are served as static files.

> **Security rule when editing widgets:** any text coming from a visitor, from a
> document, or from the AI must pass through `escapeHtml()` **before** it goes
> into `innerHTML`. Markdown formatting is applied to the already-escaped text.
> Reversing that order reintroduces a cross-site scripting hole on every site
> that embeds the widget. See [SECURITY.md](../SECURITY.md).

### Removing "Powered by DocuSage"

Per project: Embed settings → *Hide "Powered by" text*.
For the whole instance, edit the string in all three `embed*.js` files.

---

## 5. Branding and name

The name "DocuSage" appears in several distinct places. Renaming means touching
all of them:

| What | Where |
| --- | --- |
| Browser tab title, meta description | [`client/index.html`](../client/index.html) |
| SEO titles and descriptions | [`client/src/components/seo.tsx`](../client/src/components/seo.tsx) |
| Sidebar and navbar | `client/src/components/sidebar.tsx`, `navbar.tsx` |
| Landing page | [`client/src/pages/landing-page.tsx`](../client/src/pages/landing-page.tsx) |
| Widget "Powered by" | `client/public/embed*.js` |
| Default chatbot name | [`shared/schema.ts`](../shared/schema.ts) → `chatbotName` default |
| Email sender and links | [`server/mailer.ts`](../server/mailer.ts) + `APP_URL` in `.env` |
| Session cookie name | [`server/auth.ts`](../server/auth.ts) → `name: 'docusage.sid'` |
| npm package name | [`package.json`](../package.json) |

Favicon and logo: `client/public/favicon.svg`, plus the inline SVG logos in
`sidebar.tsx`, `navbar.tsx`, and `landing-page.tsx`.

---

## 6. AI provider and model

Set **per project** in the UI (AI settings): OpenAI, Google Gemini, or Azure OpenAI,
plus the specific model and that project's API key.

- **Azure endpoints are restricted** to `*.openai.azure.com` and
  `*.cognitiveservices.azure.com` — the server calls that URL itself, so allowing
  arbitrary addresses would be an SSRF hole. To permit another host, edit
  `isAllowedAzureEndpoint()` in [`server/routes.ts`](../server/routes.ts) and
  understand what you are opening up.
- **Global fallback key**: `OPENAI_API_KEY` in `.env`, used when a project has none.
- **The model list** offered in the UI lives in
  [`client/src/components/ai-provider-settings.tsx`](../client/src/components/ai-provider-settings.tsx).

---

## 7. Retrieval quality

If answers are too vague, too short, or miss information, these are the knobs:

**Per project** — project → *Advanced training options*: response style, context
size, temperature, maximum documents, chunk size.

**In code** — [`server/prompts.ts`](../server/prompts.ts) holds the prompts that
control how documents are split and which chunks are selected:

| Constant | Effect |
| --- | --- |
| `CHUNKING_SHORT_PROMPT` | Splitting a document into blocks. Long documents are split into segments first, and each segment goes through this same prompt |
| `CHUNK_SELECTION_SHORT_PROMPT` | The instruction given when choosing which blocks answer a question |
| `CHUNK_SELECTION_CANDIDATES_PROMPT` | How the candidate blocks are laid out for that choice |
| `SEMANTIC_ANSWER_PROMPT` | The default instruction for writing the answer, when a project has not set its own |
| `NO_RELEVANT_INFORMATION_MESSAGE` | Shown when nothing relevant is found |

This table used to list `CHUNKING_DETAILED_PROMPT`, `CHUNKING_SEGMENT_PROMPT` and
`CHUNK_SELECTION_PROMPT` as well. Those constants existed and were exported, but
nothing had called them for a long time — the only code that used them was an
older ChatGPT-only path with no callers. Editing them changed nothing, which is
worse than them not being there, so they are gone.

The threshold at which a document is processed segment by segment is in
[`server/services/documentProcessor.ts`](../server/services/documentProcessor.ts)
(`estimatedTokens > 12000`).

> Changing chunking prompts only affects **newly uploaded** documents. Existing
> chunks stay as they are — re-upload a document to reprocess it.

---

## 7b. Adding a file format

Uploads accept PDF, Word (`.docx`), plain text, Markdown and saved web pages.
Everything past extraction — chunking, embeddings, retrieval, answers — works on
plain text and does not know which format produced it, so adding one is two
edits:

1. **[`shared/documentFormats.ts`](../shared/documentFormats.ts)** — add an entry
   with an id, a label, its extensions and the MIME types browsers send for it.
   Shared rather than server-only so the upload control, its help text and the
   server's validation cannot disagree.

2. **[`server/services/extractors/index.ts`](../server/services/extractors/index.ts)**
   — add an extractor under the same id, returning `{ text, pages }`. Formats
   without pages return `pages: 0`; a citation then shows the document without a
   page number rather than an invented one. TypeScript fails the build if a
   format has no extractor, so the two cannot drift apart.

Import anything heavy inside the extractor rather than at the top of the file.
An installation that only ever receives PDFs should not load a Word parser.

Two things worth knowing before adding a format:

- **The extension decides, not the MIME type.** Browsers and operating systems
  send `application/octet-stream` for perfectly valid files, so the MIME type is
  only corroboration.
- **There is no OCR.** A scanned PDF or an image extracts to nothing, and the
  upload succeeds with empty text. Adding OCR is a much larger change than
  adding a format.

---

## 8. Colours and theme

All colours are CSS custom properties in
**[`client/src/index.css`](../client/src/index.css)**, consumed by
[`tailwind.config.ts`](../tailwind.config.ts). Both light and dark variants are defined.

```css
:root {
  --primary: 222.2 47.4% 11.2%;   /* HSL values without hsl() */
  --background: 0 0% 100%;
  --radius: 0.5rem;
}
```

Values are bare HSL components — Tailwind wraps them in `hsl()` itself. Paste a
palette from [ui.shadcn.com/themes](https://ui.shadcn.com/themes) directly here.

Widget colours are separate: they come from the `data-color` attribute, mapped in
each `embed*.js`.

---

## 9. Marketing pages and legal text

| Page | File |
| --- | --- |
| Landing page | [`client/src/pages/landing-page.tsx`](../client/src/pages/landing-page.tsx) |
| Testimonials | [`client/src/pages/references-page.tsx`](../client/src/pages/references-page.tsx) |
| Privacy policy | [`client/src/pages/privacy-page.tsx`](../client/src/pages/privacy-page.tsx) |
| How documents are processed | [`client/src/pages/document-processing-page.tsx`](../client/src/pages/document-processing-page.tsx) |

**The testimonials shipped in the repo are placeholders, not real customers.**
Replace them with your own, and only publish a real customer's name or quote with
their consent.

**The privacy policy is a template.** Fill in the `OPERATOR` constant at the top of
`privacy-page.tsx`, adjust the text to match how you actually operate, and have a
lawyer review it. You are the data controller, not the authors of this software —
see [SECURITY.md](../SECURITY.md).

---

## 10. Registration and access

All in `.env` (see [.env.example](../.env.example)):

| Variable | Effect |
| --- | --- |
| `ALLOW_PUBLIC_REGISTRATION` | `false` (default) means only an admin can create accounts. |
| `ALLOWED_EMAIL_DOMAINS` | Restrict registration to e.g. `yourcompany.com`. |
| `LOGIN_MAX_ATTEMPTS` | Failed logins per IP per 15 minutes. |
| `ALLOWED_ORIGINS` | Origins allowed to call the API with the session cookie. |

The **first account created in an empty database always becomes an admin**,
regardless of these settings — otherwise the instance could never be set up.
Details in the [README](../README.md#creating-your-admin-account).

Password rules are in [`server/auth.ts`](../server/auth.ts) (`MIN_PASSWORD_LENGTH`).
Per-role project and PDF quotas are in the `checkProjectLimits` and
`checkPdfLimits` middleware in [`server/routes.ts`](../server/routes.ts).

---

## After making changes

| You changed… | What to do |
| --- | --- |
| `client/public/embed*.js` | Nothing — served statically, just reload |
| Anything else in `client/` | `npm run build` (or `npm run dev`) |
| Anything in `server/` or `shared/` | `npm run build` and restart |
| `shared/schema.ts` | `npm run db:push`, then rebuild |
| `.env` | Restart the application |

Always run `npm run check` before deploying — the project is expected to
typecheck with zero errors.
