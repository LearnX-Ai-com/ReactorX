import { Canvas } from '@react-three/fiber';
import type { ReactNode } from 'react';

export interface AppCanvasProps {
  children: ReactNode;
  className?: string;
}

/**
 * The single, persistent Canvas (one WebGLRenderer) the whole app renders
 * into — the hub, the chamber, and the atom explorer all mount their scene
 * content as children of this same Canvas rather than each owning their
 * own. This is what lets Ion (and eventually a WebXR session) carry across
 * views instead of resetting at every navigation.
 *
 * Each scene sets its own camera fov/near/far on mount (see HubScene,
 * ReactionChamber, BohrAtom) since only one of them is ever active here.
 */
export function AppCanvas({ children, className }: AppCanvasProps) {
  return (
    <Canvas className={className} camera={{ fov: 50, near: 0.1, far: 200 }} gl={{ antialias: true }}>
      {children}
    </Canvas>
  );
}
