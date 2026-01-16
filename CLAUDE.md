# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Lecture** (also known as Notism/Skribly) is an AI-powered lecture transcription and study tool. It transforms audio, video, and document files into structured notes with auto-generated quizzes and flashcards.

## Package Manager

**ALWAYS use `bun` instead of `npm` for all operations.**

```bash
bun install              # Install dependencies
bun add <package>        # Add dependency
bun add -d <package>     # Add dev dependency
bun run <script>         # Run scripts
```

## Build Commands

### From Repository Root
```bash
bun run dev:server       # Run server with hot reload
bun run dev:web          # Run web frontend dev server
bun run build:server     # Build server
bun run build:web        # Build web frontend
```

### Server (`apps/server`)
```bash
bun run dev              # Development with hot reload (tsx watch)
bun run build            # TypeScript compile to dist/
bun run typecheck        # Type-check without emit
bun run deploy           # Deploy to Fly.io
```

### Web Frontend (`apps/web-frontend`)
```bash
bun run dev              # Vite dev server
bun run build            # Production build (tsc + vite build)
bun run lint             # ESLint
bun run typecheck        # Type-check only
bun run deploy           # Build and deploy to Cloudflare Pages
```

## Architecture

### Monorepo Structure
- `apps/server` - Express.js backend (TypeScript, Node.js, Clerk auth)
- `apps/web-frontend` - React web app (TypeScript, Vite, Tailwind CSS v4, Clerk auth)
- `apps/ios` - iOS app (Swift, SwiftUI) - *incomplete, ignore errors*
- `packages/shared` - Shared TypeScript types used by server and web

### Server Architecture (`apps/server/src/`)
- `index.ts` - Express app setup, middleware registration, route mounting
- `routes/` - API endpoint handlers (upload, transcription, study, folders, tags, billing)
- `services/` - Business logic (d1.ts for DB, llm.ts for AI, audio.ts, pdf.ts, etc.)
- `middleware/` - Auth middleware (Clerk integration)

### Web Frontend Architecture (`apps/web-frontend/src/`)
- `App.tsx` - React Router setup with lazy-loaded pages, Clerk provider
- `pages/` - Route pages (HomePage, AuthenticatedHome, UploadPage, TranscriptionPage)
- `components/` - UI components, `components/ui/` for reusable primitives
- `contexts/` - React contexts (AuthContext, ThemeContext, TranscriptionCacheContext)
- `lib/` - Utilities (api.ts for API calls, utils.ts for cn() helper)
- `hooks/` - Custom React hooks

### Data Flow
1. User uploads audio/video/document via web frontend
2. Server stores file in Cloudflare R2, creates DB record in Cloudflare D1
3. Transcription via OpenAI Whisper or Groq
4. LLM (Claude) structures transcription into formatted notes
5. Study materials (quizzes, flashcards) generated on-demand

## Code Style

### TypeScript
- Strict mode enabled across all packages
- Use `type` keyword for type-only imports: `import type { Transcription } from '@lecture/shared'`
- Prefer explicit return types for public functions
- Avoid `any` - use `unknown` with type guards

### Import Conventions

**Server** - Use `.js` extension for relative imports (ESM requirement):
```typescript
import { auth } from './auth.js';
import { d1Service } from './services/d1.js';
```

**Web frontend** - Use `@/` path alias:
```typescript
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
```

**Import order**: Node builtins → External packages → `@lecture/shared` → Relative imports

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Component files | PascalCase | `TranscriptionDetail.tsx` |
| Utility files | camelCase | `utils.ts`, `api.ts` |
| React components | PascalCase | `function QuizView()` |
| Functions | camelCase | `generateQuiz()` |
| Constants | UPPER_SNAKE_CASE | `API_ENDPOINTS` |
| Types/Interfaces | PascalCase | `interface Transcription` |
| Database columns | snake_case | `created_at` |
| API routes | kebab-case | `/api/transcription/:id/quiz` |

### React Patterns
- Use `cn()` utility for conditional Tailwind classes: `<div className={cn("base", isActive && "active")} />`
- Button classes: `neu-button`, `neu-button-primary`, `neu-button-destructive`, `neu-button-info`, `neu-button-success`, `neu-button-warning`, `neu-button-purple`

### Database
- Cloudflare D1 (SQLite) accessed via REST API
- DB columns use `snake_case`, TypeScript uses `camelCase`
- All types imported from `@lecture/shared`

## Key Gotchas

1. **Monorepo imports** - IDE errors for `@lecture/shared` are false positives; the types resolve correctly at build time
2. **iOS app** - Incomplete with build errors; focus on server/web development
3. **Tailwind v4** - Uses `@theme inline` syntax in index.css, not `tailwind.config.js`
4. **Language support** - Quiz/flashcard generation uses `detectedLanguage` field from transcriptions
5. **Clerk auth** - Both frontend (`VITE_CLERK_PUBLISHABLE_KEY`) and backend (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`) must use matching Clerk instance keys
