/**
 * Better Auth React client - Cross-origin auth with bearer tokens
 */
import { createAuthClient } from 'better-auth/react';

const API_BASE = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? 'https://lecture-transcription-api.fly.dev' : '');

const SESSION_TOKEN_KEY = 'lecture-session-token';

// Get stored token
export function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

// Store token
export function setSessionToken(token: string): void {
  localStorage.setItem(SESSION_TOKEN_KEY, token);
}

// Clear token
export function clearSessionToken(): void {
  localStorage.removeItem(SESSION_TOKEN_KEY);
}

export const authClient = createAuthClient({
  baseURL: API_BASE,
  fetchOptions: {
    credentials: 'include',
    auth: {
      type: 'Bearer',
      token: () => getSessionToken() || '',
    },
    onSuccess: (ctx) => {
      const token = ctx.response?.headers.get('set-auth-token');
      if (token) {
        setSessionToken(token);
      }
    },
  },
});

export const { signIn, signOut, useSession, getSession } = authClient;
