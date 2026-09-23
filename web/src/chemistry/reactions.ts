import type { Reaction } from './types';

export const REACTIONS: Reaction[] = [
  { a: 'H2', b: 'O2', products: ['H2O'], type: 'Synthesis', name: 'Formation of water', note: 'Two gases combine into the liquid that covers most of the planet.' },
  { a: 'N2', b: 'H2', products: ['NH3'], type: 'Synthesis', name: 'Haber process', note: 'Industrial ammonia synthesis for fertilizer — run under high pressure and heat with an iron catalyst.' },
  { a: 'CH4', b: 'O2', products: ['CO2', 'H2O'], type: 'Combustion', name: 'Methane combustion', note: 'Complete combustion of natural gas releases the energy stored in its C–H bonds.' },
  { a: 'Na', b: 'Cl2', products: ['NaCl'], type: 'Synthesis', name: 'Formation of table salt', note: 'A metal that reacts violently with water and a toxic gas combine into something you sprinkle on food.' },
  { a: 'Fe', b: 'O2', products: ['Fe2O3'], type: 'Oxidation', name: 'Rusting of iron', note: 'Slow oxidation at room temperature — the reaction behind rust.' },
  { a: 'Mg', b: 'O2', products: ['MgO'], type: 'Combustion', name: 'Magnesium combustion', note: 'Burns with a blinding white light — once used in photography flashbulbs.' },
  { a: 'C', b: 'O2', products: ['CO2'], type: 'Combustion', name: 'Carbon combustion', note: 'Already 1:1:1 — the simplest balanced equation in this chamber.' },
  { a: 'H2', b: 'Cl2', products: ['HCl'], type: 'Synthesis', name: 'Hydrogen chloride synthesis', note: 'A chain reaction that can be triggered explosively by ultraviolet light.' },
  { a: 'Na', b: 'O2', products: ['Na2O'], type: 'Synthesis', name: 'Formation of sodium oxide', note: 'Freshly cut sodium tarnishes almost instantly as it reacts with oxygen in the air.' },
  { a: 'Fe', b: 'Cl2', products: ['FeCl3'], type: 'Synthesis', name: 'Formation of iron(III) chloride', note: 'Iron wool glows orange and bursts into flame in an atmosphere of chlorine gas.' },
  { a: 'Mg', b: 'Cl2', products: ['MgCl2'], type: 'Synthesis', name: 'Formation of magnesium chloride', note: 'An ionic salt extracted industrially from seawater and used to de-ice roads.' },
];

export const REACTANT_OPTIONS = ['H2', 'O2', 'N2', 'CH4', 'Na', 'Cl2', 'Fe', 'Mg', 'C'];

export function findReaction(a: string, b: string): Reaction | null {
  return REACTIONS.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a)) ?? null;
}
