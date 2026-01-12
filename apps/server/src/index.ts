import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import { requireAuth } from './middleware/authMiddleware.js';
import { uploadRouter } from './routes/upload.js';
import { transcriptionRouter } from './routes/transcription.js';
import { studyRouter } from './routes/study.js';
import { iosAuthRouter } from './routes/iosAuth.js';
import { d1Service } from './services/d1.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: true, // Allow all origins for iOS app
  credentials: true, // Allow cookies
}));
app.use(express.json());

// better-auth handler - handles all /api/auth/* routes
// Must be before other middleware that parses the body
const authHandler = toNodeHandler(auth);
app.all('/api/auth/*', authHandler);
app.all('/api/auth', authHandler);

// iOS-specific auth route (validates iOS Google ID tokens)
// Must be before requireAuth middleware
app.use('/api', iosAuthRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize database schema endpoint (for manual setup)
app.post('/init-db', async (_req, res) => {
  try {
    await d1Service.initSchema();
    res.json({ success: true, message: 'Database schema initialized' });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// API routes (protected by auth middleware)
app.use('/api', requireAuth);
app.use('/api', uploadRouter);
app.use('/api', transcriptionRouter);
app.use('/api', studyRouter);

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Initialize database and start server
async function start() {
  try {
    console.log('Initializing database schema...');
    await d1Service.initSchema();
    console.log('Database schema ready');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    console.log('Server will start anyway - you can manually call POST /init-db');
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Auth endpoints available at /api/auth/*`);
  });
}

start();
