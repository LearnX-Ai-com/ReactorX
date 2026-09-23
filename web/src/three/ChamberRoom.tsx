import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ChamberAtomTray, type ReactantSlot, type TrayCard } from './ChamberAtomTray';
import { Ion } from './Ion';
import { attachLookControls, type LookState } from './lookControls';
import { PeriodicTableRoom } from './PeriodicTableRoom';
import { ReactionChamberModel, type ChamberSnapshot, type ReactionChamberHandle } from './ReactionChamber';

// Room layout: player stands near the origin at eye height, yaw=0 faces the
// reaction wall (-Z); turning left brings the atom-picker wall (-X) into
// view — same "turn to see a different wall" convention ElementsRoom
// established. FRONT_WALL sits further back than ElementsRoom's walls since
// the reaction layout itself spans ~13 units (ANCHOR_A..ANCHOR_P2 in
// ReactionChamber.tsx). LEFT_WALL_ROTATION turns the table/tray to face back
// toward the origin — a wall placed along ±X (unlike ElementsRoom's, which
// sits straight ahead along -Z) reads edge-on without this.
const EYE_HEIGHT = 1.6;
const FRONT_WALL: [number, number, number] = [0, EYE_HEIGHT, -14];
const LEFT_WALL: [number, number, number] = [-9, EYE_HEIGHT, -1];
const LEFT_WALL_ROTATION: [number, number, number] = [0, Math.PI / 2, 0];
const ION_SPOT: [number, number, number] = [2.5, EYE_HEIGHT + 0.1, -5];

export interface ChamberRoomProps {
  chamberRef: React.RefObject<ReactionChamberHandle | null>;
  reactantA: string;
  reactantB: string;
  coeffs: number[] | null;
  onChamberStateChange: (s: ChamberSnapshot) => void;

  activeBuildSlot: ReactantSlot;
  onSwitchSlot: (slot: ReactantSlot) => void;
  trayCards: Record<ReactantSlot, TrayCard[]>;
  onAddCard: (symbol: string) => void;
  onRemoveCard: (slot: ReactantSlot, id: number) => void;
  liveGuess: string | null;
  trayBusy: boolean;
  trayError: string | null;
  onConfirmTray: () => void;

  ionWaveKey: number;
  onIonClick: () => void;
}

/**
 * The reaction chamber as a first-person room, mirroring ElementsRoom.tsx:
 * the reaction itself is the front wall, and the periodic-table atom tray is
 * the left wall for building a reactant atom by atom. The equation/balance
 * data lives in the docked HTML subpanel (App.tsx's ChamberOverlay) rather
 * than on a wall — tried as wall content first, but small interactive
 * controls (coefficient steppers, etc.) are easier to use in a fixed screen
 * panel than projected onto a 3D point you have to be looking at.
 */
export function ChamberRoom({
  chamberRef, reactantA, reactantB, coeffs, onChamberStateChange,
  activeBuildSlot, onSwitchSlot, trayCards, onAddCard, onRemoveCard, liveGuess, trayBusy, trayError, onConfirmTray,
  ionWaveKey, onIonClick,
}: ChamberRoomProps) {
  const { scene, camera, gl } = useThree();
  const lookRef = useRef<LookState>({ yaw: 0, pitch: 0 });

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

  return (
    <>
      <PeriodicTableRoom
        center={LEFT_WALL}
        rotation={LEFT_WALL_ROTATION}
        selected={trayCards[activeBuildSlot].map((c) => c.symbol)}
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

      <Ion variant="small" position={ION_SPOT} smallPosition={ION_SPOT} waveKey={ionWaveKey} onClick={onIonClick} />
    </>
  );
}
