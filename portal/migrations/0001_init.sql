-- Prosperity Federal Solutions client portal — initial schema.
-- Two account planes: `clients` (portal clients, self-scoped) and
-- `admins` (staff). Never merged into one table — every client-data query
-- filters by client_id so a client can only ever see their own rows;
-- admins are the only role permitted to query across all clients.

CREATE TABLE clients (
  id TEXT PRIMARY KEY, -- uuid
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, -- pbkdf2$<iterations>$<saltB64>$<hashB64>
  full_name TEXT NOT NULL,
  company_name TEXT,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT -- admin id who created this account
);

CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessions are deliberately split by plane (client_sessions / admin_sessions)
-- with different cookie names, so a stolen client cookie can never be
-- replayed against an admin route and vice versa.
CREATE TABLE client_sessions (
  session_token TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE admin_sessions (
  session_token TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES admins(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plane TEXT NOT NULL, -- 'client' | 'admin'
  identifier TEXT NOT NULL, -- email attempted
  ip_address TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Document vault. Every row is scoped to exactly one client_id.
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  category TEXT NOT NULL, -- Contracts | Agreements | Forms | Correspondence
  file_name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  retention_10yr INTEGER NOT NULL DEFAULT 0,
  uploaded_by_admin_id TEXT REFERENCES admins(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_documents_client ON documents(client_id);

-- Contract tracker. Client can view only; only admins write.
CREATE TABLE contracts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending', -- Active | Pending | Completed | Cancelled
  start_date TEXT,
  expected_completion TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_contracts_client ON contracts(client_id);

-- Support tickets.
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Low', -- Low | Medium | High
  status TEXT NOT NULL DEFAULT 'Open', -- Open | In Progress | Resolved
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tickets_client ON tickets(client_id);

CREATE TABLE ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  author_type TEXT NOT NULL, -- 'client' | 'admin'
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ticket_replies_ticket ON ticket_replies(ticket_id);

-- Secure messaging — one thread per client, portal-only (no email sending).
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  author_type TEXT NOT NULL, -- 'client' | 'admin'
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  read_by_client INTEGER NOT NULL DEFAULT 0,
  read_by_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_messages_client ON messages(client_id);

-- Simple activity feed shown on the client dashboard.
CREATE TABLE activity_log (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id),
  event TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_activity_client ON activity_log(client_id);
