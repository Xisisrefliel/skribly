/**
 * Authentication middleware using better-auth
 * 
 * This middleware validates session cookies and extracts user info
 * for use in protected routes.
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
    // Get session from better-auth using the request headers/cookies
    const session = await auth.api.getSession({
      headers: req.headers as any,
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
    const session = await auth.api.getSession({
      headers: req.headers as any,
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
