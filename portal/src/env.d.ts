/// <reference types="astro/client" />

type Runtime = import('@astrojs/cloudflare').Runtime<{
  DB: D1Database;
  CLIENT_DOCS: R2Bucket;
}>;

declare namespace App {
  interface Locals extends Runtime {
    client: import('./lib/session').ClientSessionUser | null;
    admin: import('./lib/session').AdminSessionUser | null;
  }
}
