// Cloudflare Pages Function — owns delivery for the /contact lead capture form.
// Browser POST → this function → GHL inbound webhook (success criterion)
//
// Mirrors PSGLLC/prosperityservicesgroup's functions/api/contact-lead.ts and
// functions/api/guide-lead.ts pattern. Static Astro build, Cloudflare Pages
// Functions provide the one dynamic endpoint. GHL webhook URL stays
// server-side (env secret), never exposed to the browser.

interface Env {
  GHL_FEDERAL_CONTACT_WEBHOOK_URL: string;
}

interface ContactPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  agencyName?: string;
  message?: string;
  pagePath?: string;
  website?: string; // honeypot — real visitors never fill this
  smsOptIn?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\s()+\-.]{7,20}$/;

// GHL location this lead belongs to (Price Services Group LLC).
const GHL_LOCATION_ID = "RMrQyYPseTazGPmAynzT";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function forwardToGHL(webhookUrl: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return json({ ok: false, error: "Expected application/json." }, 415);
  }

  let body: ContactPayload;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON." }, 400);
  }

  // Honeypot tripped — pretend success, drop it silently. Don't tip off bots.
  if (body.website) {
    return json({ ok: true });
  }

  const firstName = String(body.firstName ?? "").trim();
  const lastName = String(body.lastName ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const agencyName = String(body.agencyName ?? "").trim();
  const message = String(body.message ?? "").trim();

  const smsOptIn = body.smsOptIn === true;

  if (!firstName || !lastName || !email || !message) {
    return json({ ok: false, error: "First name, last name, email, and message are required." }, 400);
  }
  if (!EMAIL_RE.test(email)) {
    return json({ ok: false, error: "Enter a valid email address." }, 400);
  }
  if (phone && !PHONE_RE.test(phone)) {
    return json({ ok: false, error: "Enter a valid phone number." }, 400);
  }
  if (!smsOptIn) {
    return json({ ok: false, error: "SMS opt-in consent is required." }, 400);
  }

  const submittedAt = new Date().toISOString();
  const payload = {
    firstName,
    lastName,
    email,
    phone,
    agencyName,
    message,
    locationId: GHL_LOCATION_ID,
    tags: ["federal-inquiry"],
    source: "prosperityfederalsolutions-contact-page",
    pagePath: String(body.pagePath ?? "/contact"),
    smsOptIn,
    submittedAt,
  };

  if (!env.GHL_FEDERAL_CONTACT_WEBHOOK_URL) {
    return json({ ok: false, error: "Message delivery is not configured yet." }, 500);
  }

  const delivered = await forwardToGHL(env.GHL_FEDERAL_CONTACT_WEBHOOK_URL, payload);
  if (!delivered) {
    return json({ ok: false, error: "We couldn't send your message. Please try again or call us." }, 502);
  }

  return json({ ok: true });
};

export const onRequestGet: PagesFunction = async () =>
  new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
