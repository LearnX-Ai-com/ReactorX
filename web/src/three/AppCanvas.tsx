import { Canvas } from '@react-three/fiber';
import { XR } from '@react-three/xr';
import type { ReactNode } from 'react';
import { xrStore } from './xr';

export interface AppCanvasProps {
  children: ReactNode;
  className?: string;
}

/**
 * The single, persistent Canvas (one WebGLRenderer) the whole app renders
 * into — the hub, the chamber, and the atom explorer all mount their scene
 * content as children of this same Canvas rather than each owning their
 * own. This is what lets Ion (and a WebXR session, via the <XR> wrapper
 * below) carry across views instead of resetting at every navigation.
 *
 * Each scene sets its own camera fov/near/far on mount (see HubScene,
 * ReactionChamber, BohrAtom) since only one of them is ever active here —
 * every one of those same scenes also has to stop doing that (and stop
 * manually driving camera.position/lookAt in its own useFrame) once an XR
 * session is active, since the headset's own head tracking owns the
 * camera transform at that point; see each scene's useXR() session guard.
 */
export function AppCanvas({ children, className }: AppCanvasProps) {
  return (
    <Canvas className={className} camera={{ fov: 50, near: 0.1, far: 200 }} gl={{ antialias: true }}>
      <XR store={xrStore}>{children}</XR>
    </Canvas>
  );
}
