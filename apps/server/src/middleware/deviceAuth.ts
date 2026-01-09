import { Request, Response, NextFunction } from 'express';

// Extend Express Request to include deviceId
declare global {
  namespace Express {
    interface Request {
      deviceId?: string;
    }
  }
}

export function deviceAuth(req: Request, res: Response, next: NextFunction): void {
  const deviceId = req.headers['x-device-id'] as string;

  if (!deviceId) {
    res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Device ID is required' 
    });
    return;
  }

  // Basic validation - device ID should be a non-empty string
  if (typeof deviceId !== 'string' || deviceId.length < 10) {
    res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Invalid device ID format' 
    });
    return;
  }

  req.deviceId = deviceId;
  next();
}
