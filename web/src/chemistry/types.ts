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

export type ReactionType = 'Synthesis' | 'Combustion' | 'Oxidation';

export interface Reaction {
  a: string;
  b: string;
  products: string[];
  type: ReactionType;
  name: string;
  note: string;
}

export type ReactantSlot = 'a' | 'b';

/** One atom picked into the chamber's element picker, awaiting confirm into
 * a reactant slot — see useChamberController (App.tsx). */
export interface TrayCard {
  id: number;
  symbol: string;
}
