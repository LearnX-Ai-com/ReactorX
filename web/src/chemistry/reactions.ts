import type { Reaction } from './types';

export const REACTIONS: Reaction[] = [
  {
    a: 'H2', b: 'O2', products: ['H2O'], type: 'Synthesis', name: 'Formation of water',
    note: 'Two gases combine into the liquid that covers most of the planet.',
    energyChange: 'Exothermic', conditions: 'Needs an ignition source (a spark) to start, then self-sustains', reversible: false,
    whatsHappening: 'Hydrogen and oxygen molecules break apart and their atoms bond directly into water. The reaction releases a large burst of energy as heat and light — the same reaction that powers rocket engines.',
    safetyNote: 'Teacher demonstration only — hydrogen gas is flammable. Standard classroom version uses a small test-tube sample, not open mixing of both gases.',
    labSteps: [
      'Collect a small test tube of hydrogen gas by downward displacement of water (this is the "squeaky pop" test for hydrogen).',
      'Put on safety goggles; keep the flame source and gas sample well away from any other open containers of gas.',
      'Bring a lit splint to the mouth of the inverted test tube.',
      'Listen for the characteristic squeaky pop as the hydrogen ignites and burns with the oxygen in the air.',
      'Observe condensation forming on the inside of the tube afterward — that’s the water this reaction produces.',
    ],
  },
  {
    a: 'N2', b: 'H2', products: ['NH3'], type: 'Synthesis', name: 'Haber process',
    note: 'Industrial ammonia synthesis for fertilizer — run under high pressure and heat with an iron catalyst.',
    energyChange: 'Exothermic', conditions: 'High pressure and high heat', catalyst: 'Iron', reversible: true,
    whatsHappening: "Nitrogen's strong triple bond and hydrogen's bonds break at the iron catalyst's surface, and the atoms recombine into ammonia. This one is genuinely reversible — some ammonia keeps decomposing back into nitrogen and hydrogen, so industrial plants continuously remove it to keep yield high.",
    safetyNote: 'Not performed hands-on in a school lab — the real process needs industrial pressure and heat no classroom can reach safely.',
    labSteps: [
      'This reaction isn’t run as a hands-on experiment in a classroom — it needs far more pressure and heat than any school lab setup provides safely.',
      'Instead, it’s typically taught with a video of an industrial ammonia plant or a tabletop equilibrium simulation.',
      'A common substitute demo: test for ammonia gas from a bottle of concentrated ammonia solution using damp red litmus paper (it turns blue), to see what the product itself smells and behaves like.',
      'Discuss why the process is run as continuous removal of ammonia — tying back to the "reversible" note in the Info tab.',
    ],
  },
  {
    a: 'CH4', b: 'O2', products: ['CO2', 'H2O'], type: 'Combustion', name: 'Methane combustion',
    note: 'Complete combustion of natural gas releases the energy stored in its C–H bonds.',
    energyChange: 'Exothermic', conditions: 'Needs an ignition source (a spark or flame)', reversible: false,
    whatsHappening: "Methane's C–H bonds and oxygen's O=O bonds break, and the atoms recombine into carbon dioxide and water. Complete combustion releases a large amount of heat and light — the reaction that heats homes and stoves running on natural gas.",
    safetyNote: 'Requires an adult-supervised open flame — tie back hair, keep flammables clear, and have a way to extinguish the flame nearby.',
    labSteps: [
      'Light a Bunsen burner and adjust the air hole for a clean blue flame.',
      'Hold a dry, cold glass beaker above (not in) the flame for a few seconds.',
      'Observe droplets of condensation forming on the beaker — that’s the water product.',
      'Pour a small amount of limewater into a second beaker and hold it (upside down, carefully) above the flame briefly to trap some of the combustion gas.',
      'Swirl the limewater — it turning cloudy confirms carbon dioxide, the other product.',
    ],
  },
  {
    a: 'Na', b: 'Cl2', products: ['NaCl'], type: 'Synthesis', name: 'Formation of table salt',
    note: 'A metal that reacts violently with water and a toxic gas combine into something you sprinkle on food.',
    energyChange: 'Exothermic', conditions: 'Reacts immediately at room temperature', reversible: false,
    whatsHappening: 'Sodium metal readily gives up an electron to chlorine gas, forming Na⁺ and Cl⁻ ions that lock into an ionic crystal lattice. The reaction is highly exothermic and often produces a bright flash.',
    safetyNote: 'Teacher demonstration only, behind a safety screen — chlorine gas is toxic and the reaction is vigorous. Many schools show this as a recorded video instead.',
    labSteps: [
      'Performed only by the teacher, in a fume hood or behind a safety screen, with chlorine gas generated and handled under controlled conditions.',
      'A small piece of sodium (freshly cut, stored under oil beforehand) is lowered into a gas jar of chlorine.',
      'The sodium ignites almost immediately, burning with a bright orange-yellow flame.',
      'White sodium chloride crystals form on the inside of the jar once the reaction finishes.',
      'Students observe from a safe distance rather than performing this step themselves.',
    ],
  },
  {
    a: 'Fe', b: 'O2', products: ['Fe2O3'], type: 'Oxidation', name: 'Rusting of iron',
    note: 'Slow oxidation at room temperature — the reaction behind rust.',
    energyChange: 'Exothermic', conditions: 'Room temperature, with moisture present', reversible: false,
    whatsHappening: "Iron slowly gives up electrons to oxygen, forming iron(III) oxide — rust. Unlike most oxidation reactions, this one releases its energy so slowly you can't feel the heat, and it visibly changes the metal's color from silvery-gray to reddish-brown.",
    safetyNote: 'Safe for students to set up and observe — no open flame or hazardous chemicals involved.',
    labSteps: [
      'Set up three test tubes: one with an iron nail in dry air, one with a nail fully submerged in boiled (deoxygenated) water topped with oil, and one with a nail in ordinary tap water exposed to air.',
      'Label each tube and leave them undisturbed somewhere they won’t be knocked over.',
      'Check the tubes every day for about a week, noting any color change on the nail.',
      'Compare the three: rust should only develop clearly on the nail that had access to both water and air.',
      'Record which conditions actually produced rust, connecting the result back to the Conditions field on the Info tab.',
    ],
  },
  {
    a: 'Mg', b: 'O2', products: ['MgO'], type: 'Combustion', name: 'Magnesium combustion',
    note: 'Burns with a blinding white light — once used in photography flashbulbs.',
    energyChange: 'Exothermic', conditions: 'Needs an ignition source (burns readily once lit)', reversible: false,
    whatsHappening: 'Magnesium burns in oxygen with an intensely bright white flame, forming magnesium oxide powder. The light is so bright it was once used in camera flashbulbs and fireworks.',
    safetyNote: 'Never look directly at the burning magnesium — the light is bright enough to damage eyes. Use tongs and safety glasses; typically teacher-led.',
    labSteps: [
      'Hold a short strip of magnesium ribbon with tongs, well away from your face and any flammable material.',
      'Put on safety glasses and avert your eyes from the flame once it starts (or view it only through the dark side of the safety glasses / a #14 welding lens if available).',
      'Ignite the tip of the ribbon in a Bunsen burner flame.',
      'Hold the burning ribbon over a heatproof mat and let it burn out completely.',
      'Once cooled, examine the white magnesium oxide powder left behind.',
    ],
  },
  {
    a: 'C', b: 'O2', products: ['CO2'], type: 'Combustion', name: 'Carbon combustion',
    note: 'Already 1:1:1 — the simplest balanced equation in this chamber.',
    energyChange: 'Exothermic', conditions: 'Needs an ignition source', reversible: false,
    whatsHappening: 'Carbon burns in oxygen to form carbon dioxide — already balanced 1:1:1, the simplest equation in the chamber. The same basic reaction behind burning coal or charcoal.',
    safetyNote: 'Requires adult-supervised open flame and good ventilation.',
    labSteps: [
      'Light a small piece of charcoal (carbon) with a Bunsen burner or match, using tongs to hold it.',
      'Let it glow and burn over a heatproof mat, away from anything flammable.',
      'Hold a beaker of limewater (upside down, carefully) briefly above the glowing charcoal to trap some of the gas it produces.',
      'Swirl the limewater — turning cloudy confirms carbon dioxide gas was produced.',
    ],
  },
  {
    a: 'H2', b: 'Cl2', products: ['HCl'], type: 'Synthesis', name: 'Hydrogen chloride synthesis',
    note: 'A chain reaction that can be triggered explosively by ultraviolet light.',
    energyChange: 'Exothermic', conditions: 'Can be triggered explosively by ultraviolet light (a chain reaction)', reversible: false,
    whatsHappening: 'UV light splits a chlorine molecule into two reactive radicals, which rapidly propagate a chain reaction with hydrogen, forming HCl gas. It can go from stable to explosively fast the moment light hits it.',
    safetyNote: 'Not performed as a hands-on student experiment — direct H₂/Cl₂ mixing under light can react explosively. Shown as a video or a very small, shielded teacher demo only.',
    labSteps: [
      'Because this mixture can react explosively the instant it’s exposed to bright or UV light, it isn’t mixed directly in a typical classroom.',
      'Most classrooms instead show a recorded video of the reaction, or a small-scale version performed by the teacher behind a blast shield in a fume hood.',
      'A safer companion demo: test a sample of hydrochloric acid (the dissolved form of this gas) with blue litmus paper — it turns red, showing the product is an acid.',
    ],
  },
  {
    a: 'Na', b: 'O2', products: ['Na2O'], type: 'Synthesis', name: 'Formation of sodium oxide',
    note: 'Freshly cut sodium tarnishes almost instantly as it reacts with oxygen in the air.',
    energyChange: 'Exothermic', conditions: 'Reacts almost instantly with air at room temperature', reversible: false,
    whatsHappening: 'Freshly cut sodium metal is so reactive that its shiny surface tarnishes within seconds as it reacts with atmospheric oxygen, forming a dull sodium oxide coating.',
    safetyNote: 'Teacher handles the sodium directly — it’s stored under oil and reacts violently with skin moisture and water.',
    labSteps: [
      'Teacher removes a small piece of sodium from its oil storage using forceps (never bare hands) and blots off the excess oil.',
      'A fresh surface is cut with a scalpel on a tile, revealing a shiny, silvery metal.',
      'Students observe the cut surface dulling within seconds as it reacts with oxygen in the air.',
      'The sodium is returned to oil storage or safely destroyed by the teacher immediately after — never left exposed.',
    ],
  },
  {
    a: 'Fe', b: 'Cl2', products: ['FeCl3'], type: 'Synthesis', name: 'Formation of iron(III) chloride',
    note: 'Iron wool glows orange and bursts into flame in an atmosphere of chlorine gas.',
    energyChange: 'Exothermic', conditions: 'Needs heat to ignite', reversible: false,
    whatsHappening: 'Heated iron wool reacts vigorously with chlorine gas, glowing orange and bursting into flame as it forms iron(III) chloride, a yellow-brown solid.',
    safetyNote: 'Teacher demonstration only, in a fume hood — chlorine gas is toxic.',
    labSteps: [
      'Performed by the teacher in a fume hood, with chlorine gas generated and contained under controlled conditions.',
      'A small tuft of iron wool is heated until it just starts to glow, then lowered into the gas jar of chlorine.',
      'The iron continues to glow orange and burns further as it reacts with the chlorine.',
      'A yellow-brown solid (iron(III) chloride) collects in the jar once the reaction is complete.',
    ],
  },
  {
    a: 'Mg', b: 'Cl2', products: ['MgCl2'], type: 'Synthesis', name: 'Formation of magnesium chloride',
    note: 'An ionic salt extracted industrially from seawater and used to de-ice roads.',
    energyChange: 'Exothermic', conditions: 'Reacts readily at elevated temperature', reversible: false,
    whatsHappening: 'Magnesium metal reacts with chlorine gas, each magnesium atom giving up two electrons to two chlorine atoms, forming the ionic solid magnesium chloride — commercially extracted from seawater and used to de-ice roads.',
    safetyNote: 'Teacher demonstration only, in a fume hood — chlorine gas is toxic.',
    labSteps: [
      'Performed by the teacher in a fume hood, with chlorine gas generated and contained under controlled conditions.',
      'A strip of magnesium ribbon is heated until it starts to burn, then lowered into the gas jar of chlorine.',
      'The magnesium continues burning brightly as it reacts with the chlorine gas.',
      'White magnesium chloride solid remains once the reaction is complete.',
      'As an alternative, easier classroom demo: react magnesium ribbon with dilute hydrochloric acid instead, and observe the bubbling hydrogen gas produced.',
    ],
  },
];

export const REACTANT_OPTIONS = ['H2', 'O2', 'N2', 'CH4', 'Na', 'Cl2', 'Fe', 'Mg', 'C'];

// Reactions the AI-backed lookup (reactionApi.ts) has already resolved this
// session, so a repeat pick — including every Reset/React replay, which
// calls resetChamber(a, b) again — is a synchronous cache hit rather than
// another network round trip. The server has its own persistent cache
// (functions/src/index.ts's Tier-1 DB lookup) for across-session reuse;
// this is just the in-session fast path.
const discoveredCache = new Map<string, Reaction>();
function pairKey(a: string, b: string): string {
  return [a, b].sort().join('::');
}
export function cacheDiscoveredReaction(entry: Reaction): void {
  discoveredCache.set(pairKey(entry.a, entry.b), entry);
}

export function findReaction(a: string, b: string): Reaction | null {
  const known = REACTIONS.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  if (known) return known;
  return discoveredCache.get(pairKey(a, b)) ?? null;
}

/** "SingleDisplacement" -> "Single Displacement" — the hand-authored types
 * are single words already (unaffected); only the AI-backed lookup's wider
 * type set needs this. */
export function formatReactionType(type: Reaction['type']): string {
  return type.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** The standard textbook double-harpoon (⇌) for a reversible reaction,
 * a plain arrow otherwise — every equation display (chamber signage, HUD
 * equations, Ion's chat) should agree on which one a reaction gets. */
export function reactionArrow(reaction: Pick<Reaction, 'reversible'>): string {
  return reaction.reversible ? '⇌' : '→';
}
