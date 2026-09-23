import type { ElementCategory, ElementData } from './types';

export type CategoryFilter = 'all' | 'metal' | 'nonmetal' | 'noble-gas';

const METAL_CATEGORIES: ElementCategory[] = [
  'alkali-metal', 'alkaline-earth-metal', 'transition-metal', 'post-transition-metal', 'lanthanide', 'actinide',
];
const NONMETAL_CATEGORIES: ElementCategory[] = ['nonmetal', 'halogen', 'metalloid'];

/** Buckets ElementCategory's 10 IUPAC-precise values down to the 3 a K-12
 * filter row needs (metalloids fold into "nonmetal" — a common classroom
 * simplification, not a chemistry claim). */
export function categoryBucket(category: ElementCategory): Exclude<CategoryFilter, 'all'> {
  if (METAL_CATEGORIES.includes(category)) return 'metal';
  if (NONMETAL_CATEGORIES.includes(category)) return 'nonmetal';
  return 'noble-gas';
}

export function matchesFilter(el: ElementData, search: string, category: CategoryFilter): boolean {
  if (category !== 'all' && categoryBucket(el.category) !== category) return false;
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return el.symbol.toLowerCase().includes(q) || el.name.toLowerCase().includes(q);
}
