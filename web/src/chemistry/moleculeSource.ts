import { fetchMoleculeFromAtoms, MoleculeNotPossibleError } from './api';
import { ELEMENTS } from './elements';
import { parseFormula } from './formulas';
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

// A reaction's product AI (proposeReaction.ts) and a molecule's own
// validity AI (proposeMolecule.ts) are separate calls with separate
// standards — a reaction can confidently name a product (e.g. "NO") that
// the stricter molecule check then rejects as too unstable to render. That
// answer doesn't change on retry, so without tracking it here
// ensureMoleculesResolved would keep re-asking forever and
// resetChamber's "are all products resolved" gate would never pass —
// every replay stuck retrying instead of ever reaching the synchronous
// path (see ReactionChamber.tsx's play(), which calls react() right after
// resetChamber and silently no-ops when it didn't finish synchronously).
const unresolvable = new Set<string>();

/** True once a formula has either resolved (getKnownMolecule) or been
 * conclusively told "not a renderable molecule" — the two outcomes
 * resetChamber's fast-path gate should treat as "done trying", so a
 * legitimately unresolvable product still renders (as an empty group,
 * same as any other unresolved formula) instead of blocking forever. */
export function isSettled(formula: string): boolean {
  return !!getKnownMolecule(formula) || unresolvable.has(formula);
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

/** Last-resort geometry for a formula the molecule-validity AI rejected
 * (see `unresolvable` below) — e.g. "NO", which proposeReaction is happy to
 * name as a real reaction product but proposeMolecule then calls too
 * unstable/not-notable to generate a structure for. With exactly two atoms
 * there's only one possible way to connect them, so a single bond between
 * two spheres is real geometry, not a guess, regardless of how the AI
 * judged its stability — this only ever runs on a formula a *reaction*'s
 * own AI already vetted as real chemistry (see ensureMoleculesResolved), so
 * it doesn't touch the atom tray's own free-pick validity check. */
function synthesizeDiatomicFallback(formula: string): MoleculeDef | undefined {
  const composition = parseFormula(formula);
  const atoms = Object.entries(composition).flatMap(([el, n]) => Array(n).fill(el));
  if (atoms.length !== 2) return undefined;
  const [a, b] = atoms;
  if (!(a in ELEMENTS) || !(b in ELEMENTS)) return undefined;
  const d = (ELEMENTS[a].r + ELEMENTS[b].r) * 0.9;
  return {
    atoms: [
      { el: a as MoleculeDef['atoms'][number]['el'], pos: [-d / 2, 0, 0] },
      { el: b as MoleculeDef['atoms'][number]['el'], pos: [d / 2, 0, 0] },
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

/**
 * Best-effort: fetches + session-caches structure for any formulas
 * getKnownMolecule can't already resolve — for reaction products the
 * AI-backed reaction lookup (reactionApi.ts) just named, which were never
 * built through the atom tray (the only other path that resolves a
 * molecule) and so have no known geometry yet. Reuses the exact same
 * Tier-1/Tier-2 endpoint the tray itself uses — a product another student's
 * session already resolved is a fast DB hit, not a fresh AI call. Failures
 * are swallowed: buildMoleculeMesh already renders an empty group for an
 * unresolved formula, so this is a "make it real if we can" step, not a
 * required one — the reaction itself is still valid either way.
 */
export async function ensureMoleculesResolved(formulas: string[]): Promise<void> {
  const unresolved = Array.from(new Set(formulas)).filter((f) => !isSettled(f));
  await Promise.all(unresolved.map(async (formula) => {
    try {
      const result = await fetchMoleculeFromAtoms(parseFormula(formula));
      // The server canonicalizes the formula from the requested atom
      // composition (chemistry/formulas.ts's canonicalFormula), which isn't
      // guaranteed to come back byte-identical to `formula` — a reaction's
      // product string is free-text from the AI reaction lookup, never run
      // through that same canonicalizer. Caching only under result.formula
      // left getKnownMolecule(formula) — what resetChamber's fast-path check
      // and every renderer actually calls — missing forever whenever the two
      // strings diverged. Caching under both keys is a harmless no-op when
      // they already match.
      cacheMolecule(formula, result.def, result.name);
      if (result.formula !== formula) cacheMolecule(result.formula, result.def, result.name);
    } catch (err) {
      if (err instanceof MoleculeNotPossibleError) {
        unresolvable.add(formula);
        // A two-atom product still gets a real (if simplified) rendering
        // instead of sitting invisible forever — see
        // synthesizeDiatomicFallback above.
        const fallback = synthesizeDiatomicFallback(formula);
        if (fallback) cacheMolecule(formula, fallback);
      } else {
        console.error('[ensureMoleculesResolved]', formula, err);
      }
    }
  }));
}
