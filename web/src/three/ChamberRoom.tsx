import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ELEMENTS } from '../chemistry/elements';
import { matchesFilter, type CategoryFilter } from '../chemistry/elementFilter';
import type { Reaction, ReactantSlot, TrayCard } from '../chemistry/types';
import { ChamberAtomTray } from './ChamberAtomTray';
import { ChamberIonPanel } from './ChamberIonPanel';
import { Ion } from './Ion';
import { attachLookControls, type LookState } from './lookControls';
import { PeriodicTableRoom } from './PeriodicTableRoom';
import { ReactionChamberModel, type ChamberSnapshot, type ReactionChamberHandle } from './ReactionChamber';

// Room layout: player stands near the origin at eye height, yaw=0 faces the
// reaction wall (-Z); turning left brings the element-picker wall (-X) into
// view, turning right brings the reaction-info/Ion wall (+X) — same "turn to
// see a different wall" convention ElementsRoom established. FRONT_WALL sits
// further back than ElementsRoom's walls since the reaction layout itself
// spans ~13 units (ANCHOR_A..ANCHOR_P2 in ReactionChamber.tsx).
// *_WALL_ROTATION turns 3D wall content to face back toward the origin — a
// wall placed along ±X (unlike ElementsRoom's, which sits straight ahead
// along -Z) reads edge-on without this.
const EYE_HEIGHT = 1.6;
const FRONT_WALL: [number, number, number] = [0, EYE_HEIGHT, -14];
const LEFT_WALL: [number, number, number] = [-9, EYE_HEIGHT, -1];
const LEFT_WALL_ROTATION: [number, number, number] = [0, Math.PI / 2, 0];
const RIGHT_WALL: [number, number, number] = [9, EYE_HEIGHT, -1];
const ION_SPOT: [number, number, number] = [7.2, EYE_HEIGHT + 0.1, -3];

export interface ChamberRoomProps {
  chamberRef: React.RefObject<ReactionChamberHandle | null>;
  reactantA: string;
  reactantB: string;
  coeffs: number[] | null;
  onChamberStateChange: (s: ChamberSnapshot) => void;
  reaction: Reaction | null;
  caption: string;

  activeBuildSlot: ReactantSlot;
  onSwitchSlot: (slot: ReactantSlot) => void;
  trayCards: Record<ReactantSlot, TrayCard[]>;
  onAddCard: (symbol: string) => void;
  onRemoveCard: (slot: ReactantSlot, id: number) => void;
  liveGuess: string | null;
  trayBusy: boolean;
  trayError: string | null;
  onConfirmTray: () => void;
  elementCategory: CategoryFilter;
  onElementCategoryChange: (v: CategoryFilter) => void;

  ionWaveKey: number;
}

/**
 * The reaction chamber as a first-person room, mirroring ElementsRoom.tsx:
 * the reaction plays out on the front wall, the periodic table + atom tray
 * are the left wall, and reaction info + Ion's chat float on the right wall
 * — all wall content (3D boxes / drei <Html> anchored to a 3D point), not
 * screen-docked panels, per explicit direction that these should "float
 * like the atoms do." Only the balancing/coefficient controls stay in a
 * docked HTML subpanel (App.tsx's ChamberOverlay) — that one's on-screen by
 * a separate, still-standing decision (small interactive steppers are
 * easier to use in a fixed panel than projected onto a 3D point).
 */
export function ChamberRoom({
  chamberRef, reactantA, reactantB, coeffs, onChamberStateChange, reaction, caption,
  activeBuildSlot, onSwitchSlot, trayCards, onAddCard, onRemoveCard, liveGuess, trayBusy, trayError, onConfirmTray,
  elementCategory, onElementCategoryChange,
  ionWaveKey,
}: ChamberRoomProps) {
  const { scene, camera, gl } = useThree();
  const lookRef = useRef<LookState>({ yaw: 0, pitch: 0 });
  const chatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    perspectiveCamera.fov = 62;
    perspectiveCamera.near = 0.1;
    perspectiveCamera.far = 200;
    perspectiveCamera.updateProjectionMatrix();

    scene.background = new THREE.Color(0x0a0f1c);
    scene.fog = new THREE.Fog(0x0a0f1c, 18, 60);

    const root = new THREE.Group();
    scene.add(root);

    root.add(new THREE.AmbientLight(0x445577, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(3, 6, 4);
    root.add(key);
    const rim = new THREE.DirectionalLight(0x2dd4bf, 0.3);
    rim.position.set(-4, 3, -2);
    root.add(rim);

    const grid = new THREE.GridHelper(30, 30, 0x2dd4bf, 0x1b2a44);
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

  useFrame(() => {
    const eye = new THREE.Vector3(0, EYE_HEIGHT, 0);
    camera.position.copy(eye);
    const { yaw, pitch } = lookRef.current;
    const dir = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    camera.lookAt(eye.clone().add(dir));
  });

  const filterActive = elementCategory !== 'all';
  const dim = filterActive
    ? (symbol: string) => !matchesFilter(ELEMENTS[symbol], '', elementCategory)
    : undefined;

  return (
    <>
      <PeriodicTableRoom
        center={LEFT_WALL}
        rotation={LEFT_WALL_ROTATION}
        selected={trayCards[activeBuildSlot].map((c) => c.symbol)}
        dim={dim}
        onSelectElement={onAddCard}
      />
      <ChamberAtomTray
        center={LEFT_WALL}
        rotation={LEFT_WALL_ROTATION}
        activeSlot={activeBuildSlot}
        cards={trayCards}
        onSwitchSlot={onSwitchSlot}
        onRemoveCard={onRemoveCard}
        liveGuess={liveGuess}
        busy={trayBusy}
        error={trayError}
        onConfirm={onConfirmTray}
        reactantA={reactantA}
        reactantB={reactantB}
        category={elementCategory}
        onCategoryChange={onElementCategoryChange}
      />

      <ReactionChamberModel
        ref={chamberRef}
        reactantA={reactantA}
        reactantB={reactantB}
        coeffs={coeffs}
        onStateChange={onChamberStateChange}
        driveCamera={false}
        roomOffset={FRONT_WALL}
      />

      <ChamberIonPanel
        position={RIGHT_WALL}
        reactantA={reactantA}
        reactantB={reactantB}
        reaction={reaction}
        caption={caption}
        inputRef={chatInputRef}
      />
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
