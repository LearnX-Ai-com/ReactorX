import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set (expected in .env)');
  process.exit(1);
}

const client = new pg.Client({ connectionString });

const sql = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

try {
  await client.connect();
  await client.query(sql);
  console.log('Schema applied successfully.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
