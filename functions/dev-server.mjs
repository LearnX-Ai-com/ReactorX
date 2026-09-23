// Local stand-in for `neon dev` — runs the same Hono app (functions/src/index.ts)
// as a plain Node HTTP server, since this session doesn't have authenticated
// Neon CLI access to this project. Reads the same root .env DATABASE_URL
// already used by db/migrate.mjs, plus ANTHROPIC_API_KEY. Once real Neon CLI
// access exists, `neon deploy` deploys functions/src/index.ts directly —
// this file becomes unnecessary, not something to migrate away from.
import 'dotenv/config';
import { serve } from '@hono/node-server';
import app from './src/index.ts';

const port = Number(process.env.FUNCTIONS_PORT || 8787);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (expected in .env)');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('ANTHROPIC_API_KEY is not set — /molecules/from-atoms will fail on any Tier-2 (AI) request.');
}

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`ReactorX API (local dev) listening on http://localhost:${info.port}`);
});
