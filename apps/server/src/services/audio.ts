import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

// 5 minutes per chunk with MP3 compression = ~5MB per chunk (well under 25MB limit)
const CHUNK_DURATION_MINUTES = parseInt(process.env.CHUNK_DURATION_MINUTES || '5', 10);
const CHUNK_DURATION_SECONDS = CHUNK_DURATION_MINUTES * 60;

// Target ~64kbps for speech (very efficient, Whisper handles it fine)
const AUDIO_BITRATE = '64k';

// Video file extensions that need audio extraction
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.ogv', '.3gp', '.3g2', '.m4v', '.wmv', '.flv'];

export interface AudioChunkInfo {
  index: number;
  filePath: string;
  startTime: number;
  endTime: number;
}

export interface AudioInfo {
  duration: number;  // Total duration in seconds
  format: string;
  bitrate: number;
}

export interface MediaInfo {
  duration: number;
  format: string;
  bitrate: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

/**
 * Get information about an audio file
 */
export function getAudioInfo(filePath: string): Promise<AudioInfo> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const format = metadata.format;
      resolve({
        duration: format.duration || 0,
        format: format.format_name || 'unknown',
        bitrate: format.bit_rate ? parseInt(String(format.bit_rate), 10) : 0,
      });
    });
  });
}

/**
 * Get detailed media information including video/audio stream detection
 */
export function getMediaInfo(filePath: string): Promise<MediaInfo> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const format = metadata.format;
      const streams = metadata.streams || [];
      
      const hasVideo = streams.some(s => s.codec_type === 'video');
      const hasAudio = streams.some(s => s.codec_type === 'audio');

      resolve({
        duration: format.duration || 0,
        format: format.format_name || 'unknown',
        bitrate: format.bit_rate ? parseInt(String(format.bit_rate), 10) : 0,
        hasVideo,
        hasAudio,
      });
    });
  });
}

/**
 * Check if a file is a video based on extension
 */
export function isVideoFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}

/**
 * Extract audio from a video file and save as MP3
 * Returns the path to the extracted audio file
 */
export function extractAudioFromVideo(
  videoPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`Extracting audio from video: ${videoPath}`);
    
    ffmpeg(videoPath)
      .noVideo()                     // Remove video stream
      .audioFrequency(16000)         // 16kHz sample rate (good for speech)
      .audioChannels(1)              // Mono
      .audioBitrate(AUDIO_BITRATE)   // 64kbps (efficient for speech)
      .audioCodec('libmp3lame')      // MP3 codec
      .on('start', (cmd) => {
        console.log(`FFmpeg command: ${cmd}`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`Extracting audio: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log('Audio extraction completed');
        resolve();
      })
      .on('error', (err) => {
        console.error('Audio extraction failed:', err);
        reject(err);
      })
      .save(outputPath);
  });
}

/**
 * Convert audio to optimal format for transcription (16kHz mono MP3)
 * MP3 at 64kbps for speech = ~0.5MB per minute
 */
export function convertToOptimalFormat(
  inputPath: string, 
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFrequency(16000)      // 16kHz sample rate (good for speech)
      .audioChannels(1)            // Mono
      .audioBitrate(AUDIO_BITRATE) // 64kbps (efficient for speech)
      .audioCodec('libmp3lame')    // MP3 codec
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
}

/**
 * Split audio file into chunks of specified duration
 */
export async function splitAudioIntoChunks(
  inputPath: string,
  outputDir: string
): Promise<AudioChunkInfo[]> {
  const audioInfo = await getAudioInfo(inputPath);
  const totalDuration = audioInfo.duration;
  const chunks: AudioChunkInfo[] = [];

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Calculate number of chunks needed
  const numChunks = Math.ceil(totalDuration / CHUNK_DURATION_SECONDS);
  
  console.log(`Splitting ${Math.round(totalDuration)}s audio into ${numChunks} chunks of ${CHUNK_DURATION_MINUTES} minutes each`);

  // Split into chunks
  for (let i = 0; i < numChunks; i++) {
    const startTime = i * CHUNK_DURATION_SECONDS;
    const endTime = Math.min((i + 1) * CHUNK_DURATION_SECONDS, totalDuration);
    const chunkDuration = endTime - startTime;
    const chunkPath = path.join(outputDir, `chunk_${i.toString().padStart(3, '0')}.mp3`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(chunkDuration)
        .audioFrequency(16000)
        .audioChannels(1)
        .audioBitrate(AUDIO_BITRATE)
        .audioCodec('libmp3lame')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(chunkPath);
    });

    // Log chunk size for debugging
    const stats = fs.statSync(chunkPath);
    const sizeMB = stats.size / (1024 * 1024);
    console.log(`  Chunk ${i + 1}/${numChunks}: ${sizeMB.toFixed(2)}MB (${Math.round(chunkDuration)}s)`);

    chunks.push({
      index: i,
      filePath: chunkPath,
      startTime,
      endTime,
    });
  }

  return chunks;
}

/**
 * Process audio or video file: extract audio if video, convert to optimal format and split into chunks
 * Returns array of chunk info
 */
export async function processAudioFile(
  inputBuffer: Buffer,
  originalFilename: string
): Promise<{ chunks: AudioChunkInfo[]; totalDuration: number; tempDir: string }> {
  // Create temp directory for this processing job
  const tempDir = path.join(os.tmpdir(), `lecture-${uuidv4()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  // Save input buffer to temp file
  const inputExt = path.extname(originalFilename) || '.mp3';
  const inputPath = path.join(tempDir, `input${inputExt}`);
  fs.writeFileSync(inputPath, inputBuffer);

  // Check if this is a video file and extract audio if needed
  let audioPath = inputPath;
  const isVideo = isVideoFile(originalFilename);
  
  if (isVideo) {
    // Verify the file has an audio stream
    const mediaInfo = await getMediaInfo(inputPath);
    
    if (!mediaInfo.hasAudio) {
      throw new Error('Video file does not contain an audio track');
    }
    
    console.log(`Detected video file: ${originalFilename}, extracting audio...`);
    
    // Extract audio from video
    const extractedAudioPath = path.join(tempDir, 'extracted_audio.mp3');
    await extractAudioFromVideo(inputPath, extractedAudioPath);
    audioPath = extractedAudioPath;
    
    // Log the extracted audio size
    const stats = fs.statSync(extractedAudioPath);
    const sizeMB = stats.size / (1024 * 1024);
    console.log(`Extracted audio: ${sizeMB.toFixed(2)}MB`);
  }

  // Get audio info
  const audioInfo = await getAudioInfo(audioPath);
  const totalDuration = audioInfo.duration;
  
  console.log(`Processing ${isVideo ? 'video' : 'audio'}: ${originalFilename}, duration: ${Math.round(totalDuration)}s`);

  // If audio is short enough (under 4 minutes), no need to split
  // Just convert to optimal format (skip if already extracted from video as it's already in optimal format)
  if (totalDuration <= CHUNK_DURATION_SECONDS * 0.8) {
    let finalPath = audioPath;
    
    // If this was not a video (audio already extracted to optimal format), convert it
    if (!isVideo) {
      const convertedPath = path.join(tempDir, 'converted.mp3');
      await convertToOptimalFormat(audioPath, convertedPath);
      finalPath = convertedPath;
    }
    
    const stats = fs.statSync(finalPath);
    const sizeMB = stats.size / (1024 * 1024);
    console.log(`Single file output: ${sizeMB.toFixed(2)}MB`);

    return {
      chunks: [{
        index: 0,
        filePath: finalPath,
        startTime: 0,
        endTime: totalDuration,
      }],
      totalDuration,
      tempDir,
    };
  }

  // Split into chunks
  const chunksDir = path.join(tempDir, 'chunks');
  const chunks = await splitAudioIntoChunks(audioPath, chunksDir);

  return {
    chunks,
    totalDuration,
    tempDir,
  };
}

/**
 * Clean up temporary files
 */
export function cleanupTempDir(tempDir: string): void {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
