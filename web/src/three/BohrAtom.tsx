import { useFrame, useThree } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { ionChargeRange } from '../chemistry/bonds';
import { ELEMENTS } from '../chemistry/elements';
import { formatIonLabel } from '../chemistry/formulas';
import type { ElementSymbol } from '../chemistry/types';
import { ease, fibonacciSphere } from './math';
import { attachOrbitControls, type CameraOrbitState } from './orbitControls';
import { makeDotSprite, makeDotTexture, makeSignSprite } from './signSprite';

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
  /** Restores every electron dragged off in Ionize mode and resets the net
   * charge back to 0 — a manual undo, since ionizing is otherwise one-way. */
  resetIons(): void;
  /** Adds one electron to the valence shell (anion formation) — the
   * counterpart to dragging one off. Gated by the element's own realistic
   * charge range (ionChargeRange in chemistry/bonds.ts), same as dragging
   * one out is, and a no-op if nothing is at that limit or an animation is
   * already in flight. */
  addElectron(): void;
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
  electrons: { mesh: THREE.Mesh; angle0: number; removed?: boolean }[];
  /** The shell's own THREE.Group — kept so Ionize mode's "+ electron" can
   * parent a freshly-created electron into the right shell after the
   * initial build, not just during it. */
  group: THREE.Group;
}

/** Ionize-mode drag/animation state — a single active one at a time: an
 * electron being dragged outward, one springing back after a release that
 * didn't reach the threshold, one fading out after a release that did, or
 * a freshly added one growing in (see the "+ electron" button). Not used
 * outside 'ionize' view mode. */
interface PullState {
  mesh: THREE.Mesh;
  shellIndex: number;
  shellRadius: number;
  phase: 'dragging' | 'snapping' | 'fading' | 'growing';
  /** 0 (resting on its shell) to 1 (fully pulled — releasing here ionizes).
   * Derived from how far (x, y) below has ended up from the nucleus,
   * relative to PULL_RANGE — not from raw screen-pixel drag distance, so
   * it stays correct regardless of camera zoom. */
  t: number;
  /** Live world-space position (on the flat Z=0 plane every shell/electron
   * lives on in Ionize mode) the electron is currently drawn at — while
   * dragging this is a direct ray/plane intersection under the pointer, so
   * the electron follows the cursor exactly rather than just tracking pull
   * magnitude along its original angle. */
  x: number;
  y: number;
  transitionStart?: number;
  /** (x, y) captured at release, snapping/fading continue from here. */
  releaseX?: number;
  releaseY?: number;
}
const PULL_RANGE = 1.1;

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

// Lewis-dot layout: standard textbook filling order — one dot per side
// (top/right/bottom/left) for the first 4 valence electrons, then a second
// dot paired onto each side in the same order for electrons 5-8. Only
// s/p-block valence counts (<=8) are meaningful in this notation — Lewis
// structures aren't taught for transition metals in the first place, so
// anything past 8 is simply capped rather than guessed at.
const LEWIS_SIDES: { dir: [number, number]; spread: [number, number] }[] = [
  { dir: [0, 1], spread: [1, 0] }, // top
  { dir: [1, 0], spread: [0, 1] }, // right
  { dir: [0, -1], spread: [1, 0] }, // bottom
  { dir: [-1, 0], spread: [0, 1] }, // left
];
const LEWIS_SIDE_DIST = 0.85;
const LEWIS_PAIR_GAP = 0.16;
const LEWIS_MAX_RADIUS = 1.4;

function buildLewisDiagram(atomGroup: THREE.Group, symbol: string, valence: number): THREE.Sprite[] {
  const symbolSprite = makeSignSprite(symbol, '#e8edf7');
  atomGroup.add(symbolSprite);
  const sprites = [symbolSprite];

  const dotCount = Math.min(valence, 8);
  const perSide = [0, 0, 0, 0];
  for (let i = 0; i < dotCount; i++) perSide[i % 4] += 1;

  LEWIS_SIDES.forEach((side, sideIndex) => {
    const n = perSide[sideIndex];
    for (let k = 0; k < n; k++) {
      const offset = n === 1 ? 0 : (k === 0 ? -1 : 1) * LEWIS_PAIR_GAP;
      const dot = makeDotSprite('#5eead4');
      dot.position.set(
        side.dir[0] * LEWIS_SIDE_DIST + side.spread[0] * offset,
        side.dir[1] * LEWIS_SIDE_DIST + side.spread[1] * offset,
        0,
      );
      atomGroup.add(dot);
      sprites.push(dot);
    }
  });

  return sprites;
}

interface CloudShell {
  group: THREE.Group;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  /** Slow drift speed for this shell's cloud — see the per-frame update in
   * the component below. Deliberately not orbital motion (a fixed angle per
   * point, like the Bohr rings use): a probability cloud reads as "a fuzzy
   * region," not "particles on a track", so the whole shell drifts instead
   * of individual points circling. */
  speed: number;
}

const CLOUD_POINTS_BASE = 50;
const CLOUD_POINTS_PER_ELECTRON = 22;
const CLOUD_THICKNESS = 0.4;

/** Quantum-cloud view: each shell becomes a scattered point cloud filling a
 * spherical shell (radius ± thickness) instead of a ring with electrons on
 * fixed orbits — "electrons are a probability region," not marbles on a
 * track. Point count scales mildly with electron count (denser shells read
 * as more occupied) without being a literal one-point-per-electron count,
 * since a probability cloud is a density field, not discrete markers. */
function buildQuantumCloud(atomGroup: THREE.Group, shells: number[], dotTexture: THREE.Texture): CloudShell[] {
  return shells.map((count, i) => {
    const radius = 1.35 + i * 0.85;
    const isValence = i === shells.length - 1;
    const pointCount = CLOUD_POINTS_BASE + count * CLOUD_POINTS_PER_ELECTRON;
    const positions = new Float32Array(pointCount * 3);
    for (let p = 0; p < pointCount; p++) {
      const r = radius + (Math.random() - 0.5) * 2 * CLOUD_THICKNESS;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      positions[p * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[p * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[p * 3 + 2] = r * Math.cos(phi);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      map: dotTexture,
      color: isValence ? 0x5eead4 : 0x2dd4bf,
      size: 0.09,
      transparent: true,
      opacity: isValence ? 0.85 : 0.5,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const group = new THREE.Group();
    group.add(new THREE.Points(geometry, material));
    atomGroup.add(group);
    return { group, geometry, material, speed: 0.05 / (i + 1) + 0.015 };
  });
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
  /** Uniform scale applied to the root group — an atom's natural footprint
   * (maxRadius below) varies a lot by shell count, so a room wall passes a
   * per-symbol scale to keep every element filling a consistent amount of
   * wall space instead of light elements looking tiny next to heavy ones. */
  roomScale?: number;
  /** 'bohr' (default): the full nucleus+shells model, unchanged. 'cloud':
   * same nucleus, but each shell is a scattered probability-cloud point
   * field instead of a ring with electrons on fixed orbits. 'lewis': a
   * flat Lewis-dot diagram (symbol + valence-electron dots) instead — a
   * distinct notation with no physical nucleus/shells at all. 'ionize':
   * the same nucleus+shells model as 'bohr', but single-finger drag pulls
   * an electron off instead of orbiting the camera — its own tab so that
   * gesture never has to be disambiguated from ordinary orbit-drag (see
   * attachIonizeControls below). */
  viewMode?: 'bohr' | 'cloud' | 'lewis' | 'ionize';
  /** Fires whenever net charge changes in Ionize mode (electrons pulled
   * off, or resetIons() called) — a cation label is the caller's job. */
  onChargeChange?: (charge: number) => void;
}

/**
 * A self-contained 3D Bohr model of one element, built with imperative
 * three.js (nucleon/shell/electron counts, click-to-inspect, quark
 * drill-down) inside an R3F scene graph — R3F supplies the renderer, camera
 * lifecycle and resize handling; the interaction model here mirrors the
 * original chamber's per-particle isolate/zoom/quark-drill-down behavior.
 */
export const BohrAtomModel = forwardRef<BohrAtomHandle, BohrAtomModelProps>(function BohrAtomModel(
  { symbol, onStateChange, driveCamera = true, roomOffset, roomScale, viewMode = 'bohr', onChargeChange },
  ref,
) {
  const { scene, camera, gl } = useThree();
  const apiRef = useRef<BohrAtomHandle>({
    clearSelection() {}, enterQuark() {}, exitQuark() {}, triggerJump: () => null, resetIons() {}, addElectron() {},
  });

  useImperativeHandle(ref, () => ({
    clearSelection: () => apiRef.current.clearSelection(),
    enterQuark: (nucleonType) => apiRef.current.enterQuark(nucleonType),
    exitQuark: () => apiRef.current.exitQuark(),
    triggerJump: () => apiRef.current.triggerJump(),
    resetIons: () => apiRef.current.resetIons(),
    addElectron: () => apiRef.current.addElectron(),
  }), []);

  // Mutable, per-symbol scene state shared between the setup effect and the
  // per-frame update below.
  const camStateRef = useRef<CameraOrbitState>({ theta: 0.5, phi: 1.33, radius: 10 });
  const camTargetRef = useRef(new THREE.Vector3());
  const distRef = useRef(10);
  const shellDataRef = useRef<ShellDatum[]>([]);
  const cloudShellsRef = useRef<CloudShell[]>([]);
  const pullRef = useRef<PullState | null>(null);
  const chargeRef = useRef(0);
  // Ionize mode only: freezes every electron's orbital motion for the
  // duration of a pointer hold, so a small, otherwise-constantly-moving
  // target isn't also fighting the student's attempt to tap/drag it —
  // pausedAt/pauseAccum implement a standard pausable clock (see
  // attachIonizeControls' pauseOrbit/resumeOrbit below), not a boolean
  // flag, so resuming continues each electron's orbit from exactly where
  // it froze rather than jumping ahead by however long the hold lasted.
  const orbitPauseRef = useRef<{ pausedAt: number | null; pauseAccum: number }>({ pausedAt: null, pauseAccum: 0 });
  const chargeLabelRef = useRef<THREE.Sprite | null>(null);
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
    // selectedRef/quarkNucleonRef persist across effect re-runs (they're
    // plain component refs, not effect-local state) — reset them on every
    // rebuild so a selection made before a symbol or view-mode switch can't
    // linger and reference a mesh this run just disposed. Most reachable
    // via the new Bohr/Lewis toggle: select an electron, then switch to
    // Lewis (which has nothing selectable), and the info panel/jump button
    // would otherwise still think that stale electron were selected.
    selectedRef.current = null;
    quarkNucleonRef.current = null;
    pullRef.current = null;
    chargeRef.current = 0;
    onStateChange?.({ mode: 'atom' });
    onChargeChange?.(0);
    // This scene may share a Canvas with other views (the hub, the chamber,
    // the elements room) that set a different fov/fog/background — pin all
    // of it explicitly rather than trusting whatever the Canvas happened to
    // be left with. The distance math below assumes exactly this fov (21 ==
    // fov/2). Fog in particular has to be reset here: the elements room's
    // own fog range (Fog(..., 6, 16)) has nothing to do with this atom's own
    // camera distance, which scales with the element's shell count and
    // regularly exceeds 16 units for anything past ~5 shells — without
    // clearing it, a heavy element was already substantially fogged out at
    // rest and vanished well before reaching its intended zoom-out limit,
    // while a light element (whose distance stays under the stale fog's
    // range) looked unaffected — the inconsistent "H looks fine, heavy
    // elements disappear" framing this was reported as. Skipped entirely in
    // room mode: the room's own first-person camera and fog own the scene,
    // and this atom is just one more object sitting in it.
    if (driveCamera) {
      const perspectiveCamera = camera as THREE.PerspectiveCamera;
      perspectiveCamera.fov = 42;
      perspectiveCamera.near = 0.1;
      perspectiveCamera.far = 60;
      perspectiveCamera.updateProjectionMatrix();
      scene.background = new THREE.Color(0x0a0f1c);
      scene.fog = null;
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
    if (roomScale) root.scale.setScalar(roomScale);
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
    // (H) fills the frame as tightly as a 4-shell one (Fe). The Lewis
    // diagram's footprint doesn't depend on shell count at all (dot layout
    // is a fixed small cluster around the symbol), so it gets its own fixed
    // framing instead.
    const maxRadius = viewMode === 'lewis' ? LEWIS_MAX_RADIUS : 1.35 + (el.shells.length - 1) * 0.85 + 0.3;
    const dist = (maxRadius * 1.25) / Math.tan((21 * Math.PI) / 180);
    const minR = dist * 0.35;
    const maxR = dist * 2.5;
    distRef.current = dist;
    // The realistic charge range this element can actually reach, derived
    // from its own real oxidation states (see ionChargeRange) — oxygen's
    // max comes out 0 (no cation), iron's min comes out 0 (no anion), etc.
    // Gates both the drag-out threshold and the "+ electron" button below.
    const { min: minCharge, max: maxCharge } = ionChargeRange(symbol);
    if (viewMode === 'ionize') {
      // Straight-on rather than the angled 3/4 view the other modes use:
      // the camera never orbits here anyway (drag is reserved for pulling
      // electrons), so committing to a flat, dead-on framing — shells drawn
      // as concentric circles below, not tilted rings — reads far more
      // clearly as "a 2D diagram you drag on" than a fixed-but-still-3D
      // angle would, and lets the drag itself be a direct ray-plane
      // intersection instead of an indirect distance-only tug.
      camStateRef.current = { theta: 0, phi: Math.PI / 2, radius: dist };
      camTargetRef.current = new THREE.Vector3(0, 0, 0);
    } else {
      camStateRef.current = { theta: 0.5, phi: 1.33, radius: dist };
      // Aim slightly above the atom's true center so the outer shell's arc
      // doesn't reach up behind a fixed header above the viewport.
      camTargetRef.current = new THREE.Vector3(0, maxRadius * 0.22, 0);
    }

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

    let lewisSprites: THREE.Sprite[] = [];
    let cloudDotTexture: THREE.Texture | null = null;
    if (viewMode === 'lewis') {
      // A different notation entirely, not a camera trick on the same
      // model — no nucleus spheres, no shell rings, nothing selectable.
      // Interactivity (tap-to-select/jump/quark drill-down) all still
      // attaches below but harmlessly no-ops here since `particles` stays
      // empty and shellDataRef/cloudShellsRef stay empty.
      lewisSprites = buildLewisDiagram(atomGroup, symbol, el.valence);
      shellDataRef.current = [];
      cloudShellsRef.current = [];
    } else {
      // Nucleus is shared between 'bohr' and 'cloud' — only how the
      // electron shells render differs between those two.
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

      if (viewMode === 'cloud') {
        cloudDotTexture = makeDotTexture();
        cloudShellsRef.current = buildQuantumCloud(atomGroup, el.shells, cloudDotTexture);
        shellDataRef.current = [];
      } else {
        cloudShellsRef.current = [];
        const shellData: ShellDatum[] = [];
        el.shells.forEach((count, i) => {
          const radius = 1.35 + i * 0.85;
          const isValence = i === el.shells.length - 1;
          const groupKey = `shell-${i}`;
          const shellGroup = new THREE.Group();
          if (viewMode === 'ionize') {
            // Flat, untilted rings — concentric circles facing the camera
            // dead-on, matching the straight-on framing set above, so a
            // drag can be a simple ray/Z=0-plane intersection instead of
            // accounting for each shell's own tilt.
            shellGroup.rotation.set(0, 0, 0);
          } else {
            shellGroup.rotation.x = 0.5 + i * 0.85;
            shellGroup.rotation.y = i * 0.55;
          }

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
          shellData.push({ radius, speed: 0.5 / (i + 1) + 0.12, electrons, group: shellGroup });
        });
        shellDataRef.current = shellData;
      }
    }

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

    // A charge label right next to the atom — the dock's own charge readout
    // is easy to miss while attention is on the drag itself, so the ion
    // notation (O⁻, Fe²⁺, ...) also lives in-scene, swapped in place the
    // same way the reversible-reaction arrow sprite is (a canvas-texture
    // sprite can't have its text updated after creation).
    function updateChargeLabel(charge: number): void {
      if (chargeLabelRef.current) {
        atomGroup.remove(chargeLabelRef.current);
        const mat = chargeLabelRef.current.material as THREE.SpriteMaterial;
        mat.map?.dispose();
        mat.dispose();
        chargeLabelRef.current = null;
      }
      if (charge === 0) return;
      const label = makeSignSprite(formatIonLabel(symbol, charge), charge > 0 ? '#f5a524' : '#5eead4');
      label.scale.set(1, 1, 1);
      label.position.set(0, maxRadius + 0.35, 0);
      atomGroup.add(label);
      chargeLabelRef.current = label;
    }

    function addElectron(): void {
      if (pullRef.current || chargeRef.current - 1 < minCharge) return;
      const shellIndex = shellDataRef.current.length - 1;
      const shell = shellDataRef.current[shellIndex];
      if (!shell) return;
      const angle0 = Math.random() * Math.PI * 2;
      const mesh = makeParticle(electronMat, new THREE.SphereGeometry(0.11, 12, 10), 'electron', false, { groupKey: `shell-${shellIndex}`, shellIndex });
      const mat = mesh.material as THREE.Material & { opacity?: number };
      if (mat.opacity != null) mat.opacity = 0;
      shell.group.add(mesh);
      shell.electrons.push({ mesh, angle0 });
      pullRef.current = {
        mesh, shellIndex, shellRadius: shell.radius, phase: 'growing', t: 0, x: 0, y: 0, transitionStart: performance.now(),
      };
      chargeRef.current -= 1;
      onChargeChange?.(chargeRef.current);
      updateChargeLabel(chargeRef.current);
    }

    function resetIons(): void {
      shellDataRef.current.forEach((s) => {
        s.electrons.forEach((e) => {
          if (!e.removed) return;
          e.removed = false;
          e.mesh.visible = true;
          const mat = e.mesh.material as THREE.Material & { opacity?: number };
          if (mat.opacity != null) mat.opacity = 1;
        });
      });
      pullRef.current = null;
      chargeRef.current = 0;
      onChargeChange?.(0);
      updateChargeLabel(0);
    }

    apiRef.current = { clearSelection, enterQuark, exitQuark: exitQuarkInternal, triggerJump, resetIons, addElectron };

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

    /**
     * Ionize mode's own pointer handling, standing in for attachOrbitControls
     * entirely rather than composing with it — single-finger drag is fully
     * repurposed for pulling an electron off instead of orbiting the camera,
     * which only works cleanly because it's a dedicated tab: there's no
     * ambiguity to resolve between "the student meant to orbit" and "the
     * student meant to grab an electron" when this is the only thing drag
     * does here. Pinch (2-finger) and wheel zoom still work, identically to
     * attachOrbitControls, since those gestures don't overlap with a single-
     * finger drag at all.
     */
    function attachIonizeControls(): () => void {
      const canvasEl = gl.domElement;
      canvasEl.style.touchAction = 'none';
      canvasEl.style.cursor = 'grab';
      let dragMesh: THREE.Mesh | null = null;
      // True from a legitimate single-pointer down (not blocked by an
      // existing pull or the charge limit) until either a grab actually
      // lands on an electron or the pointer lifts without ever landing one
      // — lets onPointerMove keep retrying the raycast while the pointer
      // stays down, so a student who missed the (now motionless, see
      // pauseOrbit below) electron on the initial tap can just slide onto
      // it instead of having to release and try tapping again.
      let pendingGrab = false;
      const pointers = new Map<number, { x: number; y: number }>();
      let pinchDist: number | null = null;
      let pinchRadius: number | null = null;

      function pauseOrbit(now: number): void {
        const p = orbitPauseRef.current;
        if (p.pausedAt == null) p.pausedAt = now;
      }
      function resumeOrbit(now: number): void {
        const p = orbitPauseRef.current;
        if (p.pausedAt != null) {
          p.pauseAccum += now - p.pausedAt;
          p.pausedAt = null;
        }
      }
      const raycaster = new THREE.Raycaster();

      function ndcFromClient(clientX: number, clientY: number): THREE.Vector2 {
        const rect = canvasEl.getBoundingClientRect();
        return new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      }

      function raycastElectron(clientX: number, clientY: number): { mesh: THREE.Mesh; shellIndex: number } | null {
        raycaster.setFromCamera(ndcFromClient(clientX, clientY), camera);
        const hits = raycaster.intersectObjects(atomGroup.children, true);
        const hit = hits.find((h) => h.object.userData?.particleType === 'electron' && !h.object.userData.hitProxy);
        if (!hit) return null;
        const mesh = hit.object as THREE.Mesh;
        const shellIndex = shellDataRef.current.findIndex((s) => s.electrons.some((e) => e.mesh === mesh && !e.removed));
        if (shellIndex < 0) return null;
        return { mesh, shellIndex };
      }

      // Every shell/electron lives in the local (== world, in Ionize mode —
      // no roomOffset/roomScale/idle-spin) Z=0 plane, and the camera looks
      // straight down it — so "where should the dragged electron be drawn"
      // is just where the pointer's ray crosses that plane, giving a direct
      // 1:1 follow instead of an indirect distance-only tug.
      function planePointFromClient(clientX: number, clientY: number): THREE.Vector2 | null {
        raycaster.setFromCamera(ndcFromClient(clientX, clientY), camera);
        const denom = raycaster.ray.direction.z;
        if (Math.abs(denom) < 1e-6) return null;
        const t = -raycaster.ray.origin.z / denom;
        if (t < 0) return null;
        const p = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, t);
        return new THREE.Vector2(p.x, p.y);
      }

      // Attempts to actually grab whatever electron is under (clientX,
      // clientY) — called from onPointerDown immediately, and again from
      // onPointerMove on every subsequent move while pendingGrab is still
      // true, so a first attempt that missed can be corrected by sliding
      // onto the (frozen, thanks to pauseOrbit) electron rather than
      // needing a fresh, separately-timed tap.
      function tryGrab(clientX: number, clientY: number): void {
        const hit = raycastElectron(clientX, clientY);
        if (!hit) return;
        const point = planePointFromClient(clientX, clientY);
        if (!point) return;
        dragMesh = hit.mesh;
        pendingGrab = false;
        const shellRadius = shellDataRef.current[hit.shellIndex].radius;
        pullRef.current = {
          mesh: hit.mesh, shellIndex: hit.shellIndex, shellRadius, phase: 'dragging',
          t: Math.max(0, Math.min(1, (point.length() - shellRadius) / PULL_RANGE)),
          x: point.x, y: point.y,
        };
        canvasEl.style.cursor = 'grabbing';
      }

      function onPointerDown(e: PointerEvent): void {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        canvasEl.setPointerCapture(e.pointerId);
        if (pointers.size === 2) {
          dragMesh = null;
          pendingGrab = false;
          resumeOrbit(performance.now());
          const pts = Array.from(pointers.values());
          pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          pinchRadius = camStateRef.current.radius;
          return;
        }
        if (pointers.size !== 1 || pullRef.current) return; // a previous pull is still resolving
        // Refuse to even start the drag once losing another electron would
        // go past what's realistic for this element (oxygen: maxCharge=0,
        // so this fires on the very first attempt) — a snap-back after a
        // full drag would just read as "why did it undo itself".
        if (chargeRef.current + 1 > maxCharge) return;
        // Freeze every electron's orbit for the duration of this hold —
        // small, constantly-moving targets are hard to tap/drag precisely
        // (see this function's doc) — before even trying the first raycast,
        // so the very first frame the student sees mid-tap is already still.
        pendingGrab = true;
        pauseOrbit(performance.now());
        tryGrab(e.clientX, e.clientY);
      }

      function onPointerMove(e: PointerEvent): void {
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2 && pinchDist) {
          const pts = Array.from(pointers.values());
          const d = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
          camStateRef.current.radius = Math.min(maxR, Math.max(minR, (pinchRadius as number) * (pinchDist / d)));
          return;
        }
        if (pendingGrab && !dragMesh) {
          tryGrab(e.clientX, e.clientY);
          return;
        }
        if (!dragMesh || pullRef.current?.mesh !== dragMesh || pullRef.current.phase !== 'dragging') return;
        const point = planePointFromClient(e.clientX, e.clientY);
        if (!point) return;
        pullRef.current.x = point.x;
        pullRef.current.y = point.y;
        pullRef.current.t = Math.max(0, Math.min(1, (point.length() - pullRef.current.shellRadius) / PULL_RANGE));
      }

      function release(e: PointerEvent): void {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinchDist = null;
        if (pointers.size === 0) canvasEl.style.cursor = 'grab';
      }

      function onPointerUp(e: PointerEvent): void {
        release(e);
        // Unconditional (and a no-op if already resumed) — every path that
        // paused (a miss that never landed a grab, or a completed grab
        // about to transition to snapping/fading below) ends the hold here.
        pendingGrab = false;
        resumeOrbit(performance.now());
        if (dragMesh && pullRef.current?.mesh === dragMesh && pullRef.current.phase === 'dragging') {
          pullRef.current.transitionStart = performance.now();
          pullRef.current.releaseX = pullRef.current.x;
          pullRef.current.releaseY = pullRef.current.y;
          if (pullRef.current.t >= 1) {
            pullRef.current.phase = 'fading';
            chargeRef.current += 1;
            onChargeChange?.(chargeRef.current);
            updateChargeLabel(chargeRef.current);
          } else {
            pullRef.current.phase = 'snapping';
          }
        }
        dragMesh = null;
      }

      function onPointerCancel(e: PointerEvent): void {
        release(e);
        dragMesh = null;
        pendingGrab = false;
        resumeOrbit(performance.now());
      }

      function onWheel(e: WheelEvent): void {
        e.preventDefault();
        camStateRef.current.radius = Math.min(maxR, Math.max(minR, camStateRef.current.radius * Math.exp(e.deltaY * 0.0015)));
      }

      canvasEl.addEventListener('pointerdown', onPointerDown);
      canvasEl.addEventListener('pointermove', onPointerMove);
      canvasEl.addEventListener('pointerup', onPointerUp);
      canvasEl.addEventListener('pointercancel', onPointerCancel);
      canvasEl.addEventListener('wheel', onWheel, { passive: false });

      return () => {
        canvasEl.removeEventListener('pointerdown', onPointerDown);
        canvasEl.removeEventListener('pointermove', onPointerMove);
        canvasEl.removeEventListener('pointerup', onPointerUp);
        canvasEl.removeEventListener('pointercancel', onPointerCancel);
        canvasEl.removeEventListener('wheel', onWheel);
        // Safety net for a hold interrupted by this control scheme itself
        // being torn down mid-drag (switching away from Ionize view mode,
        // or unmounting) — without this a pause left active would freeze
        // every electron's orbit in whatever mode/element comes next too.
        resumeOrbit(performance.now());
      };
    }

    const detachControls = driveCamera
      ? (viewMode === 'ionize' ? attachIonizeControls() : attachOrbitControls(gl.domElement, camStateRef.current, minR, maxR, handleTap))
      : null;

    return () => {
      cancelled = true;
      detachControls?.();
      scene.remove(root);
      particles.forEach((p) => {
        p.mesh.geometry.dispose();
        p.mat.dispose();
      });
      lewisSprites.forEach((s) => {
        s.material.map?.dispose();
        s.material.dispose();
      });
      cloudShellsRef.current.forEach((s) => {
        s.geometry.dispose();
        s.material.dispose();
      });
      cloudDotTexture?.dispose();
      if (chargeLabelRef.current) {
        const mat = chargeLabelRef.current.material as THREE.SpriteMaterial;
        mat.map?.dispose();
        mat.dispose();
        chargeLabelRef.current = null;
      }
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
    // roomOffset/roomScale are fixed per call site, not meant to be reactive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, onStateChange, driveCamera, viewMode]);

  // The headset's own head tracking owns the camera transform once an XR
  // session starts — see the driveCamera check below.
  const xrSession = useXR((s) => s.session);
  useFrame((_, dt) => {
    const now = performance.now();
    // Frozen (or continuing smoothly from wherever it froze) while a
    // pointer hold is in progress in Ionize mode — see orbitPauseRef's doc.
    // Outside Ionize mode pausedAt/pauseAccum never change, so this is
    // exactly `now` there, unchanged from before this existed.
    const pause = orbitPauseRef.current;
    const orbitNow = (pause.pausedAt ?? now) - pause.pauseAccum;
    const camTween = camTweenRef.current;
    const camState = camStateRef.current;
    if (camTween) {
      const p = ease(Math.min(1, (now - camTween.start) / camTween.duration));
      camState.radius = camTween.fromRadius + (camTween.toRadius - camTween.fromRadius) * p;
      if (p >= 1) camTweenRef.current = null;
    }
    // Ambient spin pauses once something is selected, so the highlighted
    // particle doesn't rotate out of frame while its info panel is open —
    // stays off entirely in Lewis mode (its sprites already always face
    // the camera, so spinning the group would just make the whole diagram
    // visibly drift) — and stays off in Ionize mode too, so a student
    // dragging an electron isn't also fighting the whole atom slowly
    // turning underneath it (per-shell orbital motion still runs either way).
    if (!selectedRef.current && !quarkNucleonRef.current && viewMode !== 'lewis' && viewMode !== 'ionize') atomGroupRef.current.rotation.y += 0.12 * dt;
    quarkGroupRef.current.rotation.y += 0.18 * dt;
    // Each cloud shell slowly counter-drifts at its own speed — a gentle,
    // ongoing tumble rather than points circling on a fixed orbit, reading
    // as "a fuzzy region in motion" instead of a discrete path.
    cloudShellsRef.current.forEach((s, i) => {
      const dir = i % 2 === 0 ? 1 : -1;
      s.group.rotation.y += dir * s.speed * dt;
      s.group.rotation.x += dir * s.speed * 0.6 * dt;
    });
    const jump = jumpRef.current;
    const pull = pullRef.current;
    shellDataRef.current.forEach((s) => {
      s.electrons.forEach((e) => {
        if (e.removed) return;
        const a = e.angle0 + orbitNow * 0.001 * s.speed;
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
        if (pull && pull.mesh === e.mesh) {
          if (pull.phase === 'dragging') {
            // Directly follows the pointer (see planePointFromClient) —
            // no orbit-angle math while actively being dragged.
            e.mesh.position.set(pull.x, pull.y, 0);
            return;
          }
          if (pull.phase === 'snapping') {
            const elapsed = now - (pull.transitionStart ?? now);
            const p = ease(Math.min(1, elapsed / 350));
            // Eases from wherever it was released back toward its live
            // orbit position (angle `a` keeps advancing throughout), so it
            // reads as "snapping back into orbit" rather than teleporting.
            const homeX = pull.shellRadius * Math.cos(a);
            const homeY = pull.shellRadius * Math.sin(a);
            const x = (pull.releaseX ?? homeX) + (homeX - (pull.releaseX ?? homeX)) * p;
            const y = (pull.releaseY ?? homeY) + (homeY - (pull.releaseY ?? homeY)) * p;
            e.mesh.position.set(x, y, 0);
            if (p >= 1) pullRef.current = null;
            return;
          }
          if (pull.phase === 'fading') {
            // Keeps drifting outward from its release point along that same
            // direction while its material fades to nothing, then it's
            // marked removed and hidden for good.
            const elapsed = now - (pull.transitionStart ?? now);
            const p = Math.min(1, elapsed / 450);
            const rx = pull.releaseX ?? pull.x;
            const ry = pull.releaseY ?? pull.y;
            const len = Math.hypot(rx, ry) || 1;
            const extra = PULL_RANGE * 0.6 * p;
            e.mesh.position.set(rx + (rx / len) * extra, ry + (ry / len) * extra, 0);
            const mat = e.mesh.material as THREE.Material & { opacity?: number };
            if (mat.opacity != null) mat.opacity = 1 - p;
            if (p >= 1) {
              e.mesh.visible = false;
              e.removed = true;
              pullRef.current = null;
            }
            return;
          }
          // 'growing': the "+ electron" counterpart to fading — eases in
          // from just outside the shell along its own (freshly rolled)
          // orbit angle while its material fades up from nothing, then
          // resumes ordinary orbital motion once settled.
          const elapsed = now - (pull.transitionStart ?? now);
          const p = ease(Math.min(1, elapsed / 450));
          radius = pull.shellRadius + PULL_RANGE * 0.5 * (1 - p);
          const mat = e.mesh.material as THREE.Material & { opacity?: number };
          if (mat.opacity != null) mat.opacity = p;
          if (p >= 1) pullRef.current = null;
          e.mesh.position.set(radius * Math.cos(a), radius * Math.sin(a), 0);
          return;
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
    if (driveCamera && !xrSession) {
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
