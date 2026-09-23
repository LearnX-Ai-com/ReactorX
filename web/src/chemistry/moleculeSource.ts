import { ELEMENTS } from './elements';
import { MOLECULE_INFO, MOLECULES } from './molecules';
import type { MoleculeDef } from './types';

interface RuntimeEntry {
  def: MoleculeDef;
  name?: string;
}

// Molecules fetched from the AI backend this session (formula -> descriptor
// + name), so a repeat pick within the same session is a cache read, not a
// request.
const runtimeCache = new Map<string, RuntimeEntry>();

export function cacheMolecule(formula: string, def: MoleculeDef, name?: string): void {
  runtimeCache.set(formula, { def, name });
}

const ELEMENTAL_FORM = /^([A-Z][a-z]?)(2)?$/;

/** A bare element symbol or its diatomic form (H2, O2, ...) is never a
 * question worth asking the AI backend — whether it's a "molecule" is
 * settled chemistry, not something to generate. Single atoms render as one
 * sphere, diatomics as two atoms with a single covalent bond, matching the
 * hand-authored entries in molecules.ts (Na, Fe, H2, Cl2, ...) this mirrors. */
function synthesizeElemental(formula: string): MoleculeDef | undefined {
  const match = ELEMENTAL_FORM.exec(formula);
  if (!match) return undefined;
  const [, el, diatomic] = match;
  if (!(el in ELEMENTS)) return undefined;
  if (!diatomic) return { atoms: [{ el: el as MoleculeDef['atoms'][number]['el'], pos: [0, 0, 0] }], bonds: [] };
  const d = ELEMENTS[el].r * 1.8;
  return {
    atoms: [
      { el: el as MoleculeDef['atoms'][number]['el'], pos: [-d, 0, 0] },
      { el: el as MoleculeDef['atoms'][number]['el'], pos: [d, 0, 0] },
    ],
    bonds: [[0, 1, 'covalent']],
  };
}

/** Formula -> renderable geometry, in resolution order: hand-authored
 * (molecules.ts), AI-generated earlier this session (runtimeCache), then
 * synthesized elemental/diatomic form. Returns undefined only for a formula
 * nobody has resolved yet (multi-element, never fetched) — the caller is
 * expected to fetch it via chemistry/api.ts and cacheMolecule() the result. */
export function getKnownMolecule(formula: string): MoleculeDef | undefined {
  return MOLECULES[formula] ?? runtimeCache.get(formula)?.def ?? synthesizeElemental(formula);
}

/** Friendly name for a formula already resolved by getKnownMolecule, for the
 * atom tray's live-guess label. undefined for a synthesized elemental form
 * (there's no "name" beyond the formula itself) or an unresolved formula. */
export function getMoleculeName(formula: string): string | undefined {
  return MOLECULE_INFO[formula]?.name ?? runtimeCache.get(formula)?.name;
}
