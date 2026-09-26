import { useFrame, useThree } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { attachOrbitControls, type CameraOrbitState } from './orbitControls';
import { HubNavModel } from './HubNavModel';
import { Ion } from './Ion';

// Shared between the JSX below and the per-model point lights added in the
// setup effect, so a light always sits with the model it's meant to light.
const NAV_POS = {
  chamber: [-3.1, -0.3, -0.2] as [number, number, number],
  elements: [3.1, -0.3, -0.2] as [number, number, number],
};

export interface HubSceneProps {
  /** Increment to make Ion wave + blink (e.g. on menu interaction). */
  ionWaveKey?: number;
  /** Tapping the rotating lab-equipment model — the "Reaction Chamber" nav
   * entry, replacing what used to be a flat 2D menu card. */
  onSelectChamber?: () => void;
  /** Tapping the rotating explore model — the "Explore Elements" nav
   * entry, replacing what used to be a flat 2D menu card. */
  onSelectElements?: () => void;
}

/**
 * The home hub: Ion standing in the same ambient lab backdrop (grid +
 * starfield) the reaction chamber uses, so the hub and the views it leads
 * into read as one continuous space rather than a separate menu screen.
 * The 2D radial menu is HTML, layered on top by the caller — this only
 * owns the 3D backdrop and camera.
 */
export function HubScene({ ionWaveKey, onSelectChamber, onSelectElements }: HubSceneProps) {
  const { scene, camera, gl } = useThree();
  const camStateRef = useRef<CameraOrbitState>({ theta: 0.15, phi: 1.28, radius: 5.4 });
  const camTargetRef = useRef(new THREE.Vector3(0, 0.05, 0));
  const chamberModelRef = useRef<THREE.Group>(null);
  const elementsModelRef = useRef<THREE.Group>(null);
  // Latest-callback refs so the one-time setup effect below (empty deps,
  // mirrors ChamberRoom/MoleculeViewer's own established reasoning) doesn't
  // need to re-run — and can't hold a stale closure — every time the
  // parent re-renders with fresh onSelect* identities.
  const onSelectChamberRef = useRef(onSelectChamber);
  const onSelectElementsRef = useRef(onSelectElements);
  useEffect(() => {
    onSelectChamberRef.current = onSelectChamber;
    onSelectElementsRef.current = onSelectElements;
  });

  useEffect(() => {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    perspectiveCamera.fov = 42;
    perspectiveCamera.near = 0.1;
    perspectiveCamera.far = 60;
    perspectiveCamera.updateProjectionMatrix();

    scene.background = new THREE.Color(0x0a0f1c);
    scene.fog = new THREE.Fog(0x0a0f1c, 30, 60);

    const root = new THREE.Group();
    scene.add(root);

    root.add(new THREE.AmbientLight(0x445577, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(3, 4, 5);
    root.add(key);
    const rim = new THREE.DirectionalLight(0x2dd4bf, 0.35);
    rim.position.set(-4, 2, -3);
    root.add(rim);

    // A dedicated glow on each nav model — matching this room's own
    // accent-teal/amber theming (App.css's .menu-card-accent-* colors) so
    // each object reads as lit/highlighted rather than sitting in the same
    // flat ambient wash as the floor and stars. Positioned in front of and
    // slightly above each model (NAV_POS below), short falloff distance so
    // they don't bleed into the center of the scene or onto each other.
    const chamberGlow = new THREE.PointLight(0x2dd4bf, 6, 6, 2);
    chamberGlow.position.set(NAV_POS.chamber[0], NAV_POS.chamber[1] + 1, NAV_POS.chamber[2] + 1.5);
    root.add(chamberGlow);
    const elementsGlow = new THREE.PointLight(0xf5a524, 6, 6, 2);
    elementsGlow.position.set(NAV_POS.elements[0], NAV_POS.elements[1] + 1, NAV_POS.elements[2] + 1.5);
    root.add(elementsGlow);

    const grid = new THREE.GridHelper(20, 20, 0x2dd4bf, 0x1b2a44);
    grid.position.y = -1.4;
    (grid.material as THREE.Material & { opacity: number; transparent: boolean }).opacity = 0.25;
    (grid.material as THREE.Material & { transparent: boolean }).transparent = true;
    root.add(grid);

    const starCount = 220;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 10 + Math.random() * 9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0x3a4a70, size: 0.05, transparent: true, opacity: 0.6 });
    const stars = new THREE.Points(starGeo, starMat);
    root.add(stars);

    // A tap (not a drag) raycast scoped to just the two nav models — cheap,
    // and can't accidentally match unrelated scene content.
    function handleNavTap(clientX: number, clientY: number): void {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      if (chamberModelRef.current) {
        const hits = raycaster.intersectObject(chamberModelRef.current, true);
        if (hits.length) { onSelectChamberRef.current?.(); return; }
      }
      if (elementsModelRef.current) {
        const hits = raycaster.intersectObject(elementsModelRef.current, true);
        if (hits.length) onSelectElementsRef.current?.();
      }
    }

    const detach = attachOrbitControls(gl.domElement, camStateRef.current, 3.5, 9, handleNavTap);

    return () => {
      detach();
      scene.remove(root);
      grid.geometry.dispose();
      starGeo.dispose();
      starMat.dispose();
    };
    // gl/scene/camera are stable for the lifetime of a given <Canvas>.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // In VR, the headset's own head tracking owns the camera transform — this
  // orbit math would otherwise fight it every frame, snapping the view back
  // to wherever the mouse/touch drag last left it instead of following the
  // student's actual head movement.
  const xrSession = useXR((s) => s.session);
  useFrame(() => {
    if (xrSession) return;
    const camState = camStateRef.current;
    const camTarget = camTargetRef.current;
    camera.position.set(
      camTarget.x + camState.radius * Math.sin(camState.phi) * Math.sin(camState.theta),
      camTarget.y + camState.radius * Math.cos(camState.phi),
      camTarget.z + camState.radius * Math.sin(camState.phi) * Math.cos(camState.theta),
    );
    camera.lookAt(camTarget);
  });

  return (
    <>
      <Ion variant="full" position={[0, 0, 0]} smallPosition={[0, 0, 0]} waveKey={ionWaveKey} />
      {/* useGLTF suspends while its model loads — Canvas has no implicit
       * Suspense boundary, so each GLTF-backed nav model gets its own (both
       * fallback={null}: briefly absent beats a crash). The "Reaction
       * Chamber" (left) and "Explore Elements" (right) nav entries are now
       * these rotating 3D objects instead of flat 2D cards — tap one to
       * navigate, same as tapping the old card did (see handleNavTap above). */}
      <Suspense fallback={null}>
        <HubNavModel
          ref={chamberModelRef}
          url="/models/chemistry-lab-equipment.glb"
          position={NAV_POS.chamber}
          scale={2}
          rotationY={0.5}
          label="Reaction Chamber"
        />
      </Suspense>
      <Suspense fallback={null}>
        <HubNavModel
          ref={elementsModelRef}
          url="/models/explore.glb"
          position={NAV_POS.elements}
          scale={1.4}
          rotationY={-0.5}
          label="Explore Elements"
          labelAccent="amber"
        />
      </Suspense>
    </>
  );
}
