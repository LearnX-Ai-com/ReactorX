import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildMoleculeMesh, disposeMoleculeMesh } from './moleculeMesh';
import { attachOrbitControls, type CameraOrbitState } from './orbitControls';
import type { BondType, ElementSymbol } from '../chemistry/types';

export interface MoleculeBondHit {
  bondType: BondType;
  elementA: ElementSymbol;
  elementB: ElementSymbol;
  order: number;
}

export interface MoleculeViewerProps {
  formula: string;
  /** A bond cylinder (tagged by buildMoleculeMesh) was tapped — switches the
   * docked card from the molecule overview to that bond's explanation. */
  onBondTap: (hit: MoleculeBondHit) => void;
  /** An atom sphere was tapped — jumps the detail view's tab to that
   * element, mirroring the original prototype's "click an atom in the
   * molecule to jump to its own tab" behavior. */
  onAtomTap: (symbol: ElementSymbol) => void;
}

/**
 * Standalone ball-and-stick molecule viewer for the chamber's molecule
 * detail view (App.tsx's "Molecule" tab) — built the same way BohrAtomModel
 * drives its own camera (a manual THREE scene graph assembled in an effect,
 * a CameraOrbitState ref driving the camera every frame), just centered on
 * a molecule instead of an atom, and reusing buildMoleculeMesh's already-
 * proven bond/sphere construction (same geometry the reaction chamber
 * itself renders) instead of building a second molecule renderer.
 */
export function MoleculeViewerModel({ formula, onBondTap, onAtomTap }: MoleculeViewerProps) {
  const { scene, camera, gl } = useThree();
  const camStateRef = useRef<CameraOrbitState>({ theta: 0.5, phi: 1.2, radius: 6 });
  // Latest-callback refs so a parent re-render (e.g. from unrelated chat
  // state) doesn't force this effect to re-run and rebuild the whole scene
  // graph / reset the student's current orbit — only a genuine formula
  // change should do that (see the effect's dependency array below).
  const onBondTapRef = useRef(onBondTap);
  const onAtomTapRef = useRef(onAtomTap);
  useEffect(() => {
    onBondTapRef.current = onBondTap;
    onAtomTapRef.current = onAtomTap;
  });

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    perspectiveCamera.fov = 42;
    perspectiveCamera.near = 0.1;
    perspectiveCamera.far = 60;
    perspectiveCamera.updateProjectionMatrix();
    scene.background = new THREE.Color(0x0a0f1c);
    scene.fog = null;

    const root = new THREE.Group();
    const model = buildMoleculeMesh(formula);
    root.add(model);
    scene.add(root);

    root.add(new THREE.AmbientLight(0x445577, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 1);
    key.position.set(3, 4, 5);
    root.add(key);
    const rim = new THREE.DirectionalLight(0x38bdf8, 0.3);
    rim.position.set(-4, 2, -3);
    root.add(rim);

    // Auto-fit the camera to whatever this molecule's actual footprint is
    // (a single atom vs. a large multi-atom structure) rather than a fixed
    // distance — mirrors BohrAtomModel's own maxRadius-driven framing, just
    // measured from the built geometry instead of a formula (shell count).
    const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
    const fitRadius = Math.max(1.2, sphere.radius);
    const dist = (fitRadius * 1.6) / Math.tan((21 * Math.PI) / 180);
    camStateRef.current = { theta: 0.5, phi: 1.2, radius: dist };
    const minR = dist * 0.4;
    const maxR = dist * 3;

    function raycastAt(clientX: number, clientY: number): THREE.Intersection | null {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(model, true);
      return hits[0] ?? null;
    }
    function handleTap(clientX: number, clientY: number): void {
      const hit = raycastAt(clientX, clientY);
      if (!hit) return;
      const data = hit.object.userData;
      if (data.bondType) {
        onBondTapRef.current({ bondType: data.bondType, elementA: data.elementA, elementB: data.elementB, order: data.order || 1 });
      } else if (data.el) {
        onAtomTapRef.current(data.el as ElementSymbol);
      }
    }

    const detach = attachOrbitControls(gl.domElement, camStateRef.current, minR, maxR, handleTap);

    return () => {
      detach();
      scene.remove(root);
      disposeMoleculeMesh(model);
    };
    // formula is the only thing that should rebuild this scene — see the
    // latest-callback refs above for why onBondTap/onAtomTap are excluded,
    // and ChamberRoom.tsx's own setup effect for the same scene/camera/gl-
    // are-stable-for-the-Canvas's-lifetime reasoning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formula]);

  useFrame(() => {
    const camState = camStateRef.current;
    camera.position.set(
      camState.radius * Math.sin(camState.phi) * Math.sin(camState.theta),
      camState.radius * Math.cos(camState.phi),
      camState.radius * Math.sin(camState.phi) * Math.cos(camState.theta),
    );
    camera.lookAt(0, 0, 0);
  });

  return null;
}
