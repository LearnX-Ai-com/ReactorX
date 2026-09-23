import { useFrame, useThree } from '@react-three/fiber';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { ELEMENTS } from '../chemistry/elements';
import type { ElementSymbol } from '../chemistry/types';
import { ease, fibonacciSphere } from './math';
import { attachOrbitControls, type CameraOrbitState } from './orbitControls';

export type BohrParticleKind = 'proton' | 'neutron' | 'electron' | 'shell';

export interface BohrSceneState {
  mode: 'atom' | 'particle' | 'quark';
  type?: BohrParticleKind;
  isGhost?: boolean;
  shellIndex?: number;
  isValence?: boolean;
  electronCount?: number;
  letter?: string;
  nucleonType?: 'proton' | 'neutron';
}

export interface JumpResult {
  kind: 'emit' | 'absorb';
  fromLetter: string;
  toLetter: string;
}

export interface BohrAtomHandle {
  clearSelection(): void;
  enterQuark(nucleonType: 'proton' | 'neutron'): void;
  exitQuark(): void;
  /** Animates the currently-selected electron jumping to an adjacent shell
   * and back, with a photon particle firing out (emission, dropping to an
   * inner shell) or in (absorption, rising to an outer shell) — a visual
   * demonstration of E=hν, not a permanent change to the atom's electron
   * configuration. Returns what it did (for the caller to narrate in sync),
   * or null if nothing is selected/there's no adjacent shell to jump to. */
  triggerJump(): JumpResult | null;
}

// Shared with the React layer so on-screen/spoken narration can be timed to
// match the animation instead of guessing at durations independently.
// Deliberately slow-motion — the point is for a student to actually be able
// to track what's happening, not to look fast/twitchy.
export const JUMP_OUT_MS = 1400;
export const JUMP_HOLD_MS = 800;
export const JUMP_BACK_MS = 1400;
export const PHOTON_MS = 1600;

const SHELL_LETTERS = ['K', 'L', 'M', 'N'];
const GLOW_COLOR: Record<BohrParticleKind, number> = {
  proton: 0xf5a524, neutron: 0xaeb9d4, electron: 0x2dd4bf, shell: 0x2dd4bf,
};

// Shared template materials, cloned per particle so isolate-mode can dim
// siblings without affecting every atom on the page.
const protonMat = new THREE.MeshStandardMaterial({ color: 0xf5a524, roughness: 0.4, metalness: 0.1 });
const neutronMat = new THREE.MeshStandardMaterial({ color: 0x7c8aae, roughness: 0.4, metalness: 0.1 });
const electronMat = new THREE.MeshStandardMaterial({ color: 0x5eead4, emissive: 0x2dd4bf, emissiveIntensity: 0.7, roughness: 0.3 });
const ringMat = new THREE.MeshBasicMaterial({ color: 0x3a4a70, transparent: true, opacity: 0.55 });
const upQuarkMat = new THREE.MeshStandardMaterial({ color: 0x5eead4, emissive: 0x0e7b70, emissiveIntensity: 0.5 });
const downQuarkMat = new THREE.MeshStandardMaterial({ color: 0xf5a524, emissive: 0x7a4a0a, emissiveIntensity: 0.5 });
const gluonMat = new THREE.LineBasicMaterial({ color: 0xb072ff, transparent: true, opacity: 0.55 });

// A photon rendered as a wavy wave-packet trail (tapered sine ribbon) with a
// bright leading dot — reads as "a wave of light", not just a moving ball.
// Built once as a static local-space shape (tail at local -X, head at local
// origin) and reused: each photon just translates/rotates this rigid shape
// along its travel path rather than regenerating geometry every frame.
const PHOTON_WAVE_LENGTH = 0.9;
const photonWaveCurve = new THREE.CatmullRomCurve3(
  Array.from({ length: 21 }, (_, i) => {
    const t = i / 20;
    const x = -PHOTON_WAVE_LENGTH * (1 - t);
    const y = Math.sin(t * Math.PI * 3) * 0.12 * Math.sin(t * Math.PI); // tapers to 0 at both ends
    return new THREE.Vector3(x, y, 0);
  }),
);
const photonWaveGeo = new THREE.TubeGeometry(photonWaveCurve, 40, 0.025, 8, false);
const photonHeadGeo = new THREE.SphereGeometry(0.09, 14, 12);

interface ParticleEntry {
  mesh: THREE.Mesh;
  mat: THREE.Material & { color?: THREE.Color; emissive?: THREE.Color; emissiveIntensity?: number; opacity?: number };
  type: BohrParticleKind;
  isGhost: boolean;
  baseEmissiveIntensity: number;
  baseEmissiveColor: number;
  baseOpacity: number;
  baseColor: number | null;
  glowColor: number;
  isRing?: boolean;
  shellIndex?: number;
  isValence?: boolean;
  electronCount?: number;
  groupKey?: string;
  letter?: string;
}

interface ShellDatum {
  radius: number;
  speed: number;
  electrons: { mesh: THREE.Mesh; angle0: number }[];
}

interface JumpAnim {
  mesh: THREE.Mesh;
  fromRadius: number;
  toRadius: number;
  start: number;
}

interface PhotonAnim {
  group: THREE.Group;
  headMat: THREE.MeshBasicMaterial;
  tailMat: THREE.MeshBasicMaterial;
  from: THREE.Vector3;
  to: THREE.Vector3;
  start: number;
}

interface CamTween {
  fromRadius: number;
  toRadius: number;
  start: number;
  duration: number;
}

interface BohrAtomModelProps {
  symbol: ElementSymbol;
  onStateChange?: (state: BohrSceneState) => void;
  /**
   * false when this atom is a passive preview living on a room wall
   * (see PeriodicTableRoom/ElementsRoom) rather than the sole focus of the
   * screen: skips claiming the shared camera and attaching its own
   * drag-to-orbit/tap-to-select controls, since the room's own look
   * controls own the canvas in that mode. The atom still idly rotates and
   * renders normally — it just isn't individually interactive. Defaults to
   * true (today's standalone full-screen inspection behavior).
   */
  driveCamera?: boolean;
  /** World-space offset for this atom's root group — lets it sit on a
   * specific room wall instead of always at the origin. */
  roomOffset?: [number, number, number];
}

/**
 * A self-contained 3D Bohr model of one element, built with imperative
 * three.js (nucleon/shell/electron counts, click-to-inspect, quark
 * drill-down) inside an R3F scene graph — R3F supplies the renderer, camera
 * lifecycle and resize handling; the interaction model here mirrors the
 * original chamber's per-particle isolate/zoom/quark-drill-down behavior.
 */
export const BohrAtomModel = forwardRef<BohrAtomHandle, BohrAtomModelProps>(function BohrAtomModel(
  { symbol, onStateChange, driveCamera = true, roomOffset },
  ref,
) {
  const { scene, camera, gl } = useThree();
  const apiRef = useRef<BohrAtomHandle>({
    clearSelection() {}, enterQuark() {}, exitQuark() {}, triggerJump: () => null,
  });

  useImperativeHandle(ref, () => ({
    clearSelection: () => apiRef.current.clearSelection(),
    enterQuark: (nucleonType) => apiRef.current.enterQuark(nucleonType),
    exitQuark: () => apiRef.current.exitQuark(),
    triggerJump: () => apiRef.current.triggerJump(),
  }), []);

  // Mutable, per-symbol scene state shared between the setup effect and the
  // per-frame update below.
  const camStateRef = useRef<CameraOrbitState>({ theta: 0.5, phi: 1.33, radius: 10 });
  const camTargetRef = useRef(new THREE.Vector3());
  const distRef = useRef(10);
  const shellDataRef = useRef<ShellDatum[]>([]);
  const selectedRef = useRef<ParticleEntry | null>(null);
  const quarkNucleonRef = useRef<'proton' | 'neutron' | null>(null);
  const camTweenRef = useRef<CamTween | null>(null);
  const atomGroupRef = useRef(new THREE.Group());
  const quarkGroupRef = useRef(new THREE.Group());
  const jumpRef = useRef<JumpAnim | null>(null);
  const photonsRef = useRef<PhotonAnim[]>([]);

  useEffect(() => {
    let cancelled = false;
    const el = ELEMENTS[symbol];
    // This scene may share a Canvas with other views (the hub, the chamber)
    // that set a different fov — pin it explicitly rather than trusting
    // whatever the Canvas happened to be created with. The distance math
    // below assumes exactly this fov (21 == fov/2). Skipped entirely in
    // room mode: the room's own first-person camera owns fov/position, and
    // this atom is just one more object sitting in its scene.
    if (driveCamera) {
      const perspectiveCamera = camera as THREE.PerspectiveCamera;
      perspectiveCamera.fov = 42;
      perspectiveCamera.near = 0.1;
      perspectiveCamera.far = 60;
      perspectiveCamera.updateProjectionMatrix();
    }
    // Superheavy elements (Z>103) have no settled isotope data — fall back
    // to 0 rather than showing a fabricated neutron count.
    const neutronCount = el.neutrons ?? 0;
    const total = el.number + neutronCount;
    // A fresh group every run (not a persisted ref) — this effect re-runs on
    // every symbol change, and reusing one long-lived group across runs left
    // the previous element's nucleus/shells/lights parented under it forever
    // (nothing ever removed them, so switching elements just kept adding to it).
    const root = new THREE.Group();
    if (roomOffset) root.position.set(...roomOffset);
    const atomGroup = new THREE.Group();
    const quarkGroup = new THREE.Group();
    quarkGroup.visible = false;
    root.add(atomGroup, quarkGroup);
    atomGroupRef.current = atomGroup;
    quarkGroupRef.current = quarkGroup;
    scene.add(root);

    root.add(new THREE.AmbientLight(0x445577, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 1);
    key.position.set(3, 4, 5);
    root.add(key);

    // Distance scales with this element's outermost shell so a 1-shell atom
    // (H) fills the frame as tightly as a 4-shell one (Fe).
    const maxRadius = 1.35 + (el.shells.length - 1) * 0.85 + 0.3;
    const dist = (maxRadius * 1.25) / Math.tan((21 * Math.PI) / 180);
    const minR = dist * 0.35;
    const maxR = dist * 2.5;
    distRef.current = dist;
    camStateRef.current = { theta: 0.5, phi: 1.33, radius: dist };
    // Aim slightly above the atom's true center so the outer shell's arc
    // doesn't reach up behind a fixed header above the viewport.
    camTargetRef.current = new THREE.Vector3(0, maxRadius * 0.22, 0);

    const particles: ParticleEntry[] = [];
    function makeParticle(
      templateMat: THREE.Material,
      geometry: THREE.BufferGeometry,
      type: BohrParticleKind,
      isGhost: boolean,
      extra?: Partial<ParticleEntry> & { colorOverride?: number },
    ): THREE.Mesh {
      const mat = templateMat.clone() as ParticleEntry['mat'];
      mat.transparent = true;
      if (extra?.colorOverride != null && mat.color) mat.color.setHex(extra.colorOverride);
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.userData.particleType = type;
      mesh.userData.isGhost = isGhost;
      const entry: ParticleEntry = {
        mesh, mat, type, isGhost,
        baseEmissiveIntensity: mat.emissiveIntensity ?? 0,
        baseEmissiveColor: mat.emissive ? mat.emissive.getHex() : 0x000000,
        baseOpacity: mat.opacity ?? 1,
        baseColor: mat.color ? mat.color.getHex() : null,
        glowColor: GLOW_COLOR[type],
        ...extra,
      };
      particles.push(entry);
      return mesh;
    }

    const nucleusGroup = new THREE.Group();
    {
      // Every nucleon is individually clickable, light elements and heavy
      // ones alike — pack radius and sphere size both scale with the count
      // so a 56-nucleon iron nucleus doesn't turn into an unreadable mass.
      const packRadius = 0.45 + Math.min(0.5, (total - 1) * 0.012);
      const sphereRadius = Math.max(0.11, 0.22 - Math.max(0, total - 16) * 0.0025);
      let p = el.number;
      let n = neutronCount;
      let i = 0;
      const positions = fibonacciSphere(total, packRadius);
      while (p > 0 || n > 0) {
        const isProton = (i % 2 === 0 && p > 0) || n === 0;
        if (isProton) p--; else n--;
        const mesh = makeParticle(isProton ? protonMat : neutronMat, new THREE.SphereGeometry(sphereRadius, 14, 12), isProton ? 'proton' : 'neutron', false);
        mesh.position.copy(positions[i]);
        nucleusGroup.add(mesh);
        i++;
      }
      // Hydrogen-1 has no neutron at all — a dashed "ghost" sphere marks the
      // absence itself as something worth clicking, rather than omitting it.
      if (neutronCount === 0) {
        const ghostMat = new THREE.MeshStandardMaterial({ color: 0x7c8aae, wireframe: true, transparent: true, opacity: 0.55, roughness: 0.6 });
        const ghost = makeParticle(ghostMat, new THREE.SphereGeometry(sphereRadius, 10, 8), 'neutron', true);
        ghost.position.set(-packRadius, 0, 0);
        nucleusGroup.add(ghost);
      }
    }
    atomGroup.add(nucleusGroup);

    const shellData: ShellDatum[] = [];
    el.shells.forEach((count, i) => {
      const radius = 1.35 + i * 0.85;
      const isValence = i === el.shells.length - 1;
      const groupKey = `shell-${i}`;
      const shellGroup = new THREE.Group();
      shellGroup.rotation.x = 0.5 + i * 0.85;
      shellGroup.rotation.y = i * 0.55;

      // The ring itself is clickable too — resting color hints which ring
      // is the valence shell before you even click it.
      const ring = makeParticle(ringMat, new THREE.TorusGeometry(radius, 0.02, 8, 64), 'shell', false, {
        isRing: true, shellIndex: i, isValence, electronCount: count, groupKey,
        letter: SHELL_LETTERS[i] || `#${i + 1}`, colorOverride: isValence ? 0x4a6fa5 : undefined,
      });
      shellGroup.add(ring);
      // The ring is deliberately razor-thin to look right, which makes it a
      // frustratingly small tap target — a much fatter invisible torus sits
      // on top purely as a bigger hit area.
      const ringHitTarget = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.22, 8, 48),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      ringHitTarget.userData.hitProxy = ring;
      shellGroup.add(ringHitTarget);

      const electrons: ShellDatum['electrons'] = [];
      for (let j = 0; j < count; j++) {
        const mesh = makeParticle(electronMat, new THREE.SphereGeometry(0.11, 12, 10), 'electron', false, { groupKey, shellIndex: i });
        shellGroup.add(mesh);
        electrons.push({ mesh, angle0: (j / count) * Math.PI * 2 });
      }
      atomGroup.add(shellGroup);
      shellData.push({ radius, speed: 0.5 / (i + 1) + 0.12, electrons });
    });
    shellDataRef.current = shellData;

    /* ---------- selection / isolate / camera zoom / quark drill-down ---------- */

    function tweenRadiusTo(target: number, duration?: number): void {
      camTweenRef.current = { fromRadius: camStateRef.current.radius, toRadius: target, start: performance.now(), duration: duration ?? 600 };
    }

    function applyIsolate(): void {
      const selected = selectedRef.current;
      particles.forEach((p) => {
        const show = !selected ? true
          : selected.type === 'shell' ? p.groupKey === selected.groupKey
            : p.mesh === selected.mesh;
        if (p.isRing) {
          p.mat.opacity = selected ? (show ? 1 : 0.12) : p.baseOpacity;
          p.mat.color?.setHex(show && selected ? 0x2dd4bf : (p.baseColor ?? 0x000000));
        } else {
          p.mat.opacity = selected ? (show ? 1 : 0.15) : 1;
          if (show && selected) {
            p.mat.emissive?.setHex(p.glowColor);
          } else {
            p.mat.emissive?.setHex(p.baseEmissiveColor);
            if (p.mat.emissiveIntensity != null) p.mat.emissiveIntensity = p.baseEmissiveIntensity;
          }
        }
      });
    }

    function selectParticle(mesh: THREE.Object3D): void {
      const entry = particles.find((p) => p.mesh === mesh);
      if (!entry) return;
      selectedRef.current = entry;
      applyIsolate();
      const target = entry.type === 'electron' ? distRef.current * 0.65
        : entry.type === 'shell' ? Math.min(distRef.current, Math.max(minR, (entry.mesh.geometry as THREE.TorusGeometry).parameters.radius * 2.3))
          : minR * 1.05;
      tweenRadiusTo(target);
      onStateChange?.({
        mode: 'particle', type: entry.type, isGhost: entry.isGhost,
        shellIndex: entry.shellIndex, isValence: entry.isValence, electronCount: entry.electronCount, letter: entry.letter,
      });
    }

    function clearSelection(): void {
      if (quarkNucleonRef.current) {
        exitQuarkInternal();
        return;
      }
      selectedRef.current = null;
      applyIsolate();
      tweenRadiusTo(distRef.current);
      onStateChange?.({ mode: 'atom' });
    }

    function buildQuarkChildren(nucleonType: 'proton' | 'neutron'): void {
      while (quarkGroup.children.length) quarkGroup.remove(quarkGroup.children[0]);
      const defs: [string, THREE.Material, number][] = nucleonType === 'proton'
        ? [['u', upQuarkMat, 0], ['u', upQuarkMat, 2.094], ['d', downQuarkMat, 4.189]]
        : [['d', downQuarkMat, 0], ['d', downQuarkMat, 2.094], ['u', upQuarkMat, 4.189]];
      const pts = defs.map(([, mat, angle]) => {
        const pos = new THREE.Vector3(0.5 * Math.cos(angle), 0.5 * Math.sin(angle), 0);
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 16), mat);
        m.position.copy(pos);
        quarkGroup.add(m);
        return pos;
      });
      const lineGeo = new THREE.BufferGeometry().setFromPoints([pts[0], pts[1], pts[1], pts[2], pts[2], pts[0]]);
      quarkGroup.add(new THREE.LineSegments(lineGeo, gluonMat));
    }

    function enterQuark(nucleonType: 'proton' | 'neutron'): void {
      quarkNucleonRef.current = nucleonType;
      buildQuarkChildren(nucleonType);
      atomGroup.visible = false;
      quarkGroup.visible = true;
      tweenRadiusTo(2.4, 500);
      onStateChange?.({ mode: 'quark', nucleonType });
    }

    function exitQuarkInternal(): void {
      quarkNucleonRef.current = null;
      quarkGroup.visible = false;
      atomGroup.visible = true;
      const selected = selectedRef.current;
      const target = selected ? (selected.type === 'electron' ? distRef.current * 0.65 : minR * 1.05) : distRef.current;
      tweenRadiusTo(target, 500);
      onStateChange?.(selected ? { mode: 'particle', type: selected.type, isGhost: selected.isGhost } : { mode: 'atom' });
    }

    function spawnPhoton(from: THREE.Vector3, to: THREE.Vector3): void {
      const dir = to.clone().sub(from).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);

      const tailMat = new THREE.MeshBasicMaterial({ color: 0xf5c56a, transparent: true, opacity: 0.9 });
      const tailMesh = new THREE.Mesh(photonWaveGeo, tailMat);
      const headMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 1 });
      const headMesh = new THREE.Mesh(photonHeadGeo, headMat);

      const group = new THREE.Group();
      group.quaternion.copy(quat);
      group.add(tailMesh, headMesh);
      group.position.copy(from);
      atomGroup.add(group);

      photonsRef.current.push({ group, headMat, tailMat, from: from.clone(), to: to.clone(), start: performance.now() });
    }

    function triggerJump(): JumpResult | null {
      const selected = selectedRef.current;
      if (!selected || selected.type !== 'electron' || jumpRef.current) return null;
      const fromIndex = selected.shellIndex;
      if (fromIndex == null) return null;
      const shells = shellDataRef.current;
      const canDrop = fromIndex > 0;
      const canRise = fromIndex < shells.length - 1;
      // Prefer dropping (emission) when possible — a simplified stand-in for
      // "electrons settle toward the lowest available energy state" — and
      // fall back to absorption only when already in the innermost shell.
      const toIndex = canDrop ? fromIndex - 1 : canRise ? fromIndex + 1 : null;
      if (toIndex == null) return null;
      const kind: JumpResult['kind'] = canDrop ? 'emit' : 'absorb';

      const fromRadius = shells[fromIndex].radius;
      const toRadius = shells[toIndex].radius;
      jumpRef.current = { mesh: selected.mesh, fromRadius, toRadius, start: performance.now() };

      // Push in tighter than a plain selection does — an isolated, close-up
      // shot of just this electron and the gap it's crossing, rather than
      // the whole atom — then ease back out once the demo finishes.
      const jumpZoomTarget = Math.max(minR * 1.3, Math.max(fromRadius, toRadius) * 1.7);
      tweenRadiusTo(jumpZoomTarget, JUMP_OUT_MS * 0.8);
      window.setTimeout(() => {
        if (cancelled) return;
        tweenRadiusTo(distRef.current * 0.65, JUMP_BACK_MS * 0.6);
      }, JUMP_OUT_MS + JUMP_HOLD_MS + JUMP_BACK_MS * 0.3);

      const worldPos = new THREE.Vector3();
      selected.mesh.getWorldPosition(worldPos);
      const localPos = atomGroup.worldToLocal(worldPos.clone());
      const radial = localPos.clone().normalize();
      if (kind === 'emit') {
        // Photon fires once the electron has actually arrived at the inner
        // shell — guarded by `cancelled` in case the symbol changes (and
        // this whole scene gets torn down) before that timer fires.
        window.setTimeout(() => {
          if (cancelled) return;
          const innerPos = radial.clone().multiplyScalar(toRadius);
          const outerPos = radial.clone().multiplyScalar(toRadius + 2.6);
          spawnPhoton(innerPos, outerPos);
        }, JUMP_OUT_MS);
      } else {
        // Photon arrives from outside just as the electron rises to meet it.
        const outerPos = radial.clone().multiplyScalar(toRadius + 2.6);
        const targetPos = radial.clone().multiplyScalar(toRadius);
        spawnPhoton(outerPos, targetPos);
      }

      return { kind, fromLetter: SHELL_LETTERS[fromIndex] || `#${fromIndex + 1}`, toLetter: SHELL_LETTERS[toIndex] || `#${toIndex + 1}` };
    }

    apiRef.current = { clearSelection, enterQuark, exitQuark: exitQuarkInternal, triggerJump };

    function handleTap(clientX: number, clientY: number): void {
      if (quarkNucleonRef.current) return; // quark view only exits via its own back button
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(atomGroup.children, true);
      // Electrons orbit exactly on their shell's ring, and the ring's fat
      // invisible hit-target (added so the razor-thin ring itself is easier
      // to tap) bulges toward the camera further than a small electron
      // sphere does — so the nearest raycast hit is very often the ring
      // proxy even when the click was really on an electron. A direct
      // particle hit (proton/neutron/electron) always wins over the ring's
      // proxy target, regardless of which one the raycaster found first.
      const directHit = hits.find((h) => h.object.userData?.particleType && !h.object.userData.hitProxy);
      const hit = directHit ?? hits.find((h) => h.object.userData && (h.object.userData.particleType || h.object.userData.hitProxy));
      if (hit) {
        const proxy = hit.object.userData.hitProxy as THREE.Object3D | undefined;
        selectParticle(proxy ?? hit.object);
      } else {
        clearSelection();
      }
    }

    const detachControls = driveCamera
      ? attachOrbitControls(gl.domElement, camStateRef.current, minR, maxR, handleTap)
      : null;

    return () => {
      cancelled = true;
      detachControls?.();
      scene.remove(root);
      particles.forEach((p) => {
        p.mesh.geometry.dispose();
        p.mat.dispose();
      });
      quarkGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.geometry.dispose();
      });
      // A jump/photon animation is short-lived, but if the symbol changes
      // mid-flight the meshes it references belong to the atomGroup we're
      // tearing down right here — drop them rather than leaking materials.
      jumpRef.current = null;
      photonsRef.current.forEach((ph) => { ph.headMat.dispose(); ph.tailMat.dispose(); });
      photonsRef.current = [];
    };
    // gl/scene/camera are stable for the lifetime of a given <Canvas>;
    // roomOffset is a fixed tuple per call site, not meant to be reactive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, onStateChange, driveCamera]);

  useFrame((_, dt) => {
    const now = performance.now();
    const camTween = camTweenRef.current;
    const camState = camStateRef.current;
    if (camTween) {
      const p = ease(Math.min(1, (now - camTween.start) / camTween.duration));
      camState.radius = camTween.fromRadius + (camTween.toRadius - camTween.fromRadius) * p;
      if (p >= 1) camTweenRef.current = null;
    }
    // Ambient spin pauses once something is selected, so the highlighted
    // particle doesn't rotate out of frame while its info panel is open.
    if (!selectedRef.current && !quarkNucleonRef.current) atomGroupRef.current.rotation.y += 0.12 * dt;
    quarkGroupRef.current.rotation.y += 0.18 * dt;
    const jump = jumpRef.current;
    shellDataRef.current.forEach((s) => {
      s.electrons.forEach((e) => {
        const a = e.angle0 + now * 0.001 * s.speed;
        let radius = s.radius;
        if (jump && jump.mesh === e.mesh) {
          const t = now - jump.start;
          const total = JUMP_OUT_MS + JUMP_HOLD_MS + JUMP_BACK_MS;
          if (t >= total) {
            jumpRef.current = null;
          } else if (t < JUMP_OUT_MS) {
            radius = jump.fromRadius + (jump.toRadius - jump.fromRadius) * ease(t / JUMP_OUT_MS);
          } else if (t < JUMP_OUT_MS + JUMP_HOLD_MS) {
            radius = jump.toRadius;
          } else {
            const bt = (t - JUMP_OUT_MS - JUMP_HOLD_MS) / JUMP_BACK_MS;
            radius = jump.toRadius + (jump.fromRadius - jump.toRadius) * ease(bt);
          }
        }
        e.mesh.position.set(radius * Math.cos(a), radius * Math.sin(a), 0);
      });
    });
    for (let i = photonsRef.current.length - 1; i >= 0; i--) {
      const ph = photonsRef.current[i];
      const t = (now - ph.start) / PHOTON_MS;
      if (t >= 1) {
        atomGroupRef.current.remove(ph.group);
        ph.headMat.dispose();
        ph.tailMat.dispose();
        photonsRef.current.splice(i, 1);
        continue;
      }
      ph.group.position.lerpVectors(ph.from, ph.to, ease(t));
      const fade = t < 0.15 ? t / 0.15 : 1 - Math.max(0, (t - 0.7) / 0.3);
      ph.headMat.opacity = fade;
      ph.tailMat.opacity = fade * 0.85;
    }
    const selected = selectedRef.current;
    if (selected) {
      const pulse = 0.6 + 0.4 * Math.sin(now * 0.006);
      if (selected.isRing) selected.mat.opacity = 0.7 + 0.3 * pulse;
      else if (selected.mat.emissiveIntensity != null) selected.mat.emissiveIntensity = (selected.type === 'electron' ? 1.1 : 0.9) * pulse;
    }
    if (driveCamera) {
      const camTarget = camTargetRef.current;
      camera.position.set(
        camTarget.x + camState.radius * Math.sin(camState.phi) * Math.sin(camState.theta),
        camTarget.y + camState.radius * Math.cos(camState.phi),
        camTarget.z + camState.radius * Math.sin(camState.phi) * Math.cos(camState.theta),
      );
      camera.lookAt(camTarget);
    }
  });

  return null;
});

// No standalone Canvas wrapper here (unlike earlier versions of this file) —
// BohrAtomModel is mounted directly inside the app's single shared
// <AppCanvas> alongside whichever other view is active, so a WebXR session
// (or just Ion) can persist across navigation instead of resetting per view.
