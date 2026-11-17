import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import db from './db.ts';

export type UserRole = 'super_admin' | 'restaurant_admin' | 'restaurant_manager';

export interface AuthUser {
  id: number;
  full_name: string;
  email: string;
  role: UserRole;
  venue_id: number | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

const EPHEMERAL_DEV_SECRET = crypto.randomBytes(32).toString('hex');

function getJwtSecret(): string {
  return process.env.JWT_SECRET_KEY || EPHEMERAL_DEV_SECRET;
}

const TOKEN_TTL_MINUTES = Number(process.env.ACCESS_TOKEN_EXPIRE_MINUTES || 480);

export function signToken(user: AuthUser): string {
  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      role: user.role,
      venue_id: user.venue_id,
      full_name: user.full_name,
    },
    getJwtSecret(),
    { expiresIn: `${TOKEN_TTL_MINUTES}m` }
  );
}

export function verifyToken(token: string): AuthUser {
  const payload = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
  return {
    id: Number(payload.sub),
    email: String(payload.email),
    role: payload.role as UserRole,
    venue_id: payload.venue_id === null || payload.venue_id === undefined ? null : Number(payload.venue_id),
    full_name: String(payload.full_name),
  };
}

export function logAudit(
  actorId: number | null,
  actorEmail: string | null,
  action: string,
  objectType: string,
  objectId: string | null,
  result: 'success' | 'denied' | 'error'
): void {
  try {
    db.prepare(`
      INSERT INTO audit_logs (actor_id, actor_email, action, object_type, object_id, result)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(actorId, actorEmail, action, objectType, objectId, result);
  } catch {
    // Audit logging should never crash request flow
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ detail: 'Authentication credentials were not provided.' });
    return;
  }

  const token = authHeader.slice(7).trim();
  try {
    const decoded = verifyToken(token);
    const dbUser = db
      .prepare('SELECT id, full_name, email, role, venue_id, status FROM users WHERE id = ?')
      .get(decoded.id) as (AuthUser & { status: string }) | undefined;

    if (!dbUser || dbUser.status !== 'active') {
      res.status(401).json({ detail: 'Account is inactive or no longer exists.' });
      return;
    }

    req.user = {
      id: dbUser.id,
      full_name: dbUser.full_name,
      email: dbUser.email,
      role: dbUser.role,
      venue_id: dbUser.venue_id,
    };
    next();
  } catch {
    res.status(401).json({ detail: 'Invalid or expired authentication token.' });
  }
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ detail: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      logAudit(req.user.id, req.user.email, `UNAUTHORIZED_ROLE_${req.method}_${req.path}`, 'rbac', null, 'denied');
      res.status(403).json({ detail: 'You do not have permission to perform this action.' });
      return;
    }
    next();
  };
}

export function resolveAuthorizedVenueId(user: AuthUser, requestedVenueId?: number | null): number | null {
  if (user.role === 'super_admin') {
    return requestedVenueId ?? null;
  }
  return user.venue_id;
}
