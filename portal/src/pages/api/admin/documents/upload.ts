import type { APIRoute } from 'astro';

export const prerender = false;

const ALLOWED_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
const MAX_BYTES = 20 * 1024 * 1024;
const CATEGORIES = new Set(['Contracts', 'Agreements', 'Forms', 'Correspondence']);

// Admin-only: uploads to any client's vault by explicit clientId, validated
// against a real clients row before the write.
export const POST: APIRoute = async (context) => {
  const admin = context.locals.admin;
  if (!admin) return new Response('Unauthorized', { status: 401 });

  const db = context.locals.runtime.env.DB;
  const bucket = context.locals.runtime.env.CLIENT_DOCS;
  const formData = await context.request.formData();
  const clientId = String(formData.get('clientId') ?? '');
  const category = String(formData.get('category') ?? '');
  const retention = formData.get('retention10yr') === '1' ? 1 : 0;
  const file = formData.get('file');

  const client = await db.prepare('SELECT id FROM clients WHERE id = ?').bind(clientId).first<{ id: string }>();
  if (!client) return new Response('Unknown client', { status: 400 });
  if (!CATEGORIES.has(category)) return context.redirect(`/admin/clients/${clientId}/?error=category`);
  if (!(file instanceof File) || file.size === 0) return context.redirect(`/admin/clients/${clientId}/?error=file`);
  if (file.size > MAX_BYTES) return context.redirect(`/admin/clients/${clientId}/?error=toolarge`);
  if (!ALLOWED_TYPES.has(file.type)) return context.redirect(`/admin/clients/${clientId}/?error=filetype`);

  const id = crypto.randomUUID();
  const r2Key = `${clientId}/${id}-${file.name}`;
  await bucket.put(r2Key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  await db
    .prepare(
      'INSERT INTO documents (id, client_id, category, file_name, r2_key, content_type, size_bytes, retention_10yr, uploaded_by_admin_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(id, clientId, category, file.name, r2Key, file.type, file.size, retention, admin.id)
    .run();
  await db
    .prepare('INSERT INTO activity_log (id, client_id, event) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), clientId, `Document added by Prosperity Federal Solutions: ${file.name}`)
    .run();

  return context.redirect(`/admin/clients/${clientId}/`);
};
