import type { APIRoute } from 'astro';

export const prerender = false;

const ALLOWED_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const CATEGORIES = new Set(['Contracts', 'Agreements', 'Forms', 'Correspondence']);

// Client self-upload — always writes to the caller's own client_id, never
// a client_id supplied by the form, so there is no way to upload into
// another client's vault from this endpoint.
export const POST: APIRoute = async (context) => {
  const client = context.locals.client;
  if (!client) return new Response('Unauthorized', { status: 401 });

  const db = context.locals.runtime.env.DB;
  const bucket = context.locals.runtime.env.CLIENT_DOCS;

  const formData = await context.request.formData();
  const category = String(formData.get('category') ?? '');
  const file = formData.get('file');

  if (!CATEGORIES.has(category)) return context.redirect('/documents/?error=category');
  if (!(file instanceof File) || file.size === 0) return context.redirect('/documents/?error=file');
  if (file.size > MAX_BYTES) return context.redirect('/documents/?error=toolarge');
  if (!ALLOWED_TYPES.has(file.type)) return context.redirect('/documents/?error=filetype');

  const id = crypto.randomUUID();
  const r2Key = `${client.id}/${id}-${file.name}`;

  await bucket.put(r2Key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  await db
    .prepare(
      'INSERT INTO documents (id, client_id, category, file_name, r2_key, content_type, size_bytes, retention_10yr) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
    )
    .bind(id, client.id, category, file.name, r2Key, file.type, file.size)
    .run();
  await db
    .prepare('INSERT INTO activity_log (id, client_id, event) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), client.id, `Uploaded document: ${file.name}`)
    .run();

  return context.redirect('/documents/?uploaded=1');
};
