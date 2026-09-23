import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ELEMENTS } from '../chemistry/elements';
import type { ElementSymbol } from '../chemistry/types';
import { BohrAtomModel } from './BohrAtom';
import { ElementPlaque } from './ElementPlaque';
import { Ion } from './Ion';
import { attachLookControls, type LookState } from './lookControls';
import { PeriodicTableRoom } from './PeriodicTableRoom';

// Room layout: player stands near the origin at eye height, yaw=0 faces
// the periodic table wall (-Z); turning right (+yaw) brings the selected
// atom's wall (+X) into view.
const EYE_HEIGHT = 1.6;
const TABLE_WALL: [number, number, number] = [0, EYE_HEIGHT, -7];
const ATOM_WALL: [number, number, number] = [8, EYE_HEIGHT, -1];
const ION_SPOT: [number, number, number] = [-6.5, EYE_HEIGHT + 0.1, -5];

export interface ElementsRoomProps {
  symbol: ElementSymbol;
  onSelectElement: (symbol: string) => void;
  ionWaveKey?: number;
  onIonClick: () => void;
  onInspect: () => void;
}

/**
 * The elements room: a first-person space rather than an object you orbit.
 * The periodic table is a wall of 3D tiles in front of you; turn right and
 * the atom you've picked is on display, full size. Picking a new element
 * on the table swaps what's showing on that wall.
 */
export function ElementsRoom({ symbol, onSelectElement, ionWaveKey, onIonClick, onInspect }: ElementsRoomProps) {
  const { scene, camera, gl } = useThree();
  const lookRef = useRef<LookState>({ yaw: 0, pitch: 0 });

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    perspectiveCamera.fov = 62;
    perspectiveCamera.near = 0.1;
    perspectiveCamera.far = 100;
    perspectiveCamera.updateProjectionMatrix();

    scene.background = new THREE.Color(0x0a0f1c);
    scene.fog = new THREE.Fog(0x0a0f1c, 18, 40);

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

  // The atom's own radius grows with its shell count (see BohrAtom.tsx) —
  // anchor the plaque below whatever that atom's actual footprint is, so it
  // doesn't get swallowed by a big atom's outer shell.
  const maxRadius = 1.35 + (ELEMENTS[symbol].shells.length - 1) * 0.85 + 0.3;
  const plaquePosition: [number, number, number] = [ATOM_WALL[0], ATOM_WALL[1] - maxRadius - 0.5, ATOM_WALL[2]];

  return (
    <>
      <PeriodicTableRoom center={TABLE_WALL} selected={symbol} onSelectElement={onSelectElement} />
      <BohrAtomModel symbol={symbol} driveCamera={false} roomOffset={ATOM_WALL} />
      <ElementPlaque symbol={symbol} position={plaquePosition} onAskIon={onIonClick} onInspect={onInspect} />
      <Ion variant="small" position={ION_SPOT} smallPosition={ION_SPOT} waveKey={ionWaveKey} onClick={onIonClick} />
    </>
  );
}
