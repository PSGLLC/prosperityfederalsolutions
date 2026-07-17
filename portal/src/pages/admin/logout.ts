import type { APIRoute } from 'astro';
import { ADMIN_COOKIE, destroyAdminSession, destroyAdminSessionCookie, parseCookie } from '../../lib/session';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const db = context.locals.runtime.env.DB;
  const token = parseCookie(context.request.headers.get('cookie'), ADMIN_COOKIE);
  await destroyAdminSession(db, token);
  return new Response(null, {
    status: 302,
    headers: { Location: '/admin/login', 'Set-Cookie': destroyAdminSessionCookie() },
  });
};
