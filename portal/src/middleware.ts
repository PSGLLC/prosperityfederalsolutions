import { defineMiddleware } from 'astro:middleware';
import { ADMIN_COOKIE, CLIENT_COOKIE, parseCookie, validateAdminSession, validateClientSession } from './lib/session';

// Every request resolves locals.client / locals.admin here, then each
// page/API route enforces its own auth requirement explicitly (no single
// public-paths allowlist to fall out of sync) — see requireClient/requireAdmin
// usage at the top of each protected page and API endpoint.
export const onRequest = defineMiddleware(async (context, next) => {
  const db = context.locals.runtime.env.DB;
  const cookieHeader = context.request.headers.get('cookie');

  const clientToken = parseCookie(cookieHeader, CLIENT_COOKIE);
  const adminToken = parseCookie(cookieHeader, ADMIN_COOKIE);

  context.locals.client = await validateClientSession(db, clientToken);
  context.locals.admin = await validateAdminSession(db, adminToken);

  return next();
});
