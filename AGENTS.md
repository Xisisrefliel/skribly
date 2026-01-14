# AGENTS.md - Coding Agent Guidelines

Guidelines for AI coding agents working in the Lecture monorepo.

## Project Overview

**Lecture** is an AI-powered lecture transcription and study tool:
- `apps/server` - Express.js backend (TypeScript, Node.js)
- `apps/web-frontend` - React web app (TypeScript, Vite, Tailwind CSS v4)
- `apps/ios` - iOS app (Swift, SwiftUI) - *incomplete, ignore errors*
- `packages/shared` - Shared TypeScript types

## Package Manager

**ALWAYS use `bun` instead of `npm` for all operations.**

```bash
bun install              # Install dependencies
bun add <package>        # Add dependency
bun add -d <package>     # Add dev dependency
bun run <script>         # Run scripts
```

## Build Commands

### Server (`apps/server`)
```bash
bun run dev              # Development with hot reload
bun run build            # TypeScript compile to dist/
bun run typecheck        # Type-check without emit
```

### Web Frontend (`apps/web-frontend`)
```bash
bun run dev              # Vite dev server
bun run build            # Production build
bun run lint             # ESLint
bun run typecheck        # Type-check only
```

## Code Style Guidelines

### TypeScript
- **Strict mode** - All packages use `"strict": true`
- **Type imports** - Use `type` keyword: `import type { Transcription } from '@lecture/shared'`
- **Explicit return types** - Prefer for public functions
- **Avoid `any`** - Use `unknown` and type guards

### Imports

**Server** - Use `.js` extension for relative imports (ESM requirement):
```typescript
import { auth } from './auth.js';
import { d1Service } from './services/d1.js';
```

**Web frontend** - Use `@/` alias:
```typescript
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
```

**Order**: Node builtins → External packages → `@lecture/shared` → Relative imports

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

### Error Handling

**Server**:
```typescript
try {
  const result = await someOperation();
  res.json(result);
} catch (error) {
  console.error('Operation failed:', error);
  res.status(500).json({
    error: 'Failed to perform operation',
    message: error instanceof Error ? error.message : 'Unknown error',
  });
}
```

### React Patterns

**Component structure**:
```typescript
import { useState } from 'react';
import type { SomeType } from '@lecture/shared';
import { Button } from '@/components/ui/button';

interface Props {
  data: SomeType;
}

export function MyComponent({ data }: Props) {
  const [state, setState] = useState('');
  return <div>...</div>;
}
```

**Tailwind** - Use `cn()` for conditional classes:
```typescript
<div className={cn("base", isActive && "active")} />
```

**Button classes** - Use `neu-button-*` for consistent styling:
- `neu-button` - Secondary/outline
- `neu-button-primary` - Primary actions
- `neu-button-destructive` - Destructive actions
- `neu-button-info` / `neu-button-success` / `neu-button-warning` / `neu-button-purple`

### Database
- Uses Cloudflare D1 (SQLite) via REST API
- DB columns: `snake_case` → TypeScript: `camelCase`
- Always import types from `@lecture/shared`

## File Structure

```
apps/
  server/src/
    index.ts, auth.ts, middleware/, routes/, services/
  web-frontend/src/
    components/, components/ui/, contexts/, lib/, pages/, index.css
packages/
  shared/src/
    types.ts, index.ts
```

## Common Gotchas

2. **Monorepo imports** - IDE errors for `@lecture/shared` are false positives
3. **iOS app** - Incomplete, has build errors - ignore and focus on server/web
4. **Tailwind v4** - Uses `@theme inline` syntax, not `tailwind.config.js`
5. **Language support** - Quiz/flashcard generation uses `detectedLanguage` field
