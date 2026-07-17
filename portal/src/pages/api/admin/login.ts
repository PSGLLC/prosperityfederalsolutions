import type { APIRoute } from 'astro';
import { verifyPassword } from '../../../lib/password';
import { createAdminSession, isLoginRateLimited, recordLoginAttempt } from '../../../lib/session';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const db = context.locals.runtime.env.DB;
  const ip = context.request.headers.get('cf-connecting-ip') || 'unknown';
  const formData = await context.request.formData();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  const fail = (msg: string) => context.redirect(`/admin/login?error=${encodeURIComponent(msg)}`);

  if (!email || !password) return fail('Email and password are required.');

  if (await isLoginRateLimited(db, 'admin', ip, email)) {
    return fail('Too many attempts. Please try again in an hour.');
  }
  await recordLoginAttempt(db, 'admin', ip, email);

  const row = await db
    .prepare('SELECT id, password_hash FROM admins WHERE email = ?')
    .bind(email)
    .first<{ id: string; password_hash: string }>();

  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return fail('Invalid email or password.');
  }

  const { cookie } = await createAdminSession(db, row.id);
  return new Response(null, {
    status: 302,
    headers: { Location: '/admin/', 'Set-Cookie': cookie },
  });
};
