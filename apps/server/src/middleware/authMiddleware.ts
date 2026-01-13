/**
 * Authentication middleware using Clerk Express SDK
 */
import { clerkMiddleware, getAuth, clerkClient } from '@clerk/express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { d1Service } from '../services/d1.js';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: {
        id: string;
        name: string;
        email: string;
        image?: string;
      };
    }
  }
}

// Note: Clerk env vars are validated at server startup in index.ts

/**
 * Clerk middleware - must be applied before other middleware
 * Configured to accept tokens from Authorization header (Bearer tokens)
 */
export const clerkAuthMiddleware: RequestHandler = clerkMiddleware({
  // Clerk Express SDK automatically reads CLERK_SECRET_KEY from environment
  // It will check for tokens in:
  // 1. Authorization header (Bearer token)
  // 2. Cookies (__session)
  // 3. Query parameters (__clerk_js_version for frontend)
  
  // authorizedParties is required for cross-origin authentication
  // This tells Clerk which origins are allowed to send authenticated requests
  authorizedParties: [
    'http://localhost:5173',           // Local dev frontend (Vite)
    'http://localhost:3000',           // Alternative local dev
    'https://lecture-web.pages.dev',   // Production frontend on Cloudflare Pages
    'https://notism.one',              // Custom domain
    'https://www.notism.one',          // Custom domain with www
  ],
});

/**
 * Extract user info from Clerk auth, ensure user exists in DB, and attach to request
 */
async function attachUserInfo(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  
  // Debug logging in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[Auth] Request path:', req.path);
    console.log('[Auth] Auth header present:', !!req.headers.authorization);
    console.log('[Auth] Auth userId:', auth?.userId);
    if (!auth?.userId) {
      console.log('[Auth] Claims:', auth?.sessionClaims);
    }
  }
  
  if (auth?.userId) {
    let name = '';
    let email = '';
    let image: string | undefined;
    
    try {
      // Use clerkClient to get full user data reliably
      const user = await clerkClient.users.getUser(auth.userId);
      name = user.firstName && user.lastName 
        ? `${user.firstName} ${user.lastName}`.trim()
        : user.firstName || user.lastName || '';
      email = user.emailAddresses?.[0]?.emailAddress || '';
      image = user.imageUrl;
      
      // Ensure user exists in our database
      await d1Service.ensureUser(auth.userId, name, email, image);
    } catch (error) {
      console.error('Failed to get user data or ensure user exists:', error);
      // Fall back to session claims if clerkClient fails
      name = (auth.sessionClaims as any)?.name || (auth.sessionClaims as any)?.fullName || '';
      email = (auth.sessionClaims as any)?.email || (auth.sessionClaims as any)?.primaryEmail || '';
      image = (auth.sessionClaims as any)?.image_url;
      
      // Still try to ensure user even with fallback data
      try {
        await d1Service.ensureUser(auth.userId, name, email, image);
      } catch (ensureError) {
        console.error('Failed to ensure user with fallback data:', ensureError);
      }
    }
    
    req.userId = auth.userId;
    req.user = {
      id: auth.userId,
      name,
      email,
      image,
    };
  }
  
  next();
}

/**
 * Auth middleware that requires authentication
 * Returns 401 for unauthenticated API requests (no redirect)
 */
export const requireAuth: RequestHandler[] = [
  (req: Request, res: Response, next: NextFunction) => {
    const auth = getAuth(req);
    const hasAuthHeader = !!req.headers.authorization;
    const authHeaderPrefix = req.headers.authorization?.startsWith('Bearer ') ? 'Bearer' : 
                            req.headers.authorization ? 'Other' : 'None';
    
    if (!auth?.userId) {
      // Always log 401 errors for diagnostics (production and development)
      console.warn('[Auth] 401 Unauthorized:', {
        path: req.path,
        method: req.method,
        hasAuthHeader,
        authHeaderType: authHeaderPrefix,
        userId: auth?.userId || null,
        // Don't log token contents for security
      });
      
      // Provide helpful error message
      if (!hasAuthHeader) {
        res.status(401).json({ 
          error: 'Authentication required',
          message: 'Missing Authorization header. Please include a Bearer token.' 
        });
      } else {
        res.status(401).json({ 
          error: 'Authentication required',
          message: 'Invalid or expired authentication token. Please sign in again.' 
        });
      }
      return;
    }
    next();
  },
  attachUserInfo,
];

/**
 * Optional auth - doesn't require auth but extracts user if present
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  attachUserInfo(req, res, next);
}
