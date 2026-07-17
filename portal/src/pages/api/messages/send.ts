import type { APIRoute } from 'astro';

export const prerender = false;

// Shared endpoint for both planes. A client always writes to their own
// thread (client.id); an admin must specify which client's thread via
// clientId in the form, and that value is validated against a real
// clients row before anything is written.
export const POST: APIRoute = async (context) => {
  const client = context.locals.client;
  const admin = context.locals.admin;
  if (!client && !admin) return new Response('Unauthorized', { status: 401 });

  const db = context.locals.runtime.env.DB;
  const formData = await context.request.formData();
  const body = String(formData.get('body') ?? '').trim();
  if (!body) return new Response('Message body required', { status: 400 });

  let clientId: string;
  if (client) {
    clientId = client.id;
  } else {
    const requested = String(formData.get('clientId') ?? '');
    const exists = await db.prepare('SELECT id FROM clients WHERE id = ?').bind(requested).first<{ id: string }>();
    if (!exists) return new Response('Unknown client', { status: 400 });
    clientId = requested;
  }

  const authorType = client ? 'client' : 'admin';
  const authorId = client ? client.id : admin!.id;

  await db
    .prepare(
      'INSERT INTO messages (id, client_id, author_type, author_id, body, read_by_client, read_by_admin) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(crypto.randomUUID(), clientId, authorType, authorId, body, client ? 1 : 0, admin ? 1 : 0)
    .run();

  if (client) return context.redirect('/messages/');
  return context.redirect(`/admin/clients/${clientId}/`);
};
