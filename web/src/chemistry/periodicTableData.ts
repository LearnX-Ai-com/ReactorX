import { buildElectronConfiguration } from './electronConfig';

export type ElementCategory =
  | 'alkali-metal' | 'alkaline-earth-metal' | 'transition-metal' | 'post-transition-metal'
  | 'metalloid' | 'nonmetal' | 'halogen' | 'noble-gas' | 'lanthanide' | 'actinide';

export type ElementBlock = 's' | 'p' | 'd' | 'f';

export interface ElementData {
  number: number;
  symbol: string;
  name: string;
  category: ElementCategory;
  period: number;
  group: number | null;
  block: ElementBlock;
  /** Standard atomic weight; null for synthetic/superheavy elements with no
   * settled value (their periodic table entries usually show a bracketed
   * mass number instead — not meaningfully different pedagogically). */
  mass: number | null;
  /** Neutron count of the most abundant (or most stable) isotope, derived
   * from `mass`; null wherever `mass` is null. */
  neutrons: number | null;
  /** Simplified Bohr-model electron distribution (K, L, M, N...), computed
   * from the real ground-state configuration — see electronConfig.ts. */
  shells: number[];
  /** Electrons in the outermost occupied principal shell. */
  valence: number;
  /** Ground-state electron configuration in subshell notation. */
  config: string;
  /** See ElectronConfiguration.bondShellDepth. */
  bondShellDepth?: number;
  /** Common oxidation states, most significant first. */
  oxidation: number[];
  /** Pauling-scale electronegativity. Not established for noble gases or
   * most elements past roughly Z=100 — real reference tables leave these
   * blank too, so this is left undefined rather than guessed. */
  en?: number;
  /** Render color/radius — aesthetic, not a physical property. The 8
   * elements the original chamber hand-picked colors for keep those exact
   * values; every other element gets a category-consistent color instead
   * of 110 individually invented ones. */
  color: number;
  r: number;
  /** One hand-authored, verified fact — only populated for a starter set
   * of commonly-taught elements (see FACTS below). Left undefined rather
   * than filled in with an unverified or AI-generated claim for the rest. */
  fact?: string;
}

// [atomic_number, symbol, name, category, period, group, block, atomic_mass, oxidation_states]
// Identical source facts to db/seed-elements.mjs — kept in sync deliberately
// so the frontend's "test data" and the DB seed never quietly diverge.
const BASE_FACTS: [number, string, string, ElementCategory, number, number | null, ElementBlock, number | null, number[]][] = [
  [1, 'H', 'Hydrogen', 'nonmetal', 1, 1, 's', 1.008, [1, -1]],
  [2, 'He', 'Helium', 'noble-gas', 1, 18, 's', 4.0026, [0]],
  [3, 'Li', 'Lithium', 'alkali-metal', 2, 1, 's', 6.94, [1]],
  [4, 'Be', 'Beryllium', 'alkaline-earth-metal', 2, 2, 's', 9.0122, [2]],
  [5, 'B', 'Boron', 'metalloid', 2, 13, 'p', 10.81, [3]],
  [6, 'C', 'Carbon', 'nonmetal', 2, 14, 'p', 12.011, [4, 2, -4]],
  [7, 'N', 'Nitrogen', 'nonmetal', 2, 15, 'p', 14.007, [-3, 3, 5, 2, 4]],
  [8, 'O', 'Oxygen', 'nonmetal', 2, 16, 'p', 15.999, [-2, -1]],
  [9, 'F', 'Fluorine', 'halogen', 2, 17, 'p', 18.998, [-1]],
  [10, 'Ne', 'Neon', 'noble-gas', 2, 18, 'p', 20.180, [0]],
  [11, 'Na', 'Sodium', 'alkali-metal', 3, 1, 's', 22.990, [1]],
  [12, 'Mg', 'Magnesium', 'alkaline-earth-metal', 3, 2, 's', 24.305, [2]],
  [13, 'Al', 'Aluminium', 'post-transition-metal', 3, 13, 'p', 26.982, [3]],
  [14, 'Si', 'Silicon', 'metalloid', 3, 14, 'p', 28.085, [4, -4]],
  [15, 'P', 'Phosphorus', 'nonmetal', 3, 15, 'p', 30.974, [-3, 3, 5]],
  [16, 'S', 'Sulfur', 'nonmetal', 3, 16, 'p', 32.06, [-2, 4, 6]],
  [17, 'Cl', 'Chlorine', 'halogen', 3, 17, 'p', 35.45, [-1, 1, 3, 5, 7]],
  [18, 'Ar', 'Argon', 'noble-gas', 3, 18, 'p', 39.948, [0]],
  [19, 'K', 'Potassium', 'alkali-metal', 4, 1, 's', 39.098, [1]],
  [20, 'Ca', 'Calcium', 'alkaline-earth-metal', 4, 2, 's', 40.078, [2]],
  [21, 'Sc', 'Scandium', 'transition-metal', 4, 3, 'd', 44.956, [3]],
  [22, 'Ti', 'Titanium', 'transition-metal', 4, 4, 'd', 47.867, [4, 3, 2]],
  [23, 'V', 'Vanadium', 'transition-metal', 4, 5, 'd', 50.942, [5, 4, 3, 2]],
  [24, 'Cr', 'Chromium', 'transition-metal', 4, 6, 'd', 51.996, [3, 6, 2]],
  [25, 'Mn', 'Manganese', 'transition-metal', 4, 7, 'd', 54.938, [2, 4, 7, 3]],
  [26, 'Fe', 'Iron', 'transition-metal', 4, 8, 'd', 55.845, [2, 3]],
  [27, 'Co', 'Cobalt', 'transition-metal', 4, 9, 'd', 58.933, [2, 3]],
  [28, 'Ni', 'Nickel', 'transition-metal', 4, 10, 'd', 58.693, [2, 3]],
  [29, 'Cu', 'Copper', 'transition-metal', 4, 11, 'd', 63.546, [1, 2]],
  [30, 'Zn', 'Zinc', 'transition-metal', 4, 12, 'd', 65.38, [2]],
  [31, 'Ga', 'Gallium', 'post-transition-metal', 4, 13, 'p', 69.723, [3]],
  [32, 'Ge', 'Germanium', 'metalloid', 4, 14, 'p', 72.630, [4, 2]],
  [33, 'As', 'Arsenic', 'metalloid', 4, 15, 'p', 74.922, [-3, 3, 5]],
  [34, 'Se', 'Selenium', 'nonmetal', 4, 16, 'p', 78.971, [-2, 4, 6]],
  [35, 'Br', 'Bromine', 'halogen', 4, 17, 'p', 79.904, [-1, 1, 3, 5]],
  [36, 'Kr', 'Krypton', 'noble-gas', 4, 18, 'p', 83.798, [0]],
  [37, 'Rb', 'Rubidium', 'alkali-metal', 5, 1, 's', 85.468, [1]],
  [38, 'Sr', 'Strontium', 'alkaline-earth-metal', 5, 2, 's', 87.62, [2]],
  [39, 'Y', 'Yttrium', 'transition-metal', 5, 3, 'd', 88.906, [3]],
  [40, 'Zr', 'Zirconium', 'transition-metal', 5, 4, 'd', 91.224, [4]],
  [41, 'Nb', 'Niobium', 'transition-metal', 5, 5, 'd', 92.906, [5, 3]],
  [42, 'Mo', 'Molybdenum', 'transition-metal', 5, 6, 'd', 95.95, [6, 4]],
  [43, 'Tc', 'Technetium', 'transition-metal', 5, 7, 'd', 98, [7]],
  [44, 'Ru', 'Ruthenium', 'transition-metal', 5, 8, 'd', 101.07, [3, 4]],
  [45, 'Rh', 'Rhodium', 'transition-metal', 5, 9, 'd', 102.91, [3]],
  [46, 'Pd', 'Palladium', 'transition-metal', 5, 10, 'd', 106.42, [2, 4]],
  [47, 'Ag', 'Silver', 'transition-metal', 5, 11, 'd', 107.87, [1]],
  [48, 'Cd', 'Cadmium', 'transition-metal', 5, 12, 'd', 112.41, [2]],
  [49, 'In', 'Indium', 'post-transition-metal', 5, 13, 'p', 114.82, [3]],
  [50, 'Sn', 'Tin', 'post-transition-metal', 5, 14, 'p', 118.71, [4, 2]],
  [51, 'Sb', 'Antimony', 'metalloid', 5, 15, 'p', 121.76, [3, 5]],
  [52, 'Te', 'Tellurium', 'metalloid', 5, 16, 'p', 127.60, [-2, 4, 6]],
  [53, 'I', 'Iodine', 'halogen', 5, 17, 'p', 126.90, [-1, 1, 5, 7]],
  [54, 'Xe', 'Xenon', 'noble-gas', 5, 18, 'p', 131.29, [0, 2, 4, 6]],
  [55, 'Cs', 'Caesium', 'alkali-metal', 6, 1, 's', 132.91, [1]],
  [56, 'Ba', 'Barium', 'alkaline-earth-metal', 6, 2, 's', 137.33, [2]],
  [57, 'La', 'Lanthanum', 'lanthanide', 6, 3, 'd', 138.91, [3]],
  [58, 'Ce', 'Cerium', 'lanthanide', 6, null, 'f', 140.12, [3, 4]],
  [59, 'Pr', 'Praseodymium', 'lanthanide', 6, null, 'f', 140.91, [3]],
  [60, 'Nd', 'Neodymium', 'lanthanide', 6, null, 'f', 144.24, [3]],
  [61, 'Pm', 'Promethium', 'lanthanide', 6, null, 'f', 145, [3]],
  [62, 'Sm', 'Samarium', 'lanthanide', 6, null, 'f', 150.36, [3, 2]],
  [63, 'Eu', 'Europium', 'lanthanide', 6, null, 'f', 151.96, [3, 2]],
  [64, 'Gd', 'Gadolinium', 'lanthanide', 6, null, 'f', 157.25, [3]],
  [65, 'Tb', 'Terbium', 'lanthanide', 6, null, 'f', 158.93, [3]],
  [66, 'Dy', 'Dysprosium', 'lanthanide', 6, null, 'f', 162.50, [3]],
  [67, 'Ho', 'Holmium', 'lanthanide', 6, null, 'f', 164.93, [3]],
  [68, 'Er', 'Erbium', 'lanthanide', 6, null, 'f', 167.26, [3]],
  [69, 'Tm', 'Thulium', 'lanthanide', 6, null, 'f', 168.93, [3]],
  [70, 'Yb', 'Ytterbium', 'lanthanide', 6, null, 'f', 173.05, [3, 2]],
  [71, 'Lu', 'Lutetium', 'lanthanide', 6, null, 'f', 174.97, [3]],
  [72, 'Hf', 'Hafnium', 'transition-metal', 6, 4, 'd', 178.49, [4]],
  [73, 'Ta', 'Tantalum', 'transition-metal', 6, 5, 'd', 180.95, [5]],
  [74, 'W', 'Tungsten', 'transition-metal', 6, 6, 'd', 183.84, [6, 4]],
  [75, 'Re', 'Rhenium', 'transition-metal', 6, 7, 'd', 186.21, [7, 4]],
  [76, 'Os', 'Osmium', 'transition-metal', 6, 8, 'd', 190.23, [4, 3]],
  [77, 'Ir', 'Iridium', 'transition-metal', 6, 9, 'd', 192.22, [3, 4]],
  [78, 'Pt', 'Platinum', 'transition-metal', 6, 10, 'd', 195.08, [4, 2]],
  [79, 'Au', 'Gold', 'transition-metal', 6, 11, 'd', 196.97, [3, 1]],
  [80, 'Hg', 'Mercury', 'transition-metal', 6, 12, 'd', 200.59, [2, 1]],
  [81, 'Tl', 'Thallium', 'post-transition-metal', 6, 13, 'p', 204.38, [1, 3]],
  [82, 'Pb', 'Lead', 'post-transition-metal', 6, 14, 'p', 207.2, [2, 4]],
  [83, 'Bi', 'Bismuth', 'post-transition-metal', 6, 15, 'p', 208.98, [3, 5]],
  [84, 'Po', 'Polonium', 'post-transition-metal', 6, 16, 'p', 209, [2, 4]],
  [85, 'At', 'Astatine', 'halogen', 6, 17, 'p', 210, [-1, 1]],
  [86, 'Rn', 'Radon', 'noble-gas', 6, 18, 'p', 222, [0]],
  [87, 'Fr', 'Francium', 'alkali-metal', 7, 1, 's', 223, [1]],
  [88, 'Ra', 'Radium', 'alkaline-earth-metal', 7, 2, 's', 226, [2]],
  [89, 'Ac', 'Actinium', 'actinide', 7, 3, 'd', 227, [3]],
  [90, 'Th', 'Thorium', 'actinide', 7, null, 'f', 232.04, [4]],
  [91, 'Pa', 'Protactinium', 'actinide', 7, null, 'f', 231.04, [5]],
  [92, 'U', 'Uranium', 'actinide', 7, null, 'f', 238.03, [6, 4]],
  [93, 'Np', 'Neptunium', 'actinide', 7, null, 'f', 237, [5]],
  [94, 'Pu', 'Plutonium', 'actinide', 7, null, 'f', 244, [4]],
  [95, 'Am', 'Americium', 'actinide', 7, null, 'f', 243, [3]],
  [96, 'Cm', 'Curium', 'actinide', 7, null, 'f', 247, [3]],
  [97, 'Bk', 'Berkelium', 'actinide', 7, null, 'f', 247, [3]],
  [98, 'Cf', 'Californium', 'actinide', 7, null, 'f', 251, [3]],
  [99, 'Es', 'Einsteinium', 'actinide', 7, null, 'f', 252, [3]],
  [100, 'Fm', 'Fermium', 'actinide', 7, null, 'f', 257, [3]],
  [101, 'Md', 'Mendelevium', 'actinide', 7, null, 'f', 258, [3]],
  [102, 'No', 'Nobelium', 'actinide', 7, null, 'f', 259, [2]],
  [103, 'Lr', 'Lawrencium', 'actinide', 7, null, 'f', 266, [3]],
  [104, 'Rf', 'Rutherfordium', 'transition-metal', 7, 4, 'd', null, []],
  [105, 'Db', 'Dubnium', 'transition-metal', 7, 5, 'd', null, []],
  [106, 'Sg', 'Seaborgium', 'transition-metal', 7, 6, 'd', null, []],
  [107, 'Bh', 'Bohrium', 'transition-metal', 7, 7, 'd', null, []],
  [108, 'Hs', 'Hassium', 'transition-metal', 7, 8, 'd', null, []],
  [109, 'Mt', 'Meitnerium', 'transition-metal', 7, 9, 'd', null, []],
  [110, 'Ds', 'Darmstadtium', 'transition-metal', 7, 10, 'd', null, []],
  [111, 'Rg', 'Roentgenium', 'transition-metal', 7, 11, 'd', null, []],
  [112, 'Cn', 'Copernicium', 'transition-metal', 7, 12, 'd', null, []],
  [113, 'Nh', 'Nihonium', 'post-transition-metal', 7, 13, 'p', null, []],
  [114, 'Fl', 'Flerovium', 'post-transition-metal', 7, 14, 'p', null, []],
  [115, 'Mc', 'Moscovium', 'post-transition-metal', 7, 15, 'p', null, []],
  [116, 'Lv', 'Livermorium', 'post-transition-metal', 7, 16, 'p', null, []],
  [117, 'Ts', 'Tennessine', 'halogen', 7, 17, 'p', null, []],
  [118, 'Og', 'Oganesson', 'noble-gas', 7, 18, 'p', null, []],
];

// Pauling-scale electronegativity. Solid, textbook-standard values through
// roughly Z=54 (all of it double-checked); values from Z=55 up are collected
// from standard reference tables but not independently re-verified here —
// treat those as "probably right," not load-bearing for a correctness claim.
// Noble gases and most elements past the actinides have no established
// value in real chemistry either, so those are simply omitted.
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

// Exact overrides for the 8 elements the original chamber hand-picked
// render colors/radii for — zero visual regression for anything already
// built on those values.
const ORIGINAL_COLOR_RADIUS: Record<string, { color: number; r: number }> = {
  H: { color: 0xf1f5f9, r: 0.32 },
  O: { color: 0xf0574b, r: 0.55 },
  N: { color: 0x3b82f6, r: 0.55 },
  C: { color: 0x4b5567, r: 0.58 },
  Cl: { color: 0x8fe04e, r: 0.75 },
  Na: { color: 0xb072ff, r: 0.85 },
  Fe: { color: 0xc97a3d, r: 0.72 },
  Mg: { color: 0x7fe0a8, r: 0.75 },
};

// Starter set of hand-authored, verified facts — common, well-established
// claims (not obscure trivia), covering the original chamber's 8 elements
// plus other high-interest ones. Left absent for the rest rather than
// invented or AI-generated without review — see ElementData.fact.
const FACTS: Record<string, string> = {
  H: 'The most abundant element in the universe — stars are mostly hydrogen fusing into helium.',
  He: "So light and unreactive that party balloons float on it, and it was discovered in the Sun's spectrum 27 years before being found on Earth.",
  C: 'The only element that readily bonds with itself in long chains and rings, which is why every living thing on Earth is carbon-based.',
  N: "Makes up about 78% of the air you breathe, but is so unreactive most organisms can't use it directly — it has to be “fixed” by bacteria or industry first.",
  O: "Makes up about 21% of the atmosphere and is needed by nearly all life on Earth — it's also what makes fire possible; no oxygen, no flame.",
  Ne: '"Neon signs" get their name from this gas, which glows reddish-orange when electricity passes through it (most colored signs actually use other gases).',
  Na: 'So reactive it is never found free in nature and has to be stored under oil — drop a piece in water and it fizzes, sometimes catching fire.',
  Mg: 'Burns with a blindingly bright white light, which is why it was used in old photography flashbulbs and is still used in flares and fireworks.',
  Al: 'The most abundant metal in Earth’s crust, but once so hard to extract that it was more valuable than gold — Napoleon III reportedly reserved aluminium cutlery for his most honored guests.',
  Cl: 'A toxic greenish gas in its pure form, but tiny amounts are added to drinking water and pools to kill dangerous bacteria.',
  K: 'Reacts so violently with water that it does more than fizz like sodium does — it usually bursts into a lilac-colored flame.',
  Ca: 'Makes up most of your bones and teeth, though as a pure metal it is silvery and reacts with water — the calcium in your body is always combined with other elements.',
  Fe: 'The most common element on Earth by mass, mostly concentrated in the molten core — and the reason blood is red, since it binds oxygen in hemoglobin.',
  Cu: 'One of the only metals with a natural color other than silver or gray, and one of the first metals humans learned to work, going back over 10,000 years.',
  Zn: 'Essential in tiny amounts for the human body, and used to coat ("galvanize") steel to stop it from rusting.',
  Ag: 'The best natural electrical conductor of any element, and has natural antibacterial properties — part of why it was historically used in coins and cutlery.',
  Au: 'So unreactive that it is often found in nature as pure nuggets rather than combined with other elements — nearly all the gold ever mined is still in use today.',
  Pb: 'Was once used everywhere — pipes, paint, gasoline — until its serious health risks were understood; the word "plumbing" comes from plumbum, Latin for lead.',
  Hg: 'The only metal that is liquid at room temperature, which made it famous (if dangerously toxic) in old thermometers.',
  U: 'The heaviest naturally occurring element found in significant quantities, and its radioactive decay is what powers nuclear reactors.',
};

// Aesthetic only (not a physical property) for the other 110 elements —
// one consistent color per category instead of 110 individually invented ones.
const CATEGORY_COLOR: Record<ElementCategory, number> = {
  'alkali-metal': 0xb072ff,
  'alkaline-earth-metal': 0x7fe0a8,
  'transition-metal': 0xc97a3d,
  'post-transition-metal': 0xd9a066,
  metalloid: 0x9fd9c4,
  nonmetal: 0x6b7690,
  halogen: 0x8fe04e,
  'noble-gas': 0x6fd8e8,
  lanthanide: 0xe8a8d8,
  actinide: 0xe86a6a,
};
const CATEGORY_BASE_RADIUS: Record<ElementCategory, number> = {
  'alkali-metal': 0.80,
  'alkaline-earth-metal': 0.72,
  'transition-metal': 0.68,
  'post-transition-metal': 0.70,
  metalloid: 0.62,
  nonmetal: 0.50,
  halogen: 0.65,
  'noble-gas': 0.55,
  lanthanide: 0.75,
  actinide: 0.78,
};

function buildElement(facts: (typeof BASE_FACTS)[number]): ElementData {
  const [number, symbol, name, category, period, group, block, mass, oxidation] = facts;
  const neutrons = mass != null ? Math.round(mass) - number : null;
  const electronConfig = buildElectronConfiguration(number);
  const override = ORIGINAL_COLOR_RADIUS[symbol];
  const color = override ? override.color : CATEGORY_COLOR[category];
  const r = override ? override.r : Math.min(0.95, CATEGORY_BASE_RADIUS[category] + (period - 1) * 0.03);

  return {
    number, symbol, name, category, period, group, block, mass, neutrons,
    shells: electronConfig.shells,
    valence: electronConfig.valence,
    config: electronConfig.configString,
    bondShellDepth: electronConfig.bondShellDepth,
    oxidation,
    en: ELECTRONEGATIVITY[symbol],
    color,
    r,
    fact: FACTS[symbol],
  };
}

const PERIODIC_TABLE: ElementData[] = BASE_FACTS.map(buildElement);

export const ELEMENTS: Record<string, ElementData> = Object.fromEntries(
  PERIODIC_TABLE.map((el) => [el.symbol, el]),
);

export type ElementSymbol = keyof typeof ELEMENTS;

export const ELEMENT_LIST: ElementData[] = PERIODIC_TABLE;

export const ATOMIC_NAMES: Record<string, string> = Object.fromEntries(
  PERIODIC_TABLE.map((el) => [el.symbol, el.name]),
);
