/**
 * Authentication middleware using Clerk Express SDK
 */
import { clerkMiddleware, getAuth } from '@clerk/express';
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

/**
 * Clerk middleware - must be applied before other middleware
 */
export { clerkMiddleware };

/**
 * Extract user info from Clerk auth, ensure user exists in DB, and attach to request
 */
async function attachUserInfo(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  
  if (auth?.userId) {
    const name = (auth.sessionClaims as any)?.name || '';
    const email = (auth.sessionClaims as any)?.email || '';
    const image = (auth.sessionClaims as any)?.image_url;
    
    try {
      await d1Service.ensureUser(auth.userId, name, email, image);
    } catch (error) {
      console.error('Failed to ensure user exists:', error);
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
    if (!auth?.userId) {
      res.status(401).json({ error: 'Authentication required' });
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
