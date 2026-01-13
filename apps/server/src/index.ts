import express from 'express';
import cors from 'cors';
import { clerkMiddleware, requireAuth as authMiddleware } from './middleware/authMiddleware.js';
import { uploadRouter } from './routes/upload.js';
import { transcriptionRouter } from './routes/transcription.js';
import { studyRouter } from './routes/study.js';
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
}));
app.use(express.json());

// Clerk middleware - must be applied before routes
app.use(clerkMiddleware());

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
app.use('/api', authMiddleware);
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
  });
}

start();
