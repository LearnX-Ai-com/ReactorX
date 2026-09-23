import type { MoleculeDef } from './types';

const BASE_URL = import.meta.env.VITE_FUNCTIONS_URL ?? 'http://localhost:8787';

export interface GeneratedMolecule {
  formula: string;
  name: string;
  def: MoleculeDef;
}

export class MoleculeNotPossibleError extends Error {}

/** Calls the /molecules/from-atoms endpoint (functions/src/index.ts): Tier-1
 * DB lookup, falling back to Tier-2 AI generation for a composition never
 * seen before. Throws MoleculeNotPossibleError when the composition isn't a
 * real molecule, or a plain Error for request/validation failures. */
export async function fetchMoleculeFromAtoms(atoms: Record<string, number>): Promise<GeneratedMolecule> {
  const res = await fetch(`${BASE_URL}/molecules/from-atoms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ atoms }),
  });
  const body = await res.json().catch(() => null);

  if (res.ok && (body?.status === 'found' || body?.status === 'generated')) {
    const { formula, name, descriptor } = body.molecule;
    return { formula, name, def: descriptor as MoleculeDef };
  }
  if (body?.status === 'not_possible') {
    throw new MoleculeNotPossibleError(body.reason ?? "That combination isn't a known stable molecule.");
  }
  throw new Error(body?.message ?? body?.reason ?? `Molecule generation failed (${res.status})`);
}
