/**
 * Better Auth React client
 * 
 * This creates a type-safe auth client that handles:
 * - Google OAuth sign-in
 * - Session management
 * - Sign out
 * 
 * All OAuth complexity is handled by better-auth automatically.
 */
import { createAuthClient } from 'better-auth/react';

const API_BASE = import.meta.env.VITE_API_URL || '';

export const authClient = createAuthClient({
  baseURL: API_BASE,
});

// Export commonly used methods and hooks
export const { signIn, signOut, useSession, getSession } = authClient;
