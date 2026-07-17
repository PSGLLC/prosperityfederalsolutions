#!/usr/bin/env node
// Bootstraps the first admin account. Plain Node (no build step), uses the
// same PBKDF2 parameters as src/lib/password.ts so the hash it produces is
// verifiable by the deployed app. Prints a wrangler d1 execute --remote
// command rather than writing to D1 directly, so the operator can review
// the SQL before it touches the production database.
//
// Usage: node scripts/create-admin.mjs "Full Name" "email@example.com" "temporary-password"

import { webcrypto as crypto } from 'node:crypto';
import { randomUUID } from 'node:crypto';

const ITERATIONS = 100_000;
const HASH_BITS = 256;
const SALT_BYTES = 16;

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

async function deriveBits(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, HASH_BITS);
  return new Uint8Array(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveBits(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

const [, , fullName, email, password] = process.argv;
if (!fullName || !email || !password) {
  console.error('Usage: node scripts/create-admin.mjs "Full Name" "email@example.com" "temporary-password"');
  process.exit(1);
}
if (password.length < 12) {
  console.error('Password must be at least 12 characters.');
  process.exit(1);
}

const id = randomUUID();
const hash = await hashPassword(password);
const sql = `INSERT INTO admins (id, email, password_hash, full_name) VALUES ('${id}', '${email.toLowerCase().replace(/'/g, "''")}', '${hash}', '${fullName.replace(/'/g, "''")}');`;

console.log('\nRun this to create the admin account on the remote D1 database:\n');
console.log(`npx wrangler d1 execute pfs-portal --remote --command "${sql}"\n`);
