import type { Reaction } from './types';

const BASE_URL = import.meta.env.VITE_FUNCTIONS_URL ?? 'http://localhost:8787';

export class ReactionNotPossibleError extends Error {}

/** Calls the /reactions/from-formulas endpoint (functions/src/index.ts):
 * Tier-1 DB lookup, falling back to Tier-2 AI prediction for a reactant
 * pair that isn't in the hand-authored list (chemistry/reactions.ts) and
 * hasn't been asked about before. Throws ReactionNotPossibleError when the
 * pair genuinely doesn't react, or a plain Error for request/validation
 * failures. */
export async function fetchReactionFromFormulas(a: string, b: string): Promise<Reaction> {
  const res = await fetch(`${BASE_URL}/reactions/from-formulas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ a, b }),
  });
  const body = await res.json().catch(() => null);

  if (res.ok && (body?.status === 'found' || body?.status === 'generated')) {
    const r = body.reaction;
    return {
      a: r.a, b: r.b, products: r.products, type: r.type, name: r.name, note: r.note,
      energyChange: r.energyChange, conditions: r.conditions, catalyst: r.catalyst,
      reversible: r.reversible, whatsHappening: r.whatsHappening,
      labSteps: r.labSteps, safetyNote: r.safetyNote,
    };
  }
  if (body?.status === 'not_possible') {
    throw new ReactionNotPossibleError(body.reason ?? "These reactants don't react under normal conditions.");
  }
  throw new Error(body?.message ?? body?.reason ?? `Reaction lookup failed (${res.status})`);
}
