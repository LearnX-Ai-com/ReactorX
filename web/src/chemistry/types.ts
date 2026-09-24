import type { ElementSymbol } from './periodicTableData';

export type { ElementSymbol, ElementData, ElementCategory, ElementBlock } from './periodicTableData';

export type BondType = 'covalent' | 'ionic';

/** [atomIndexA, atomIndexB, bondType, order?] — order is shared electron
 * pairs for covalent bonds (defaults to 1), or electrons transferred for
 * ionic bonds (defaults to 1). */
export type Bond = [number, number, BondType, number?];

export interface MoleculeAtom {
  el: ElementSymbol;
  pos: [number, number, number];
}

export interface MoleculeDef {
  atoms: MoleculeAtom[];
  bonds: Bond[];
}

export interface MoleculeInfo {
  name: string;
  category: 'Element' | 'Compound';
  fact: string;
}

// Synthesis/Combustion/Oxidation are the hand-authored set (reactions.ts);
// the rest cover what the AI-backed lookup (reactionApi.ts) can propose for
// a pair outside that list — kept in sync with functions/src/proposeReaction.ts's
// REACTION_TYPES (a separate deployable unit, can't share the import).
export type ReactionType =
  | 'Synthesis' | 'Decomposition' | 'Combustion' | 'Oxidation'
  | 'SingleDisplacement' | 'DoubleDisplacement' | 'AcidBase';

export type EnergyChange = 'Exothermic' | 'Endothermic';

export interface Reaction {
  a: string;
  b: string;
  products: string[];
  type: ReactionType;
  name: string;
  note: string;
  // Everything below is optional and only shown on the right wall's Info
  // tab when present — undefined means "not established for this reaction"
  // rather than a blank/invented value. Hand-authored reactions carry these
  // directly (reactions.ts); AI-discovered ones get them from the same
  // propose_reaction call that finds the reaction itself (reactionApi.ts),
  // never fabricated client-side.
  energyChange?: EnergyChange;
  /** Plain-language conditions, e.g. "Room temperature" or "Requires heat
   * to start, then self-sustains" — never a fabricated precise temperature/
   * pressure the app can't actually back up. */
  conditions?: string;
  /** Catalyst name if one applies — omitted (not empty string) when none. */
  catalyst?: string;
  reversible?: boolean;
  /** 1-3 sentence writeup: what the reactants/products are doing, and any
   * visible cue (color change, gas, precipitate, flame color) a student
   * would actually observe. Shown under "What's happening?" on the Info tab. */
  whatsHappening?: string;
  /** Ordered lab procedure steps for the Steps tab — starts with whether
   * it's student-safe (with supervision) or teacher-demonstration-only,
   * since several of these (chlorine gas, reactive metals, UV-triggered
   * reactions) genuinely aren't something a student should run themselves. */
  labSteps?: string[];
  /** One-line safety callout shown above the steps, e.g. "Eye protection
   * required — do not look directly at the flame." Omitted when the
   * reaction has no notable hazard beyond standard lab practice. */
  safetyNote?: string;
}

export type ReactantSlot = 'a' | 'b';

/** One atom picked into the chamber's element picker, awaiting confirm into
 * a reactant slot — see useChamberController (App.tsx). */
export interface TrayCard {
  id: number;
  symbol: string;
}
