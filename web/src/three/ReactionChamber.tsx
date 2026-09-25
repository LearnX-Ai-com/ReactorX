import { useFrame, useThree } from '@react-three/fiber';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { bondList } from '../chemistry/bonds';
import { ensureMoleculesResolved, isSettled } from '../chemistry/moleculeSource';
import { ReactionNotPossibleError, fetchReactionFromFormulas } from '../chemistry/reactionApi';
import { cacheDiscoveredReaction, findReaction } from '../chemistry/reactions';
import type { Reaction } from '../chemistry/types';
import { ease } from './math';
import {
  addInstances, clearGroup, setBondScale,
} from './moleculeMesh';
import { attachOrbitControls, type CameraOrbitState } from './orbitControls';
import { makeSignSprite } from './signSprite';

// 'checking' is the AI-backed fallback in flight — findReaction missed the
// hand-authored list, so reactionApi.ts is asking whether the pair reacts
// at all before settling into 'idle' (yes) or back to 'no-reaction' (no).
export type ChamberPhase = 'no-reaction' | 'checking' | 'idle' | 'reacting' | 'done';

export interface ChamberSnapshot {
  phase: ChamberPhase;
  reaction: Reaction | null;
  caption: string;
}

export interface ReactionChamberHandle {
  react(): void;
  reset(): void;
  /** Reset + react in one synchronous call, so a reaction can be replayed
   * from a 'done' state without a round trip through React's async effect
   * scheduling — resetChamber/applyCoefficients/react all read the current
   * coeffs prop directly via closure, so the replay shows the correct
   * (already-balanced) counts immediately rather than the 1-each preview
   * resetChamber alone would leave up until the coeffs-changed effect
   * happened to re-fire. */
  play(): void;
  /** The current reactant/product molecule groups — every mesh under them
   * (built by buildMoleculeMesh) carries userData.formula/bondType, so the
   * room's own tap handler can raycast against just these rather than the
   * whole scene, then walk up to find which molecule (or bond) was hit. */
  getClickableGroups(): THREE.Object3D[];
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
  /** Yaw applied to the root group so its front face (local +Z) turns to
   * match the wall it's sitting on — same convention as PeriodicTableRoom's
   * `rotation` prop. Only meaningful alongside roomOffset. */
  roomRotationY?: number;
  /** Uniform scale applied to the root group — lets the chamber's existing
   * anchor layout (ANCHOR_A..ANCHOR_P2, spanning ~13 units) fit inside a
   * compact meter-scale wall without rewriting those anchor constants. */
  roomScale?: number;
}

const ANCHOR_A = new THREE.Vector3(-6.4, 0.6, 0);
const ANCHOR_B = new THREE.Vector3(-2.8, 0.6, 0);
const ANCHOR_P1 = new THREE.Vector3(2.8, 0.6, 0);
const ANCHOR_P2 = new THREE.Vector3(6.4, 0.6, 0);
const ANCHOR_P_SINGLE = new THREE.Vector3(3.6, 0.6, 0);
const ZERO = new THREE.Vector3(0, 0.6, 0);
const DEFAULT_RADIUS = 11.5;

// Every stage of the reaction timeline scales off this one knob — bump it
// up/down to slow the whole sequence down (or speed it back up) without
// throwing off the proportions between collide/break/rearrange/form.
const REACT_SLOWMO = 1.8;
const T_COLLIDE = 350 * REACT_SLOWMO;
const T_BREAK_END = 900 * REACT_SLOWMO;
const T_REARRANGE_END = 1150 * REACT_SLOWMO;
const T_DONE = 2150 * REACT_SLOWMO;
const BREAK_WINDOW = 500 * REACT_SLOWMO;
const FORM_WINDOW = 1000 * REACT_SLOWMO;
const LIGHT_FADE_WINDOW = 500 * REACT_SLOWMO;
const BURST_DURATION = 550 * REACT_SLOWMO;

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
    reactantA, reactantB, coeffs, onStateChange, driveCamera = true, roomOffset, roomRotationY, roomScale,
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
    // Bumped on every resetChamber call — an in-flight AI reaction lookup
    // checks this before applying its result, so a stale response (the
    // student picked different reactants again before it landed) is
    // silently dropped instead of clobbering newer state.
    const resetGenerationRef = useRef(0);

    // A single sprite object is swapped (removed + disposed, then replaced)
    // rather than toggling between two pre-built alternates — with only one
    // arrow sprite ever in the group at a time, there's no way for a normal
    // and a reversible arrow to end up simultaneously visible.
    function setArrowGlyph(reversible: boolean): void {
      const old = signArrowRef.current;
      if (old) {
        rootRef.current.remove(old);
        const material = old.material as THREE.SpriteMaterial;
        material.map?.dispose();
        material.dispose();
      }
      const next = makeSignSprite(reversible ? '⇌' : '→', '#2DD4BF');
      next.position.set(0, 0.6, 0);
      rootRef.current.add(next);
      signArrowRef.current = next;
    }

    // Shared by both the synchronous (hand-authored list) and async
    // (AI-discovered) paths below — builds the reactant/product groups for
    // a known-good Reaction and reports 'idle'.
    function applyEntry(entry: Reaction): void {
      setArrowGlyph(!!entry.reversible);
      if (signPlusProductsRef.current) signPlusProductsRef.current.visible = entry.products.length === 2;

      currentRef.current = { entry, phase: 'idle', reactStart: 0, burstFired: false, caption: '' };
      clearGroup(reactantGroupARef.current);
      clearGroup(reactantGroupBRef.current);
      addInstances(reactantGroupARef.current, entry.a, 1);
      addInstances(reactantGroupBRef.current, entry.b, 1);

      productGroupsRef.current.forEach((g) => {
        clearGroup(g);
        rootRef.current.remove(g);
      });
      productGroupsRef.current = [];
      // Products are visible from the start, at 1 each — a skeleton
      // equation a student balances against (you can't balance what you
      // can't see), not the correct answer. App.tsx defaults coeffs to 1
      // each rather than auto-solving, and gates React on checkBalance
      // actually passing — so seeing the products up front doesn't skip the
      // balancing step, it's what the step needs to be possible at all.
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

    function resetChamber(a: string, b: string): void {
      camTweenRef.current = null;
      camStateRef.current.theta = 0;
      camStateRef.current.phi = 1.08;
      camStateRef.current.radius = DEFAULT_RADIUS;

      reactantGroupARef.current.visible = true;
      reactantGroupBRef.current.visible = true;
      reactantGroupARef.current.scale.set(1, 1, 1);
      reactantGroupBRef.current.scale.set(1, 1, 1);
      reactantGroupARef.current.position.copy(ANCHOR_A);
      reactantGroupBRef.current.position.copy(ANCHOR_B);

      const requestId = ++resetGenerationRef.current;
      const entry = findReaction(a, b);
      if (entry) {
        if (entry.products.every((f) => isSettled(f))) {
          applyEntry(entry); // fully synchronous — play()/reset() depend on this
          return;
        }
        // Known reaction (hand-authored or discovered earlier this session
        // via reactionApi.ts), but at least one product's structure isn't
        // resolved yet — e.g. cacheDiscoveredReaction ran before a product
        // lookup finished or failed. Same resolve-then-render path as a
        // fresh AI discovery, just skipping the "does this react" call.
        // isSettled (not getKnownMolecule) also lets a product the
        // molecule-validity AI conclusively rejected (a reaction can name a
        // product — e.g. "NO" — that a separate, stricter check then calls
        // too unstable to render) through this gate once, rather than
        // retrying the same doomed lookup on every single replay and never
        // reaching the synchronous path above.
        currentRef.current = null;
        onStateChange?.({ phase: 'checking', reaction: null, caption: 'Preparing molecule structures…' });
        ensureMoleculesResolved(entry.products).then(() => {
          if (requestId !== resetGenerationRef.current) return;
          applyEntry(entry);
        });
        return;
      }

      currentRef.current = null;
      clearGroup(reactantGroupARef.current);
      clearGroup(reactantGroupBRef.current);
      productGroupsRef.current.forEach((g) => {
        clearGroup(g);
        rootRef.current.remove(g);
      });
      productGroupsRef.current = [];
      if (signArrowRef.current) signArrowRef.current.visible = false;
      if (signPlusProductsRef.current) signPlusProductsRef.current.visible = false;

      // A cleared slot (the × on a reactant chip) sends an empty string
      // here — nothing to ask the AI about yet, just show whichever
      // reactant is still picked and wait for its replacement, rather than
      // firing a pointless network call with half a pair.
      if (!a || !b) {
        if (a) addInstances(reactantGroupARef.current, a, 1);
        if (b) addInstances(reactantGroupBRef.current, b, 1);
        onStateChange?.({ phase: 'no-reaction', reaction: null, caption: '' });
        return;
      }

      // Not a hand-authored pair (or a previously AI-discovered one, which
      // findReaction also checks) — show the two reactants plainly while
      // asking the AI backend whether they actually react at all.
      addInstances(reactantGroupARef.current, a, 1);
      addInstances(reactantGroupBRef.current, b, 1);
      onStateChange?.({ phase: 'checking', reaction: null, caption: 'Asking Ion whether these react…' });

      fetchReactionFromFormulas(a, b).then(async (aiEntry) => {
        if (requestId !== resetGenerationRef.current) return;
        cacheDiscoveredReaction(aiEntry);
        // The reaction is real, but its products were only just named by
        // the AI, not built through the atom tray (the only other path
        // that resolves a molecule) — fetch real geometry/bonds for
        // whichever ones aren't already known before rendering them,
        // rather than showing an empty cloud where ZnCl2 should be.
        await ensureMoleculesResolved(aiEntry.products);
        if (requestId !== resetGenerationRef.current) return;
        applyEntry(aiEntry);
      }).catch((err) => {
        if (requestId !== resetGenerationRef.current) return;
        currentRef.current = null;
        const reason = err instanceof ReactionNotPossibleError
          ? err.message
          : 'Could not determine whether these react — try again.';
        onStateChange?.({ phase: 'no-reaction', reaction: null, caption: reason });
      });
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

    function play(): void {
      resetChamber(reactantA, reactantB);
      // Applied synchronously here (reading the current `coeffs` prop
      // directly) rather than relying on the [coeffs] effect below, which
      // only re-fires on a coeffs *change* — after a 'done' reaction the
      // coeffs value is unchanged, so that effect wouldn't re-apply it and
      // the replay would show resetChamber's 1-each preview instead of the
      // actual balanced counts.
      applyCoefficients(coeffs);
      react();
    }

    function getClickableGroups(): THREE.Object3D[] {
      return [reactantGroupARef.current, reactantGroupBRef.current, ...productGroupsRef.current];
    }

    // react/reset/play are plain closures over stable refs, recreated every
    // render — deliberately not memoized (they're cheap and the handle only
    // needs to expose the latest ones).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useImperativeHandle(ref, () => ({ react, reset, play, getClickableGroups }), [reactantA, reactantB, coeffs, onStateChange]);

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
      if (roomRotationY) root.rotation.y = roomRotationY;
      if (roomScale) root.scale.setScalar(roomScale);
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
      // Placeholder — applyEntry always swaps this for the correct glyph
      // (→ or ⇌) via setArrowGlyph before it's ever shown, so its initial
      // text doesn't matter beyond starting hidden.
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
        // scene.remove only detaches `root` from the scene — it doesn't
        // touch root's own children. rootRef is a stable ref, so in dev
        // StrictMode's simulated unmount+remount, `root` is the SAME Group
        // both times: without removing the sign sprites and reactionLight
        // here first, the OLD ones (still holding whatever glyph/visibility
        // applyEntry last set) stay behind as the remount adds a fresh set
        // on top — exactly how an old arrow sprite ended up stuck visible
        // behind the current one. Reactant/product groups don't need this:
        // clearGroup below empties their *contents*, and the groups
        // themselves are ref-stable and just get re-added, not duplicated.
        root.remove(signPlusReactants, signPlusProducts, reactionLight);
        [signPlusReactants, signPlusProducts, signArrowRef.current].forEach((sprite) => {
          if (!sprite) return;
          sprite.material.map?.dispose();
          sprite.material.dispose();
        });
        if (signArrowRef.current) root.remove(signArrowRef.current);
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
      if (t < T_COLLIDE) caption = 'Reactants collide…';
      else if (t < T_BREAK_END) caption = `Breaking bonds: ${bondCaption([entry.a, entry.b])}`;
      else if (t < T_REARRANGE_END) caption = 'Atoms rearrange…';
      else caption = `Forming bonds: ${bondCaption(entry.products)}`;
      if (t < T_DONE && caption !== current.caption) {
        current.caption = caption;
        onStateChange?.({ phase: 'reacting', reaction: entry, caption });
      }

      if (t < T_BREAK_END) {
        // Reactant bonds snap while the molecules are still closing in.
        const breakP = ease(clamp01((t - T_COLLIDE) / BREAK_WINDOW));
        setBondScale(groupA, 1 - breakP);
        setBondScale(groupB, 1 - breakP);
        const p = ease(Math.min(1, t / T_BREAK_END));
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
      }

      if (t >= T_BREAK_END && t < T_DONE) {
        if (reactionLight) reactionLight.intensity = Math.max(0, 8 * (1 - (t - T_BREAK_END) / LIGHT_FADE_WINDOW));
        const p2 = ease(Math.min(1, (t - T_BREAK_END) / (T_DONE - T_BREAK_END)));
        const formP = ease(clamp01((t - T_REARRANGE_END) / FORM_WINDOW));
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

      if (t >= T_DONE) {
        current.phase = 'done';
        // Reactants settle back at full visibility (they're a "record of
        // what went in", not erased — see the ghosting removal earlier this
        // session) but their bond cylinders were scaled to 0 when they
        // broke apart at the burst and — unlike the product groups just
        // below — never got scaled back up, leaving the atoms floating
        // with no visible bond between them.
        setBondScale(groupA, 1);
        setBondScale(groupB, 1);
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
        const t = (now - b.start) / BURST_DURATION;
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
