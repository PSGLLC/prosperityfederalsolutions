import type { APIRoute } from 'astro';

export const prerender = false;

const PRIORITIES = new Set(['Low', 'Medium', 'High']);

export const POST: APIRoute = async (context) => {
  const client = context.locals.client;
  if (!client) return new Response('Unauthorized', { status: 401 });

  const db = context.locals.runtime.env.DB;
  const formData = await context.request.formData();
  const subject = String(formData.get('subject') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();
  const priority = String(formData.get('priority') ?? 'Low');

  if (!subject || !description || !PRIORITIES.has(priority)) {
    return context.redirect('/tickets/?error=1');
  }

  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO tickets (id, client_id, subject, description, priority, status) VALUES (?, ?, ?, ?, ?, \'Open\')')
    .bind(id, client.id, subject, description, priority)
    .run();
  await db
    .prepare('INSERT INTO activity_log (id, client_id, event) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), client.id, `Opened support ticket: ${subject}`)
    .run();

  return context.redirect('/tickets/?created=1');
};
