import { Container, Text } from '@react-three/uikit';
import { useFrame, useThree } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import { useRef } from 'react';
import * as THREE from 'three';
import { toSubscript } from '../chemistry/formulas';
import { greetingFor, type ChatContext } from '../ion/answers';

export interface XRHudProps {
  context: ChatContext;
}

function titleFor(ctx: ChatContext): string {
  if (ctx.kind === 'chamber') {
    return ctx.reaction ? `${toSubscript(ctx.reactantA)} + ${toSubscript(ctx.reactantB)}` : 'Reaction Chamber';
  }
  if (ctx.kind === 'elements') return ctx.symbol;
  if (ctx.kind === 'molecule') return toSubscript(ctx.formula);
  return 'ReactorX';
}

/**
 * A read-only, camera-anchored info panel — the in-VR stand-in for the
 * app's 2D chat/HUD overlay, which is invisible inside an immersive WebXR
 * session (the session renders straight to the headset, bypassing the DOM
 * page entirely, no matter how that HTML is positioned — this is true even
 * of the app's existing drei <Html> panels, not just the top-level
 * App.tsx overlay). Built with @react-three/uikit so it's real WebGL
 * content the headset actually renders.
 *
 * Deliberately read-only for this first pass: no way to type/ask a new
 * question in VR yet (that needs either a virtual keyboard or voice
 * input — a separate, bigger piece of work), so this only ever shows
 * Ion's own scripted context blurb (the same one IonChatBody shows as its
 * opening line), not a live conversation.
 */
export function XRHud({ context }: XRHudProps) {
  const session = useXR((s) => s.session);
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null!);

  useFrame(() => {
    const g = groupRef.current;
    if (!g || !session) return;
    // Anchored fresh every frame (not lerped) to a fixed camera-local
    // offset — chest-height, slightly below eye line and in front — the
    // same "HUD stays put on screen regardless of head movement" technique
    // Ion.tsx's hudOffset already uses elsewhere in this app.
    camera.updateMatrixWorld();
    const pos = camera.localToWorld(new THREE.Vector3(0, -0.35, -1.1));
    g.position.copy(pos);
    g.quaternion.copy(camera.quaternion);
  });

  if (!session) return null;

  return (
    <group ref={groupRef}>
      <Container
        flexDirection="column"
        sizeX={0.6}
        sizeY={0.3}
        padding={16}
        gap={8}
        backgroundColor="#121a2c"
        borderRadius={20}
        borderWidth={2}
        borderColor="#2dd4bf"
      >
        <Container flexDirection="row" alignItems="center" gap={8}>
          <Container width={12} height={12} borderRadius={6} backgroundColor="#5eead4" />
          <Text fontSize={22} fontWeight="bold" color="#5eead4">{titleFor(context)}</Text>
        </Container>
        <Text fontSize={15} color="#e8edf8" lineHeight={20} width="100%">
          {greetingFor(context)}
        </Text>
      </Container>
    </group>
  );
}
