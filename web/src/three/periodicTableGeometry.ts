import { GRID_COLS } from '../chemistry/periodicTableLayout';

// Split out of PeriodicTableRoom.tsx (a component file) so this doesn't mix
// component and non-component exports in one module; see elementLabel.ts's
// identical rationale.

export const SPACING = 0.5;
export const DEFAULT_F_BLOCK_GAP = SPACING * 0.6;
/** Period 7 (row 7) is the last row of the main table body — rows 9-10 are
 * the f-block overflow, row 8 is always blank. */
export const MAIN_TABLE_LAST_ROW = 7;
export const F_BLOCK_LAST_ROW = 10;

export function colToX(col: number): number {
  return (col - (GRID_COLS + 1) / 2) * SPACING;
}

// Row 1 (period 1) maps to the top; rows 9-10 (the f-block overflow rows)
// get extra breathing room below the main table (period 7, row 7) — same
// spot a printed periodic table leaves blank before dropping the
// lanthanides/actinides in below. `fBlockGap` is how much extra space, in
// world units, on top of the normal one-row gap. Irrelevant when the
// f-block isn't being rendered at all (PeriodicTableRoom's excludeFBlock).
export function rowToY(row: number, fBlockGap: number): number {
  const gap = row >= 9 ? fBlockGap : 0;
  return -(row - 1) * SPACING - gap;
}

/** Shifts the whole grid up so it's vertically centered on `center` rather
 * than hanging entirely below it. `lastRow` is which row is actually the
 * bottom of what's being rendered — F_BLOCK_LAST_ROW (10) for the full
 * table, MAIN_TABLE_LAST_ROW (7) when excludeFBlock drops the
 * lanthanides/actinides, so the shorter grid centers on its own extent
 * instead of leaving a gap where the f-block rows would have been. */
export function verticalCenterOffset(fBlockGap: number, lastRow: number = F_BLOCK_LAST_ROW): number {
  return -rowToY(lastRow, fBlockGap) / 2;
}
