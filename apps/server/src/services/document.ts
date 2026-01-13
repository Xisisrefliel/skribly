import { PDFParse } from 'pdf-parse';
import PptxParser from 'node-pptx-parser';
import mammoth from 'mammoth';
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { SourceType } from '@lecture/shared';

export const documentService = {
  /**
   * Extract text from a PDF or PPTX document buffer
   */
  async extractText(
    buffer: Buffer,
    sourceType: SourceType,
    mimeType?: string | null
  ): Promise<string> {
    if (sourceType === 'pdf' || mimeType === 'application/pdf') {
      return this.extractPdfText(buffer);
    }

    if (
      sourceType === 'pptx' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) {
      return this.extractPptxText(buffer);
    }

    if (
      sourceType === 'docx' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return this.extractDocxText(buffer);
    }

    if (
      sourceType === 'ppt' ||
      mimeType === 'application/vnd.ms-powerpoint'
    ) {
      throw new Error(
        'Legacy .ppt files are not supported. Please convert to PPTX or PDF and try again.'
      );
    }

    throw new Error(`Unsupported document type: ${sourceType}`);
  },

  /**
   * Extract text from a PDF buffer
   */
  async extractPdfText(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const text = result.text.trim();

      if (!text) {
        throw new Error(
          'No text could be extracted from this PDF. It may be a scanned document or contain only images.'
        );
      }

      return text;
    } finally {
      await parser.destroy();
    }
  },

  /**
   * Extract text from a PPTX buffer
   * node-pptx-parser requires a file path, so we write to a temp file
   */
  async extractPptxText(buffer: Buffer): Promise<string> {
    const tempDir = mkdtempSync(join(tmpdir(), 'pptx-'));
    const tempPath = join(tempDir, 'presentation.pptx');

    try {
      writeFileSync(tempPath, buffer);

      const parser = new PptxParser(tempPath);
      const slides = await parser.extractText();

      const slideTexts: string[] = [];

      for (const slide of slides) {
        let slideContent = [];
        
        // Extract main text
        if (slide.text && slide.text.length > 0) {
          const mainText = slide.text.join('\n').trim();
          if (mainText) slideContent.push(mainText);
        }

        // Extract speaker notes (if the parser supports it)
        // @ts-ignore - node-pptx-parser might have notes in some versions/forks
        if (slide.notes && slide.notes.length > 0) {
          // @ts-ignore
          const notesText = Array.isArray(slide.notes) ? slide.notes.join('\n').trim() : slide.notes.trim();
          if (notesText) {
            slideContent.push(`\n[Speaker Notes]\n${notesText}`);
          }
        }

        if (slideContent.length > 0) {
          slideTexts.push(`--- Slide ${slide.id} ---\n${slideContent.join('\n')}`);
        }
      }

      const fullText = slideTexts.join('\n\n');

      if (!fullText.trim()) {
        throw new Error(
          'No text could be extracted from this PowerPoint presentation.'
        );
      }

      return fullText;
    } finally {
      try {
        unlinkSync(tempPath);
        // Use rmSync for recursive cleanup if it's a directory
        try {
          unlinkSync(tempDir);
        } catch {
          // fallback if it's not empty or other issue
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  },

  /**
   * Extract text from a DOCX buffer
   */
  async extractDocxText(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value.trim();

      if (!text) {
        throw new Error(
          'No text could be extracted from this Word document.'
        );
      }

      return text;
    } catch (error) {
      console.error('DOCX extraction failed:', error);
      throw new Error('Failed to extract text from Word document.');
    }
  },
};
