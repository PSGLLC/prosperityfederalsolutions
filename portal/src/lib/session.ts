// Two entirely separate session planes — client_sessions/psg_client_session
// and admin_sessions/pfs_admin_session — different tables, different cookie
// names, different lookup functions. A client cookie is never checked
// against admin_sessions and vice versa, so there is no code path where one
// plane's session could be replayed against the other.

export const CLIENT_COOKIE = 'pfs_client_session';
export const ADMIN_COOKIE = 'pfs_admin_session';
const SESSION_HOURS = 24 * 7; // 7 days

export interface ClientSessionUser {
  id: string;
  email: string;
  fullName: string;
}

export interface AdminSessionUser {
  id: string;
  email: string;
  fullName: string;
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function cookieHeader(name: string, token: string, expiresAt: Date): string {
  return [
    `${name}=${token}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Expires=${expiresAt.toUTCString()}`,
  ].join('; ');
}

function logoutCookieHeader(name: string): string {
  return [`${name}=`, 'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=0'].join('; ');
}

// ---- Client plane ----

export async function createClientSession(db: D1Database, clientId: string): Promise<{ token: string; cookie: string }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await db
    .prepare('INSERT INTO client_sessions (session_token, client_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, clientId, expiresAt.toISOString())
    .run();
  return { token, cookie: cookieHeader(CLIENT_COOKIE, token, expiresAt) };
}

export async function validateClientSession(db: D1Database, token: string | undefined): Promise<ClientSessionUser | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT c.id, c.email, c.full_name, s.expires_at
       FROM client_sessions s JOIN clients c ON c.id = s.client_id
       WHERE s.session_token = ? AND c.active = 1`,
    )
    .bind(token)
    .first<{ id: string; email: string; full_name: string; expires_at: string }>();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.prepare('DELETE FROM client_sessions WHERE session_token = ?').bind(token).run();
    return null;
  }
  return { id: row.id, email: row.email, fullName: row.full_name };
}

export function destroyClientSessionCookie(): string {
  return logoutCookieHeader(CLIENT_COOKIE);
}

export async function destroyClientSession(db: D1Database, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.prepare('DELETE FROM client_sessions WHERE session_token = ?').bind(token).run();
}

// ---- Admin plane ----

export async function createAdminSession(db: D1Database, adminId: string): Promise<{ token: string; cookie: string }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await db
    .prepare('INSERT INTO admin_sessions (session_token, admin_id, expires_at) VALUES (?, ?, ?)')
    .bind(token, adminId, expiresAt.toISOString())
    .run();
  return { token, cookie: cookieHeader(ADMIN_COOKIE, token, expiresAt) };
}

export async function validateAdminSession(db: D1Database, token: string | undefined): Promise<AdminSessionUser | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT a.id, a.email, a.full_name, s.expires_at
       FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
       WHERE s.session_token = ?`,
    )
    .bind(token)
    .first<{ id: string; email: string; full_name: string; expires_at: string }>();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.prepare('DELETE FROM admin_sessions WHERE session_token = ?').bind(token).run();
    return null;
  }
  return { id: row.id, email: row.email, fullName: row.full_name };
}

export function destroyAdminSessionCookie(): string {
  return logoutCookieHeader(ADMIN_COOKIE);
}

export async function destroyAdminSession(db: D1Database, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.prepare('DELETE FROM admin_sessions WHERE session_token = ?').bind(token).run();
}

// ---- Rate limiting (shared, keyed by plane) ----

const RATE_LIMIT_MAX = 8;
const RATE_LIMIT_WINDOW = '-60 minutes';

export async function isLoginRateLimited(db: D1Database, plane: 'client' | 'admin', ip: string, identifier: string): Promise<boolean> {
  const [byIp, byId] = await Promise.all([
    db
      .prepare("SELECT COUNT(*) as c FROM login_attempts WHERE plane = ? AND ip_address = ? AND created_at >= datetime('now', ?)")
      .bind(plane, ip, RATE_LIMIT_WINDOW)
      .first<{ c: number }>(),
    db
      .prepare("SELECT COUNT(*) as c FROM login_attempts WHERE plane = ? AND identifier = ? AND created_at >= datetime('now', ?)")
      .bind(plane, identifier, RATE_LIMIT_WINDOW)
      .first<{ c: number }>(),
  ]);
  return (byIp?.c ?? 0) >= RATE_LIMIT_MAX || (byId?.c ?? 0) >= RATE_LIMIT_MAX;
}

export async function recordLoginAttempt(db: D1Database, plane: 'client' | 'admin', ip: string, identifier: string): Promise<void> {
  await db.prepare('INSERT INTO login_attempts (plane, identifier, ip_address) VALUES (?, ?, ?)').bind(plane, identifier, ip).run();
}

export function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}
