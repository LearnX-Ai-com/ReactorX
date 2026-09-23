import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

export type IonVariant = 'full' | 'small';

export interface IonProps {
  /** 'full' when Ion should be front-and-center (idle/browsing moments);
   * 'small' when the 3D content itself should have the viewer's attention
   * (e.g. mid-reaction) — Ion shrinks and steps back rather than disappearing. */
  variant: IonVariant;
  /** World position to occupy at 'full' size. */
  position: [number, number, number];
  /** World position to occupy at 'small' size (typically a quieter corner). */
  smallPosition: [number, number, number];
  /** Increment to trigger a wave + blink gesture (e.g. on a phase change). */
  waveKey?: number;
  /** When set, Ion is clickable (cursor + hover pulse) — used to open the chat panel. */
  onClick?: () => void;
}

const FULL_SCALE = 1;
const SMALL_SCALE = 0.4;
const TWEEN_RATE = 4; // higher = snappier size/position transitions

/**
 * ReactorX's companion character — procedurally built from the same
 * sphere/bond primitives as every molecule in the chamber (sphere body,
 * an orbiting electron on a shell ring) rather than an imported model, so
 * it reads as "made of the subject matter" the way the app's own atoms do.
 */
export function Ion({ variant, position, smallPosition, waveKey, onClick }: IonProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const [hovered, setHovered] = useState(false);
  const leftArmRef = useRef<THREE.Group>(null!);
  const rightArmRef = useRef<THREE.Group>(null!);
  const eyeLRef = useRef<THREE.Mesh>(null!);
  const eyeRRef = useRef<THREE.Mesh>(null!);
  const pupilLRef = useRef<THREE.Mesh>(null!);
  const pupilRRef = useRef<THREE.Mesh>(null!);
  const electronRef = useRef<THREE.Mesh>(null!);

  const currentScaleRef = useRef(variant === 'full' ? FULL_SCALE : SMALL_SCALE);
  const currentPosRef = useRef(new THREE.Vector3(...(variant === 'full' ? position : smallPosition)));
  const waveStartRef = useRef(0);
  const waveUntilRef = useRef(0);
  const lastBlinkRef = useRef(0);
  const blinkUntilRef = useRef(0);

  useEffect(() => {
    const now = performance.now();
    waveStartRef.current = now;
    waveUntilRef.current = now + 1400;
    lastBlinkRef.current = now - 2500; // blink almost immediately on a wave
    // Re-fire only when explicitly asked to (waveKey changing), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveKey]);

  const targetScale = variant === 'full' ? FULL_SCALE : SMALL_SCALE;
  const targetPos = useMemo(
    () => new THREE.Vector3(...(variant === 'full' ? position : smallPosition)),
    [variant, position, smallPosition],
  );

  useFrame((_, dt) => {
    const now = performance.now();
    const t = now / 1000;
    const g = groupRef.current;
    if (!g) return;

    const lerpFactor = Math.min(1, dt * TWEEN_RATE);
    currentScaleRef.current += (targetScale - currentScaleRef.current) * lerpFactor;
    currentPosRef.current.lerp(targetPos, lerpFactor);
    const hoverBump = onClick && hovered ? 1.1 : 1;
    g.scale.setScalar(currentScaleRef.current * hoverBump);
    g.position.copy(currentPosRef.current);
    g.position.y += Math.sin(t * 1.1) * 0.06;
    g.rotation.y = Math.sin(t * 0.35) * 0.18;

    if (now - lastBlinkRef.current > 3500) {
      lastBlinkRef.current = now;
      blinkUntilRef.current = now + 140;
    }
    const blinked = now < blinkUntilRef.current;
    if (eyeLRef.current) eyeLRef.current.scale.y = blinked ? 0.15 : 1.15;
    if (eyeRRef.current) eyeRRef.current.scale.y = blinked ? 0.15 : 1.15;
    if (pupilLRef.current) pupilLRef.current.visible = !blinked;
    if (pupilRRef.current) pupilRRef.current.visible = !blinked;

    const ea = t * 1.4;
    if (electronRef.current) {
      electronRef.current.position.set(Math.cos(ea) * 1.55, Math.sin(ea) * 1.55 * 0.4, Math.sin(ea) * 1.55 * 0.85);
    }

    if (now < waveUntilRef.current) {
      const wp = (now - waveStartRef.current) / 1400;
      if (rightArmRef.current) {
        rightArmRef.current.rotation.z = Math.sin(wp * Math.PI * 5) * 0.5;
        rightArmRef.current.rotation.x = 0.3;
      }
    } else if (rightArmRef.current) {
      rightArmRef.current.rotation.z = Math.sin(t * 0.8) * 0.05;
      rightArmRef.current.rotation.x = 0;
    }
    if (leftArmRef.current) leftArmRef.current.rotation.z = Math.sin(t * 0.7 + 1.5) * 0.06;
  });

  return (
    <group
      ref={groupRef}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
      onPointerOver={onClick ? (e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; } : undefined}
      onPointerOut={onClick ? () => { setHovered(false); document.body.style.cursor = 'auto'; } : undefined}
    >
      <mesh>
        <sphereGeometry args={[1, 40, 30]} />
        <meshStandardMaterial color={0x1c3a3d} roughness={0.35} metalness={0.15} emissive={0x2dd4bf} emissiveIntensity={0.35} />
      </mesh>

      <mesh ref={eyeLRef} position={[-0.36, 0.22, 0.86]} scale={[1, 1.15, 0.7]}>
        <sphereGeometry args={[0.26, 24, 20]} />
        <meshStandardMaterial color={0xf1f5f9} roughness={0.3} metalness={0.05} />
      </mesh>
      <mesh ref={pupilLRef} position={[-0.36, 0.22, 1.06]}>
        <sphereGeometry args={[0.11, 16, 14]} />
        <meshStandardMaterial color={0x0a0f1c} roughness={0.4} />
      </mesh>
      <mesh ref={eyeRRef} position={[0.36, 0.22, 0.86]} scale={[1, 1.15, 0.7]}>
        <sphereGeometry args={[0.26, 24, 20]} />
        <meshStandardMaterial color={0xf1f5f9} roughness={0.3} metalness={0.05} />
      </mesh>
      <mesh ref={pupilRRef} position={[0.36, 0.22, 1.06]}>
        <sphereGeometry args={[0.11, 16, 14]} />
        <meshStandardMaterial color={0x0a0f1c} roughness={0.4} />
      </mesh>

      <mesh position={[0, -0.28, 0.92]} rotation={[0, 0, Math.PI]}>
        <torusGeometry args={[0.28, 0.035, 10, 24, Math.PI]} />
        <meshStandardMaterial color={0x0a0f1c} roughness={0.5} />
      </mesh>

      <group ref={leftArmRef} position={[-0.92, -0.05, 0.05]}>
        <mesh position={[-0.22, -0.05, 0]} rotation={[0, 0, -0.9]}>
          <cylinderGeometry args={[0.09, 0.07, 0.6, 10]} />
          <meshStandardMaterial color={0x16232f} roughness={0.5} metalness={0.1} />
        </mesh>
        <mesh position={[-0.42, -0.2, 0]}>
          <sphereGeometry args={[0.14, 16, 14]} />
          <meshStandardMaterial color={0xf5a524} roughness={0.35} metalness={0.1} emissive={0x7a4a0a} emissiveIntensity={0.25} />
        </mesh>
      </group>
      <group ref={rightArmRef} position={[0.92, -0.05, 0.05]}>
        <mesh position={[0.22, -0.05, 0]} rotation={[0, 0, 0.9]}>
          <cylinderGeometry args={[0.09, 0.07, 0.6, 10]} />
          <meshStandardMaterial color={0x16232f} roughness={0.5} metalness={0.1} />
        </mesh>
        <mesh position={[0.42, -0.2, 0]}>
          <sphereGeometry args={[0.14, 16, 14]} />
          <meshStandardMaterial color={0xf5a524} roughness={0.35} metalness={0.1} emissive={0x7a4a0a} emissiveIntensity={0.25} />
        </mesh>
      </group>

      <mesh rotation={[0.55, 0.4, 0]}>
        <torusGeometry args={[1.55, 0.015, 8, 64]} />
        <meshBasicMaterial color={0x3a4a70} transparent opacity={0.55} />
      </mesh>
      <mesh ref={electronRef}>
        <sphereGeometry args={[0.09, 14, 12]} />
        <meshStandardMaterial color={0x5eead4} emissive={0x2dd4bf} emissiveIntensity={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}
