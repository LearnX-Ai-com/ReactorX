import { Html, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';

export interface HubNavModelProps {
  /** public/models path, e.g. "/models/chemistry-lab-equipment.glb". */
  url: string;
  position: [number, number, number];
  scale?: number;
  rotationY?: number;
  /** Floating label under the model, e.g. "Reaction Chamber". */
  label?: string;
  /** Tints the label's glow to match this model's point light in HubScene
   * (teal for chamber, amber for elements) — default is the app's usual
   * teal accent. */
  labelAccent?: 'teal' | 'amber';
}

/**
 * A clickable, slowly-spinning 3D model standing in for a hub nav entry —
 * used for both "Reaction Chamber" (chemistry-lab-equipment.glb) and
 * "Explore Elements" (explore.glb), per the user's request to replace
 * their flat 2D menu cards with actual rotating 3D objects. Each is an
 * AI-generated (Tripo) model: a single static mesh, no rig/animations, so
 * "spinning" is a plain rotation.y increment rather than anything baked in.
 *
 * Forwards its inner (rotating) group so HubScene can raycast against it
 * for tap/click detection — deliberately NOT using React Three Fiber's own
 * onClick/onPointerOver here, the same reason ChamberRoom's molecule-tap
 * feature doesn't either: this scene's camera is driven by raw DOM pointer
 * listeners (attachOrbitControls), and a custom onTap raycast alongside
 * that is the pattern already proven to coexist reliably with it, rather
 * than trusting R3F's synthetic click event to behave the same way
 * alongside a hand-rolled drag-to-orbit scheme.
 */
export const HubNavModel = forwardRef<THREE.Group, HubNavModelProps>(function HubNavModel(
  { url, position, scale = 1, rotationY = 0, label, labelAccent = 'teal' },
  ref,
) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const spinRef = useRef<THREE.Group>(null!);
  // Owns rotation.y itself via a plain number ref (not the JSX `rotation`
  // prop) — a prop-driven initial rotation would get re-applied on every
  // re-render of this component and stomp the accumulated spin.
  const rotRef = useRef(rotationY);

  useImperativeHandle(ref, () => spinRef.current, []);

  useFrame((_, dt) => {
    rotRef.current += dt * 0.3;
    if (spinRef.current) spinRef.current.rotation.y = rotRef.current;
  });

  return (
    <group position={position}>
      <group ref={spinRef}>
        <primitive object={cloned} scale={scale} />
      </group>
      {label && (
        <Html position={[0, 0.05, 0]} center occlude={false} zIndexRange={[1, 1]}>
          <div className={labelAccent === 'amber' ? 'hub-3d-label hub-3d-label-amber' : 'hub-3d-label'}>{label}</div>
        </Html>
      )}
    </group>
  );
});
