import type { MoleculeDef, MoleculeInfo } from './types';

export const ELEMENT_NAMES: Record<string, string> = {
  H2: 'Hydrogen', O2: 'Oxygen', N2: 'Nitrogen', CH4: 'Methane',
  Na: 'Sodium', Cl2: 'Chlorine', Fe: 'Iron', Mg: 'Magnesium', C: 'Carbon',
};

export const MOLECULE_INFO: Record<string, MoleculeInfo> = {
  H2: { name: 'Hydrogen gas', category: 'Element', fact: 'The lightest and most abundant element in the universe.' },
  O2: { name: 'Oxygen gas', category: 'Element', fact: 'Makes up about 21% of Earth’s atmosphere and powers cellular respiration.' },
  N2: { name: 'Nitrogen gas', category: 'Element', fact: 'About 78% of the air you breathe, but too inert to use directly — plants need it fixed first.' },
  Cl2: { name: 'Chlorine gas', category: 'Element', fact: 'A toxic yellow-green gas, used in small amounts to disinfect drinking water.' },
  Na: { name: 'Sodium', category: 'Element', fact: 'A soft metal that reacts violently with water — never found free in nature.' },
  Fe: { name: 'Iron', category: 'Element', fact: 'The most common element on Earth by mass, concentrated in its molten core.' },
  Mg: { name: 'Magnesium', category: 'Element', fact: 'Burns with a blinding white light — once used in photographic flashbulbs.' },
  C: { name: 'Carbon', category: 'Element', fact: 'The backbone of every known living organism and of organic chemistry itself.' },
  H2O: { name: 'Water', category: 'Compound', fact: 'The only common substance found naturally in solid, liquid, and gas form on Earth.' },
  CH4: { name: 'Methane', category: 'Compound', fact: 'The simplest hydrocarbon and the main component of natural gas.' },
  CO2: { name: 'Carbon dioxide', category: 'Compound', fact: 'A greenhouse gas produced whenever carbon-based fuel burns or cells respire.' },
  NH3: { name: 'Ammonia', category: 'Compound', fact: 'A pungent gas that is the starting point for most nitrogen fertilizer on Earth.' },
  HCl: { name: 'Hydrogen chloride', category: 'Compound', fact: 'Dissolves in water to form hydrochloric acid — the acid in your stomach.' },
  NaCl: { name: 'Sodium chloride (table salt)', category: 'Compound', fact: 'An ionic crystal lattice, not discrete molecules like a covalent compound.' },
  MgO: { name: 'Magnesium oxide', category: 'Compound', fact: 'A white ionic solid used in antacids and in heat-resistant refractory brick.' },
  Fe2O3: { name: 'Iron(III) oxide (rust)', category: 'Compound', fact: 'The reddish-brown compound that forms as iron slowly oxidizes in air.' },
  Na2O: { name: 'Sodium oxide', category: 'Compound', fact: 'Forms almost instantly on the shiny surface of freshly cut sodium metal exposed to air.' },
  FeCl3: { name: 'Iron(III) chloride', category: 'Compound', fact: 'A yellow-brown solid — iron wool will burst into flame on contact with chlorine gas.' },
  MgCl2: { name: 'Magnesium chloride', category: 'Compound', fact: 'Extracted from seawater and used to de-ice roads and produce magnesium metal.' },
};

// Simplified molecular geometry: atoms with local positions, bonds as
// [atomIndexA, atomIndexB, 'covalent' | 'ionic', order?].
export const MOLECULES: Record<string, MoleculeDef> = {
  // Covalent bonds carry a 4th element too: bond order (shared electron
  // pairs) — O=O is a double bond and N#N a triple bond in reality, not the
  // single shared pair a plain 'covalent' entry would imply.
  H2: { atoms: [{ el: 'H', pos: [-0.37, 0, 0] }, { el: 'H', pos: [0.37, 0, 0] }], bonds: [[0, 1, 'covalent', 1]] },
  O2: { atoms: [{ el: 'O', pos: [-0.6, 0, 0] }, { el: 'O', pos: [0.6, 0, 0] }], bonds: [[0, 1, 'covalent', 2]] },
  N2: { atoms: [{ el: 'N', pos: [-0.55, 0, 0] }, { el: 'N', pos: [0.55, 0, 0] }], bonds: [[0, 1, 'covalent', 3]] },
  Cl2: { atoms: [{ el: 'Cl', pos: [-0.99, 0, 0] }, { el: 'Cl', pos: [0.99, 0, 0] }], bonds: [[0, 1, 'covalent']] },
  HCl: { atoms: [{ el: 'H', pos: [-0.64, 0, 0] }, { el: 'Cl', pos: [0.64, 0, 0] }], bonds: [[0, 1, 'covalent']] },
  H2O: {
    atoms: [{ el: 'O', pos: [0, 0, 0] }, { el: 'H', pos: [0.76, 0.59, 0] }, { el: 'H', pos: [-0.76, 0.59, 0] }],
    bonds: [[0, 1, 'covalent'], [0, 2, 'covalent']],
  },
  CO2: {
    atoms: [{ el: 'C', pos: [0, 0, 0] }, { el: 'O', pos: [1.16, 0, 0] }, { el: 'O', pos: [-1.16, 0, 0] }],
    bonds: [[0, 1, 'covalent', 2], [0, 2, 'covalent', 2]],
  },
  CH4: {
    atoms: [
      { el: 'C', pos: [0, 0, 0] }, { el: 'H', pos: [0.63, 0.63, 0.63] }, { el: 'H', pos: [0.63, -0.63, -0.63] },
      { el: 'H', pos: [-0.63, 0.63, -0.63] }, { el: 'H', pos: [-0.63, -0.63, 0.63] },
    ],
    bonds: [[0, 1, 'covalent'], [0, 2, 'covalent'], [0, 3, 'covalent'], [0, 4, 'covalent']],
  },
  NH3: {
    atoms: [
      { el: 'N', pos: [0, 0.35, 0] }, { el: 'H', pos: [0.82, -0.15, 0] },
      { el: 'H', pos: [-0.41, -0.15, 0.71] }, { el: 'H', pos: [-0.41, -0.15, -0.71] },
    ],
    bonds: [[0, 1, 'covalent'], [0, 2, 'covalent'], [0, 3, 'covalent']],
  },
  Na: { atoms: [{ el: 'Na', pos: [0, 0, 0] }], bonds: [] },
  Fe: { atoms: [{ el: 'Fe', pos: [0, 0, 0] }], bonds: [] },
  Mg: { atoms: [{ el: 'Mg', pos: [0, 0, 0] }], bonds: [] },
  C: { atoms: [{ el: 'C', pos: [0, 0, 0] }], bonds: [] },
  NaCl: { atoms: [{ el: 'Na', pos: [-0.9, 0, 0] }, { el: 'Cl', pos: [0.9, 0, 0] }], bonds: [[0, 1, 'ionic']] },
  // Ionic bonds carry a 4th element: how many electrons actually cross for
  // THAT bond (default 1 if omitted). This isn't always 1 — Mg has 2 valence
  // electrons and gives both to the single oxygen it's paired with, and in
  // Fe2O3 each Fe loses 3 total (Fe3+) split across its two O neighbors
  // rather than 1 apiece, while each terminal O still gains its full 2.
  MgO: { atoms: [{ el: 'Mg', pos: [-0.85, 0, 0] }, { el: 'O', pos: [0.85, 0, 0] }], bonds: [[0, 1, 'ionic', 2]] },
  Fe2O3: {
    atoms: [
      { el: 'Fe', pos: [-0.9, 0.5, 0] }, { el: 'Fe', pos: [0.9, 0.5, 0] }, { el: 'O', pos: [0, 1.25, 0] },
      { el: 'O', pos: [-0.9, -0.55, 0] }, { el: 'O', pos: [0.9, -0.55, 0] },
    ],
    bonds: [[0, 2, 'ionic', 1], [1, 2, 'ionic', 1], [0, 3, 'ionic', 2], [1, 4, 'ionic', 2]],
  },
  Na2O: {
    atoms: [{ el: 'Na', pos: [-1.1, 0.55, 0] }, { el: 'Na', pos: [1.1, 0.55, 0] }, { el: 'O', pos: [0, -0.5, 0] }],
    bonds: [[0, 2, 'ionic'], [1, 2, 'ionic']],
  },
  FeCl3: {
    atoms: [
      { el: 'Fe', pos: [0, 0, 0] }, { el: 'Cl', pos: [0, 1.5, 0] }, { el: 'Cl', pos: [1.3, -0.75, 0] }, { el: 'Cl', pos: [-1.3, -0.75, 0] },
    ],
    bonds: [[0, 1, 'ionic'], [0, 2, 'ionic'], [0, 3, 'ionic']],
  },
  MgCl2: {
    atoms: [{ el: 'Cl', pos: [-1.35, 0, 0] }, { el: 'Mg', pos: [0, 0, 0] }, { el: 'Cl', pos: [1.35, 0, 0] }],
    bonds: [[1, 0, 'ionic'], [1, 2, 'ionic']],
  },
};
