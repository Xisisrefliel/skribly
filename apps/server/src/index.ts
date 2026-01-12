import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import { requireAuth } from './middleware/authMiddleware.js';
import { uploadRouter } from './routes/upload.js';
import { transcriptionRouter } from './routes/transcription.js';
import { studyRouter } from './routes/study.js';
import { iosAuthRouter } from './routes/iosAuth.js';
import { publicRouter } from './routes/public.js';
import { foldersRouter } from './routes/folders.js';
import { tagsRouter } from './routes/tags.js';
import { d1Service } from './services/d1.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://lecture-web.pages.dev',
    'https://lecture-transcription-api.fly.dev',
  ],
  credentials: true,
  exposedHeaders: ['set-auth-token'],
}));
app.use(cookieParser());
app.use(express.json());

// better-auth handler
const authHandler = toNodeHandler(auth);

// Handle OAuth callback - intercept to append token to redirect URL for Safari
app.all('/api/auth/callback/*', async (req, res, next) => {
  // Create a wrapper response to intercept the redirect
  const originalRedirect = res.redirect.bind(res);
  let capturedToken: string | null = null;

  // Intercept setHeader to capture the session token
  const originalSetHeader = res.setHeader.bind(res);
  res.setHeader = function(name: string, value: any) {
    if (name.toLowerCase() === 'set-auth-token' && typeof value === 'string') {
      capturedToken = value;
    }
    // Also check Set-Cookie for the session token
    if (name.toLowerCase() === 'set-cookie') {
      const cookies = Array.isArray(value) ? value : [value];
      for (const cookie of cookies) {
        const match = cookie.match(/better-auth\.session_token=([^;]+)/);
        if (match && !capturedToken) {
          capturedToken = match[1];
        }
      }
    }
    return originalSetHeader(name, value);
  };

  // Override redirect to append token
  res.redirect = function(statusOrUrl: number | string, url?: string) {
    let redirectUrl: string;
    let status: number;

    if (typeof statusOrUrl === 'number') {
      status = statusOrUrl;
      redirectUrl = url || '/';
    } else {
      status = 302;
      redirectUrl = statusOrUrl;
    }

    // Append token to redirect URL if we have one and it's going to the frontend
    if (capturedToken) {
      try {
        const urlObj = new URL(redirectUrl, `${req.protocol}://${req.get('host')}`);
        // Only append to frontend URLs
        const isFrontendUrl = 
          urlObj.origin.includes('localhost:5173') ||
          urlObj.origin.includes('lecture-web.pages.dev');
        
        if (isFrontendUrl && !urlObj.searchParams.has('token')) {
          urlObj.searchParams.set('token', capturedToken);
          redirectUrl = urlObj.toString();
        }
      } catch (e) {
        // If URL parsing fails, try simple string append
        if (!redirectUrl.includes('token=')) {
          const separator = redirectUrl.includes('?') ? '&' : '?';
          redirectUrl = `${redirectUrl}${separator}token=${encodeURIComponent(capturedToken)}`;
        }
      }
    }

    return originalRedirect(status, redirectUrl);
  } as any;

  // Let better-auth handle the request
  try {
    await authHandler(req, res);
  } catch (err) {
    next(err);
  }
});

// All other auth routes
app.all('/api/auth/*', (req, res, next) => {
  authHandler(req, res).catch(next);
});

app.all('/api/auth', (req, res, next) => {
  authHandler(req, res).catch(next);
});

// iOS-specific auth route
app.use('/api', iosAuthRouter);

// Public routes
app.use('/api/public', publicRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root redirect to frontend
app.get('/', (_req, res) => {
  res.redirect('https://lecture-web.pages.dev');
});

// Initialize database schema endpoint
app.post('/init-db', async (_req, res) => {
  try {
    await d1Service.initSchema();
    res.json({ success: true, message: 'Database schema initialized' });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// API routes (protected)
app.use('/api', requireAuth);
app.use('/api', uploadRouter);
app.use('/api', transcriptionRouter);
app.use('/api', studyRouter);
app.use('/api', foldersRouter);
app.use('/api', tagsRouter);

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
async function start() {
  try {
    console.log('Initializing database schema...');
    await d1Service.initSchema();
    console.log('Database schema ready');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Auth endpoints available at /api/auth/*`);
  });
}

start();
