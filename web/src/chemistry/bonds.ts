import { ATOMIC_NAMES, ELEMENTS } from './elements';
import { getKnownMolecule } from './moleculeSource';
import type { BondType, ElementSymbol } from './types';

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

/** The realistic charge range an element can actually reach — derived from
 * its own real common oxidation states (ELEMENTS[symbol].oxidation), not a
 * hand-picked rule. Oxygen's oxidation states are all negative ([-2, -1]),
 * so max comes out 0 — no cation, matching real chemistry (it always gains
 * electrons, never loses them). Iron's are all positive ([2, 3]), so min
 * comes out 0 — no anion. Shared by the Ionize view's drag gate and its
 * "+ electron" button (three/BohrAtom.tsx) and the dock's button
 * enablement (App.tsx), so the three can't drift out of sync. */
export function ionChargeRange(symbol: ElementSymbol): { min: number; max: number } {
  const states = ELEMENTS[symbol].oxidation;
  return {
    min: Math.min(0, ...states),
    max: Math.max(0, ...states),
  };
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

export interface BondExplanation {
  title: string;
  kind: string;
  diff: string;
  body: string;
}

// A couple of bonds get a hand-written explanation instead of the generic
// template — ported from the original single-file prototype (index.html,
// bondInfo()) essentially verbatim, since these two are exactly the
// textbook examples (a clean ionic transfer, a clean polar-covalent
// share) worth naming explicitly rather than leaving to the templated
// wording. Keyed by the pair's symbols sorted, so order doesn't matter.
const BESPOKE_BOND_EXPLANATIONS: Record<string, (diff: string) => string> = {
  'Cl-Na': (diff) => `Sodium (EN ${ELEMENTS.Na.en}) barely holds onto its lone valence electron; chlorine (EN ${ELEMENTS.Cl.en}) pulls hard for one more to fill its own shell. That gap (${diff}) is wide enough that sodium simply gives its electron away rather than sharing it — forming Na⁺ and Cl⁻ ions held together by electrostatic attraction, not a shared pair.`,
  'H-O': (diff) => `Oxygen (EN ${ELEMENTS.O.en}) pulls harder on the shared electron pair than hydrogen (EN ${ELEMENTS.H.en}) does. The gap (${diff}) isn't wide enough to transfer the electron outright, but it's enough to make this bond polar — electrons spend more time near oxygen, giving it a slight negative charge and hydrogen a slight positive one.`,
};

/** Why a specific bond is ionic/covalent, in the same "electronegativity gap"
 * terms the rest of the app already uses (oxidationStates above) — the
 * click-a-bond explanation for the reaction chamber's molecule/bond card.
 * Ported from the original single-file prototype's bondInfo(). */
export function bondInfo(bondType: BondType, elA: ElementSymbol, elB: ElementSymbol, order?: number): BondExplanation {
  const a = ELEMENTS[elA];
  const b = ELEMENTS[elB];
  const diff = (a.en != null && b.en != null ? Math.abs(a.en - b.en) : 0).toFixed(2);
  const key = [elA, elB].slice().sort().join('-');
  const n = order || 1;
  const pairWord = n === 1 ? 'a single pair' : n === 2 ? 'two pairs' : 'three pairs';
  const bondWord = n === 1 ? 'a single bond' : n === 2 ? 'a double bond' : 'a triple bond';
  const electronWord = n === 1 ? 'an electron' : n === 2 ? 'two electrons' : `${n} electrons`;
  const generic = bondType === 'ionic'
    ? `The electronegativity difference between ${ATOMIC_NAMES[elA]} (${a.en}) and ${ATOMIC_NAMES[elB]} (${b.en}) is ${diff} — large enough that one atom transfers ${electronWord} to the other rather than sharing them, forming oppositely charged ions held together by electrostatic attraction.`
    : `${ATOMIC_NAMES[elA]} (${a.en}) and ${ATOMIC_NAMES[elB]} (${b.en}) have an electronegativity difference of just ${diff} — small enough that both atoms share electrons instead of one taking them outright. Here they share ${pairWord} of electrons, forming ${bondWord}.`;
  return {
    title: `${elA}–${elB} bond`,
    kind: bondType === 'ionic' ? 'Ionic bond' : (n === 1 ? 'Covalent bond' : n === 2 ? 'Covalent bond (double)' : 'Covalent bond (triple)'),
    diff,
    body: BESPOKE_BOND_EXPLANATIONS[key]?.(diff) ?? generic,
  };
}
