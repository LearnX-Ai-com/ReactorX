import { Html } from '@react-three/drei';
import type { CategoryFilter } from '../chemistry/elementFilter';

const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'metal', label: 'Metals' },
  { value: 'nonmetal', label: 'Nonmetals' },
  { value: 'noble-gas', label: 'Noble Gases' },
];

export interface ChamberFilterPanelProps {
  /** World-space point above the table's top row. */
  position: [number, number, number];
  category: CategoryFilter;
  onCategoryChange: (v: CategoryFilter) => void;
}

/** The category-filter strip grouped with the periodic table wall — split
 * out on its own now that the rest of the reactant-building UI (ChamberAtomTray)
 * moved off the wall entirely onto ChamberWorkbench.tsx's physical pedestal. */
export function ChamberFilterPanel({ position, category, onCategoryChange }: ChamberFilterPanelProps) {
  return (
    <Html position={position} center occlude={false} zIndexRange={[1, 1]}>
      <div className="category-filter-panel">
        <div className="category-filter">
          {CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={category === opt.value ? 'category-btn category-btn-active' : 'category-btn'}
              onClick={() => onCategoryChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </Html>
  );
}
