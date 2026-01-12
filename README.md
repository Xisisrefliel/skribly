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
- **better-auth** - Session-based authentication
- **OpenAI API** - gpt-4o-mini-transcribe for transcription
- **Groq API** - Alternative Whisper transcription provider
- **Anthropic Claude** - LLM for note structuring and study materials
- **Cloudflare R2** - Audio and PDF storage
- **Cloudflare D1** - SQLite database

### Web Frontend
- **React + Vite** - Fast development and builds
- **TypeScript** - Type-safe development
- **Tailwind CSS + shadcn/ui** - Modern styling

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

   # Authentication
   BETTER_AUTH_SECRET=your_32_char_secret
   BETTER_AUTH_URL=http://localhost:3000
   GOOGLE_IOS_CLIENT_ID=your_ios_client_id.apps.googleusercontent.com
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

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ios-auth/google` | iOS Google Sign-In token exchange |
| GET | `/api/auth/*` | better-auth endpoints |

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
