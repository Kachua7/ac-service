import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AuthUser, UserRole } from '../shared/types.js';
import { db } from './store.js';

interface SessionRecord {
  token: string;
  user: AuthUser;
  expiresAt: number;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map<string, SessionRecord>();

// Scrypt-hashed credentials for Admin and Technician portal accounts (no plaintext passwords stored)
const SALT = 'vayucare-jaipur-v1';

function hashSecret(secret: string): string {
  return crypto.scryptSync(secret, SALT, 32).toString('hex');
}

function verifySecret(plain: string, expectedHash: string): boolean {
  const actualBuf = Buffer.from(hashSecret(plain), 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

const ADMIN_ACCOUNTS = [
  {
    id: 'adm-jaipur-1',
    email: 'ops@vayucare.in',
    name: 'Jaipur Operations Lead',
    passcodeHash: hashSecret('ADMIN2026'),
  },
];

const TECH_PASSCODE_HASH = hashSecret('TECH2026');

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

export function createSession(user: AuthUser): string {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    token,
    user,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export function getSessionUser(token: string | undefined): AuthUser | null {
  if (!token) return null;
  const rec = sessions.get(token);
  if (!rec) return null;
  if (Date.now() > rec.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return rec.user;
}

export function revokeSession(token: string | undefined) {
  if (token) sessions.delete(token);
}

export function extractBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return undefined;
}

export function requireAuth(allowedRoles?: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req);
    const user = getSessionUser(token);
    if (!user) {
      res.status(401).json({ error: 'Authentication required. Please sign in.' });
      return;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      res.status(403).json({
        error: `Access denied for role ${user.role}.`,
      });
      return;
    }
    req.authUser = user;
    next();
  };
}

export function authenticateUser(params: {
  role: UserRole;
  identifier: string;
  passcode?: string;
  name?: string;
}): { user: AuthUser; token: string } | { error: string; status: number } {
  const { role, identifier, passcode = '', name } = params;

  if (role === 'CUSTOMER') {
    const cleanPhone = normalizePhone(identifier);
    if (cleanPhone.length < 10) {
      return { error: 'Please enter a valid 10-digit mobile number.', status: 400 };
    }
    const cleanName = (name ?? '').trim();
    const state = db.read();
    const matchedBooking = state.bookings.find(
      (b) => normalizePhone(b.address.phone) === cleanPhone,
    );
    const resolvedName =
      cleanName.length >= 2
        ? cleanName
        : matchedBooking?.address.customerName ?? 'Jaipur Customer';

    const user: AuthUser = {
      id: `cust-${cleanPhone}`,
      role: 'CUSTOMER',
      name: resolvedName,
      identifier: `+91 ${cleanPhone.slice(0, 5)} ${cleanPhone.slice(5)}`,
    };
    return { user, token: createSession(user) };
  }

  if (role === 'TECHNICIAN') {
    const cleanPhone = normalizePhone(identifier);
    const state = db.read();
    const tech = state.technicians.find(
      (t) => normalizePhone(t.phone) === cleanPhone || t.id === identifier.trim(),
    );
    if (!tech) {
      return { error: 'No registered technician found for this phone number.', status: 401 };
    }
    if (!verifySecret(passcode.trim(), TECH_PASSCODE_HASH)) {
      return { error: 'Invalid technician portal passcode.', status: 401 };
    }
    const user: AuthUser = {
      id: tech.id,
      role: 'TECHNICIAN',
      name: tech.name,
      identifier: tech.phone,
      technicianId: tech.id,
    };
    return { user, token: createSession(user) };
  }

  if (role === 'ADMIN') {
    const cleanEmail = identifier.trim().toLowerCase();
    const admin = ADMIN_ACCOUNTS.find((a) => a.email === cleanEmail);
    if (!admin || !verifySecret(passcode.trim(), admin.passcodeHash)) {
      return { error: 'Invalid administrator email or passcode.', status: 401 };
    }
    const user: AuthUser = {
      id: admin.id,
      role: 'ADMIN',
      name: admin.name,
      identifier: admin.email,
    };
    return { user, token: createSession(user) };
  }

  return { error: 'Unsupported role.', status: 400 };
}
