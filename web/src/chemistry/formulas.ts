import { ELEMENTS } from './elements';
import type { ElementSymbol } from './types';

export function parseFormula(formula: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const re = /([A-Z][a-z]?)(\d*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula))) {
    if (!m[1]) continue;
    counts[m[1]] = (counts[m[1]] || 0) + (m[2] ? parseInt(m[2], 10) : 1);
  }
  return counts;
}

// Duplicated (by hand, deliberately) in functions/src/formula.ts — that's a
// separate deployable unit and can't import across the boundary. Keep the
// two in sync rather than pulling in a shared-package build step for one
// function each.
/** Canonical formula string from an atom composition, so the same
 * composition always produces the same cache key regardless of the order
 * atoms were picked in. Two conventions, chosen by whether carbon is
 * present:
 *  - Carbon present: Hill system (C, then H, then everything else
 *    alphabetically) — the standard for organic formulas, e.g. {H:4,C:1} ->
 *    "CH4", {C:2,H:6,O:1} -> "C2H6O".
 *  - No carbon: ascending electronegativity, i.e. the more electropositive
 *    (metallic/cation-like) element first — {K:1,Cl:1} -> "KCl", not the
 *    "ClK" a plain alphabetical sort would give. This matches how ionic
 *    compounds are conventionally written (cation before anion) for the
 *    overwhelming majority of binary salts a student can build here. It's
 *    not a universal nomenclature engine: a handful of hydrogen-nonmetal
 *    covalent compounds (NH3, PH3) have a historical formula that doesn't
 *    follow any monotonic element-ordering rule — a known, narrow gap. */
export function canonicalFormula(counts: Record<string, number>): string {
  const symbols = Object.keys(counts).filter((s) => counts[s] > 0);
  const hasCarbon = symbols.includes('C');
  const rank = (s: string): number => {
    if (hasCarbon) return s === 'C' ? -2 : s === 'H' ? -1 : 0;
    return ELEMENTS[s]?.en ?? 99;
  };
  symbols.sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return a.localeCompare(b);
  });
  return symbols.map((s) => (counts[s] > 1 ? `${s}${counts[s]}` : s)).join('');
}

const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
export function toSubscript(formula: string): string {
  return formula.replace(/[0-9]/g, (d) => SUB[d]);
}

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
/** "O" + charge -1 -> "O⁻", "Fe" + charge 2 -> "Fe²⁺" — standard ion
 * notation, shared by the Ionize view's HUD label and its in-scene label
 * (three/BohrAtom.tsx) so the two can never drift out of sync. */
export function formatIonLabel(symbol: string, charge: number): string {
  if (charge === 0) return symbol;
  const magnitude = Math.abs(charge);
  const digits = magnitude > 1 ? String(magnitude).split('').map((d) => SUP[d]).join('') : '';
  return `${symbol}${digits}${charge > 0 ? '⁺' : '⁻'}`;
}

export function molarMass(formula: string): number {
  const counts = parseFormula(formula);
  return Object.entries(counts).reduce(
    (sum, [el, n]) => sum + (ELEMENTS[el as ElementSymbol].mass ?? 0) * n,
    0,
  );
}
