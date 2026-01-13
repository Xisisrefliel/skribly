import { createWorker } from 'tesseract.js';
import { fromBuffer } from 'pdf2pic';
import sharp from 'sharp';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import type { ProgressCallback } from '../types/document.js';

export const ocrService = {
  /**
   * Extract text from a buffer (image or PDF) using OCR
   */
  async extractText(
    buffer: Buffer,
    mimeType: string,
    onProgress?: ProgressCallback
  ): Promise<string> {
    if (mimeType === 'application/pdf') {
      return this.extractTextFromPdf(buffer, onProgress);
    }
    return this.extractTextFromImage(buffer, onProgress);
  },

  /**
   * Perform OCR on an image buffer
   */
  async extractTextFromImage(
    buffer: Buffer,
    onProgress?: ProgressCallback
  ): Promise<string> {
    const worker = await createWorker('eng+tur', 1, {
      logger: m => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress({
            stage: 'ocr',
            progress: m.progress,
            message: `OCR Progress: ${Math.round(m.progress * 100)}%`
          });
        }
      }
    });

    try {
      const { data: { text } } = await worker.recognize(buffer);
      return text;
    } finally {
      await worker.terminate();
    }
  },

  /**
   * Convert PDF pages to images and perform OCR on each
   */
  async extractTextFromPdf(
    buffer: Buffer,
    onProgress?: ProgressCallback
  ): Promise<string> {
    const tempDir = mkdtempSync(join(tmpdir(), 'ocr-pdf-'));
    
    try {
      const options = {
        density: 300,
        saveFilename: "page",
        savePath: tempDir,
        format: "png",
        width: 2048,
        height: 2896
      };

      const convert = fromBuffer(buffer, options);
      // We'll process first 10 pages for now to avoid extreme resource usage
      // In a real production app, this should be a background job
      const maxPages = 10; 
      
      let fullText = '';
      
      // pdf2pic doesn't easily give us the page count from buffer without extra tools
      // so we try pages one by one until failure or maxPages
      for (let i = 1; i <= maxPages; i++) {
        if (onProgress) {
          onProgress({
            stage: 'ocr',
            progress: (i - 1) / maxPages,
            message: `Converting page ${i}...`
          });
        }

        try {
          const result = await convert(i, { responseType: "buffer" });
          
          if (!result.buffer) break;

          const pageText = await this.extractTextFromImage(result.buffer, (p) => {
            if (onProgress) {
              onProgress({
                stage: 'ocr',
                progress: ((i - 1) + p.progress) / maxPages,
                message: `OCR Page ${i}: ${Math.round(p.progress * 100)}%`
              });
            }
          });
          
          fullText += `\n--- Page ${i} ---\n${pageText}\n`;
        } catch (err) {
          // Likely end of document or error on this page
          console.warn(`Stopped PDF OCR at page ${i}:`, err);
          break;
        }
      }

      return fullText.trim();
    } finally {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.error('Failed to cleanup OCR temp dir:', e);
      }
    }
  }
};
