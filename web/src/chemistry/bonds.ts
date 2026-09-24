import { ELEMENTS } from './elements';
import { getKnownMolecule } from './moleculeSource';
import type { ElementSymbol } from './types';

export const BOND_SYMBOL: Record<number, string> = { 1: '–', 2: '=', 3: '≡' };

// Human-readable list of the distinct bonds in a molecule, e.g. "O=O" or "H–O".
// Goes through getKnownMolecule (hand-authored -> session AI cache ->
// synthesized elemental) rather than indexing the hand-authored MOLECULES
// dict directly — a reaction product the AI-backed lookup just proposed
// (reactionApi.ts) may not be in any of those yet, and this used to crash
// the whole chamber's render loop rather than just show an unknown structure.
export function bondList(formula: string): string[] {
  const def = getKnownMolecule(formula);
  if (!def) return [];
  const seen = new Set<string>();
  def.bonds.forEach(([i, j, type, order]) => {
    const a = def.atoms[i].el;
    const b = def.atoms[j].el;
    seen.add(type === 'ionic' ? `${a}⋯${b}` : `${a}${BOND_SYMBOL[order || 1]}${b}`);
  });
  return Array.from(seen);
}

// Oxidation state of every atom in a molecule, derived from its bonds:
// each bonded pair's electrons are assigned to the more electronegative atom
// (transferred outright for ionic bonds, counted as owned for shared pairs),
// and equal-EN pairs (H–H, O=O) contribute nothing — the standard rule.
export function oxidationStates(formula: string): number[] {
  const def = getKnownMolecule(formula);
  if (!def) return [];
  const states = def.atoms.map(() => 0);
  def.bonds.forEach(([i, j, , order]) => {
    const n = order || 1;
    const enA = ELEMENTS[def.atoms[i].el].en;
    const enB = ELEMENTS[def.atoms[j].el].en;
    // No established electronegativity for one of these (rare — only the
    // heaviest elements) means there's no basis to assign the bond's
    // electrons to one side, same as a genuine tie.
    if (enA == null || enB == null || enA === enB) return;
    const lo = enA < enB ? i : j;
    const hi = enA < enB ? j : i;
    states[lo] += n;
    states[hi] -= n;
  });
  return states;
}

export function formatOxidation(n: number): string {
  return n === 0 ? '0' : (n > 0 ? '+' : '−') + Math.abs(n);
}

// One entry per distinct element in the molecule (all atoms of an element
// share a state in every molecule in this data set).
export function oxidationBySymbol(formula: string): Partial<Record<ElementSymbol, number>> {
  const def = getKnownMolecule(formula);
  if (!def) return {};
  const states = oxidationStates(formula);
  const out: Partial<Record<ElementSymbol, number>> = {};
  def.atoms.forEach((a, k) => {
    if (!(a.el in out)) out[a.el] = states[k];
  });
  return out;
}

export function bondTypeLabel(formula: string): string {
  const def = getKnownMolecule(formula);
  if (!def) return 'Unknown structure';
  const { bonds } = def;
  if (bonds.length === 0) return 'Single atom';
  if (bonds.some((b) => b[2] === 'ionic')) return 'Ionic bonding';
  return 'Covalent bonding';
}
