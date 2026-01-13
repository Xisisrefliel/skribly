import type { SourceType } from '@lecture/shared';

export interface DocumentQuality {
  textConfidence: number;    // 0-1
  structureScore: number;    // 0-1
  completeness: number;      // 0-1
  language: string;
  recommendedAction: 'process' | 'ocr' | 'manual_review';
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface ChartData {
  title?: string;
  type?: string;
  data?: any;
}

export interface EnhancedSlide {
  id: number;
  title?: string;
  content: string[];
  notes?: string;
  tables: TableData[];
  charts: ChartData[];
}

export interface ExtractedDocument {
  text: string;
  sourceType: SourceType;
  quality: DocumentQuality;
  structure: {
    pages?: Array<{ number: number; content: string }>;
    slides?: EnhancedSlide[];
    metadata: {
      pageCount?: number;
      slideCount?: number;
      hasImages: boolean;
      hasTables: boolean;
    };
  };
}

export interface ExtractionProgress {
  stage: 'initializing' | 'extracting' | 'ocr' | 'finalizing';
  progress: number; // 0-1
  message?: string;
}

export type ProgressCallback = (progress: ExtractionProgress) => void;
