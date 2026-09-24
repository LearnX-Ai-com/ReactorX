import { useMemo } from 'react';
import * as THREE from 'three';
import { ELEMENT_LIST, type ElementData } from '../chemistry/elements';
import { gridPosition } from '../chemistry/periodicTableLayout';
import { labelTexture } from './elementLabel';
import {
  colToX, DEFAULT_F_BLOCK_GAP, MAIN_TABLE_LAST_ROW, rowToY, verticalCenterOffset,
} from './periodicTableGeometry';

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

export interface ElementTileProps {
  el: ElementData;
  x: number;
  y: number;
  isSelected: boolean;
  /** True when a search/category filter is active and this element doesn't
   * match — the tile stays in place (so the grid layout doesn't jump around
   * as the student types) but fades and desaturates rather than disappearing. */
  dimmed?: boolean;
  onSelectElement: (symbol: string) => void;
}

/** A single "specimen box" tile — exported so other 3D content can spawn
 * matching cards outside the table grid. */
export function ElementTile({ el, x, y, isSelected, dimmed, onSelectElement }: ElementTileProps) {
  // BoxGeometry's material groups are ordered [+x, -x, +y, -y, +z, -z] —
  // index 4 (+z) is the face pointing back toward the player, so that's
  // the only one that gets the bright category color and the selection glow.
  const materials = useMemo(() => {
    const sideColor = dimmed ? darken(el.color, 0.22) : darken(el.color, 0.6);
    const side = new THREE.MeshStandardMaterial({
      color: sideColor,
      roughness: 0.4,
      metalness: 0.05,
      transparent: !!dimmed,
      opacity: dimmed ? 0.35 : 1,
      // A low-level self-glow (the tile's own category color, not just the
      // selection highlight) is what actually reads as "neon" rather than
      // just a brightly-lit colored box — every tile glows a little, the
      // selected one glows a lot more, in the accent color.
      emissive: sideColor,
      emissiveIntensity: dimmed ? 0.03 : 0.28,
    });
    const front = new THREE.MeshStandardMaterial({
      color: dimmed ? darken(el.color, 0.45) : el.color,
      roughness: 0.25,
      metalness: 0.08,
      transparent: !!dimmed,
      opacity: dimmed ? 0.35 : 1,
      emissive: isSelected ? 0x2dd4bf : el.color,
      emissiveIntensity: dimmed ? 0.04 : (isSelected ? 1.1 : 0.45),
    });
    return [side, side, side, side, front, side];
  }, [el.color, isSelected, dimmed]);

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
        <meshBasicMaterial map={labelTexture(el.symbol)} transparent opacity={dimmed ? 0.35 : 1} />
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
   * needs none since its wall is straight ahead; a wall placed along ±X
   * would need a ±90° yaw or it reads edge-on). Defaults to no rotation
   * (facing +Z, the un-rotated case). */
  rotation?: [number, number, number];
  /** A single symbol, or a list to highlight more than one at once. */
  selected?: string | string[];
  /** True for a symbol that fails the active search/category filter (see
   * chemistry/elementFilter.ts) — undefined/omitted means no filter active. */
  dim?: (symbol: string) => boolean;
  /** Extra world-unit gap between the main table and the f-block rows, on
   * top of the normal one-row spacing — see rowToY's comment. Defaults to
   * the small cosmetic gap every instance used before this was
   * configurable (ElementsRoom doesn't pass this, so it's unaffected).
   * Meaningless when excludeFBlock is set. */
  fBlockGap?: number;
  /** Drops the lanthanides/actinides (rows 9-10) entirely — not used, not
   * rendered, not clickable. For a surface where picking a reactant is the
   * point (the chamber) rather than browsing every element (the atom
   * explorer, which doesn't set this): those 30 elements never come up in
   * the reactions this app supports, and removing them shrinks the table
   * to a clean 7-row grid with no leftover gap-row bookkeeping. */
  excludeFBlock?: boolean;
  onSelectElement: (symbol: string) => void;
}

/**
 * The periodic table as an actual wall of 3D boxes instead of an HTML grid
 * — the "front wall" of the elements room. Same 118-element data and the
 * same period/group layout as the flat picker (chemistry/periodicTableLayout),
 * just built from meshes instead of DOM nodes so it lives in the room.
 */
export function PeriodicTableRoom({
  center, rotation, selected, dim, fBlockGap = DEFAULT_F_BLOCK_GAP, excludeFBlock, onSelectElement,
}: PeriodicTableRoomProps) {
  const isSelected = (symbol: string): boolean => (
    Array.isArray(selected) ? selected.includes(symbol) : symbol === selected
  );
  const elements = excludeFBlock
    ? ELEMENT_LIST.filter((el) => el.category !== 'lanthanide' && el.category !== 'actinide')
    : ELEMENT_LIST;
  const offset = verticalCenterOffset(fBlockGap, excludeFBlock ? MAIN_TABLE_LAST_ROW : undefined);
  return (
    <group position={center} rotation={rotation}>
      {elements.map((el) => {
        const { row, col } = gridPosition(el);
        return (
          <ElementTile
            key={el.symbol}
            el={el}
            x={colToX(col)}
            y={rowToY(row, fBlockGap) + offset}
            isSelected={isSelected(el.symbol)}
            dimmed={dim?.(el.symbol)}
            onSelectElement={onSelectElement}
          />
        );
      })}
    </group>
  );
}
