import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CloudUpload, 
  CheckCircle2, 
  FileAudio, 
  FileVideo, 
  X, 
  Loader2,
  Upload
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranscriptionCache } from '@/contexts/TranscriptionCacheContext';
import { api } from '@/lib/api';
import { formatFileSize } from '@/lib/utils';

interface FileUploadProps {
  onUploadComplete?: (id: string) => void;
}

export function FileUpload({ onUploadComplete }: FileUploadProps) {
  const navigate = useNavigate();
  const { invalidateTranscriptions } = useTranscriptionCache();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptedTypes = [
    'audio/mpeg',
    'audio/mp3',
    'audio/mp4',
    'audio/m4a',
    'audio/wav',
    'audio/ogg',
    'audio/flac',
    'audio/webm',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/ogg',
  ];

  const isVideoFile = (file: File) => file.type.startsWith('video/');

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      if (acceptedTypes.includes(droppedFile.type) || droppedFile.type.startsWith('audio/') || droppedFile.type.startsWith('video/')) {
        setFile(droppedFile);
        if (!title) {
          // Use filename without extension as default title
          const defaultTitle = droppedFile.name.replace(/\.[^/.]+$/, '');
          setTitle(defaultTitle);
        }
      } else {
        setError('Please upload an audio or video file');
      }
    }
  }, [title]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      if (!title) {
        const defaultTitle = selectedFile.name.replace(/\.[^/.]+$/, '');
        setTitle(defaultTitle);
      }
    }
  }, [title]);

  const handleRemoveFile = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
    setTitle('');
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const response = await api.uploadFile(file, title || 'Untitled Lecture');
      
      // Start transcription automatically
      await api.startTranscription(response.id);
      
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
          <Upload className="h-5 w-5 text-primary" />
          Upload Audio or Video
        </CardTitle>
        <CardDescription>
          Upload a lecture recording to transcribe it into notes
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
          aria-label="Drop zone for audio or video files. Click or drag and drop to upload."
          className={`
            drop-zone relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
            transition-all duration-200 ease-out
            outline-none
            ${isDragging ? 'drop-zone-active border-primary' : 'border-muted-foreground/25'}
            ${file ? 'bg-status-success-soft border-status-success/50' : 'hover:border-primary/50 hover:bg-muted/30'}
          `}
        >
          <input
            type="file"
            accept="audio/*,video/*"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            aria-hidden="true"
          />
          
          {file ? (
            <div className="space-y-3 animate-scale-in">
              <div className="flex items-center justify-center">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-status-success/10 flex items-center justify-center">
                    {isVideoFile(file) ? (
                      <FileVideo className="h-8 w-8 text-status-success" />
                    ) : (
                      <FileAudio className="h-8 w-8 text-status-success" />
                    )}
                  </div>
                  <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-status-success flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-white" />
                  </div>
                </div>
              </div>
              <div>
                <p className="font-medium text-foreground truncate max-w-[280px] mx-auto">
                  {file.name}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatFileSize(file.size)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveFile}
                className="neu-button-subtle text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4 mr-1" />
                Remove
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center">
                <div className={`
                  w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-200
                  ${isDragging 
                    ? 'bg-primary/20 scale-110' 
                    : 'bg-muted'
                  }
                `}>
                  <CloudUpload className={`
                    h-8 w-8 transition-colors duration-200
                    ${isDragging ? 'text-primary' : 'text-muted-foreground'}
                  `} />
                </div>
              </div>
              <div>
                <p className="font-medium text-foreground">
                  {isDragging ? 'Drop your file here' : 'Drop your file here or click to browse'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Supports MP3, M4A, WAV, MP4, MOV, and more
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Title input */}
        <div className="space-y-2">
          <label htmlFor="title" className="text-sm font-medium">
            Title
          </label>
          <Input
            id="title"
            placeholder="Enter a title for your lecture"
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
            className="p-3 rounded-lg bg-status-error-soft border border-status-error/20 text-status-error text-sm"
          >
            {error}
          </div>
        )}

        {/* Upload button */}
        <Button
          onClick={handleUpload}
          disabled={!file || isUploading}
          className="w-full neu-button-primary"
          size="lg"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Upload & Transcribe
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
