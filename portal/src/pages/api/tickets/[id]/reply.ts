import type { APIRoute } from 'astro';

export const prerender = false;

// Shared by both the client ticket page and the admin ticket page. Which
// table the caller is allowed to touch is resolved from the session
// (locals.client / locals.admin), never from a role field in the form —
// so a client can never post a reply "as admin" by tampering with the body.
export const POST: APIRoute = async (context) => {
  const client = context.locals.client;
  const admin = context.locals.admin;
  if (!client && !admin) return new Response('Unauthorized', { status: 401 });

  const db = context.locals.runtime.env.DB;
  const id = context.params.id;
  const formData = await context.request.formData();
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return new Response('Reply body required', { status: 400 });

  const ticket = client
    ? await db.prepare('SELECT id, client_id FROM tickets WHERE id = ? AND client_id = ?').bind(id, client.id).first<{ id: string; client_id: string }>()
    : await db.prepare('SELECT id, client_id FROM tickets WHERE id = ?').bind(id).first<{ id: string; client_id: string }>();

  if (!ticket) return new Response('Not found', { status: 404 });

  const authorType = client ? 'client' : 'admin';
  const authorId = client ? client.id : admin!.id;

  await db
    .prepare('INSERT INTO ticket_replies (id, ticket_id, author_type, author_id, body) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), id, authorType, authorId, body)
    .run();

  await db.prepare("UPDATE tickets SET updated_at = datetime('now'), status = ? WHERE id = ?")
    .bind(admin ? 'In Progress' : 'Open', id)
    .run();

  if (client) {
    await db
      .prepare('INSERT INTO activity_log (id, client_id, event) VALUES (?, ?, ?)')
      .bind(crypto.randomUUID(), client.id, 'Replied to a support ticket')
      .run();
    return context.redirect(`/tickets/${id}/`);
  }
  return context.redirect(`/admin/tickets/${id}/`);
};
