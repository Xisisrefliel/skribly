/**
 * better-auth configuration for the Lecture app
 * 
 * Uses bearer tokens for cross-origin auth (Safari compatible).
 * The OAuth callback appends the session token to the redirect URL.
 */

import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { d1Adapter } from './adapters/d1Adapter.js';

const webClientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_WEB_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!webClientId) {
  console.warn('Warning: GOOGLE_CLIENT_ID not set. Web OAuth will not work.');
}

const isProd = process.env.NODE_ENV === 'production';
const baseURL = process.env.BETTER_AUTH_URL || 
  (isProd ? 'https://lecture-transcription-api.fly.dev' : 'http://localhost:3000');

export const auth = betterAuth({
  database: d1Adapter,
  baseURL,
  basePath: '/api/auth',
  secret: process.env.BETTER_AUTH_SECRET,

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24 * 7,  // 7 days
  },

  // Bearer plugin for cross-origin token-based auth
  plugins: [bearer()],

  // Trusted origins
  trustedOrigins: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://lecture-transcription-api.fly.dev',
    'https://lecture-web.pages.dev',
  ],

  // Social providers
  socialProviders: {
    google: {
      clientId: webClientId!,
      clientSecret: clientSecret || '',
    },
  },

  advanced: {
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: isProd,
    },
  },
});

export type Auth = typeof auth;
