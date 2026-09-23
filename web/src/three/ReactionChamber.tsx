import { useFrame, useThree } from '@react-three/fiber';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { bondList } from '../chemistry/bonds';
import { findReaction } from '../chemistry/reactions';
import type { Reaction } from '../chemistry/types';
import { ease } from './math';
import {
  addInstances, clearGroup, ghostGroup, setBondScale,
} from './moleculeMesh';
import { attachOrbitControls, type CameraOrbitState } from './orbitControls';
import { makeSignSprite } from './signSprite';

export type ChamberPhase = 'no-reaction' | 'idle' | 'reacting' | 'done';

export interface ChamberSnapshot {
  phase: ChamberPhase;
  reaction: Reaction | null;
  caption: string;
}

export interface ReactionChamberHandle {
  react(): void;
  reset(): void;
}

interface ReactionChamberModelProps {
  reactantA: string;
  reactantB: string;
  /** Student-controlled coefficients: [reactantA, reactantB, ...products],
   * in the same order as the current reaction's compounds. The chamber
   * renders whatever it's given — balancing is judged by the caller, not
   * this component (see chemistry/checkBalance.ts). Null until a reaction
   * is known. */
  coeffs: number[] | null;
  onStateChange?: (s: ChamberSnapshot) => void;
  /** false when this chamber is a passive wall inside ChamberRoom rather
   * than the sole focus of the screen: skips claiming the shared camera
   * (fov, background/fog, room lighting/grid/starfield) and attaching its
   * own orbit controls, since the room's own look controls and lighting own
   * the canvas in that mode. The reaction itself still animates normally —
   * see BohrAtom.tsx's identical driveCamera convention. Defaults to true
   * (today's standalone full-screen behavior). */
  driveCamera?: boolean;
  /** World-space offset for this chamber's root group — lets it sit on a
   * specific room wall instead of always at the origin. */
  roomOffset?: [number, number, number];
}

const ANCHOR_A = new THREE.Vector3(-6.4, 0.6, 0);
const ANCHOR_B = new THREE.Vector3(-2.8, 0.6, 0);
const ANCHOR_P1 = new THREE.Vector3(2.8, 0.6, 0);
const ANCHOR_P2 = new THREE.Vector3(6.4, 0.6, 0);
const ANCHOR_P_SINGLE = new THREE.Vector3(3.6, 0.6, 0);
const ZERO = new THREE.Vector3(0, 0.6, 0);
const DEFAULT_RADIUS = 11.5;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

interface CurrentReaction {
  entry: Reaction;
  phase: 'idle' | 'reacting' | 'done';
  reactStart: number;
  burstFired: boolean;
  caption: string;
}

interface Burst {
  mesh: THREE.Mesh;
  start: number;
}

/**
 * The reaction chamber: two reactant "clouds" on the left, product cloud(s)
 * on the right, joined by an equation. Compound quantities are driven
 * entirely by the `coeffs` prop — a student's in-progress (possibly wrong)
 * attempt at balancing, not something this component computes. `react()`
 * plays the break/rearrange/form animation using whatever is currently
 * built (the caller is expected to only enable that action once balanced).
 * `onStateChange` reports phase/caption transitions, not every frame.
 */
export const ReactionChamberModel = forwardRef<ReactionChamberHandle, ReactionChamberModelProps>(
  function ReactionChamberModel({
    reactantA, reactantB, coeffs, onStateChange, driveCamera = true, roomOffset,
  }, ref) {
    const { scene, camera, gl } = useThree();

    const rootRef = useRef(new THREE.Group());
    const reactantGroupARef = useRef(new THREE.Group());
    const reactantGroupBRef = useRef(new THREE.Group());
    const productGroupsRef = useRef<THREE.Group[]>([]);
    const reactionLightRef = useRef<THREE.PointLight | null>(null);
    const signArrowRef = useRef<THREE.Sprite | null>(null);
    const signPlusProductsRef = useRef<THREE.Sprite | null>(null);
    const currentRef = useRef<CurrentReaction | null>(null);
    const burstsRef = useRef<Burst[]>([]);
    const camStateRef = useRef<CameraOrbitState>({ theta: 0, phi: 1.08, radius: DEFAULT_RADIUS });
    const camTargetRef = useRef(new THREE.Vector3(0, 0.95, 0));
    const camTweenRef = useRef<{ fromRadius: number; toRadius: number; start: number; duration: number } | null>(null);

    function resetChamber(a: string, b: string): void {
      camTweenRef.current = null;
      camStateRef.current.theta = 0;
      camStateRef.current.phi = 1.08;
      camStateRef.current.radius = DEFAULT_RADIUS;

      clearGroup(reactantGroupARef.current);
      clearGroup(reactantGroupBRef.current);
      productGroupsRef.current.forEach((g) => {
        clearGroup(g);
        rootRef.current.remove(g);
      });
      productGroupsRef.current = [];
      reactantGroupARef.current.visible = true;
      reactantGroupBRef.current.visible = true;
      reactantGroupARef.current.scale.set(1, 1, 1);
      reactantGroupBRef.current.scale.set(1, 1, 1);
      reactantGroupARef.current.position.copy(ANCHOR_A);
      reactantGroupBRef.current.position.copy(ANCHOR_B);

      const entry = findReaction(a, b);
      if (signArrowRef.current) signArrowRef.current.visible = !!entry;
      if (signPlusProductsRef.current) signPlusProductsRef.current.visible = !!entry && entry.products.length === 2;

      if (!entry) {
        currentRef.current = null;
        addInstances(reactantGroupARef.current, a, 1);
        addInstances(reactantGroupBRef.current, b, 1);
        onStateChange?.({ phase: 'no-reaction', reaction: null, caption: '' });
        return;
      }

      currentRef.current = { entry, phase: 'idle', reactStart: 0, burstFired: false, caption: '' };
      addInstances(reactantGroupARef.current, entry.a, 1);
      addInstances(reactantGroupBRef.current, entry.b, 1);

      // Products are visible from the start too, at 1 each — this is a
      // preview students balance against, not a reveal. Real bonds/reacting
      // animation still only plays once `react()` runs.
      const anchors = entry.products.length === 1 ? [ANCHOR_P_SINGLE] : [ANCHOR_P1, ANCHOR_P2];
      entry.products.forEach((formula, i) => {
        const g = new THREE.Group();
        addInstances(g, formula, 1);
        g.userData.restAnchor = anchors[i];
        g.position.copy(anchors[i]);
        rootRef.current.add(g);
        productGroupsRef.current.push(g);
      });

      onStateChange?.({ phase: 'idle', reaction: entry, caption: '' });
    }

    function applyCoefficients(next: number[] | null): void {
      const current = currentRef.current;
      if (!current || !next) return;
      const { entry } = current;
      if (next.length !== 2 + entry.products.length) return;
      const [ca, cb, ...cp] = next;
      clearGroup(reactantGroupARef.current);
      addInstances(reactantGroupARef.current, entry.a, Math.max(1, ca));
      clearGroup(reactantGroupBRef.current);
      addInstances(reactantGroupBRef.current, entry.b, Math.max(1, cb));
      productGroupsRef.current.forEach((g, i) => {
        clearGroup(g);
        addInstances(g, entry.products[i], Math.max(1, cp[i]));
      });
    }

    function react(): void {
      const current = currentRef.current;
      if (!current || current.phase !== 'idle') return;
      current.phase = 'reacting';
      current.reactStart = performance.now();
      current.burstFired = false;
      current.caption = '';
      // Undo the "preview" framing (products sitting fully formed at rest)
      // so the break/form animation below has somewhere to animate from.
      productGroupsRef.current.forEach((g) => {
        g.visible = false;
        g.position.copy(ZERO);
        g.scale.setScalar(0);
        setBondScale(g, 0);
      });
      onStateChange?.({ phase: 'reacting', reaction: current.entry, caption: 'Reactants collide…' });
    }

    function reset(): void {
      resetChamber(reactantA, reactantB);
    }

    // react/reset are plain closures over stable refs, recreated every
    // render — deliberately not memoized (they're cheap and the handle only
    // needs to expose the latest ones).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useImperativeHandle(ref, () => ({ react, reset }), [reactantA, reactantB, onStateChange]);

    // One-time scaffold: lights, groups, signage, backdrop, camera controls.
    // driveCamera=false (parked on a ChamberRoom wall) skips everything that
    // claims scene-level ownership — fov, background/fog, ambient/key light,
    // grid, starfield, orbit controls — since the room supplies all of that
    // itself (see BohrAtom.tsx's identical driveCamera convention). The
    // reaction light and equation signs stay unconditional: they're part of
    // the reaction visualization, not room dressing.
    useEffect(() => {
      const root = rootRef.current;
      const reactantGroupA = reactantGroupARef.current;
      const reactantGroupB = reactantGroupBRef.current;
      scene.add(root);
      if (roomOffset) root.position.set(...roomOffset);
      root.add(reactantGroupA, reactantGroupB);

      let grid: THREE.GridHelper | null = null;
      let starGeo: THREE.BufferGeometry | null = null;
      let starMat: THREE.PointsMaterial | null = null;
      let detachControls: (() => void) | null = null;

      if (driveCamera) {
        // This scene may share a Canvas with other views (the hub, the atom
        // explorer) that set a different fov — pin it explicitly.
        const perspectiveCamera = camera as THREE.PerspectiveCamera;
        perspectiveCamera.fov = 55;
        perspectiveCamera.near = 0.1;
        perspectiveCamera.far = 200;
        perspectiveCamera.updateProjectionMatrix();

        scene.background = new THREE.Color(0x0a0f1c);
        scene.fog = new THREE.Fog(0x0a0f1c, 70, 140);

        grid = new THREE.GridHelper(18, 18, 0x2dd4bf, 0x1b2a44);
        grid.position.y = -1.3;
        (grid.material as THREE.Material & { opacity: number; transparent: boolean }).opacity = 0.35;
        (grid.material as THREE.Material & { transparent: boolean }).transparent = true;
        root.add(grid);

        root.add(new THREE.AmbientLight(0x445577, 0.7));
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
        keyLight.position.set(3, 5, 4);
        root.add(keyLight);

        // Faint background starfield.
        const starCount = 260;
        const positions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
          const r = 12 + Math.random() * 10;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(Math.random() * 2 - 1);
          positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
          positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6;
          positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starMat = new THREE.PointsMaterial({ color: 0x3a4a70, size: 0.05, transparent: true, opacity: 0.7 });
        root.add(new THREE.Points(starGeo, starMat));

        detachControls = attachOrbitControls(gl.domElement, camStateRef.current, 2, 45);
      }

      const reactionLight = new THREE.PointLight(0x2dd4bf, 0, 12);
      reactionLight.position.set(0, 0.6, 0);
      root.add(reactionLight);
      reactionLightRef.current = reactionLight;

      const signPlusReactants = makeSignSprite('+', '#8C9AB8');
      const signArrow = makeSignSprite('→', '#2DD4BF');
      const signPlusProducts = makeSignSprite('+', '#8C9AB8');
      signPlusReactants.position.set(-4.6, 0.6, 0);
      signArrow.position.set(0, 0.6, 0);
      signPlusProducts.position.set(4.6, 0.6, 0);
      signArrow.visible = false;
      signPlusProducts.visible = false;
      root.add(signPlusReactants, signArrow, signPlusProducts);
      signArrowRef.current = signArrow;
      signPlusProductsRef.current = signPlusProducts;

      return () => {
        detachControls?.();
        scene.remove(root);
        productGroupsRef.current.forEach((g) => clearGroup(g));
        clearGroup(reactantGroupA);
        clearGroup(reactantGroupB);
        starGeo?.dispose();
        starMat?.dispose();
        grid?.geometry.dispose();
      };
      // gl/scene/camera are stable for the lifetime of a given <Canvas>;
      // driveCamera/roomOffset are fixed per mount (a chamber doesn't switch
      // between standalone and room-wall mode at runtime).
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      resetChamber(reactantA, reactantB);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reactantA, reactantB]);

    useEffect(() => {
      applyCoefficients(coeffs);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [coeffs]);

    function spawnBurst(color: number): void {
      const geo = new THREE.IcosahedronGeometry(0.5, 1);
      const mat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0.6, 0);
      rootRef.current.add(mesh);
      burstsRef.current.push({ mesh, start: performance.now() });
    }

    function bondCaption(formulas: string[]): string {
      const list = Array.from(new Set(formulas.flatMap(bondList)));
      return list.length ? list.join(', ') : 'none (these are single atoms)';
    }

    function updateReaction(now: number): void {
      const current = currentRef.current;
      if (!current || current.phase !== 'reacting') return;
      const t = now - current.reactStart;
      const { entry } = current;
      const reactionLight = reactionLightRef.current;
      const groupA = reactantGroupARef.current;
      const groupB = reactantGroupBRef.current;

      let caption: string;
      if (t < 350) caption = 'Reactants collide…';
      else if (t < 900) caption = `Breaking bonds: ${bondCaption([entry.a, entry.b])}`;
      else if (t < 1150) caption = 'Atoms rearrange…';
      else caption = `Forming bonds: ${bondCaption(entry.products)}`;
      if (t < 2150 && caption !== current.caption) {
        current.caption = caption;
        onStateChange?.({ phase: 'reacting', reaction: entry, caption });
      }

      if (t < 900) {
        // Reactant bonds snap while the molecules are still closing in.
        const breakP = ease(clamp01((t - 350) / 500));
        setBondScale(groupA, 1 - breakP);
        setBondScale(groupB, 1 - breakP);
        const p = ease(Math.min(1, t / 900));
        groupA.position.lerpVectors(ANCHOR_A, ZERO, p);
        groupB.position.lerpVectors(ANCHOR_B, ZERO, p);
        groupA.scale.setScalar(1 - 0.5 * p);
        groupB.scale.setScalar(1 - 0.5 * p);
      } else if (!current.burstFired) {
        current.burstFired = true;
        spawnBurst(0x2dd4bf);
        if (reactionLight) reactionLight.intensity = 8;
        setBondScale(groupA, 0);
        setBondScale(groupB, 0);
        ghostGroup(groupA);
        ghostGroup(groupB);
      }

      if (t >= 900 && t < 2150) {
        if (reactionLight) reactionLight.intensity = Math.max(0, 8 * (1 - (t - 900) / 500));
        const p2 = ease(Math.min(1, (t - 900) / 1250));
        const formP = ease(clamp01((t - 1150) / 1000));
        productGroupsRef.current.forEach((g) => setBondScale(g, formP));
        // Reactants settle back to their spot — they aren't erased, they became the products.
        groupA.position.lerpVectors(ZERO, ANCHOR_A, p2);
        groupB.position.lerpVectors(ZERO, ANCHOR_B, p2);
        groupA.scale.setScalar(0.5 + 0.5 * p2);
        groupB.scale.setScalar(0.5 + 0.5 * p2);
        productGroupsRef.current.forEach((g) => {
          g.visible = true;
          const restAnchor = g.userData.restAnchor as THREE.Vector3;
          g.position.lerpVectors(ZERO, restAnchor, p2);
          g.scale.setScalar(p2);
        });
      }

      if (t >= 2150) {
        current.phase = 'done';
        productGroupsRef.current.forEach((g) => setBondScale(g, 1));
        onStateChange?.({ phase: 'done', reaction: entry, caption: entry.note });
        // Smoothly settle back to the default framing, undoing any zoom the
        // viewer applied mid-reaction.
        camTweenRef.current = { fromRadius: camStateRef.current.radius, toRadius: DEFAULT_RADIUS, start: performance.now(), duration: 700 };
      }
    }

    useFrame((_, dt) => {
      const now = performance.now();
      [reactantGroupARef.current, reactantGroupBRef.current, ...productGroupsRef.current].forEach((g) => {
        g.children.forEach((mesh) => {
          const bob = mesh.userData.bob as { phase: number; speed: number; baseY: number } | undefined;
          const spin = mesh.userData.spin as THREE.Vector3 | undefined;
          if (!bob || !spin) return;
          mesh.position.y = bob.baseY + Math.sin(now * 0.001 * bob.speed + bob.phase) * 0.1;
          mesh.rotation.x += spin.x * dt;
          mesh.rotation.y += spin.y * dt;
          mesh.rotation.z += spin.z * dt;
        });
      });

      for (let i = burstsRef.current.length - 1; i >= 0; i--) {
        const b = burstsRef.current[i];
        const t = (now - b.start) / 550;
        if (t >= 1) {
          rootRef.current.remove(b.mesh);
          b.mesh.geometry.dispose();
          (b.mesh.material as THREE.Material).dispose();
          burstsRef.current.splice(i, 1);
          continue;
        }
        b.mesh.scale.setScalar(0.4 + t * 3.2);
        (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
        b.mesh.rotation.y += 0.05;
      }

      updateReaction(now);

      if (driveCamera) {
        const camTween = camTweenRef.current;
        const camState = camStateRef.current;
        if (camTween) {
          const p = ease(Math.min(1, (now - camTween.start) / camTween.duration));
          camState.radius = camTween.fromRadius + (camTween.toRadius - camTween.fromRadius) * p;
          if (p >= 1) camTweenRef.current = null;
        }
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
  },
);

// No standalone Canvas wrapper here — ReactionChamberModel is mounted
// directly inside the app's single shared <AppCanvas> (see App.tsx) so Ion,
// and eventually a WebXR session, can persist across navigation instead of
// resetting per view.
