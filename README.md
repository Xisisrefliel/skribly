# Skribly

Skribly is a lecture transcription and note-taking app that transforms audio recordings into structured, readable notes using AI.

## Features

- **Google Sign-In Authentication** - Secure user accounts with Google OAuth
- Record or upload audio lectures
- Automatic transcription using OpenAI or Groq's Whisper API
- AI-powered structuring of raw transcriptions into organized notes
- **Auto-generated study materials** - Quizzes and flashcards from lecture content
- Export notes as beautifully formatted PDFs
- Local PDF caching for instant sharing
- Batch export multiple lectures at once

## Project Structure

This is a monorepo containing:

```
├── apps/
│   ├── ios/                 # Native iOS app (SwiftUI)
│   │   └── Lecture/
│   │       └── Sources/
│   │           ├── Auth/           # Authentication service
│   │           ├── Models/         # Data models
│   │           ├── Views/          # SwiftUI views
│   │           ├── ViewModels/     # State management
│   │           └── Services/       # API client, Keychain
│   │
│   ├── server/              # Node.js backend (Express)
│   │   └── src/
│   │       ├── routes/      # API endpoints
│   │       ├── services/    # Business logic (transcription, PDF, storage)
│   │       ├── middleware/  # Auth middleware
│   │       └── adapters/    # Database adapters
│   │
│   └── web-frontend/        # React web dashboard (Vite)
│       └── src/
│           ├── components/  # UI components
│           ├── pages/       # Route pages
│           └── contexts/    # Auth context
│
└── packages/
    └── shared/              # Shared TypeScript types
```

## Tech Stack

### iOS App
- **SwiftUI** - Modern declarative UI framework
- **Swift Concurrency** - async/await for network operations
- **Google Sign-In SDK** - OAuth authentication

### Backend Server
- **Node.js + Express** - REST API server
- **Clerk** - Authentication and user management
- **OpenAI API** - gpt-4o-mini-transcribe for transcription
- **Groq API** - Alternative Whisper transcription provider
- **Anthropic Claude** - LLM for note structuring and study materials
- **Cloudflare R2** - Audio and PDF storage
- **Cloudflare D1** - SQLite database

### Web Frontend
- **React + Vite** - Fast development and builds
- **TypeScript** - Type-safe development
- **Tailwind CSS + shadcn/ui** - Modern styling
- **Clerk React** - Authentication UI and session management

## Getting Started

### Prerequisites

- Xcode 15+ (for iOS development)
- Node.js 18+
- Bun (recommended) or npm

### Backend Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Create a `.env` file in `apps/server/`:
   ```env
   # Transcription (choose provider)
   TRANSCRIPTION_PROVIDER=openai  # or 'groq'
   OPENAI_API_KEY=your_openai_api_key
   GROQ_API_KEY=your_groq_api_key

   # LLM for structuring
   ANTHROPIC_API_KEY=your_anthropic_api_key

   # Cloudflare
   CLOUDFLARE_ACCOUNT_ID=your_account_id
   CLOUDFLARE_API_TOKEN=your_api_token
   R2_ACCESS_KEY_ID=your_r2_access_key
   R2_SECRET_ACCESS_KEY=your_r2_secret
   R2_BUCKET_NAME=your_bucket_name
   D1_DATABASE_ID=your_d1_database_id

   # Authentication (Clerk)
   CLERK_SECRET_KEY=sk_test_...
   CLERK_PUBLISHABLE_KEY=pk_test_...
   ```

3. Run the development server:
   ```bash
   bun run dev:server
   ```

### iOS App Setup

1. Open `apps/ios/Lecture.xcodeproj` in Xcode

2. Update the server URL in `APIClient.swift`:
   ```swift
   private let baseURL = "http://YOUR_LOCAL_IP:3000"
   ```

3. Build and run on simulator or device

### Web Frontend Setup

1. Navigate to web frontend:
   ```bash
   cd apps/web-frontend
   ```

2. Install dependencies and run:
   ```bash
   bun install
   bun run dev
   ```

## Deployment

### Production Deployment Checklist

#### Backend (Fly.io)

The backend requires **both** Clerk environment variables to authenticate requests:

1. Set Clerk secrets on Fly.io:
   ```bash
   fly secrets set CLERK_SECRET_KEY=sk_live_... --app lecture-transcription-api
   fly secrets set CLERK_PUBLISHABLE_KEY=pk_live_... --app lecture-transcription-api
   ```

2. **Critical**: Both keys must match the same Clerk instance/environment:
   - If using **test** environment: use `sk_test_...` and `pk_test_...`
   - If using **live** environment: use `sk_live_...` and `pk_live_...`
   - The frontend and backend must use keys from the same Clerk instance

3. Verify secrets are set:
   ```bash
   fly secrets list --app lecture-transcription-api
   ```

4. Deploy:
   ```bash
   cd apps/server
   bun run deploy
   ```

The server will fail to start in production if either `CLERK_SECRET_KEY` or `CLERK_PUBLISHABLE_KEY` is missing.

#### Web Frontend (Cloudflare Pages)

1. Set environment variable in Cloudflare Pages dashboard:
   - `VITE_CLERK_PUBLISHABLE_KEY` = `pk_live_...` (or `pk_test_...` for test)

2. Ensure `VITE_API_URL` is set to your backend URL:
   - `VITE_API_URL` = `https://lecture-transcription-api.fly.dev`

3. Deploy:
   ```bash
   cd apps/web-frontend
   bun run deploy
   ```

#### Troubleshooting 401 Errors

If you see `401 Unauthorized` errors after deployment:

1. **Check Fly logs** for auth diagnostics:
   ```bash
   fly logs --app lecture-transcription-api
   ```
   Look for `[Auth] 401 Unauthorized` entries that show:
   - `hasAuthHeader`: whether the Authorization header was present
   - `authHeaderType`: Bearer/Other/None
   - `userId`: null if token verification failed

2. **Verify environment variables match**:
   - Frontend `VITE_CLERK_PUBLISHABLE_KEY` and backend `CLERK_PUBLISHABLE_KEY` must be from the same Clerk instance
   - Both must be test keys (`pk_test_...`) or both live keys (`pk_live_...`)

3. **Check token transmission**:
   - Frontend should include `Authorization: Bearer <token>` header
   - Token is obtained via Clerk's `getToken()` function

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ios-auth/google` | iOS Google Sign-In token exchange |
| All `/api/*` routes | Protected by Clerk authentication | Requires `Authorization: Bearer <token>` header |

### Transcriptions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transcriptions` | List all transcriptions |
| GET | `/api/transcription/:id` | Get single transcription |
| POST | `/api/upload` | Upload audio file |
| POST | `/api/transcribe/:id` | Start transcription |
| POST | `/api/transcription/:id/pdf` | Generate/get PDF |
| DELETE | `/api/transcription/:id` | Delete transcription |

### Study Materials
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transcription/:id/quiz` | Get quiz for transcription |
| GET | `/api/transcription/:id/flashcards` | Get flashcards for transcription |

## License

Private - All rights reserved
