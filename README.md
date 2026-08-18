# DocuSage

**A self-hosted AI chatbot that answers from your own documents — embeddable on any website with one script tag.**

[![CI](https://github.com/czHeso/DocuSage/actions/workflows/ci.yml/badge.svg)](https://github.com/czHeso/DocuSage/actions/workflows/ci.yml)
[![CodeQL](https://github.com/czHeso/DocuSage/actions/workflows/codeql.yml/badge.svg)](https://github.com/czHeso/DocuSage/actions/workflows/codeql.yml)
[![Release](https://img.shields.io/github/v/release/czHeso/DocuSage?sort=semver)](https://github.com/czHeso/DocuSage/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[![Node](https://img.shields.io/badge/Node-%3E%3D20-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Self-hosted](https://img.shields.io/badge/Self--hosted-your%20keys%2C%20your%20data-0A7B83)](#deploying-to-production)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Upload your manuals, policies or product sheets. DocuSage extracts the text, splits it
into chunks, computes embeddings, and answers questions using **retrieval-augmented
generation (RAG)** — grounded in your documents rather than in whatever the model
happens to remember. Then you put the chatbot on your site:

```html
<script src="https://your-domain.com/embed.js" data-token="your-project-token"></script>
```

That is the whole integration. No cookies, no tracking script, works from any domain.

DocuSage is **free and open source** under the [MIT license](LICENSE). You run your own
instance, on your own infrastructure, with your own API keys — your documents and your
customers' questions never pass through anyone else's service.

### Why you might want this

- **Your data stays yours.** Self-hosted, no SaaS in the middle, no per-conversation pricing.
- **Answers are grounded.** Semantic search over your own chunks, plus a log of the
  questions it failed to answer so you can see what your documentation is missing.
- **Not tied to one vendor.** OpenAI, Google Gemini or Azure OpenAI, chosen per project.
- **Multi-project and multi-tenant.** Separate chatbots, documents, teams and API keys.
- **Actually deployable.** Azure, Cloud Run, or a plain VPS — all three documented below,
  with a production build that has been verified to start from a clean install.

**Good fit for:** customer support on a documentation site, an internal knowledge base
over company policies, product Q&A over spec sheets, or anywhere "search our documents"
is the real request.

**Not a fit if** you want a hosted service you do not have to run — DocuSage is
deliberately something you operate yourself. Scanned documents with no text layer are
also out of scope: there is no OCR, so run those through an OCR tool first.

---

## Contents

- [What DocuSage does](#what-docusage-does)
- [Requirements](#requirements)
- [Quick start (local)](#quick-start-local)
- [Creating your admin account](#creating-your-admin-account)
- [Scripts](#scripts)
- [Configuration](#configuration)
- [Deploying to production](#deploying-to-production)
  - [General rules](#general-rules)
  - [Azure App Service](#azure-app-service)
  - [Google Cloud Run](#google-cloud-run)
  - [Your own server / VPS](#your-own-server--vps)
- [Embedding the chatbot](#embedding-the-chatbot)
- [Customizing DocuSage](#customizing-docusage)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Operator responsibility](#operator-responsibility)
- [License](#license)

---

## What DocuSage does

- You upload documents — PDF, Word (.docx), plain text, Markdown or a saved web page —
  and their text is extracted automatically.
- The text is split into chunks and embeddings are computed for them.
- Semantic search runs on top of those chunks, so the chatbot answers only from your material.
- Embed the chatbot on any site with one script tag (three looks: classic, advanced, premium).
- Includes a REST API, team management, analytics, and a log of unsuccessful answers.
- Supported AI providers: **OpenAI**, **Google Gemini**, **Azure OpenAI** — selectable per project.

## Requirements

| What | Version | Notes |
| --- | --- | --- |
| Node.js | 20 or newer | [nodejs.org](https://nodejs.org) |
| PostgreSQL | 14+ | Local instance, [Neon](https://neon.tech), Azure Database, Cloud SQL… |
| API key | – | OpenAI, Google, or Azure OpenAI. Without one the chatbot cannot answer. |
| SMTP server | – | Optional. Without it, account activation and password reset do not work. |

---

## Quick start (local)

```bash
# 1. Clone the repository
git clone <url-of-your-fork> docusage
cd docusage

# 2. Install dependencies
npm install

# 3. Configure
cp .env.example .env
```

Fill in at least these two values in `.env`:

```bash
DATABASE_URL=postgresql://postgres:password@localhost:5432/docusage
SESSION_SECRET=<generate one, see below>
```

Generate `SESSION_SECRET` like this:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then:

```bash
# 4. Create the database schema
npm run db:push

# 5. Run it
npm run dev
```

The app runs at **http://localhost:5000**.

> **No local PostgreSQL?** The fastest route is a free instance on
> [neon.tech](https://neon.tech) — create a project, copy the connection string
> into `DATABASE_URL`, and you're done. Or use Docker:
> `docker run -d --name docusage-db -e POSTGRES_PASSWORD=password -e POSTGRES_DB=docusage -p 5432:5432 postgres:16`
>
> Either works without further configuration: a `*.neon.tech` host uses Neon's
> WebSocket driver, anything else uses a regular PostgreSQL connection.

<details>
<summary><b>Windows without Docker or an installer</b></summary>

PostgreSQL ships portable binaries that need no administrator rights:

```powershell
# 1. Download and extract
Invoke-WebRequest https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64-binaries.zip -OutFile pg.zip
Expand-Archive pg.zip -DestinationPath C:\pgsql-docusage

# 2. Initialize the data directory
"docusage_local" | Out-File -Encoding ascii pw.txt
C:\pgsql-docusage\pgsql\bin\initdb.exe -D C:\pgsql-docusage\data -U postgres --pwfile=pw.txt -E UTF8
Remove-Item pw.txt

# 3. Start it and create the database
C:\pgsql-docusage\pgsql\bin\pg_ctl.exe -D C:\pgsql-docusage\data -l C:\pgsql-docusage\pg.log start
$env:PGPASSWORD="docusage_local"
C:\pgsql-docusage\pgsql\bin\createdb.exe -h 127.0.0.1 -U postgres docusage
```

```bash
DATABASE_URL=postgresql://postgres:docusage_local@127.0.0.1:5432/docusage
```

Stop it with `pg_ctl.exe -D C:\pgsql-docusage\data stop`. Deleting the
`C:\pgsql-docusage` folder removes everything without a trace.

If you edit `pg_hba.conf` or `postgresql.conf` from PowerShell, write them
**without a BOM** — PostgreSQL refuses to start otherwise. `Set-Content -Encoding utf8`
adds one; use `[System.IO.File]::WriteAllLines($path, $lines, (New-Object System.Text.UTF8Encoding($false)))`.

</details>

---

## Creating your admin account

**The first account you register automatically gets the `admin` role** and is active
immediately (no confirmation email needed). There is nothing to configure:

1. Open http://localhost:5000/auth
2. Switch to the registration tab and fill in your details.
3. That's it — you're an admin. Administration lives at `/admin/users`.

This only applies while the users table is empty. Once the first account exists,
registration is governed by `ALLOW_PUBLIC_REGISTRATION` (default `false`), so
strangers cannot sign up on your instance.

### Additional accounts

You have three options:

- **Create them from the admin panel** — `/admin/users`, use the add-user button.
- **Temporarily enable registration** — set `ALLOW_PUBLIC_REGISTRATION=true`,
  optionally together with `ALLOWED_EMAIL_DOMAINS=yourcompany.com` so only
  colleagues can register.
- **Promote an existing account to admin directly in the database:**

  ```sql
  UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
  ```

### Locked out of your admin account?

If you have no working SMTP and cannot use the password reset flow, promote another
account with the SQL above. If you need to set a password directly, generate a hash
in the same format the application uses:

```bash
node -e "const {scrypt,randomBytes}=require('crypto');const s=randomBytes(16).toString('hex');scrypt('NewPassword123',s,64,(e,b)=>console.log(b.toString('hex')+'.'+s))"
```

Then write the result into the database:

```sql
UPDATE users SET password = '<output-of-the-command>', is_active = true WHERE email = 'you@example.com';
```

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Development server with Vite HMR (API and client on one port) |
| `npm run build` | Production build of the client (`dist/public`) and server (`dist/index.js`) |
| `npm start` | Run the production build |
| `npm run check` | Type checking (TypeScript) |
| `npm run db:push` | Apply the schema from `shared/schema.ts` to the database |

---

## Configuration

Every variable is documented in [.env.example](.env.example). The important ones:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | – | **Required.** PostgreSQL connection string. |
| `DATABASE_DRIVER` | auto | `neon` or `postgres`. Derived from `DATABASE_URL`; set it only to override. |
| `SESSION_SECRET` | – | **Required.** The server refuses to start without it. |
| `PORT` | `5000` | Application port. Azure and Cloud Run provide it themselves. |
| `APP_URL` | – | Public URL. Used in emails and as the default CORS origin. |
| `ALLOWED_ORIGINS` | `APP_URL` | Origins allowed to call the API with a session cookie. |
| `ALLOW_PUBLIC_REGISTRATION` | `false` | Whether anyone may register themselves. |
| `ALLOWED_EMAIL_DOMAINS` | – | Restrict registration to domains, e.g. `yourcompany.com`. |
| `LOGIN_MAX_ATTEMPTS` | `10` | Failed logins per IP within 15 minutes. |
| `OPENAI_API_KEY` | – | Optional; can also be set per project in the UI. |
| `SMTP_*` | – | Without these, account activation and password reset do not work. |

---

## Deploying to production

### General rules

Whichever platform you choose, these always apply:

1. **`NODE_ENV=production`** — otherwise the session cookie is not marked `secure`
   and will travel over unencrypted connections.
2. **HTTPS is mandatory.** Behind a reverse proxy, the proxy must forward the
   `X-Forwarded-Proto` header (the app has `trust proxy` enabled).
3. **Generate a fresh `SESSION_SECRET`** for every environment and store it in your
   platform's secret manager, not in the repository.
4. **Set `APP_URL` and `ALLOWED_ORIGINS`** to your real domain.
5. **Back up the database.** It holds the documents and conversation history.
6. **The `pdfs/` and `icons/` directories** hold uploaded files. On platforms with
   ephemeral disks (Cloud Run, containers) they are lost on restart — see the
   Cloud Run note below.

Build and start are the same everywhere:

```bash
npm ci
npm run build
npm start
```

### Azure App Service

The app listens on the port from `PORT`, which App Service sets for you.

**1. Create the resources** (Azure CLI):

```bash
az group create --name docusage-rg --location westeurope

az postgres flexible-server create \
  --resource-group docusage-rg \
  --name docusage-db \
  --admin-user docusage \
  --admin-password '<strong-password>' \
  --tier Burstable --sku-name Standard_B1ms \
  --version 16

az appservice plan create \
  --resource-group docusage-rg \
  --name docusage-plan \
  --is-linux --sku B1

az webapp create \
  --resource-group docusage-rg \
  --plan docusage-plan \
  --name docusage \
  --runtime "NODE:20-lts"
```

**2. Set the environment variables:**

```bash
az webapp config appsettings set --resource-group docusage-rg --name docusage --settings \
  NODE_ENV=production \
  DATABASE_URL="postgresql://docusage:<password>@docusage-db.postgres.database.azure.com:5432/postgres?sslmode=require" \
  SESSION_SECRET="<generated-string>" \
  APP_URL="https://docusage.azurewebsites.net" \
  ALLOWED_ORIGINS="https://docusage.azurewebsites.net" \
  SCM_DO_BUILD_DURING_DEPLOYMENT=true
```

**3. Set the startup command and deploy:**

```bash
az webapp config set --resource-group docusage-rg --name docusage \
  --startup-file "npm start"

az webapp up --resource-group docusage-rg --name docusage --runtime "NODE:20-lts"
```

**4. After the first start**, create the schema. The simplest way is to run
`npm run db:push` locally with `DATABASE_URL` pointing at the production database.

> **Persistent storage:** App Service has a persistent disk at `/home`, but the
> default working directory is overwritten on redeploy. To be safe, set
> `WEBSITES_ENABLE_APP_SERVICE_STORAGE=true`, and consider moving `pdfs/` to
> Azure Blob Storage if you plan to scale beyond a single instance.

### Google Cloud Run

**1. Add a `Dockerfile` to the project:**

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
CMD ["node", "dist/index.js"]
```

**2. Create the database and deploy:**

```bash
gcloud sql instances create docusage-db \
  --database-version=POSTGRES_16 --tier=db-f1-micro --region=europe-west1

gcloud sql databases create docusage --instance=docusage-db

# Store secrets in Secret Manager, not in environment variables
echo -n "<generated-string>" | gcloud secrets create docusage-session-secret --data-file=-
echo -n "postgresql://..." | gcloud secrets create docusage-database-url --data-file=-

gcloud run deploy docusage \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,APP_URL=https://<your-url>,ALLOWED_ORIGINS=https://<your-url> \
  --set-secrets SESSION_SECRET=docusage-session-secret:latest,DATABASE_URL=docusage-database-url:latest \
  --add-cloudsql-instances <project>:europe-west1:docusage-db
```

Cloud Run provides the port in `PORT` — the app honours it, so set nothing.

> **Important for Cloud Run:** containers have ephemeral disks, so uploaded documents
> and icons in `pdfs/` and `icons/` disappear on restart. The extracted document
> text lives in the database, so the chatbot keeps working, but the original files
> are gone. For production, mount
> [Cloud Storage FUSE](https://cloud.google.com/run/docs/configuring/services/cloud-storage-volume-mounts)
> on those paths, or set the minimum instance count to 1.

### Your own server / VPS

```bash
# Node 20 (Debian/Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql nginx

# Application
git clone <url> /opt/docusage && cd /opt/docusage
npm ci && npm run build
cp .env.example .env   # fill it in
npm run db:push
```

**systemd unit** (`/etc/systemd/system/docusage.service`):

```ini
[Unit]
Description=DocuSage
After=network.target postgresql.service

[Service]
Type=simple
User=docusage
WorkingDirectory=/opt/docusage
EnvironmentFile=/opt/docusage/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now docusage
```

**nginx** as a reverse proxy with HTTPS (Let's Encrypt via `certbot --nginx`):

```nginx
server {
    listen 443 ssl;
    server_name docusage.example.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;   # required for secure cookies
    }
}
```

---

## Embedding the chatbot

The project detail page shows the generated snippet. It looks like this:

```html
<!-- DocuSage AI Assistant -->
<script src="https://your-domain.com/embed.js"
  data-token="<project-token>"
  data-color="blue"
  data-theme="light"
  data-style="classic"
  data-chatbot-name="DocuSage Assistant"
  data-welcome-message="Hello, how can I help you?"
  data-disclaimer-text="Answers are generated by AI and may not always be accurate."
></script>
<!-- End DocuSage AI Assistant -->
```

Switch the look with the `data-style` attribute: `classic`, `advanced`, or `premium`
(matching `embed.js`, `embed-advanced.js`, `embed-premium.js`).

The widget uses no cookies and authenticates solely with the project token, so it
works from any domain.

---

## Customizing DocuSage

**[docs/CUSTOMIZATION.md](docs/CUSTOMIZATION.md) is the guide for changing anything
after forking** — it says exactly which file to edit for each change.

The things people change most often:

| I want to change… | Where |
| --- | --- |
| What the chatbot sounds like | Project → Chatbot settings (no code) |
| Default personality for every project | [`server/prompts.ts`](server/prompts.ts) |
| The language answers come back in | The prompt — see [section 2](docs/CUSTOMIZATION.md#2-the-language-the-chatbot-answers-in) |
| Interface language (default is English) | [`client/src/hooks/use-language.tsx`](client/src/hooks/use-language.tsx) |
| Widget colours and text | Project → Embed settings (no code) |
| Colour palette of the app | [`client/src/index.css`](client/src/index.css) |
| The name "DocuSage" | [section 5](docs/CUSTOMIZATION.md#5-branding-and-name) lists every place |

**All default AI prompts live in one file: [`server/prompts.ts`](server/prompts.ts).**
Each constant is documented with where it is used. A project's own prompt, set in
the UI, always takes precedence over these fallbacks.

---

## Project structure

```
client/               React frontend (Vite root)
  public/             Static files + embed widgets
  src/                Components, pages, hooks
server/
  index.ts            Entry point, CORS, embed chat endpoint
  auth.ts             Registration, login, sessions, passwords
  routes.ts           Main API
  storage.ts          Database layer (Drizzle)
  prompts.ts          All default AI prompts (edit here to change behaviour)
  ai/                 Fallback answer generation via OpenAI
  services/
    documentProcessor.ts   Chunking, embeddings, semantic search
    extractors/            Text extraction, one module per file format
    pdfExtractor.ts        PDF text extraction, used by the PDF extractor
    failureDetection.ts    Detection of unsuccessful answers
shared/schema.ts      Drizzle schema shared by client and server
docs/CUSTOMIZATION.md How to change prompts, branding, language, colours
pdfs/, icons/         Files uploaded at runtime (git-ignored)
```

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `SESSION_SECRET is not set` | Add it to `.env`. The server requires it by design. |
| `DATABASE_URL must be set` | Missing connection string, or `.env` was not loaded from the project root. |
| Chatbot always replies "I don't know the answer" | The project has no API key, or the documents have no chunks yet. Check that the document was processed. |
| Nothing happens after uploading a document | The project has no OpenAI key — chunking will not start without one. |
| Document uploaded but 0 characters of text | Usually a scanned PDF with no text layer. DocuSage does not do OCR — run the file through an OCR tool first. |
| Cannot log in even with the right password | The account is waiting for email activation, or its password is in an old format. Use the password reset flow. |
| `[CORS] Rejected origin` in the log | Add the domain to `ALLOWED_ORIGINS`. |
| Login does not persist in production | Missing HTTPS, or the proxy does not forward `X-Forwarded-Proto`. |
| "Too many failed attempts" | Brute-force protection. Wait 15 minutes or raise `LOGIN_MAX_ATTEMPTS`. |

> **Note on language:** the application is English throughout — interface, API
> responses, log messages, and the default AI prompts. A Czech translation is
> still shipped and selectable, but it is partial: only strings that go through
> the `t()` helper switch language. See
> [CUSTOMIZATION.md](docs/CUSTOMIZATION.md#3-interface-language).

---

## Security

The security model, recommended configuration, and how to report vulnerabilities
are described in [SECURITY.md](SECURITY.md).

## Operator responsibility

> **The software is provided "as is", without warranty of any kind.** The authors and
> contributors of DocuSage do not operate any instance of this application and are not
> liable for damages arising from its use. See [LICENSE](LICENSE) for the full text.

If you deploy DocuSage and make it available to other people, you become the
**operator** and take on full responsibility for running it. Before going live, make
sure you have handled at least the following:

- **Data protection (GDPR).** Towards your users, you are the data controller.
  The template in [privacy-page.tsx](client/src/pages/privacy-page.tsx) is only a
  starting point — fill in the `OPERATOR` constant, adjust the text to reflect
  reality, and have a lawyer review it.
- **Data sent to AI providers.** The contents of uploaded documents and users'
  questions are sent to the provider you select (OpenAI, Google, Azure OpenAI),
  which may be outside the EEA. Tell your users, and do not upload documents you
  have no rights to.
- **Your own API keys and secrets.** Never commit them; they belong in `.env`,
  which is git-ignored.
- **Hardening the instance.** Follow [SECURITY.md](SECURITY.md).
- **Answer accuracy.** Answers are generated by a language model and can be wrong.
  Keep a visible disclaimer in the chatbot (the `data-disclaimer-text` setting).
- **Default content.** The testimonials on the References page and the landing page
  copy are placeholders — replace them with your own, and only publish third-party
  brands or quotes with their consent.

## License

[MIT](LICENSE) — use it, modify it, deploy it commercially; just keep the license text.

For a deeper architecture overview see [PROJECT.md](PROJECT.md), and for the public
API reference see [API_DOCUMENTATION.md](API_DOCUMENTATION.md).
