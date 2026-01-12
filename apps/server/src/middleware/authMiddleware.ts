/**
 * Authentication middleware using better-auth
 * 
 * This middleware validates session cookies or Bearer tokens and extracts user info
 * for use in protected routes.
 * 
 * Supports both:
 * - Cookie-based auth (for same-origin or iOS apps)
 * - Bearer token auth (for cross-origin web apps)
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { auth } from '../auth.js';

// Extend Express Request to include userId and user info
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

/**
 * Extract session token from request - supports both cookies and Bearer tokens
 */
function getSessionTokenFromRequest(req: Request): string | null {
  // Check for Bearer token in Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  
  // Fall back to cookie (better-auth uses 'better-auth.session_token' by default)
  const cookies = req.cookies || {};
  return cookies['better-auth.session_token'] || cookies['lecture.session_token'] || null;
}

/**
 * Auth middleware that requires authentication and extracts userId
 * Use this on protected routes
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Skip auth check for better-auth's own routes (they handle their own auth)
  // When mounted on /api, req.path is relative to mount point, but req.originalUrl has full path
  if (req.originalUrl.startsWith('/api/auth')) {
    next();
    return;
  }

  try {
    // Get session token from request (supports both cookies and Bearer tokens)
    const sessionToken = getSessionTokenFromRequest(req);
    
    // Create headers for better-auth
    const headers: Record<string, string> = {};
    
    if (sessionToken) {
      // If we have a Bearer token, convert it to a cookie header for better-auth
      headers['cookie'] = `better-auth.session_token=${sessionToken}`;
    } else {
      // Use the original cookie header
      headers['cookie'] = req.headers.cookie || '';
    }
    
    // Copy other relevant headers
    if (req.headers.origin) {
      headers['origin'] = req.headers.origin as string;
    }

    // Get session from better-auth
    const session = await auth.api.getSession({
      headers: headers as any,
    });

    if (!session || !session.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    // Set userId and user on request for use in route handlers
    req.userId = session.user.id;
    req.user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image || undefined,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired session',
    });
  }
}

/**
 * Optional auth middleware - doesn't require auth but extracts user if present
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionToken = getSessionTokenFromRequest(req);
    
    const headers: Record<string, string> = {};
    if (sessionToken) {
      headers['cookie'] = `better-auth.session_token=${sessionToken}`;
    } else {
      headers['cookie'] = req.headers.cookie || '';
    }
    
    const session = await auth.api.getSession({
      headers: headers as any,
    });

    if (session?.user) {
      req.userId = session.user.id;
      req.user = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image || undefined,
      };
    }

    next();
  } catch (error) {
    // Just continue without auth
    next();
  }
}
