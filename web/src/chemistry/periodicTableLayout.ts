import type { ElementData } from './elements';

const F_BLOCK_ROW: Record<number, number> = { 6: 9, 7: 10 };
const F_BLOCK_START: Record<number, number> = { 6: 57, 7: 89 };

/** Standard period/group grid position, with lanthanides/actinides dropped
 * into their own two rows below the main table (columns 3-17) — shared by
 * the 2D HTML picker and the 3D room wall so they never drift apart. */
export function gridPosition(el: ElementData): { row: number; col: number } {
  if (el.group != null) return { row: el.period, col: el.group };
  const row = F_BLOCK_ROW[el.period];
  const col = el.number - F_BLOCK_START[el.period] + 3;
  return { row, col };
}

export const GRID_COLS = 18;
export const GRID_ROWS = 10;
