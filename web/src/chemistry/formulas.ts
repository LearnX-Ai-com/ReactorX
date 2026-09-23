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
/** Hill-system-ish canonical formula string from an atom composition, so the
 * same composition always produces the same cache key regardless of the
 * order atoms were picked in: Carbon first (if present), then Hydrogen,
 * then everything else alphabetically — e.g. {H:4, C:1} -> "CH4". */
export function canonicalFormula(counts: Record<string, number>): string {
  const symbols = Object.keys(counts).filter((s) => counts[s] > 0);
  const rank = (s: string): number => (s === 'C' ? 0 : s === 'H' ? 1 : 2);
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

export function molarMass(formula: string): number {
  const counts = parseFormula(formula);
  return Object.entries(counts).reduce(
    (sum, [el, n]) => sum + (ELEMENTS[el as ElementSymbol].mass ?? 0) * n,
    0,
  );
}
