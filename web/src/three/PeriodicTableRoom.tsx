import { useMemo } from 'react';
import * as THREE from 'three';
import { ELEMENT_LIST, type ElementData } from '../chemistry/elements';
import { gridPosition, GRID_COLS } from '../chemistry/periodicTableLayout';
import { labelTexture } from './elementLabel';

const SPACING = 0.5;
const TILE_SIZE = 0.44;
// A real box, not a wafer — the whole point is that this reads as a
// specimen block sitting on the wall, not a flat card. Front face (+Z,
// toward the player) is the full category color; the other five faces are
// a darkened shade of the same color, which is what actually sells "box"
// rather than "colored square" from any angle other than dead-on.
const TILE_DEPTH = 0.26;
const SELECTED_POP = 0.16;

function darken(hex: number, factor: number): number {
  const r = Math.round(((hex >> 16) & 0xff) * factor);
  const g = Math.round(((hex >> 8) & 0xff) * factor);
  const b = Math.round((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

function colToX(col: number): number {
  return (col - (GRID_COLS + 1) / 2) * SPACING;
}
// Row 1 (period 1) maps to the top; rows 9-10 (the f-block overflow rows)
// get a bit of extra breathing room below the main table, same spirit as
// the flat picker's blank CSS grid row.
function rowToY(row: number): number {
  const gap = row >= 9 ? SPACING * 0.6 : 0;
  return -(row - 1) * SPACING - gap;
}
// Shifts the whole grid up so it's vertically centered on `center` rather
// than hanging entirely below it.
const VERTICAL_CENTER_OFFSET = -rowToY(10) / 2;

export interface ElementTileProps {
  el: ElementData;
  x: number;
  y: number;
  isSelected: boolean;
  onSelectElement: (symbol: string) => void;
}

/** A single "specimen box" tile — exported so other 3D content (e.g. the
 * chamber's atom tray) can spawn matching cards outside the table grid. */
export function ElementTile({ el, x, y, isSelected, onSelectElement }: ElementTileProps) {
  // BoxGeometry's material groups are ordered [+x, -x, +y, -y, +z, -z] —
  // index 4 (+z) is the face pointing back toward the player, so that's
  // the only one that gets the bright category color and the selection glow.
  const materials = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ color: darken(el.color, 0.5), roughness: 0.55, metalness: 0.08 });
    const front = new THREE.MeshStandardMaterial({
      color: el.color,
      roughness: 0.35,
      metalness: 0.12,
      emissive: isSelected ? 0x2dd4bf : 0x000000,
      emissiveIntensity: isSelected ? 0.7 : 0,
    });
    return [side, side, side, side, front, side];
  }, [el.color, isSelected]);

  const z = isSelected ? SELECTED_POP : 0;

  return (
    <group position={[x, y, z]}>
      <mesh
        material={materials}
        onClick={(e) => { e.stopPropagation(); onSelectElement(el.symbol); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        <boxGeometry args={[TILE_SIZE, TILE_SIZE, TILE_DEPTH]} />
      </mesh>
      <mesh position={[0, 0, TILE_DEPTH / 2 + 0.01]}>
        <planeGeometry args={[TILE_SIZE * 0.7, TILE_SIZE * 0.7]} />
        <meshBasicMaterial map={labelTexture(el.symbol)} transparent />
      </mesh>
    </group>
  );
}

export interface PeriodicTableRoomProps {
  /** World-space center of the wall; tiles are laid out on the local XY
   * plane around this point, front face toward local +Z. */
  center: [number, number, number];
  /** Rotates the whole grid so that local +Z (the tiles' front face) points
   * back toward wherever the player actually stands — required for any wall
   * not sitting directly along -Z from the origin (ElementsRoom's table
   * happens to need none since its wall is straight ahead; a wall placed
   * along ±X, like the chamber's, needs a ±90° yaw or it reads edge-on).
   * Defaults to no rotation (facing +Z, the un-rotated case). */
  rotation?: [number, number, number];
  /** A single symbol (the atom explorer's one-at-a-time selection) or a list
   * (the chamber's atom tray, where every symbol currently picked should
   * glow, not just the most recent one). */
  selected?: string | string[];
  onSelectElement: (symbol: string) => void;
}

/**
 * The periodic table as an actual wall of 3D boxes instead of an HTML grid
 * — the "front wall" of the elements room. Same 118-element data and the
 * same period/group layout as the flat picker (chemistry/periodicTableLayout),
 * just built from meshes instead of DOM nodes so it lives in the room.
 */
export function PeriodicTableRoom({ center, rotation, selected, onSelectElement }: PeriodicTableRoomProps) {
  const isSelected = (symbol: string): boolean => (
    Array.isArray(selected) ? selected.includes(symbol) : symbol === selected
  );
  return (
    <group position={center} rotation={rotation}>
      {ELEMENT_LIST.map((el) => {
        const { row, col } = gridPosition(el);
        return (
          <ElementTile
            key={el.symbol}
            el={el}
            x={colToX(col)}
            y={rowToY(row) + VERTICAL_CENTER_OFFSET}
            isSelected={isSelected(el.symbol)}
            onSelectElement={onSelectElement}
          />
        );
      })}
    </group>
  );
}
