// Small, deliberately duplicated subset of web/src/chemistry/formulas.ts —
// this is a separate deployable unit (a Neon Function) from the frontend,
// so it can't import across that boundary. Keep it minimal and in sync by
// hand rather than pulling in a shared-package build step for two functions.

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

export function compositionsMatch(a: Record<string, number>, b: Record<string, number>): boolean {
  const keysA = Object.keys(a).filter((k) => a[k] > 0);
  const keysB = Object.keys(b).filter((k) => b[k] > 0);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => a[k] === b[k]);
}
