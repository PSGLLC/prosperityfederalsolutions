import type { APIRoute } from 'astro';
import { CLIENT_COOKIE, destroyClientSession, destroyClientSessionCookie, parseCookie } from '../lib/session';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const db = context.locals.runtime.env.DB;
  const token = parseCookie(context.request.headers.get('cookie'), CLIENT_COOKIE);
  await destroyClientSession(db, token);
  return new Response(null, {
    status: 302,
    headers: { Location: '/login', 'Set-Cookie': destroyClientSessionCookie() },
  });
};
