/**
 * better-auth configuration for the Lecture app
 * 
 * Supports both:
 * - Web OAuth flow (redirect to Google, callback with code)
 * - iOS native flow (ID token validation)
 * 
 * For web OAuth, you need a Web Application client ID.
 * For iOS, you need an iOS client ID.
 * Both can be from the same Google Cloud project.
 */

import { betterAuth } from 'better-auth';
import { d1Adapter } from './adapters/d1Adapter';

// Web client ID is required for OAuth redirect flow
const webClientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_WEB_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!webClientId) {
  console.warn('Warning: GOOGLE_CLIENT_ID not set. Web OAuth will not work.');
}

export const auth = betterAuth({
  database: d1Adapter,
  
  // Base URL for the auth endpoints
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  
  // Base path where auth routes are mounted
  basePath: '/api/auth',
  
  // Secret for signing session tokens
  secret: process.env.BETTER_AUTH_SECRET,
  
  // Session configuration
  session: {
    // Session expires after 30 days
    expiresIn: 60 * 60 * 24 * 30, // 30 days in seconds
    // Refresh session if less than 7 days until expiry
    updateAge: 60 * 60 * 24 * 7, // 7 days in seconds
    // Use cookies for session management
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
  
  // Cookie configuration for iOS app
  advanced: {
    // Allow cross-origin requests from iOS app
    crossSubDomainCookies: {
      enabled: false, // Not needed for iOS native app
    },
    // Cookie settings
    cookiePrefix: 'lecture',
    // Disable CSRF for API-only usage (iOS app sends cookies automatically)
    disableCSRFCheck: true,
  },
  
  // Trusted origins for the iOS app and web frontend
  trustedOrigins: [
    'http://localhost:3000',
    'http://localhost:5173',  // Vite dev server for web frontend
    'lecture://', // iOS app custom scheme
  ],
  
  // Social login providers
  socialProviders: {
    google: {
      // Must use Web Application client ID for OAuth redirect flow
      clientId: webClientId!,
      clientSecret: clientSecret || '',
    },
  },
});

// Export types for use in other files
export type Auth = typeof auth;
