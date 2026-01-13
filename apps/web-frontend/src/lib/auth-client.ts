/**
 * API client for authenticated requests
 */

const API_BASE = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? 'https://lecture-transcription-api.fly.dev' : '');

export { API_BASE };
