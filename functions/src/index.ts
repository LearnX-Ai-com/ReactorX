import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Pool } from 'pg';
import { balanceEquation } from './balance';
import { canonicalFormula, compositionsMatch, parseFormula } from './formula';
import { proposeIonAnswer, type IonAnswerContext } from './proposeIonAnswer';
import { layoutMolecule } from './moleculeLayout';
import { proposeMolecule } from './proposeMolecule';
import { proposeReaction, REACTION_TYPES } from './proposeReaction';

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

interface FromFormulasBody {
  a?: string;
  b?: string;
}

/** Plain-text (no subscripts/unicode — this is a DB display field, not
 * rendered UI) equation string for the reactions.balanced_equation column. */
function formatEquationPlain(reactants: string[], products: string[], coeffs: number[]): string {
  const side = (formulas: string[], offset: number) => formulas
    .map((f, i) => (coeffs[offset + i] > 1 ? `${coeffs[offset + i]}${f}` : f))
    .join(' + ');
  return `${side(reactants, 0)} -> ${side(products, reactants.length)}`;
}

app.post('/reactions/from-formulas', async (c) => {
  const body = await c.req.json<FromFormulasBody>().catch(() => null);
  const a = typeof body?.a === 'string' ? body.a.trim() : '';
  const b = typeof body?.b === 'string' ? body.b.trim() : '';
  if (!a || !b) {
    return c.json({ status: 'error', message: 'both reactant formulas (a, b) are required' }, 400);
  }

  // Order-independent cache key — "A+B" and "B+A" are the same reaction.
  const pair = [a, b].sort();

  // Tier 1: already on file (hand-authored or a previous AI prediction).
  const existing = await pool.query(
    `SELECT reactants, products, reaction_type, descriptor FROM reactions WHERE reactants = $1 AND grade_band = '9-10' AND review_status = 'approved' LIMIT 1`,
    [pair],
  );
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    return c.json({
      status: 'found',
      reaction: {
        a: row.reactants[0], b: row.reactants[1], products: row.products, type: row.reaction_type, ...row.descriptor,
      },
    });
  }

  // Tier 2: ask the model whether this pair reacts at all.
  let proposal;
  try {
    proposal = await proposeReaction(a, b);
  } catch (err) {
    console.error('[reactions/from-formulas] AI call failed', err);
    return c.json({ status: 'error', message: 'AI reaction lookup failed' }, 502);
  }

  if (!proposal.possible || proposal.products.length === 0) {
    return c.json({ status: 'not_possible', reason: proposal.reason || "These reactants don't react under normal conditions." });
  }
  // The chamber's product anchors only support 1 or 2 products (see
  // ANCHOR_P_SINGLE/ANCHOR_P1/ANCHOR_P2 in ReactionChamber.tsx).
  if (proposal.products.length > 2) {
    return c.json({ status: 'invalid', reason: 'The proposed reaction had more products than the chamber can display.' }, 422);
  }

  // Validate before trusting or caching anything: the reaction type must be
  // one of the allowed values (defense in depth beyond strict tool-use), and
  // the products must actually conserve every reactant atom in some simple
  // whole-number ratio — otherwise this "reaction" could never be balanced
  // in the chamber no matter what a student tries.
  if (!(REACTION_TYPES as readonly string[]).includes(proposal.type)) {
    return c.json({ status: 'invalid', reason: 'The proposed reaction type was not recognized.' }, 422);
  }
  const balance = balanceEquation([a, b], proposal.products);
  if (!balance) {
    console.error('[reactions/from-formulas] unbalanceable', { a, b, products: proposal.products });
    return c.json({ status: 'invalid', reason: "The proposed products didn't conserve atoms in a simple whole-number ratio." }, 422);
  }

  // Defends against an observed (reproducible) tool-call glitch where a
  // free-text field — seen specifically on an empty `catalyst` — comes back
  // with stray XML-tag-shaped fragments instead of plain text. A legitimate
  // catalyst name, condition, or writeup never contains '<'/'>', so this is
  // a safe filter, not a false-positive risk.
  const clean = (s: string): string => (s && !/[<>]/.test(s) ? s.trim() : '');
  const descriptor = {
    name: clean(proposal.name) || proposal.name,
    note: clean(proposal.note) || proposal.note,
    // '' -> omitted key rather than an empty string reaching the frontend —
    // Reaction's new fields are optional (undefined = "not established"),
    // not "blank shown as a row".
    ...(clean(proposal.energyChange) && { energyChange: proposal.energyChange }),
    ...(clean(proposal.conditions) && { conditions: clean(proposal.conditions) }),
    ...(clean(proposal.catalyst) && { catalyst: clean(proposal.catalyst) }),
    reversible: proposal.reversible,
    ...(clean(proposal.whatsHappening) && { whatsHappening: clean(proposal.whatsHappening) }),
    ...(proposal.labSteps?.length && { labSteps: proposal.labSteps.map(clean).filter(Boolean) }),
    ...(clean(proposal.safetyNote) && { safetyNote: clean(proposal.safetyNote) }),
  };
  const slug = `ai-${pair[0]}-${pair[1]}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const balancedEquation = formatEquationPlain([a, b], proposal.products, balance.coeffs);

  const inserted = await pool.query(
    `INSERT INTO reactions (slug, reactants, products, balanced_equation, reaction_type, source, grade_band, descriptor, review_status)
     VALUES ($1, $2, $3, $4, $5, 'ai_generated', '9-10', $6, 'approved')
     ON CONFLICT (reactants, grade_band) DO UPDATE SET
       products = EXCLUDED.products, balanced_equation = EXCLUDED.balanced_equation,
       reaction_type = EXCLUDED.reaction_type, descriptor = EXCLUDED.descriptor
     RETURNING reactants, products, reaction_type, descriptor`,
    [slug, pair, proposal.products, balancedEquation, proposal.type, JSON.stringify(descriptor)],
  );
  const row = inserted.rows[0];

  return c.json({
    status: 'generated',
    reaction: { a, b, products: row.products, type: row.reaction_type, ...row.descriptor },
  });
});

interface IonAskBody {
  question?: string;
  context?: IonAnswerContext;
}

app.post('/ion/ask', async (c) => {
  const body = await c.req.json<IonAskBody>().catch(() => null);
  const question = typeof body?.question === 'string' ? body.question.trim() : '';
  if (!question) {
    return c.json({ status: 'error', message: 'question is required' }, 400);
  }
  const context: IonAnswerContext = body?.context ?? { kind: 'none' };

  try {
    const answer = await proposeIonAnswer(question, context);
    return c.json({ status: 'ok', answer });
  } catch (err) {
    console.error('[ion/ask] AI call failed', err);
    return c.json({ status: 'error', message: 'Ion could not come up with an answer just now' }, 502);
  }
});

export default app;
