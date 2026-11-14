import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AuthUser, UserRole } from '../shared/types.js';
import { db } from './store.js';

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'vayucare-local-dev-secret';
const revokedTokens = new Set<string>();

function signPayload(encodedPayload: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(encodedPayload).digest('base64url');
}

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

const adminEmail = (process.env.ADMIN_EMAIL ?? 'ops@vayucare.in').trim().toLowerCase();
const adminPasscode = (process.env.ADMIN_PASSCODE ?? 'ADMIN2026').trim();
const techPasscode = (process.env.TECH_PASSCODE ?? 'TECH2026').trim();

const ADMIN_ACCOUNTS = [
  {
    id: 'adm-jaipur-1',
    email: adminEmail,
    name: 'Jaipur Operations Lead',
    passcodeHash: hashSecret(adminPasscode),
  },
];

const TECH_PASSCODE_HASH = hashSecret(techPasscode);

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

export function createSession(user: AuthUser): string {
  const payload = {
    user,
    exp: Date.now() + SESSION_TTL_MS,
    jti: crypto.randomBytes(12).toString('hex'),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = signPayload(encoded);
  return `${encoded}.${sig}`;
}

export function getSessionUser(token: string | undefined): AuthUser | null {
  if (!token || revokedTokens.has(token)) return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;

  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = signPayload(encoded);
  const sigBuf = Buffer.from(sig, 'utf-8');
  const expectedBuf = Buffer.from(expectedSig, 'utf-8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as {
      user?: AuthUser;
      exp?: number;
    };
    if (!parsed.user || typeof parsed.exp !== 'number' || Date.now() > parsed.exp) {
      return null;
    }
    return parsed.user;
  } catch {
    return null;
  }
}

export function revokeSession(token: string | undefined) {
  if (token) revokedTokens.add(token);
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
