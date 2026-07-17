import type { APIRoute } from 'astro';

export const prerender = false;

const STATUSES = new Set(['Open', 'In Progress', 'Resolved']);

export const POST: APIRoute = async (context) => {
  const admin = context.locals.admin;
  if (!admin) return new Response('Unauthorized', { status: 401 });

  const db = context.locals.runtime.env.DB;
  const id = context.params.id;
  const formData = await context.request.formData();
  const status = String(formData.get('status') ?? '');
  if (!STATUSES.has(status)) return new Response('Invalid status', { status: 400 });

  const ticket = await db.prepare('SELECT client_id FROM tickets WHERE id = ?').bind(id).first<{ client_id: string }>();
  if (!ticket) return new Response('Not found', { status: 404 });

  await db.prepare("UPDATE tickets SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, id).run();
  await db
    .prepare('INSERT INTO activity_log (id, client_id, event) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), ticket.client_id, `Support ticket status updated to ${status}`)
    .run();

  return context.redirect(`/admin/tickets/${id}/`);
};
