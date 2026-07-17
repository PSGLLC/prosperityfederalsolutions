import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const admin = context.locals.admin;
  if (!admin) return new Response('Unauthorized', { status: 401 });

  const db = context.locals.runtime.env.DB;
  const formData = await context.request.formData();
  const clientId = String(formData.get('clientId') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const startDate = String(formData.get('startDate') ?? '').trim() || null;
  const expectedCompletion = String(formData.get('expectedCompletion') ?? '').trim() || null;
  const notes = String(formData.get('notes') ?? '').trim() || null;

  const client = await db.prepare('SELECT id FROM clients WHERE id = ?').bind(clientId).first<{ id: string }>();
  if (!client || !title) return context.redirect(`/admin/clients/${clientId}/?error=contract`);

  const id = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO contracts (id, client_id, title, status, start_date, expected_completion, notes) VALUES (?, ?, ?, \'Pending\', ?, ?, ?)',
    )
    .bind(id, clientId, title, startDate, expectedCompletion, notes)
    .run();
  await db
    .prepare('INSERT INTO activity_log (id, client_id, event) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), clientId, `Contract added: ${title}`)
    .run();

  return context.redirect(`/admin/clients/${clientId}/`);
};
