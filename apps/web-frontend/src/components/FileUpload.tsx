import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CloudUpload, 
  FileAudio, 
  FileVideo,
  FileText,
  Files,
  X, 
  Loader2,
  Upload
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranscriptionCache } from '@/contexts/TranscriptionCacheContext';
import { api } from '@/lib/api';
import { formatFileSize, cn } from '@/lib/utils';

interface FileUploadProps {
  onUploadComplete?: (id: string) => void;
  transcriptionMode?: 'fast' | 'quality';
}

export function FileUpload({ onUploadComplete, transcriptionMode = 'quality' }: FileUploadProps) {
  const navigate = useNavigate();
  const { invalidateTranscriptions } = useTranscriptionCache();
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptedMimeTypes = [
    // Audio formats
    'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/wav', 'audio/ogg', 'audio/flac', 'audio/webm',
    // Video formats
    'video/mp4', 'video/quicktime', 'video/webm', 'video/ogg',
    // Document formats
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/vnd.ms-powerpoint', // .ppt
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  ];

  const isVideoFile = (file: File) => file.type.startsWith('video/');
  const isDocumentFile = (file: File) => 
    file.type === 'application/pdf' ||
    file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    file.type === 'application/vnd.ms-powerpoint' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.endsWith('.pdf') ||
    file.name.endsWith('.pptx') ||
    file.name.endsWith('.ppt') ||
    file.name.endsWith('.docx');

  const isValidFile = (file: File) => {
    return acceptedMimeTypes.includes(file.type) || 
           file.type.startsWith('audio/') || 
           file.type.startsWith('video/') ||
           file.name.endsWith('.pdf') ||
           file.name.endsWith('.pptx') ||
           file.name.endsWith('.ppt') ||
           file.name.endsWith('.docx');
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    Array.from(newFiles).forEach(f => {
      if (isValidFile(f)) {
        validFiles.push(f);
      } else {
        invalidFiles.push(f.name);
      }
    });

    if (invalidFiles.length > 0) {
      setError(`Invalid file type(s): ${invalidFiles.join(', ')}. Please upload audio, video, or documents (PDF, PPTX, DOCX).`);
    }

    if (validFiles.length > 0) {
      setFiles(prev => {
        const combined = [...prev, ...validFiles];
        // Ensure no duplicates by name and size
        const unique = combined.filter((f, index, self) => 
          index === self.findIndex((t) => (
            t.name === f.name && t.size === f.size
          ))
        );
        
        if (!title && unique.length > 0) {
          const defaultTitle = unique[0].name.replace(/\.[^/.]+$/, '') + (unique.length > 1 ? ' and others' : '');
          setTitle(defaultTitle);
        }
        
        return unique;
      });
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);
    processFiles(e.dataTransfer.files);
  }, [title]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    processFiles(e.target.files);
  }, [title]);

  const handleRemoveFile = useCallback((index: number) => {
    setFiles(prev => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length === 0) {
        setTitle('');
      } else if (title.includes(' and others')) {
         // Keep existing title logic or just leave it
      }
      return updated;
    });
  }, [title]);

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      let response;
      if (files.length === 1) {
        response = await api.uploadFile(files[0], title || 'Untitled Recording');
      } else {
        response = await api.uploadFilesBatch(files, title || 'Batch Document Study');
      }
      
      // Start transcription automatically
      await api.startTranscription(response.id, transcriptionMode);
      
      // Invalidate cache so the new transcription shows up when navigating back
      invalidateTranscriptions();
      
      if (onUploadComplete) {
        onUploadComplete(response.id);
      } else {
        navigate(`/transcription/${response.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="w-full max-w-xl mx-auto py-6 animate-fade-in-up">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {files.length > 1 ? <Files className="h-5 w-5 text-primary" /> : <Upload className="h-5 w-5 text-primary" />}
          Upload {files.length > 1 ? 'Documents' : 'Audio, Video, or Documents'}
        </CardTitle>
        <CardDescription>
          {files.length > 1 
            ? `Combine ${files.length} documents into one set of study notes` 
            : "Upload recordings or documents (PDF, PPTX, DOCX) to transcribe them into notes"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="Drop zone for files. Click or drag and drop to upload."
          className={cn(
            "drop-zone relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 ease-out outline-none min-h-[200px] flex items-center justify-center",
            isDragging ? "drop-zone-active border-primary" : "border-border/60",
            files.length > 0 ? "bg-status-success-soft border-status-success/40" : "hover:border-primary/40 hover:bg-muted/40"
          )}
        >
          <input
            type="file"
            multiple
            accept="audio/*,video/*,.pdf,.pptx,.ppt,.docx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-hidden="true"
          />
          
          {files.length > 0 ? (
            <div className="space-y-4 animate-scale-in">
              <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
                {files.slice(0, 5).map((f, i) => (
                  <div key={i} className="relative w-14 h-14 rounded-xl bg-status-success/15 border-2 border-card flex items-center justify-center shadow-sm hover:scale-105 transition-transform duration-200">
                    {isDocumentFile(f) ? (
                      <FileText className="h-7 w-7 text-status-success" />
                    ) : isVideoFile(f) ? (
                      <FileVideo className="h-7 w-7 text-status-success" />
                    ) : (
                      <FileAudio className="h-7 w-7 text-status-success" />
                    )}
                  </div>
                ))}
                {files.length > 5 && (
                  <div className="relative w-14 h-14 rounded-xl bg-muted/60 border-2 border-card flex items-center justify-center shadow-sm text-sm font-bold text-muted-foreground">
                    +{files.length - 5}
                  </div>
                )}
              </div>
              
              <div className="max-h-48 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-rounded scrollbar-track-transparent scrollbar-thumb-muted-foreground/20">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-card/80 p-3 rounded-xl border border-status-success/30 hover:bg-card transition-all duration-200 group">
                    <div className="flex items-center gap-3 overflow-hidden min-w-0">
                      {isDocumentFile(f) ? <FileText className="h-5 w-5 text-status-success shrink-0" /> : isVideoFile(f) ? <FileVideo className="h-5 w-5 text-status-success shrink-0" /> : <FileAudio className="h-5 w-5 text-status-success shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground block truncate">{f.name}</span>
                        <span className="text-xs text-muted-foreground">{formatFileSize(f.size)}</span>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleRemoveFile(i); }}
                      className="text-muted-foreground hover:text-destructive p-1.5 rounded-md hover:bg-destructive/10 transition-all opacity-50 group-hover:opacity-100"
                      title="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <div className={cn(
                  "w-20 h-20 rounded-3xl flex items-center justify-center transition-all duration-200",
                  isDragging ? "bg-primary/20 scale-110" : "bg-muted/60"
                )}>
                  <CloudUpload className={cn(
                    "h-10 w-10 transition-colors duration-200",
                    isDragging ? "text-primary" : "text-muted-foreground"
                  )} />
                </div>
              </div>
              <div>
                <p className="font-semibold text-lg text-foreground">
                  {isDragging ? 'Drop your files here' : 'Drop files here or click to browse'}
                </p>
                <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                  Upload audio recordings, videos, or documents to generate study notes
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-3">
                  <span className="text-xs bg-muted/60 px-2.5 py-1 rounded-lg text-muted-foreground font-medium">MP3</span>
                  <span className="text-xs bg-muted/60 px-2.5 py-1 rounded-lg text-muted-foreground font-medium">M4A</span>
                  <span className="text-xs bg-muted/60 px-2.5 py-1 rounded-lg text-muted-foreground font-medium">WAV</span>
                  <span className="text-xs bg-muted/60 px-2.5 py-1 rounded-lg text-muted-foreground font-medium">MP4</span>
                  <span className="text-xs bg-muted/60 px-2.5 py-1 rounded-lg text-muted-foreground font-medium">PDF</span>
                  <span className="text-xs bg-muted/60 px-2.5 py-1 rounded-lg text-muted-foreground font-medium">PPTX</span>
                  <span className="text-xs bg-muted/60 px-2.5 py-1 rounded-lg text-muted-foreground font-medium">DOCX</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Title input */}
        <div className="space-y-2">
          <label htmlFor="title" className="text-sm font-medium">
            {files.length > 1 ? 'Batch Title' : 'Title'}
          </label>
          <Input
            id="title"
            placeholder={files.length > 1 ? "Enter a title for this batch of documents" : "Enter a title for your recording"}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-describedby={error ? "upload-error" : undefined}
          />
        </div>

        {/* Error message */}
        {error && (
          <div 
            id="upload-error"
            role="alert"
            className="p-3 rounded-xl bg-status-error-soft border border-status-error/30 text-status-error text-sm"
          >
            {error}
          </div>
        )}

        {/* Upload button */}
        <Button
          onClick={handleUpload}
          disabled={files.length === 0 || isUploading}
          className="w-full neu-button-primary"
          size="lg"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading {files.length} {files.length === 1 ? 'file' : 'files'}...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Upload & Generate Notes
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
