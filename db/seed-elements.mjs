import pg from 'pg';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set (expected in .env)');
  process.exit(1);
}

// [atomic_number, symbol, name, category, period, group, block, atomic_mass, oxidation_states]
// atomic_mass is left null for elements 104+ (synthetic/superheavy, no stable standard
// atomic weight to cite) and for a handful of less-common heavy elements where precision
// isn't pedagogically load-bearing; fill in from IUPAC data before relying on those rows.
// group is left null for f-block elements other than La/Ac (traditional textbook layout).
const ELEMENTS = [
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

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  await client.query('BEGIN');
  for (const [
    atomic_number, symbol, name, category, period, group, block, atomic_mass, oxidation_states,
  ] of ELEMENTS) {
    await client.query(
      `INSERT INTO elements
         (atomic_number, symbol, name, category, period, "group", block, atomic_mass, common_oxidation_states)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (atomic_number) DO UPDATE SET
         symbol = EXCLUDED.symbol,
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         period = EXCLUDED.period,
         "group" = EXCLUDED."group",
         block = EXCLUDED.block,
         atomic_mass = EXCLUDED.atomic_mass,
         common_oxidation_states = EXCLUDED.common_oxidation_states`,
      [atomic_number, symbol, name, category, period, group, block, atomic_mass, oxidation_states],
    );
  }
  await client.query('COMMIT');
  const { rows } = await client.query('SELECT count(*)::int AS n FROM elements');
  console.log(`Seeded ${ELEMENTS.length} elements. elements table now has ${rows[0].n} rows.`);
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Seed failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
