import type { APIRoute } from 'astro';

export const prerender = false;

// Scoped at the query level, not just the UI: the row lookup itself
// filters by client_id for a client caller, so a client can never receive
// another client's document even by guessing/enumerating IDs. Admins may
// fetch any document.
export const GET: APIRoute = async (context) => {
  const client = context.locals.client;
  const admin = context.locals.admin;
  if (!client && !admin) return new Response('Unauthorized', { status: 401 });

  const db = context.locals.runtime.env.DB;
  const bucket = context.locals.runtime.env.CLIENT_DOCS;
  const id = context.params.id;

  const row = client
    ? await db.prepare('SELECT r2_key, file_name, content_type FROM documents WHERE id = ? AND client_id = ?').bind(id, client.id).first<{ r2_key: string; file_name: string; content_type: string }>()
    : await db.prepare('SELECT r2_key, file_name, content_type FROM documents WHERE id = ?').bind(id).first<{ r2_key: string; file_name: string; content_type: string }>();

  if (!row) return new Response('Not found', { status: 404 });

  const object = await bucket.get(row.r2_key);
  if (!object) return new Response('File missing from storage', { status: 404 });

  return new Response(object.body, {
    headers: {
      'Content-Type': row.content_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${row.file_name.replace(/"/g, '')}"`,
    },
  });
};
