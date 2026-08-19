# DocuSage - AI-Powered Document Chat Platform

## Overview

DocuSage is a comprehensive AI-powered platform that enables users to create custom chatbots trained on their PDF documents. The application allows users to upload PDF files, which are processed and chunked for semantic search, enabling intelligent Q&A interactions. The platform supports embedding chatbots into external websites and provides analytics, team management, and API access.

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
- **File Handling**: Multer for PDF upload processing
- **Authentication**: Passport.js with local strategy and session-based auth
- **PDF Processing**: Text extraction and chunking for semantic search
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

### Embedding and Widget System
- **Embed Generation**: Dynamic JavaScript widget generation
- **Variants**: Classic (`embed.js`), Advanced (`embed-advanced.js`), Premium (`embed-premium.js`)
- **Cross-Origin Support**: Comprehensive CORS handling for iframe embedding
- **Customization**: Theme, color, and behavior customization options
- **Analytics Tracking**: Embedded widget usage analytics

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
