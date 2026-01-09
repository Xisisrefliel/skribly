import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { uploadRouter } from './routes/upload.js';
import { transcriptionRouter } from './routes/transcription.js';
import { deviceAuth } from './middleware/deviceAuth.js';
import { d1Service } from './services/d1.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

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

// API routes (protected by device auth)
app.use('/api', deviceAuth);
app.use('/api', uploadRouter);
app.use('/api', transcriptionRouter);

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
  });
}

start();
