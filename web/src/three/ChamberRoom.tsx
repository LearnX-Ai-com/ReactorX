import { Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ELEMENTS } from '../chemistry/elements';
import { matchesFilter, type CategoryFilter } from '../chemistry/elementFilter';
import type { BondType, ElementSymbol, Reaction, ReactantSlot, TrayCard } from '../chemistry/types';
import { ChamberFilterPanel } from './ChamberFilterPanel';
import { ChamberIonPanel } from './ChamberIonPanel';
import { ChamberReactionCard } from './ChamberReactionCard';
import { Ion } from './Ion';
import type { MoleculeFocus } from './MoleculeDetailCard';
import { attachLookControls, type LookState } from './lookControls';
import { computeSideWallTransform, LAB, yawBetween, yawToFace } from './labGeometry';
import { ease } from './math';
import { MAIN_TABLE_LAST_ROW, rowToY, verticalCenterOffset } from './periodicTableGeometry';
import { PeriodicTableRoom } from './PeriodicTableRoom';
import { ReactionChamberModel, type ChamberPhase, type ChamberSnapshot, type ReactionChamberHandle } from './ReactionChamber';

export type WallFocus = 'left' | 'center' | 'right';

// Meter-scale U-shaped lab per the spec's labConfig (see labGeometry.ts):
// the center wall is the reaction theater straight ahead, the two side
// walls angle inward toward the student's fixed position. Wall positions
// and yaws are derived, not hand-placed, so they can't drift from the
// spec's numbers or from each other.
const CENTER_WALL = LAB.center.position;
const LEFT_WALL = computeSideWallTransform('left');
const RIGHT_WALL = computeSideWallTransform('right');
const CENTER_YAW = yawToFace([CENTER_WALL[0], CENTER_WALL[2]]);
const LEFT_YAW = yawToFace([LEFT_WALL.position[0], LEFT_WALL.position[2]]);
const RIGHT_YAW = yawToFace([RIGHT_WALL.position[0], RIGHT_WALL.position[2]]);
const FOCUS_YAW: Record<WallFocus, number> = { left: LEFT_YAW, center: CENTER_YAW, right: RIGHT_YAW };
const FOCUS_DURATION_MS = 500;

// "Zoomed" dollies the eye toward whichever wall is currently focused —
// requesting a wall (in either the expanded or minimized HUD) zooms in on
// it, not just the center wall. Standoff distance is measured along each
// wall's own front-facing normal, the same (sin(rotationY), cos(rotationY))
// direction already used for RIGHT_FRONT below — for the center wall
// (rotationY 0) that's just +Z. Center's 2.4 was already tuned against the
// reaction's own footprint; left/right get a tighter 1.4 — the table
// (TABLE_SCALE'd to fit a 3m wall) is physically smaller than the reaction,
// so it needs to be closer to fill the frame the same way.
const ZOOM_STANDOFF: Record<WallFocus, number> = { left: 1.4, center: 2.4, right: 1.4 };
function zoomEyeFor(wall: WallFocus, transform: { position: [number, number, number]; rotationY: number }): [number, number, number] {
  const front: [number, number] = [Math.sin(transform.rotationY), Math.cos(transform.rotationY)];
  const standoff = ZOOM_STANDOFF[wall];
  return [
    transform.position[0] + front[0] * standoff,
    transform.position[1],
    transform.position[2] + front[1] * standoff,
  ];
}
const ZOOM_TARGETS: Record<WallFocus, [number, number, number]> = {
  left: zoomEyeFor('left', LEFT_WALL),
  center: zoomEyeFor('center', { position: CENTER_WALL, rotationY: 0 }),
  right: zoomEyeFor('right', RIGHT_WALL),
};
const ZOOM_LERP_RATE = 3;

// FOCUS_YAW points a wall's way from the student's default (far-away)
// position — correct while standing back, but once zoomed in close, that
// same yaw overshoots badly (a wall off to the side needs a much smaller
// turn once you're standing right in front of it than it does from across
// the room). ZOOM_FOCUS_YAW is the same wall-facing yaw, just computed from
// each wall's own ZOOM_TARGETS eye instead, so the table/chamber/panel
// actually ends up centered once the dolly-in finishes.
function xz(v: [number, number, number]): [number, number] {
  return [v[0], v[2]];
}
const ZOOM_FOCUS_YAW: Record<WallFocus, number> = {
  left: yawBetween(xz(ZOOM_TARGETS.left), xz(LEFT_WALL.position)),
  center: yawBetween(xz(ZOOM_TARGETS.center), xz(CENTER_WALL)),
  right: yawBetween(xz(ZOOM_TARGETS.right), xz(RIGHT_WALL.position)),
};

// First-pass fit scales: each wall's existing content was built for a much
// larger room (the table's ~9x3.4-unit grid, the chamber's ~13-16x4-unit
// anchor spread — see PeriodicTableRoom.tsx/ReactionChamber.tsx), so it's
// wrapped in a scaled group here rather than having its internal layout
// constants rewritten. Chosen from those known footprints with a margin;
// not pixel-verified — expect tuning after a real look in the browser.
const TABLE_SCALE = 0.28;
const CENTER_SCALE = 0.26;

// The table's own vertical extent (see periodicTableGeometry.ts) — used to
// park the filter strip just above the top row, in the same local frame the
// table itself uses, so it scales and rotates identically instead of being
// positioned separately.
const TABLE_OFFSET = verticalCenterOffset(0, MAIN_TABLE_LAST_ROW);
const TABLE_TOP_Y = rowToY(1, 0) + TABLE_OFFSET;
const FILTER_PANEL_LOCAL: [number, number, number] = [0, TABLE_TOP_Y + 0.3, 0];

// Ion's companion character docks just off the right wall's face, toward
// the room's center — deliberately NOT nested inside that wall's content
// group, since Ion's own FULL_SCALE/SMALL_SCALE sizing is tuned in meters
// already and would read as too small if compounded with TABLE_SCALE-sized
// wall-fit scaling.
const RIGHT_FRONT: [number, number] = [Math.sin(RIGHT_WALL.rotationY), Math.cos(RIGHT_WALL.rotationY)];
const ION_SPOT: [number, number, number] = [
  RIGHT_WALL.position[0] + RIGHT_FRONT[0] * 0.6,
  RIGHT_WALL.position[1] - 0.3,
  RIGHT_WALL.position[2] + RIGHT_FRONT[1] * 0.6,
];

// Anchored close above the reacting molecule cluster (not high overhead —
// that read as "in the sky" and needed looking up to see at all). The
// collision point (ZERO in ReactionChamber.tsx) sits at world y≈2.16 after
// CENTER_SCALE; the burst effect's peak radius reaches y≈2.62 above that,
// so 0.85 above the wall's own center clears it with a bit of headroom
// while staying close enough to read as anchored to the reaction itself.
const REACTION_CARD_SPOT: [number, number, number] = [
  CENTER_WALL[0],
  CENTER_WALL[1] + 0.85,
  CENTER_WALL[2] + 0.3,
];

interface FocusTween {
  fromYaw: number;
  delta: number;
  start: number;
}

export interface ChamberRoomProps {
  chamberRef: React.RefObject<ReactionChamberHandle | null>;
  reactantA: string;
  reactantB: string;
  coeffs: number[] | null;
  onChamberStateChange: (s: ChamberSnapshot) => void;
  reaction: Reaction | null;
  caption: string;
  /** Drives the floating reaction-info card above the center wall — shown
   * only once React has actually been pressed (reacting/done), not while
   * still balancing. */
  phase: ChamberPhase;

  activeBuildSlot: ReactantSlot;
  trayCards: Record<ReactantSlot, TrayCard[]>;
  onAddCard: (symbol: string) => void;
  elementCategory: CategoryFilter;
  onElementCategoryChange: (v: CategoryFilter) => void;

  ionWaveKey: number;

  /** Which wall the desktop camera should smoothly turn to face. Only the
   * transition (a change in focusKey) matters — the wall-focus buttons bump
   * focusKey on every click, even re-clicking the wall already in view. */
  focusWall: WallFocus;
  focusKey: number;

  /** True whenever a wall focus is active (requesting a wall always zooms
   * in on it, whether the HUD is expanded or minimized) — the camera
   * dollies in toward focusWall so it fills the screen, easing back out to
   * the normal standing position only when this goes false (expanding the
   * panel back out, not just switching which wall is focused). */
  zoomed: boolean;

  /** Tapping a reactant/product molecule (or a bond on one) opens the
   * full-screen molecule detail view (App.tsx's MoleculeDetailOverlay/
   * MoleculeDetailScene) at this focus — mirrors the original prototype's
   * handleCanvasTap -> openDetailView flow, just scoped to this room's own
   * clickable groups (see ReactionChamberModel's getClickableGroups) rather
   * than raycasting the whole scene. */
  onOpenDetail: (focus: MoleculeFocus) => void;
}

/**
 * The reaction chamber as a first-person room, now built at the spec's real
 * meter-scale U-shaped layout (see labGeometry.ts) instead of the old
 * far-apart flat-wall arrangement: a 5m center wall (the reaction theater)
 * with two 3m side walls angled inward toward the student. The reaction
 * plays on the center wall, the periodic table (f-block excluded — a clean
 * 7-row grid for picking practical reactants) + its filter strip are the
 * left wall, and reaction info + Ion's chat are the right wall. Picking
 * elements still happens here (clicking a tile), but what's been picked and
 * the Add-to-Reaction action live in a docked screen subpanel (App.tsx's
 * ChamberOverlay) rather than floating 3D content near the table.
 */
export function ChamberRoom({
  chamberRef, reactantA, reactantB, coeffs, onChamberStateChange, reaction, caption, phase,
  activeBuildSlot, trayCards, onAddCard,
  elementCategory, onElementCategoryChange,
  ionWaveKey, focusWall, focusKey, zoomed, onOpenDetail,
}: ChamberRoomProps) {
  const { scene, camera, gl } = useThree();
  const lookRef = useRef<LookState>({ yaw: 0, pitch: 0, zoomOffset: 0 });
  const chatInputRef = useRef<HTMLInputElement>(null);
  const focusTweenRef = useRef<FocusTween | null>(null);
  const prevFocusKeyRef = useRef(focusKey);
  const prevZoomedRef = useRef(zoomed);
  const currentEyeRef = useRef(new THREE.Vector3(...LAB.student.position));

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    perspectiveCamera.fov = 62;
    perspectiveCamera.near = 0.1;
    perspectiveCamera.far = 200;
    perspectiveCamera.updateProjectionMatrix();

    scene.background = new THREE.Color(0x071426);
    scene.fog = new THREE.Fog(0x071426, 6, 16);

    const root = new THREE.Group();
    scene.add(root);

    root.add(new THREE.AmbientLight(0x445577, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(3, 6, 4);
    root.add(key);
    const rim = new THREE.DirectionalLight(0x38bdf8, 0.35);
    rim.position.set(-4, 3, -2);
    root.add(rim);

    const grid = new THREE.GridHelper(LAB.floor, LAB.floor, 0x38bdf8, 0x14314f);
    grid.position.y = -0.02;
    (grid.material as THREE.Material & { opacity: number; transparent: boolean }).opacity = 0.18;
    (grid.material as THREE.Material & { transparent: boolean }).transparent = true;
    root.add(grid);

    // Tap (not drag) on a reactant/product molecule opens the full-screen
    // molecule detail view; a bond on that molecule wins over the molecule
    // itself when both are hit, same priority BohrAtomModel's own tap
    // handler uses for its particles vs. their ring hit-targets. Scoped to
    // just the chamber's own groups (not the whole scene) via the handle's
    // getClickableGroups — cheap, and can't accidentally match unrelated
    // userData elsewhere in the room.
    function handleMoleculeTap(clientX: number, clientY: number): void {
      const groups = chamberRef.current?.getClickableGroups();
      if (!groups?.length) return;
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(groups, true);
      if (!hits.length) return;
      const bondHit = hits.find((h) => h.object.userData?.bondType);
      const primary = bondHit ?? hits[0];
      let obj: THREE.Object3D | null = primary.object;
      while (obj && !obj.userData?.formula) obj = obj.parent;
      if (!obj) return;
      const formula = obj.userData.formula as string;
      if (bondHit) {
        onOpenDetail({
          kind: 'bond',
          formula,
          bondType: bondHit.object.userData.bondType as BondType,
          elementA: bondHit.object.userData.elementA as ElementSymbol,
          elementB: bondHit.object.userData.elementB as ElementSymbol,
          order: (bondHit.object.userData.order as number) || 1,
        });
      } else {
        onOpenDetail({ kind: 'molecule', formula });
      }
    }

    const detach = attachLookControls(gl.domElement, lookRef.current, handleMoleculeTap);

    return () => {
      detach();
      scene.remove(root);
      grid.geometry.dispose();
    };
    // gl/scene/camera are stable for the lifetime of a given <Canvas>;
    // chamberRef is a stable ref object, not meant to be reactive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A wall-focus button click bumps focusKey (even for the wall already in
  // view) — start a short eased yaw tween from wherever the student is
  // currently looking to that wall's derived yaw, taking the shorter way
  // around rather than spinning past ±180°. Also re-fires on a `zoomed`
  // flip with no new focusKey (expanding the panel steps the camera back
  // out without picking a new wall) — the correct yaw for "the same wall,
  // but from the standing distance" is a different number than "from the
  // zoomed-in distance", so simply not re-targeting on zoom-out alone would
  // leave the camera looking the wrong direction once it finished dollying
  // back out.
  useEffect(() => {
    const focusChanged = focusKey !== prevFocusKeyRef.current;
    const zoomChanged = zoomed !== prevZoomedRef.current;
    prevFocusKeyRef.current = focusKey;
    prevZoomedRef.current = zoomed;
    if (!focusChanged && !zoomChanged) return;
    const targetYaw = (zoomed ? ZOOM_FOCUS_YAW : FOCUS_YAW)[focusWall];
    const fromYaw = lookRef.current.yaw;
    let delta = (targetYaw - fromYaw) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    focusTweenRef.current = { fromYaw, delta, start: performance.now() };
    // A fresh wall focus (or stepping back out) starts from the wall's own
    // tuned distance, not whatever a prior pinch happened to leave behind.
    lookRef.current.zoomOffset = 0;
  }, [focusKey, focusWall, zoomed]);

  // The headset's own head tracking owns the camera transform once an XR
  // session starts — the wall-focus dolly/tween below would otherwise
  // fight it every frame.
  const xrSession = useXR((s) => s.session);
  useFrame((_, dt) => {
    if (xrSession) return;
    const tween = focusTweenRef.current;
    if (tween) {
      const p = Math.min(1, (performance.now() - tween.start) / FOCUS_DURATION_MS);
      lookRef.current.yaw = tween.fromYaw + tween.delta * ease(p);
      if (p >= 1) focusTweenRef.current = null;
    }

    const targetEye = zoomed ? ZOOM_TARGETS[focusWall] : LAB.student.position;
    currentEyeRef.current.lerp(new THREE.Vector3(...targetEye), Math.min(1, dt * ZOOM_LERP_RATE));
    const { yaw, pitch, zoomOffset } = lookRef.current;
    const dir = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    // Pinch dolly (two-finger touch, see lookControls.ts) is a manual
    // adjustment along the current view direction, layered on top of the
    // wall-focus lerp above rather than replacing it — so it works whether
    // you're at the standing distance or already zoomed into a wall.
    const eye = currentEyeRef.current.clone().addScaledVector(dir, zoomOffset);
    camera.position.copy(eye);
    camera.lookAt(eye.clone().add(dir));
  });

  const filterActive = elementCategory !== 'all';
  const dim = filterActive
    ? (symbol: string) => !matchesFilter(ELEMENTS[symbol], '', elementCategory)
    : undefined;

  return (
    <>
      {/* The room has no ceiling mesh, so straight up used to be nothing but
       * the flat fog color — a starfield sphere well outside the walls
       * (unaffected by scene fog, see drei's Stars) reads as an open night
       * sky through that gap without needing an actual roof. */}
      <Stars radius={60} depth={50} count={3500} factor={3.5} saturation={0.3} fade speed={0.4} />
      <group position={LEFT_WALL.position} rotation={[0, LEFT_WALL.rotationY, 0]}>
        <mesh position={[0, 0, -0.03]}>
          <boxGeometry args={[LAB.side.width, LAB.side.height, 0.06]} />
          <meshStandardMaterial color={0x102844} roughness={0.85} metalness={0.05} emissive={0x0a1a2e} emissiveIntensity={0.25} />
        </mesh>
        <group scale={TABLE_SCALE}>
          <PeriodicTableRoom
            center={[0, 0, 0]}
            selected={trayCards[activeBuildSlot].map((c) => c.symbol)}
            dim={dim}
            excludeFBlock
            onSelectElement={onAddCard}
          />
          <ChamberFilterPanel position={FILTER_PANEL_LOCAL} category={elementCategory} onCategoryChange={onElementCategoryChange} />
        </group>
      </group>

      {/* Pushed 0.15 behind CENTER_WALL's own z, not centered on it — the
       * reaction root sits exactly at CENTER_WALL (roomOffset, no z offset),
       * so a panel centered there was coplanar with the molecules/signs and
       * z-fought against them depending on camera angle (the left/right
       * walls avoid this since their backing sits at a local z behind their
       * content group's origin; the center wall has no such group to nest
       * the panel behind). */}
      <mesh position={[CENTER_WALL[0], CENTER_WALL[1], CENTER_WALL[2] - 0.15]}>
        <boxGeometry args={[LAB.center.width, LAB.center.height, 0.06]} />
        <meshStandardMaterial color={0x102844} roughness={0.85} metalness={0.05} emissive={0x0a1a2e} emissiveIntensity={0.25} />
      </mesh>
      <ReactionChamberModel
        ref={chamberRef}
        reactantA={reactantA}
        reactantB={reactantB}
        coeffs={coeffs}
        onStateChange={onChamberStateChange}
        driveCamera={false}
        roomOffset={CENTER_WALL}
        roomScale={CENTER_SCALE}
      />
      {reaction && (phase === 'reacting' || phase === 'done') && (
        <ChamberReactionCard position={REACTION_CARD_SPOT} reaction={reaction} caption={caption} phase={phase} />
      )}

      <group position={RIGHT_WALL.position} rotation={[0, RIGHT_WALL.rotationY, 0]}>
        <mesh position={[0, 0, -0.03]}>
          <boxGeometry args={[LAB.side.width, LAB.side.height, 0.06]} />
          <meshStandardMaterial color={0x102844} roughness={0.85} metalness={0.05} emissive={0x0a1a2e} emissiveIntensity={0.25} />
        </mesh>
        <ChamberIonPanel
          position={[0, 0, 0]}
          reactantA={reactantA}
          reactantB={reactantB}
          reaction={reaction}
          caption={caption}
          phase={phase}
          inputRef={chatInputRef}
        />
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
