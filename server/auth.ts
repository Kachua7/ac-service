import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AuthUser, UserRole } from '../shared/types';
import { db } from './store';

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// Session tokens are signed and stateless so a sign-in survives a serverless
// instance being replaced between requests.
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'vayucare-local-dev-secret';
const revokedTokens = new Set<string>();

function signSessionPayload(payload: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
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

const isProduction = process.env.NODE_ENV === 'production';
const adminEmail = process.env.ADMIN_EMAIL ?? (isProduction ? '' : 'ops@example.test');
const adminPasscode = process.env.ADMIN_PASSCODE ?? (isProduction ? '' : 'admin-demo-only');
const technicianPasscode = process.env.TECH_PASSCODE ?? (isProduction ? '' : 'tech-demo-only');

const PRIVILEGED_SIGN_IN_DISABLED =
  'Admin and technician sign-in is disabled on this deployment until ADMIN_EMAIL, ADMIN_PASSCODE and TECH_PASSCODE are configured.';

// Missing production credentials must never fall back to the demo values, but
// they also must not take the whole API down: the customer flow stays usable and
// privileged sign-in is rejected with an explicit message instead.
const privilegedSignInDisabled =
  isProduction && (!adminEmail || !adminPasscode || !technicianPasscode);

if (privilegedSignInDisabled) {
  console.warn(
    '[vayucare] ADMIN_EMAIL, ADMIN_PASSCODE or TECH_PASSCODE is not set: admin and technician sign-in is disabled on this deployment.',
  );
}

// Demo credentials are available only outside production. Production must provide
// ADMIN_EMAIL, ADMIN_PASSCODE, and TECH_PASSCODE through its secret manager.
const ADMIN_ACCOUNTS =
  adminEmail && adminPasscode
    ? [
        {
          id: 'adm-jaipur-1',
          email: adminEmail.trim().toLowerCase(),
          name: 'Jaipur Operations Lead',
          passcodeHash: hashSecret(adminPasscode),
        },
      ]
    : [];

const TECH_PASSCODE_HASH = technicianPasscode ? hashSecret(technicianPasscode) : '';


export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

export function createSession(user: AuthUser): string {
  const payload = Buffer.from(
    JSON.stringify({ user, exp: Date.now() + SESSION_TTL_MS }),
    'utf-8',
  ).toString('base64url');
  return `${payload}.${signSessionPayload(payload)}`;
}

export function getSessionUser(token: string | undefined): AuthUser | null {
  if (!token || revokedTokens.has(token)) return null;

  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = signSessionPayload(payload);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      user?: AuthUser;
      exp?: number;
    };
    if (!parsed?.user || typeof parsed.exp !== 'number' || Date.now() > parsed.exp) return null;
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
    if (privilegedSignInDisabled) {
      return { error: PRIVILEGED_SIGN_IN_DISABLED, status: 503 };
    }
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
    if (privilegedSignInDisabled) {
      return { error: PRIVILEGED_SIGN_IN_DISABLED, status: 503 };
    }
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
