import { Router, Request, Response, NextFunction } from 'express';
import type { Router as RouterType } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { r2Service } from '../services/r2.js';
import { d1Service } from '../services/d1.js';
import type { UploadResponse, SourceType } from '@lecture/shared';

const router: RouterType = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max file size
  },
  fileFilter: (_req, file, cb) => {
    // Accept audio, video, and document files
    const allowedMimes = [
      // Audio formats
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/m4a',
      'audio/x-m4a',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/ogg',
      'audio/flac',
      'audio/webm',
      'audio/aac',
      // Video formats
      'video/mp4',
      'video/mpeg',
      'video/quicktime',  // .mov files
      'video/x-msvideo',  // .avi files
      'video/x-matroska', // .mkv files
      'video/webm',
      'video/ogg',
      'video/3gpp',
      'video/3gpp2',
      // Document formats
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'application/vnd.ms-powerpoint', // .ppt (legacy)
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    ];
    
    if (allowedMimes.includes(file.mimetype) || 
        file.mimetype.startsWith('audio/') || 
        file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only audio, video, and document files are allowed.`));
    }
  },
});

async function requireActiveSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.userId!;
    const isActive = await d1Service.isSubscriptionActive(userId);

    // Allow 3 free transcriptions for users without subscription
    if (!isActive) {
      const transcriptionCount = await d1Service.getTranscriptionCountByUser(userId);
      if (transcriptionCount >= 3) {
        res.status(402).json({
          error: 'Subscription required',
          message: 'You have used your 3 free transcriptions. Please subscribe to continue.',
          freeLimit: 3,
          currentCount: transcriptionCount,
        });
        return;
      }
    }

    next();
  } catch (error) {
    console.error('Subscription check failed:', error);
    res.status(500).json({
      error: 'Failed to verify subscription',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// POST /api/upload - Upload an audio or video file
router.post('/upload', requireActiveSubscription, upload.single('audio'), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const file = req.file;
    const title = (req.body.title as string) || 'Untitled Lecture';

    if (!file) {
      res.status(400).json({ error: 'Bad Request', message: 'No audio or video file provided' });
      return;
    }

    // Generate unique ID for this transcription
    const id = uuidv4();
    
    // Determine source type and folder
    const fileExtension = file.originalname.split('.').pop()?.toLowerCase() || 'bin';
    const mimeType = file.mimetype;

    let sourceType: SourceType;
    let baseFolder: string;

    if (mimeType === 'application/pdf' || fileExtension === 'pdf') {
      sourceType = 'pdf';
      baseFolder = 'documents';
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      fileExtension === 'pptx'
    ) {
      sourceType = 'pptx';
      baseFolder = 'documents';
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileExtension === 'docx'
    ) {
      sourceType = 'docx';
      baseFolder = 'documents';
    } else if (mimeType === 'application/vnd.ms-powerpoint' || fileExtension === 'ppt') {
      sourceType = 'ppt';
      baseFolder = 'documents';
    } else if (mimeType.startsWith('video/')) {
      sourceType = 'video';
      baseFolder = 'video';
    } else {
      sourceType = 'audio';
      baseFolder = 'audio';
    }

    const r2Key = `${baseFolder}/${userId}/${id}/original.${fileExtension}`;

    // Upload to R2
    await r2Service.uploadFile(r2Key, file.buffer, file.mimetype);

    // Create transcription record in D1
    await d1Service.createTranscription({
      id,
      userId,
      title,
      audioUrl: r2Key,
      audioDuration: null, // Will be set during processing
      transcriptionText: null,
      structuredText: null,
      status: 'pending',
      progress: 0,
      errorMessage: null,
      pdfKey: null,
      pdfGeneratedAt: null,
      
      whisperModel: null, // Will be set during transcription
      detectedLanguage: null, // Will be set during structuring
      isPublic: false, // Default to private
      sourceType,
      mimeType: file.mimetype,
      originalFileName: file.originalname,
    });

    const humanType =
      sourceType === 'pdf' || sourceType === 'pptx' || sourceType === 'ppt'
        ? 'Document'
        : sourceType === 'video'
          ? 'Video'
          : 'Audio';

    const response: UploadResponse = {
      id,
      message: `${humanType} uploaded successfully. Ready for processing.`,
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// POST /api/upload-batch - Upload multiple documents to be processed together
router.post('/upload-batch', requireActiveSubscription, upload.array('files', 5), async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const files = req.files as Express.Multer.File[];
    const title = (req.body.title as string) || 'Batch Document Study';

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'Bad Request', message: 'No documents provided' });
      return;
    }

    // Generate unique ID for this composite transcription
    const id = uuidv4();
    
    const uploadedFiles: Array<{ key: string, originalName: string, sourceType: SourceType }> = [];

    for (const file of files) {
      const fileExtension = file.originalname.split('.').pop()?.toLowerCase() || 'bin';
      const mimeType = file.mimetype;
      
      let sourceType: SourceType;
      if (mimeType === 'application/pdf' || fileExtension === 'pdf') sourceType = 'pdf';
      else if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || fileExtension === 'pptx') sourceType = 'pptx';
      else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileExtension === 'docx') sourceType = 'docx';
      else if (mimeType === 'application/vnd.ms-powerpoint' || fileExtension === 'ppt') sourceType = 'ppt';
      else {
        sourceType = 'pdf'; // Default fallback
      }

      const fileId = uuidv4();
      const r2Key = `documents/${userId}/${id}/${fileId}.${fileExtension}`;
      
      // Upload to R2
      await r2Service.uploadFile(r2Key, file.buffer, file.mimetype);
      uploadedFiles.push({ key: r2Key, originalName: file.originalname, sourceType });
    }

    // Store the JSON of files in the audioUrl field
    const r2KeysJson = JSON.stringify(uploadedFiles);

    // Create transcription record in D1
    await d1Service.createTranscription({
      id,
      userId,
      title,
      audioUrl: r2KeysJson,
      audioDuration: null,
      transcriptionText: null,
      structuredText: null,
      status: 'pending',
      progress: 0,
      errorMessage: null,
      pdfKey: null,
      pdfGeneratedAt: null,
      whisperModel: 'batch-processing', 
      detectedLanguage: null,
      isPublic: false,
      sourceType: 'pdf', // We'll treat batch as pdf/document type
      mimeType: 'application/json', // Indicates multiple files
      originalFileName: uploadedFiles.map(f => f.originalName).join(', '),
    });

    const response: UploadResponse = {
      id,
      message: `${files.length} documents uploaded successfully. Ready for batch processing.`,
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Batch upload error:', error);
    res.status(500).json({ 
      error: 'Batch upload failed', 
      message: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

export { router as uploadRouter };
