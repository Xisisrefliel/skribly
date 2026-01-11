# Skribly

Skribly is a lecture transcription and note-taking app that transforms audio recordings into structured, readable notes using AI.

## Features

- Record or upload audio lectures
- Automatic transcription using Groq's Whisper API
- AI-powered structuring of raw transcriptions into organized notes with headers, bullet points, and formatting
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
│   │           ├── Models/          # Data models
│   │           ├── Views/           # SwiftUI views
│   │           ├── ViewModels/      # State management
│   │           └── Services/        # API client, Keychain
│   │
│   ├── server/              # Node.js backend (Express)
│      └── src/
│          ├── routes/      # API endpoints
│          ├── services/    # Business logic (transcription, PDF, storage)
│          └── middleware/  # Auth middleware
│
└── packages/
    └── shared/              # Shared TypeScript types
```

## Tech Stack

### iOS App
- **SwiftUI** - Modern declarative UI framework
- **Swift Concurrency** - async/await for network operations
- **Keychain Services** - Secure device ID storage

### Backend Server
- **Node.js + Express** - REST API server
- **Groq API** - Fast Whisper transcription
- **Anthropic Claude** - LLM for note structuring
- **Cloudflare R2** - Audio and PDF storage
- **Cloudflare D1** - SQLite database
- **md-to-pdf** - PDF generation from Markdown

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
   GROQ_API_KEY=your_groq_api_key
   ANTHROPIC_API_KEY=your_anthropic_api_key
   CLOUDFLARE_ACCOUNT_ID=your_account_id
   CLOUDFLARE_API_TOKEN=your_api_token
   R2_ACCESS_KEY_ID=your_r2_access_key
   R2_SECRET_ACCESS_KEY=your_r2_secret
   R2_BUCKET_NAME=your_bucket_name
   D1_DATABASE_ID=your_d1_database_id
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

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/transcriptions` | List all transcriptions |
| GET | `/api/transcription/:id` | Get single transcription |
| POST | `/api/upload` | Upload audio file |
| POST | `/api/transcribe/:id` | Start transcription |
| POST | `/api/transcription/:id/pdf` | Generate/get PDF |
| DELETE | `/api/transcription/:id` | Delete transcription |

## License

Private - All rights reserved
