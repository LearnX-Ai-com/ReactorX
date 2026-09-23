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

// Pauling-scale electronegativity, duplicated from
// web/src/chemistry/periodicTableData.ts's ELECTRONEGATIVITY table — only
// used here for canonicalFormula's element ordering, not full element data.
const ELECTRONEGATIVITY: Record<string, number> = {
  H: 2.20, Li: 0.98, Be: 1.57, B: 2.04, C: 2.55, N: 3.04, O: 3.44, F: 3.98,
  Na: 0.93, Mg: 1.31, Al: 1.61, Si: 1.90, P: 2.19, S: 2.58, Cl: 3.16,
  K: 0.82, Ca: 1.00, Sc: 1.36, Ti: 1.54, V: 1.63, Cr: 1.66, Mn: 1.55, Fe: 1.83,
  Co: 1.88, Ni: 1.91, Cu: 1.90, Zn: 1.65, Ga: 1.81, Ge: 2.01, As: 2.18, Se: 2.55, Br: 2.96,
  Rb: 0.82, Sr: 0.95, Y: 1.22, Zr: 1.33, Nb: 1.60, Mo: 2.16, Tc: 1.90, Ru: 2.20,
  Rh: 2.28, Pd: 2.20, Ag: 1.93, Cd: 1.69, In: 1.78, Sn: 1.96, Sb: 2.05, Te: 2.10, I: 2.66, Xe: 2.60,
  Cs: 0.79, Ba: 0.89, La: 1.10, Ce: 1.12, Pr: 1.13, Nd: 1.14, Pm: 1.13, Sm: 1.17,
  Eu: 1.20, Gd: 1.20, Tb: 1.10, Dy: 1.22, Ho: 1.23, Er: 1.24, Tm: 1.25, Yb: 1.10, Lu: 1.27,
  Hf: 1.30, Ta: 1.50, W: 2.36, Re: 1.90, Os: 2.20, Ir: 2.20, Pt: 2.28, Au: 2.54,
  Hg: 2.00, Tl: 1.62, Pb: 2.33, Bi: 2.02, Po: 2.00, At: 2.20,
  Fr: 0.70, Ra: 0.90, Ac: 1.10, Th: 1.30, Pa: 1.50, U: 1.38, Np: 1.36, Pu: 1.28,
  Am: 1.30, Cm: 1.30, Bk: 1.30, Cf: 1.30, Es: 1.30, Fm: 1.30, Md: 1.30, No: 1.30,
};

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
    return ELECTRONEGATIVITY[s] ?? 99;
  };
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
