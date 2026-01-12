/**
 * iOS-specific authentication route
 * 
 * Validates Google ID tokens from the iOS app using the iOS client ID.
 * This is necessary because iOS uses a different client ID than web OAuth.
 */

import { Router, type Router as RouterType } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { auth } from '../auth.js';

const router = Router();

// iOS client ID from environment or hardcoded fallback
const IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID || 
  '409393189725-2hv6dtkilq1he2c92iseoqhpv448kovj.apps.googleusercontent.com';

// Google's JWKS endpoint for verifying tokens
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs')
);

interface GoogleIdTokenPayload {
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  sub: string;
  aud: string;
  iss: string;
}

/**
 * POST /api/auth/ios/google
 * 
 * Authenticates an iOS user using a Google ID token.
 * Creates a user if they don't exist, then creates a session.
 */
router.post('/auth/ios/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ 
        error: 'Missing idToken',
        message: 'Google ID token is required' 
      });
    }

    // Verify the ID token
    let payload: GoogleIdTokenPayload;
    try {
      const result = await jwtVerify(idToken, GOOGLE_JWKS, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: IOS_CLIENT_ID,
      });
      payload = result.payload as unknown as GoogleIdTokenPayload;
    } catch (error) {
      console.error('ID token verification failed:', error);
      return res.status(401).json({ 
        error: 'Invalid token',
        message: 'Failed to verify Google ID token' 
      });
    }

    const { email, email_verified, name, picture, sub } = payload;
    
    if (!email) {
      return res.status(400).json({ 
        error: 'No email',
        message: 'Email not available in token' 
      });
    }

    // Access better-auth's internal adapter to create users and sessions
    // We need to use the auth context
    const ctx = await auth.$context;
    const internalAdapter = ctx.internalAdapter;

    // Check if user exists
    const existingUser = await internalAdapter.findUserByEmail(email);
    
    let userId: string;
    let userInfo: {
      id: string;
      email: string;
      emailVerified: boolean;
      name: string;
      image?: string | null;
      createdAt: Date;
      updatedAt: Date;
    };
    
    if (!existingUser) {
      // Create new user with Google account
      const isEmailVerified = typeof email_verified === 'boolean' 
        ? email_verified 
        : email_verified === 'true';
      
      const newUser = await internalAdapter.createOAuthUser(
        {
          email,
          emailVerified: isEmailVerified,
          name: name || email.split('@')[0],
          image: picture,
        },
        {
          providerId: 'google',
          accountId: sub,
        }
      );
      
      if (!newUser) {
        return res.status(500).json({ 
          error: 'User creation failed',
          message: 'Could not create user account' 
        });
      }
      
      userId = newUser.user.id;
      userInfo = newUser.user;
    } else {
      // User exists, check if they have a Google account linked
      userId = existingUser.user.id;
      userInfo = existingUser.user;
      
      const existingAccount = await internalAdapter.findAccount(sub);
      
      if (!existingAccount) {
        // Link Google account to existing user
        await internalAdapter.linkAccount({
          userId,
          providerId: 'google',
          accountId: sub,
          scope: 'openid,profile,email',
          idToken,
        });
      }
    }

    // Create session
    const session = await internalAdapter.createSession(userId);
    
    // Set session cookie
    const cookieName = `${ctx.options.advanced?.cookiePrefix || 'better-auth'}.session_token`;
    const isSecure = process.env.NODE_ENV === 'production';
    
    res.cookie(cookieName, session.token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/',
    });

    // Return user info
    return res.json({
      user: {
        id: userInfo.id,
        email: userInfo.email,
        emailVerified: userInfo.emailVerified,
        name: userInfo.name,
        image: userInfo.image,
        createdAt: userInfo.createdAt,
        updatedAt: userInfo.updatedAt,
      },
      session: {
        token: session.token,
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    console.error('iOS Google auth error:', error);
    return res.status(500).json({ 
      error: 'Authentication failed',
      message: (error as Error).message 
    });
  }
});

export const iosAuthRouter: RouterType = router;
