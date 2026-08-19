# DocuSage - AI-Powered Document Chat Platform

## Overview

DocuSage is a self-hosted platform for building chatbots that answer from your own documents. Uploads — PDF, Word, plain text, Markdown or a saved web page — are extracted, chunked and indexed for hybrid search, so a question is answered from your material rather than from what the model remembers. Chatbots embed into external websites with one script tag, and the platform provides analytics, team management, per-project cost reporting and API access.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Build Tool**: Vite for development and production builds
- **Styling**: Tailwind CSS with ShadCN UI components for consistent design
- **Theme**: CSS custom properties defined in `client/src/index.css`, consumed by `tailwind.config.ts`
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **Authentication**: Context-based auth system with session management

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM for type-safe database operations
- **File Handling**: Multer for uploads, with the accepted formats declared in `shared/documentFormats.ts`
- **Authentication**: Passport.js with local strategy and session-based auth
- **Document Processing**: Format-specific text extraction, then chunking and embedding
- **Streaming**: Server-sent events for token-by-token answers (`server/sse.ts`), with a
  non-streaming endpoint kept alongside it because widget scripts live in third-party
  pages and browser caches
- **Rate Limiting**: `express-rate-limit` — a ceiling over every `/api` route, with
  tighter limits on the endpoints a visitor can reach without an account
- **Configuration**: Environment variables loaded from `.env` via `dotenv` (see `.env.example`)

### Database Design
- **Primary Database**: PostgreSQL (via Neon serverless)
- **Schema Management**: Drizzle migrations
- **Key Tables**:
  - Users with role-based access (user, vip, unlimited, admin)
  - Projects with customizable chatbot settings
  - PDF documents with processed chunks and embeddings
  - Chat sessions and message history
  - Team members with hierarchical permissions
  - API calls tracking and analytics
  - Provider token usage per project (`usage_events`), reported with an estimated
    cost derived at read time from a dated price table
  - Contact requests left by visitors the chatbot could not help (`leads`), holding
    a copy of the unanswered question so the lead outlives the conversation
  - The session store's `session` table, declared so `drizzle-kit push` does not
    offer to rename it into a newly added table

### AI Integration Architecture
- **Flexible AI Provider System**: Support for OpenAI, Google, and Azure OpenAI providers
- **Dynamic Model Selection**: Provider-specific model selection (GPT-4, Gemini Pro, etc.)
- **Provider Configuration**: Per-project AI provider and model settings with API key management
- **Fallback Models**: Multiple fallback systems including local models
- **Document Processing**: Multi-stage chunking and embedding generation
- **Hybrid Retrieval**: Vector similarity (pgvector, or computed in-process when the
  extension is unavailable) fused with PostgreSQL full-text search using reciprocal
  rank fusion, weighted by the source document's 1-10 weight
- **Response Pipeline**: Context-aware response generation with document grounding
- **Citations**: An answer can name the chunks it was built from, so a reader can check
  it against the source (`server/services/citations.ts`); off unless the project asks
  for it
- **Hand-written Answers**: An unanswered question can be answered from the failure
  log; the answer is stored as an ordinary chunk in a per-project document, so it is
  retrieved exactly like content from an uploaded file
  (`server/services/knowledgeAnswers.ts`)

### Embedding and Widget System
- **Embed Generation**: Dynamic JavaScript widget generation
- **Variants**: Classic (`embed.js`), Advanced (`embed-advanced.js`), Premium (`embed-premium.js`)
- **Cross-Origin Support**: Comprehensive CORS handling for iframe embedding
- **Customization**: Theme, color, and behavior customization options
- **Analytics Tracking**: Embedded widget usage analytics
- **Abuse Controls**: An optional allowed-domain list and a monthly message cap per
  project (`server/services/embedGuards.ts`), both off by default — the widget's token
  is visible in the page source of every site that embeds it
- **Lead Capture**: When an answer fails and the project asks for it, the widget offers
  a contact form instead of leaving the visitor with nothing; the request is stored
  before any email is attempted

## External Dependencies

### AI Services
- **Multi-Provider Support**: OpenAI, Google Generative AI, Azure OpenAI
- **OpenAI API**: GPT models (GPT-4, GPT-4 Turbo, GPT-3.5 Turbo)
- **Google AI**: Gemini models (Gemini Pro, Gemini 1.5 Pro, PaLM 2)
- **Azure OpenAI**: Self-hosted Azure OpenAI endpoints with custom models
- **HuggingFace Transformers**: Fallback models and embeddings generation
- **Anthropic Claude**: Alternative AI provider support

### Database and Infrastructure
- **Neon Database**: Serverless PostgreSQL hosting

### Email and Communication
- **SMTP Integration**: Configurable email service for user notifications
- **SendGrid**: Email service integration support

### Development and Build Tools
- **TypeScript**: Type safety across frontend and backend
- **ESBuild**: Fast bundling for production builds
- **Drizzle Kit**: Database migration and schema management

### File Processing
- **Text Extraction**: One extractor per format (PDF, .docx, plain text, Markdown, HTML),
  registered in `shared/documentFormats.ts` and implemented in `server/services/extractors`.
  Everything downstream works on plain text and does not know which format produced it.
- **File Storage**: Local filesystem with organized project-based structure (`pdfs/`)

### Authentication and Security
- **bcrypt**: Password hashing and security
- **express-session**: Session management with PostgreSQL store
- **CORS**: Cross-origin resource sharing configuration
- **express-rate-limit**: Request limits, recognised by static analysis as such
- **CodeQL**: `security-extended` on every pull request, with the findings printed into
  the job log rather than left in the Security tab
