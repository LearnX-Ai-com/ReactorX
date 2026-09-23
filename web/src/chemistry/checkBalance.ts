import { parseFormula } from './formulas';

export interface ElementTally {
  left: number;
  right: number;
  balanced: boolean;
}

export interface BalanceCheck {
  tally: Record<string, ElementTally>;
  balanced: boolean;
}

/** Compares atom counts on each side of a (possibly student-chosen, possibly
 * wrong) set of coefficients — the live feedback an interactive balancer
 * needs, as opposed to `balanceEquation`, which solves for the answer. */
export function checkBalance(
  reactants: string[], reactantCoeffs: number[],
  products: string[], productCoeffs: number[],
): BalanceCheck {
  const tally: Record<string, ElementTally> = {};
  function add(side: 'left' | 'right', formula: string, coeff: number): void {
    const counts = parseFormula(formula);
    for (const [el, n] of Object.entries(counts)) {
      if (!tally[el]) tally[el] = { left: 0, right: 0, balanced: false };
      tally[el][side] += n * coeff;
    }
  }
  reactants.forEach((f, i) => add('left', f, reactantCoeffs[i] ?? 1));
  products.forEach((f, i) => add('right', f, productCoeffs[i] ?? 1));

  let balanced = true;
  for (const el of Object.keys(tally)) {
    const entry = tally[el];
    entry.balanced = entry.left === entry.right;
    if (!entry.balanced) balanced = false;
  }
  return { tally, balanced };
}
