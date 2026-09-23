// Ground-state electron configuration, generated mechanically (Aufbau/Madelung
// filling order + the well-documented exceptions) rather than hand-typed per
// element — 118 hand-typed subshell strings is exactly the kind of place a
// silent transcription error hides. Verified against the 8 elements the
// original chamber hand-authored (see electronConfig.test.ts).
//
// Configs for the heaviest elements (roughly Z>100) are genuinely uncertain
// in real chemistry too — few or no confirmed measurements exist — so treat
// those as best-effort, not settled fact.

// Filling order by (n, l), l: 0=s 1=p 2=d 3=f — the standard Madelung/diagonal rule.
const SUBSHELL_ORDER: [number, number][] = [
  [1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [3, 2], [4, 1], [5, 0], [4, 2],
  [5, 1], [6, 0], [4, 3], [5, 2], [6, 1], [7, 0], [5, 3], [6, 2], [7, 1],
];
const SUBSHELL_LETTER = ['s', 'p', 'd', 'f'];
const SUBSHELL_CAPACITY = [2, 6, 10, 14];

// Ground-state configurations that deviate from straight Aufbau filling —
// generally a half-filled or fully-filled d/f subshell is more stable than
// the "predicted" one. This is the standard exception list covered in
// general chemistry; beyond element ~100 confirmed data thins out fast.
const EXCEPTIONS: Record<number, [number, number, number][]> = {
  // [n, l, electronCount] entries that override the Aufbau prediction for
  // just the affected subshells (everything else fills normally).
  24: [[3, 2, 5], [4, 0, 1]], // Cr: 3d5 4s1
  29: [[3, 2, 10], [4, 0, 1]], // Cu: 3d10 4s1
  41: [[4, 2, 4], [5, 0, 1]], // Nb: 4d4 5s1
  42: [[4, 2, 5], [5, 0, 1]], // Mo: 4d5 5s1
  44: [[4, 2, 7], [5, 0, 1]], // Ru: 4d7 5s1
  45: [[4, 2, 8], [5, 0, 1]], // Rh: 4d8 5s1
  46: [[4, 2, 10], [5, 0, 0]], // Pd: 4d10 5s0 — the famous full exception
  47: [[4, 2, 10], [5, 0, 1]], // Ag: 4d10 5s1
  57: [[4, 3, 0], [5, 2, 1], [6, 0, 2]], // La: 5d1 6s2 (no 4f yet)
  58: [[4, 3, 1], [5, 2, 1], [6, 0, 2]], // Ce: 4f1 5d1 6s2
  64: [[4, 3, 7], [5, 2, 1], [6, 0, 2]], // Gd: 4f7 5d1 6s2
  78: [[4, 3, 14], [5, 2, 9], [6, 0, 1]], // Pt: 4f14 5d9 6s1
  79: [[4, 3, 14], [5, 2, 10], [6, 0, 1]], // Au: 4f14 5d10 6s1
  89: [[5, 3, 0], [6, 2, 1], [7, 0, 2]], // Ac: 6d1 7s2
  90: [[5, 3, 0], [6, 2, 2], [7, 0, 2]], // Th: 6d2 7s2
  91: [[5, 3, 2], [6, 2, 1], [7, 0, 2]], // Pa: 5f2 6d1 7s2
  92: [[5, 3, 3], [6, 2, 1], [7, 0, 2]], // U: 5f3 6d1 7s2
  93: [[5, 3, 4], [6, 2, 1], [7, 0, 2]], // Np: 5f4 6d1 7s2
  96: [[5, 3, 7], [6, 2, 1], [7, 0, 2]], // Cm: 5f7 6d1 7s2
};

export interface Subshell {
  n: number;
  l: number;
  electrons: number;
}

export interface ElectronConfiguration {
  subshells: Subshell[];
  /** Electron count grouped by principal quantum number (shell) — what a
   * simplified Bohr diagram draws as concentric rings. */
  shells: number[];
  /** Electrons in the outermost principal shell. */
  valence: number;
  /** True when an inner shell holds more than 8 electrons because a d or f
   * subshell filled into it — transition/inner-transition metals draw on
   * those inner electrons for bonding too, so the simplified "outermost
   * ring only" bond story undersells them. */
  bondShellDepth?: number;
  /** Subshell notation, e.g. "1s² 2s² 2p⁴". */
  configString: string;
}

const SUPERSCRIPT: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
function toSuperscript(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => SUPERSCRIPT[d]);
}

export function buildElectronConfiguration(atomicNumber: number): ElectronConfiguration {
  let remaining = atomicNumber;
  const subshells: Subshell[] = [];
  const overrides = new Map<string, number>();
  (EXCEPTIONS[atomicNumber] || []).forEach(([n, l, count]) => overrides.set(`${n}-${l}`, count));

  if (overrides.size > 0) {
    // With an exception in play, fill every subshell up to Z at its
    // Aufbau-predicted count EXCEPT the ones the exception overrides —
    // those take their overridden count instead, and filling still stops
    // once `remaining` electrons are placed.
    for (const [n, l] of SUBSHELL_ORDER) {
      if (remaining <= 0) break;
      const key = `${n}-${l}`;
      const capacity = SUBSHELL_CAPACITY[l];
      const predicted = Math.min(capacity, remaining);
      const count = overrides.has(key) ? Math.min(overrides.get(key)!, capacity) : predicted;
      if (count > 0) subshells.push({ n, l, electrons: count });
      remaining -= overrides.has(key) ? overrides.get(key)! : predicted;
    }
  } else {
    for (const [n, l] of SUBSHELL_ORDER) {
      if (remaining <= 0) break;
      const count = Math.min(SUBSHELL_CAPACITY[l], remaining);
      subshells.push({ n, l, electrons: count });
      remaining -= count;
    }
  }

  const shellTotals = new Map<number, number>();
  subshells.forEach((s) => shellTotals.set(s.n, (shellTotals.get(s.n) || 0) + s.electrons));
  const maxN = Math.max(...shellTotals.keys());
  const shells: number[] = [];
  for (let n = 1; n <= maxN; n++) shells.push(shellTotals.get(n) || 0);
  // Drop any inner shell instance where filling has already moved past it
  // and left it at 0 (can't happen with this fill order, but keeps the
  // array free of gaps if a future exception ever does).
  const trimmedShells = shells.filter((count, i) => count > 0 || i === shells.length - 1);

  const bondShellDepth = trimmedShells.slice(0, -1).some((c) => c > 8) ? 2 : undefined;

  // Filled in energy order (4s before 3d), but textbooks always *display* a
  // configuration sorted by shell then subshell — re-sort for the string only.
  const configString = subshells
    .filter((s) => s.electrons > 0)
    .slice()
    .sort((a, b) => (a.n - b.n) || (a.l - b.l))
    .map((s) => `${s.n}${SUBSHELL_LETTER[s.l]}${toSuperscript(s.electrons)}`)
    .join(' ');

  return {
    subshells,
    shells: trimmedShells,
    valence: trimmedShells[trimmedShells.length - 1],
    bondShellDepth,
    configString,
  };
}
