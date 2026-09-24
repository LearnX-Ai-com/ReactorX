// Duplicated from web/src/chemistry/balance.ts — same reasoning as
// formula.ts: a separate deployable unit from the frontend, kept minimal
// and in sync by hand. Used to reject an AI-proposed reaction whose atoms
// can't actually be conserved in a simple whole-number ratio, before it's
// ever cached or shown to a student.
import { parseFormula } from './formula';

export interface BalanceResult {
  coeffs: number[];
  total: number;
}

export function balanceEquation(reactantFormulas: string[], productFormulas: string[]): BalanceResult | null {
  const compounds = reactantFormulas.concat(productFormulas);
  const signs = reactantFormulas.map(() => 1).concat(productFormulas.map(() => -1));
  const counts = compounds.map(parseFormula);
  const elements = Array.from(new Set(counts.flatMap((c) => Object.keys(c))));
  const n = compounds.length;
  const maxC = 8;
  let best: BalanceResult | null = null;
  const coeffs = new Array(n).fill(1);

  function search(idx: number): void {
    if (idx === n) {
      for (const el of elements) {
        let sum = 0;
        for (let i = 0; i < n; i++) sum += signs[i] * coeffs[i] * (counts[i][el] || 0);
        if (sum !== 0) return;
      }
      const total = coeffs.reduce((s, c) => s + c, 0);
      if (!best || total < best.total) best = { coeffs: coeffs.slice(), total };
      return;
    }
    for (let c = 1; c <= maxC; c++) {
      coeffs[idx] = c;
      search(idx + 1);
    }
  }
  search(0);
  return best;
}
