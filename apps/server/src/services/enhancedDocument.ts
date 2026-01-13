import type { SourceType } from '@lecture/shared';
import { documentService } from './document.js';
import { ocrService } from './ocr.js';
import { llmService } from './llm.js';
import type { 
  DocumentQuality, 
  ExtractedDocument, 
  ProgressCallback 
} from '../types/document.js';

export const enhancedDocumentService = {
  /**
   * Main entry point for document processing with fallbacks and quality assessment
   */
  async processDocument(
    buffer: Buffer,
    sourceType: SourceType,
    mimeType?: string | null,
    onProgress?: ProgressCallback
  ): Promise<ExtractedDocument> {
    if (onProgress) onProgress({ stage: 'initializing', progress: 0.1, message: 'Initializing document processing...' });

    // Resource limits check
    const MAX_BUFFER_SIZE = 100 * 1024 * 1024; // 100MB limit for processing
    if (buffer.length > MAX_BUFFER_SIZE) {
      throw new Error(`Document is too large to process (${Math.round(buffer.length / 1024 / 1024)}MB). Maximum size is 100MB.`);
    }

    let rawText = '';
    let usedOCR = false;

    // 1. Try standard extraction first with a simple retry for potential local resource issues
    try {
      if (onProgress) onProgress({ stage: 'extracting', progress: 0.2, message: 'Attempting standard text extraction...' });
      
      let attempts = 0;
      while (attempts < 2) {
        try {
          rawText = await documentService.extractText(buffer, sourceType, mimeType);
          break; // success
        } catch (e) {
          attempts++;
          if (attempts >= 2) throw e;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown extraction error';
      console.warn(`Standard extraction failed (${errorMessage}), will attempt OCR if appropriate`);
    }

    // 2. Assess quality of extracted text
    let quality = this.assessQuality(rawText);

    // 3. Fallback to OCR if quality is low or extraction failed
    if (!rawText || quality.recommendedAction === 'ocr' || quality.recommendedAction === 'manual_review') {
      if (onProgress) onProgress({ stage: 'ocr', progress: 0.4, message: 'Low quality or no text found. Starting OCR...' });
      
      try {
        const ocrText = await ocrService.extractText(
          buffer, 
          mimeType || (sourceType === 'pdf' ? 'application/pdf' : 'image/png'),
          onProgress
        );
        
        // If OCR found more/better text, use it
        const ocrQuality = this.assessQuality(ocrText);
        if (ocrText.length > rawText.length || ocrQuality.textConfidence > quality.textConfidence) {
          rawText = ocrText;
          quality = ocrQuality;
          usedOCR = true;
        }
      } catch (ocrError) {
        console.error('OCR fallback failed:', ocrError);
        if (!rawText) throw ocrError; // If we have NO text and OCR fails, we can't continue
      }
    }

    if (onProgress) onProgress({ stage: 'finalizing', progress: 0.9, message: 'Finalizing extraction...' });

    // 4. Return structured result
    return {
      text: rawText,
      sourceType,
      quality,
      structure: {
        metadata: {
          hasImages: usedOCR,
          hasTables: rawText.includes('|') || rawText.includes('\t'),
        }
      }
    };
  },

  /**
   * Assess the quality of extracted text
   */
  assessQuality(text: string): DocumentQuality {
    if (!text || text.trim().length === 0) {
      return {
        textConfidence: 0,
        structureScore: 0,
        completeness: 0,
        language: 'Unknown',
        recommendedAction: 'ocr'
      };
    }

    const trimmedText = text.trim();
    
    // 1. Calculate text confidence (ratio of dictionary words / common words)
    // This is a simple heuristic. In production, you'd use a more robust language model.
    const words = trimmedText.split(/\s+/);
    const avgWordLength = trimmedText.length / words.length;
    
    // Heuristic: Scanned docs with bad OCR often have many single characters or extremely long "words"
    const gibberishRatio = words.filter(w => w.length === 1 || w.length > 20).length / words.length;
    const textConfidence = Math.max(0, 1 - gibberishRatio);

    // 2. Structure score (based on headings, lists, tables)
    const hasHeadings = /^#+ /m.test(trimmedText) || /--- Slide/i.test(trimmedText);
    const hasLists = /^[-*•] /m.test(trimmedText);
    const hasTables = /\|.*\|/.test(trimmedText);
    
    let structureScore = 0.2; // base score
    if (hasHeadings) structureScore += 0.3;
    if (hasLists) structureScore += 0.2;
    if (hasTables) structureScore += 0.3;

    // 3. Completeness (very basic check)
    const completeness = Math.min(1, trimmedText.length / 500); // Assume >500 chars is "complete" for a lecture

    // 4. Determine action
    let recommendedAction: 'process' | 'ocr' | 'manual_review' = 'process';
    if (textConfidence < 0.4) {
      recommendedAction = 'ocr';
    } else if (textConfidence < 0.6 || trimmedText.length < 50) {
      recommendedAction = 'manual_review';
    }

    return {
      textConfidence,
      structureScore,
      completeness,
      language: 'English', // Default, will be detected by LLM later
      recommendedAction
    };
  }
};
