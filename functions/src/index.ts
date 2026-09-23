import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Pool } from 'pg';
import { canonicalFormula, compositionsMatch, parseFormula } from './formula';
import { layoutMolecule } from './moleculeLayout';
import { proposeMolecule } from './proposeMolecule';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
// attachDatabasePool is only meaningful on the deployed Neon runtime (it
// silences the idle-disconnect uncaughtException that runtime would
// otherwise raise); running locally via dev-server.mjs, guard the import so
// local dev doesn't need the Neon runtime present.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { attachDatabasePool } = await import('@neon/functions');
  attachDatabasePool(pool);
} catch {
  pool.on('error', (err) => console.error('[pg pool]', err));
}

const app = new Hono();
app.use('*', cors());

app.get('/', (c) => c.text('ReactorX API'));

interface FromAtomsBody {
  atoms?: Record<string, number>;
}

app.post('/molecules/from-atoms', async (c) => {
  const body = await c.req.json<FromAtomsBody>().catch(() => null);
  const composition: Record<string, number> = {};
  if (body?.atoms) {
    for (const [el, n] of Object.entries(body.atoms)) {
      if (typeof n === 'number' && n > 0) composition[el] = Math.floor(n);
    }
  }
  if (Object.keys(composition).length === 0) {
    return c.json({ status: 'error', message: 'atoms composition required, e.g. { "C": 1, "H": 4 }' }, 400);
  }

  const formula = canonicalFormula(composition);

  // Tier 1: already on file (hand-authored or a previous AI generation).
  const existing = await pool.query(
    `SELECT formula, name, source, descriptor, review_status FROM molecules WHERE formula = $1 AND review_status = 'approved' LIMIT 1`,
    [formula],
  );
  if (existing.rows.length > 0) {
    return c.json({ status: 'found', molecule: existing.rows[0] });
  }

  // Tier 2: ask the model whether this exact composition is a real molecule.
  const atomList = Object.entries(composition).flatMap(([el, n]) => Array(n).fill(el));

  let proposal;
  try {
    proposal = await proposeMolecule(atomList);
  } catch (err) {
    console.error('[molecules/from-atoms] AI call failed', err);
    return c.json({ status: 'error', message: 'AI generation failed' }, 502);
  }

  if (!proposal.possible) {
    return c.json({ status: 'not_possible', reason: proposal.reason });
  }

  // Validate before trusting or caching anything: the claimed formula must
  // be exactly the composition we asked about (the model can't add,
  // drop, or swap atoms), and every bond must reference a real index.
  const claimed = parseFormula(proposal.formula);
  if (!compositionsMatch(claimed, composition)) {
    console.error('[molecules/from-atoms] composition mismatch', { requested: composition, claimed });
    return c.json({ status: 'invalid', reason: "The proposed formula didn't match the requested atoms." }, 422);
  }
  const maxIndex = atomList.length - 1;
  const bondsValid = proposal.bonds.every((b) => (
    Number.isInteger(b.a) && Number.isInteger(b.b)
    && b.a >= 0 && b.a <= maxIndex && b.b >= 0 && b.b <= maxIndex && b.a !== b.b
  ));
  if (!bondsValid) {
    return c.json({ status: 'invalid', reason: 'The proposed structure referenced an invalid bond.' }, 422);
  }

  const positions = layoutMolecule(atomList.length, proposal.bonds);
  const descriptor = {
    atoms: atomList.map((el, i) => ({ el, pos: positions[i] })),
    bonds: proposal.bonds.map((b) => [b.a, b.b, b.type, b.order]),
  };

  const inserted = await pool.query(
    `INSERT INTO molecules (formula, name, source, grade_band, descriptor, review_status)
     VALUES ($1, $2, 'ai_generated', '9-10', $3, 'approved')
     ON CONFLICT (formula, grade_band) DO UPDATE SET descriptor = EXCLUDED.descriptor, name = EXCLUDED.name
     RETURNING formula, name, source, descriptor, review_status`,
    [formula, proposal.name, JSON.stringify(descriptor)],
  );

  return c.json({ status: 'generated', molecule: inserted.rows[0] });
});

export default app;
