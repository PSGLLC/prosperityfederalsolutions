import type { APIRoute } from 'astro';
import { hashPassword } from '../../../../lib/password';

export const prerender = false;

// Admin creates client accounts — there is no public self-signup path
// anywhere in this app.
export const POST: APIRoute = async (context) => {
  const admin = context.locals.admin;
  if (!admin) return new Response('Unauthorized', { status: 401 });

  const db = context.locals.runtime.env.DB;
  const formData = await context.request.formData();
  const fullName = String(formData.get('fullName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const companyName = String(formData.get('companyName') ?? '').trim() || null;
  const phone = String(formData.get('phone') ?? '').trim() || null;
  const password = String(formData.get('password') ?? '');

  if (!fullName || !email || password.length < 10) {
    return context.redirect(`/admin/clients/?error=${encodeURIComponent('Name, email, and a password of at least 10 characters are required.')}`);
  }

  const existing = await db.prepare('SELECT id FROM clients WHERE email = ?').bind(email).first<{ id: string }>();
  if (existing) {
    return context.redirect(`/admin/clients/?error=${encodeURIComponent('A client with that email already exists.')}`);
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  await db
    .prepare(
      'INSERT INTO clients (id, email, password_hash, full_name, company_name, phone, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(id, email, passwordHash, fullName, companyName, phone, admin.id)
    .run();
  await db
    .prepare('INSERT INTO activity_log (id, client_id, event) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), id, 'Account created')
    .run();

  return context.redirect('/admin/clients/?created=1');
};
