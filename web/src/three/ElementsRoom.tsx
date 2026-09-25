import { Html, Sparkles, Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ATOMIC_NAMES, ELEMENTS } from '../chemistry/elements';
import type { ElementSymbol } from '../chemistry/types';
import { BohrAtomModel } from './BohrAtom';
import { ElementIonPanel } from './ElementIonPanel';
import { Ion } from './Ion';
import { attachLookControls, type LookState } from './lookControls';
import { computeSideWallTransform, LAB, yawToFace } from './labGeometry';
import { ease } from './math';
import { PeriodicTableRoom } from './PeriodicTableRoom';

export type WallFocus = 'left' | 'center' | 'right';

// Same meter-scale U-shaped lab as the chamber (labGeometry.ts) — reused
// verbatim rather than re-derived, so the two rooms can't drift from each
// other's geometry. Wall *assignment* is different from the chamber's
// though: here the periodic table is the front/center wall (the main
// exploration surface, per the layout brief), not a side-wall picker, with
// the live Bohr atom on the left and element info + Ion's chat on the
// right. This room's camera logic is its own copy of ChamberRoom.tsx's
// wall-focus system (not a shared import) — kept independent deliberately
// so a change to one room's camera can't regress the other's already-tuned
// behavior. Unlike the chamber, this room deliberately has no zoom-in dolly
// on wall focus — clicking a wall chip only turns the camera to face it
// from the same standing spot, a "realistic" fixed viewing distance rather
// than an artificial close-up (per explicit user feedback: the dolly-in
// felt too zoomed in for every wall here).
const CENTER_WALL = LAB.center.position;
const LEFT_WALL = computeSideWallTransform('left');
const RIGHT_WALL = computeSideWallTransform('right');
const CENTER_YAW = yawToFace([CENTER_WALL[0], CENTER_WALL[2]]);
const LEFT_YAW = yawToFace([LEFT_WALL.position[0], LEFT_WALL.position[2]]);
const RIGHT_YAW = yawToFace([RIGHT_WALL.position[0], RIGHT_WALL.position[2]]);
const FOCUS_YAW: Record<WallFocus, number> = { left: LEFT_YAW, center: CENTER_YAW, right: RIGHT_YAW };
const FOCUS_DURATION_MS = 500;

// The full table (no excludeFBlock — exploring every element, including the
// f-block, is this room's whole point, unlike the chamber's compact
// reactant picker) sits on the wider 5m front wall rather than a 3m side
// wall, so it's scaled up proportionally from the chamber's proven
// TABLE_SCALE=0.28 (tuned for its 3m wall) rather than re-derived from
// scratch. Still a first-pass number — expects a real look before it's final.
const TABLE_SCALE = 0.28 * (LAB.center.width / LAB.side.width);

// A Bohr atom's own footprint (BohrAtom.tsx's maxRadius) ranges from ~1.65
// (hydrogen, 1 shell) to ~6.75 (7 shells) — TARGET_RADIUS is the constant
// world-space radius every element should fill once scaled, chosen to sit
// comfortably inside the 3m/2.8m side wall with margin either way.
const TARGET_RADIUS = 1.1;
function atomRoomScale(symbol: ElementSymbol): number {
  const maxRadius = 1.35 + (ELEMENTS[symbol].shells.length - 1) * 0.85 + 0.3;
  return TARGET_RADIUS / maxRadius;
}
// Every element's post-scale radius is exactly TARGET_RADIUS (that's the
// point of atomRoomScale above), so a fixed front-offset — not a per-symbol
// one — is enough to keep the atom from clipping through its own wall's
// backing mesh regardless of which element is showing.
const LEFT_FRONT: [number, number] = [Math.sin(LEFT_WALL.rotationY), Math.cos(LEFT_WALL.rotationY)];
const ATOM_SPOT: [number, number, number] = [
  LEFT_WALL.position[0] + LEFT_FRONT[0] * (TARGET_RADIUS + 0.15),
  LEFT_WALL.position[1],
  LEFT_WALL.position[2] + LEFT_FRONT[1] * (TARGET_RADIUS + 0.15),
];

// Ion's companion character docks just off the right wall's face, same
// convention as ChamberRoom's RIGHT_FRONT/ION_SPOT.
const RIGHT_FRONT: [number, number] = [Math.sin(RIGHT_WALL.rotationY), Math.cos(RIGHT_WALL.rotationY)];
const ION_SPOT: [number, number, number] = [
  RIGHT_WALL.position[0] + RIGHT_FRONT[0] * 0.6,
  RIGHT_WALL.position[1] - 0.3,
  RIGHT_WALL.position[2] + RIGHT_FRONT[1] * 0.6,
];

// A drifting particle layer overhead, centered above the room and wide
// enough to sit over all three walls at once — the ceiling has no mesh of
// its own (same reasoning as the Stars sphere below it), so this is what
// reads as "energy in the air" tying the walls together when you look up,
// rather than empty fog. Kept procedural (drei's Sparkles, a plain
// vertex-shader point cloud) instead of drei's Cloud/Clouds, which needs an
// external CDN texture this app shouldn't depend on.
const CEILING_SPOT: [number, number, number] = [0, LAB.center.height + 1.6, CENTER_WALL[2] * 0.4];

// Floating just below the table's own wall bounds (above it sat outside
// the standing camera's frustum at the student's eye height — not visible
// at all), pulled slightly toward the student (+Z) to clear the backing
// mesh — same z-offset convention as ChamberRoom's REACTION_CARD_SPOT.
// This is where "which element is selected" + the Inspect action live now:
// the room's camera never zooms (see the module doc above), so this panel
// stays a constant, comfortable size no matter which wall is focused, and
// sitting right at the table itself is far easier to notice than the same
// content buried in the bottom-of-screen dock.
const TABLE_STATUS_SPOT: [number, number, number] = [
  CENTER_WALL[0],
  CENTER_WALL[1] - LAB.center.height / 2 - 0.3,
  CENTER_WALL[2] + 0.3,
];

interface FocusTween {
  fromYaw: number;
  delta: number;
  start: number;
}

function TableStatusPanel({ symbol, onInspect }: { symbol: ElementSymbol; onInspect: () => void }) {
  return (
    <Html position={TABLE_STATUS_SPOT} center occlude={false} zIndexRange={[1, 1]}>
      <div className="table-status-panel">
        <span className="table-status-name">{ATOMIC_NAMES[symbol]} ({symbol})</span>
        <button type="button" className="chip chip-accent" onClick={onInspect}>
          {'🔎'} Inspect
        </button>
      </div>
    </Html>
  );
}

export interface ElementsRoomProps {
  symbol: ElementSymbol;
  onSelectElement: (symbol: string) => void;
  ionWaveKey?: number;
  /** Which wall the desktop camera should smoothly turn to face — no zoom,
   * just a yaw turn from the fixed standing spot (see the module doc above). */
  focusWall: WallFocus;
  focusKey: number;
  /** Opens the standalone full-screen Inspect mode for the current element
   * — triggered from the floating panel above the table (TableStatusPanel). */
  onInspect: () => void;
}

/**
 * The elements room as a first-person three-wall space, at the same
 * meter-scale U-shaped layout as the reaction chamber (labGeometry.ts):
 * the periodic table is the front/center wall (the main exploration
 * surface), a live Bohr model of the selected element is the left wall,
 * and element info + Ion's always-on chat is the right wall. Picking a
 * tile on the table swaps what's showing on the other two walls.
 */
export function ElementsRoom({
  symbol, onSelectElement, ionWaveKey, focusWall, focusKey, onInspect,
}: ElementsRoomProps) {
  const { scene, camera, gl } = useThree();
  const lookRef = useRef<LookState>({ yaw: 0, pitch: 0, zoomOffset: 0 });
  const chatInputRef = useRef<HTMLInputElement>(null);
  const focusTweenRef = useRef<FocusTween | null>(null);
  const prevFocusKeyRef = useRef(focusKey);

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    // Wider than the chamber's 62° — with no zoom-in dolly at all (see the
    // module doc above), this room's standing view is the only framing a
    // student ever gets, and it read as too close/zoomed-in by default; a
    // wider FOV shows more of each wall from the same standing spot instead.
    perspectiveCamera.fov = 72;
    perspectiveCamera.near = 0.1;
    perspectiveCamera.far = 100;
    perspectiveCamera.updateProjectionMatrix();

    scene.background = new THREE.Color(0x0a0f1c);
    scene.fog = new THREE.Fog(0x0a0f1c, 6, 16);

    const root = new THREE.Group();
    scene.add(root);

    root.add(new THREE.AmbientLight(0x445577, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(3, 6, 4);
    root.add(key);
    const rim = new THREE.DirectionalLight(0x2dd4bf, 0.3);
    rim.position.set(-4, 3, -2);
    root.add(rim);

    const grid = new THREE.GridHelper(LAB.floor, LAB.floor, 0x2dd4bf, 0x1b2a44);
    grid.position.y = -0.02;
    (grid.material as THREE.Material & { opacity: number; transparent: boolean }).opacity = 0.18;
    (grid.material as THREE.Material & { transparent: boolean }).transparent = true;
    root.add(grid);

    const detach = attachLookControls(gl.domElement, lookRef.current);

    return () => {
      detach();
      scene.remove(root);
      grid.geometry.dispose();
    };
    // gl/scene/camera are stable for the lifetime of a given <Canvas>.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // focusKey bumps on every wall-chip click, even re-clicking the wall
    // already in view, so there's always something to react to here.
    if (focusKey === prevFocusKeyRef.current) return;
    prevFocusKeyRef.current = focusKey;
    const targetYaw = FOCUS_YAW[focusWall];
    const fromYaw = lookRef.current.yaw;
    let delta = (targetYaw - fromYaw) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    focusTweenRef.current = { fromYaw, delta, start: performance.now() };
    lookRef.current.zoomOffset = 0;
  }, [focusKey, focusWall]);

  useFrame(() => {
    const tween = focusTweenRef.current;
    if (tween) {
      const p = Math.min(1, (performance.now() - tween.start) / FOCUS_DURATION_MS);
      lookRef.current.yaw = tween.fromYaw + tween.delta * ease(p);
      if (p >= 1) focusTweenRef.current = null;
    }

    // No wall-focus dolly here (see the module doc) — the eye always stays
    // at the room's fixed standing spot; pinch-zoom's zoomOffset is still a
    // manual, student-driven adjustment layered on top of that fixed point.
    const { yaw, pitch, zoomOffset } = lookRef.current;
    const dir = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    const eye = new THREE.Vector3(...LAB.student.position).addScaledVector(dir, zoomOffset);
    camera.position.copy(eye);
    camera.lookAt(eye.clone().add(dir));
  });

  return (
    <>
      <Stars radius={60} depth={50} count={3500} factor={3.5} saturation={0.3} fade speed={0.4} />
      <Sparkles
        position={CEILING_SPOT}
        scale={[LAB.floor * 0.8, 1.4, LAB.floor * 0.6]}
        count={160}
        size={4}
        speed={0.3}
        opacity={0.55}
        color="#2dd4bf"
      />

      <group position={CENTER_WALL}>
        <mesh position={[0, 0, -0.15]}>
          <boxGeometry args={[LAB.center.width, LAB.center.height, 0.06]} />
          <meshStandardMaterial color={0x102844} roughness={0.85} metalness={0.05} emissive={0x0a1a2e} emissiveIntensity={0.25} />
        </mesh>
        <group scale={TABLE_SCALE}>
          <PeriodicTableRoom center={[0, 0, 0]} selected={symbol} onSelectElement={onSelectElement} />
        </group>
      </group>
      <TableStatusPanel symbol={symbol} onInspect={onInspect} />

      <group position={LEFT_WALL.position} rotation={[0, LEFT_WALL.rotationY, 0]}>
        <mesh position={[0, 0, -0.03]}>
          <boxGeometry args={[LAB.side.width, LAB.side.height, 0.06]} />
          <meshStandardMaterial color={0x102844} roughness={0.85} metalness={0.05} emissive={0x0a1a2e} emissiveIntensity={0.25} />
        </mesh>
      </group>
      <BohrAtomModel symbol={symbol} driveCamera={false} roomOffset={ATOM_SPOT} roomScale={atomRoomScale(symbol)} />

      <group position={RIGHT_WALL.position} rotation={[0, RIGHT_WALL.rotationY, 0]}>
        <mesh position={[0, 0, -0.03]}>
          <boxGeometry args={[LAB.side.width, LAB.side.height, 0.06]} />
          <meshStandardMaterial color={0x102844} roughness={0.85} metalness={0.05} emissive={0x0a1a2e} emissiveIntensity={0.25} />
        </mesh>
        <ElementIonPanel position={[0, 0, 0]} symbol={symbol} inputRef={chatInputRef} />
      </group>
      <Ion
        variant="small"
        position={ION_SPOT}
        smallPosition={ION_SPOT}
        waveKey={ionWaveKey}
        onClick={() => chatInputRef.current?.focus()}
      />
    </>
  );
}
