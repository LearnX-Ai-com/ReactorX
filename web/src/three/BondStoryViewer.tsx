import { useFrame, useThree } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { oxidationBySymbol } from '../chemistry/bonds';
import { ELEMENTS } from '../chemistry/elements';
import { formatIonLabel } from '../chemistry/formulas';
import { getKnownMolecule } from '../chemistry/moleculeSource';
import type { BondType, ElementSymbol } from '../chemistry/types';
import { attachOrbitControls, type CameraOrbitState } from './orbitControls';
import { ease } from './math';
import { buildSimpleAtom, disposeSimpleAtom, popOuterElectron, type SimpleAtom, type SimpleAtomElectron, type SimpleAtomShell } from './simpleAtom';
import { makeSignSprite } from './signSprite';

export interface BondStoryViewerProps {
  formula: string;
}

export interface BondStoryViewerHandle {
  /** Re-runs the whole settle -> travel -> done sequence from scratch —
   * the "↻ Replay" button in App.tsx's Bond tab. */
  replay(): void;
}

interface Traveler {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  control: THREE.Vector3;
  arrive(): void;
}

interface SharedPair {
  a: SimpleAtomElectron;
  b: SimpleAtomElectron;
  mid: THREE.Vector3;
}

const DURATION_SETTLE = 700;
const DURATION_TRAVEL = 2600;
// How much bigger the revealed ion label (Na⁺, O²⁻, …) reads than the
// plain element symbol it replaces — big enough to still land as "the
// payoff of the animation", not so big it dwarfs everything else in frame.
const ION_LABEL_BOOST = 1.15;
const LABEL_COLOR = '#e8edf7';
const CATION_COLOR = '#f5a524';
const ANION_COLOR = '#5eead4';

function labelScaleFor(radius: number): number {
  return Math.max(1.7, radius * 0.7);
}
function labelYFor(pos: THREE.Vector3, radius: number, scale: number): number {
  return pos.y + radius + scale * 0.35 + 0.35;
}
function worldOf(pos: THREE.Vector3, radius: number, angle: number): THREE.Vector3 {
  return new THREE.Vector3(pos.x + radius * Math.cos(angle), pos.y + radius * Math.sin(angle), 0);
}
function maxRadiusOf(el: ElementSymbol): number {
  return 1.35 + Math.max(0, ELEMENTS[el].shells.length - 1) * 0.85;
}
/** The shell a label should sit just outside of — the true outer shell
 * normally, or whichever shell is still populated once outer ones have
 * been emptied out by donation (see buildSimpleAtom's guaranteedElectrons
 * doc) — falling back to a small fixed radius once nothing is left at all. */
function visibleRadiusOf(atom: SimpleAtom): number {
  for (let i = atom.shells.length - 1; i >= 0; i -= 1) {
    if (atom.shells[i].electrons.length > 0) return atom.shells[i].radius;
  }
  return 0.6;
}
function hideEmptiedShells(atom: SimpleAtom): void {
  atom.shells.forEach((s) => { if (s.electrons.length === 0) s.ring.opacity = 0; });
}
function reserveSlot(outer: SimpleAtomShell, reserved: Map<SimpleAtomShell, number>): number {
  const used = reserved.get(outer) ?? 0;
  reserved.set(outer, used + 1);
  const n = outer.electrons.length + used;
  return (n / (n + 1)) * Math.PI * 2;
}
function orbitAtom(atom: SimpleAtom, now: number): void {
  atom.shells.forEach((s) => {
    s.electrons.forEach((e) => {
      if (e.frozen) return;
      const a = e.angle0 + now * 0.0006;
      e.mesh.position.set(s.radius * Math.cos(a), s.radius * Math.sin(a), 0);
    });
  });
}

/**
 * The molecule detail view's "Bond" tab — every bond animated at once: a
 * shared pair physically drifting into the overlap between two shells for
 * a covalent bond, or an electron actually flying from donor to receiver
 * for an ionic one, ending in the real ion notation (Na⁺, Fe³⁺, O²⁻, …)
 * rather than just stating it in a sentence. Ported from the original
 * single-file prototype's two bond-story scenes: buildBondStoryScene (a
 * single hub atom with every other atom fanned around it as "spokes" —
 * used here whenever every bond is covalent) and buildIonicNetworkScene
 * (separate donor/receiver rows — used whenever any bond is ionic, since
 * an ionic compound isn't always a single-donor star: Fe2O3 has TWO iron
 * donors sharing a bridging oxygen, so a hub+spokes view would only ever
 * show that oxygen receiving from one iron, understating its real O²⁻).
 */
export const BondStoryViewerModel = forwardRef<BondStoryViewerHandle, BondStoryViewerProps>(function BondStoryViewerModel({ formula }, ref) {
  const { scene, camera, gl } = useThree();
  const camStateRef = useRef<CameraOrbitState>({ theta: 0.08, phi: 1.3, radius: 6 });
  const camTargetRef = useRef(new THREE.Vector3());
  const tickRef = useRef<(() => void) | null>(null);
  const replayRef = useRef<(() => void) | null>(null);

  useImperativeHandle(ref, () => ({
    replay: () => replayRef.current?.(),
  }), []);

  useEffect(() => {
    const def = getKnownMolecule(formula);
    if (!def || def.bonds.length === 0) return undefined;

    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    perspectiveCamera.fov = 42;
    perspectiveCamera.near = 0.1;
    perspectiveCamera.far = 60;
    perspectiveCamera.updateProjectionMatrix();
    scene.background = new THREE.Color(0x0a0f1c);
    scene.fog = null;

    const root = new THREE.Group();
    scene.add(root);
    root.add(new THREE.AmbientLight(0x445577, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1);
    key.position.set(3, 5, 6);
    root.add(key);

    const hasIonic = def.bonds.some(([, , bondType]) => bondType === 'ionic');
    const disposers: (() => void)[] = [];

    if (hasIonic) {
      // ---- Ionic network: every ionic bond in the molecule at once, laid
      // out as a donor row (below) and a receiver row (above) — see the
      // module doc for why this isn't the same single-hub layout covalent
      // bonds use.
      const edges = def.bonds
        .filter(([, , bondType]) => bondType === 'ionic')
        .map(([a, b, , order]) => {
          const elA = def.atoms[a].el;
          const elB = def.atoms[b].el;
          const [donorIdx, receiverIdx] = (ELEMENTS[elA].en ?? 0) <= (ELEMENTS[elB].en ?? 0) ? [a, b] : [b, a];
          return { donorIdx, receiverIdx, count: order || 1 };
        });
      const donors = Array.from(new Set(edges.map((e) => e.donorIdx)));
      const receivers = Array.from(new Set(edges.map((e) => e.receiverIdx)));
      const donorEls = donors.map((idx) => def.atoms[idx].el);
      const receiverEls = receivers.map((idx) => def.atoms[idx].el);
      const donorRadii = donorEls.map(maxRadiusOf);
      const receiverRadii = receiverEls.map(maxRadiusOf);
      // Each donor may need to give more electrons across ALL its edges
      // than its own true outer shell holds (Fe2O3's iron gives 1 to one
      // oxygen and 2 to another, 3 total) — buildSimpleAtom needs that
      // total up front to draw enough shells.
      const donorNeed = new Map<number, number>();
      edges.forEach((e) => donorNeed.set(e.donorIdx, (donorNeed.get(e.donorIdx) ?? 0) + e.count));

      function rowPositions(radii: number[], y: number): THREE.Vector3[] {
        const gap = 0.7;
        const totalWidth = radii.reduce((s, r) => s + r * 2, 0) + gap * Math.max(0, radii.length - 1);
        let x = -totalWidth / 2;
        return radii.map((r) => {
          x += r;
          const p = new THREE.Vector3(x, y, 0);
          x += r + gap;
          return p;
        });
      }

      let donorPos: THREE.Vector3[];
      let receiverPos: THREE.Vector3[];
      if (donors.length === 1 && receivers.length === 1) {
        const d = donorRadii[0] + receiverRadii[0] + 0.6;
        donorPos = [new THREE.Vector3(-d / 2, 0, 0)];
        receiverPos = [new THREE.Vector3(d / 2, 0, 0)];
      } else {
        const rowGap = Math.max(...donorRadii) + Math.max(...receiverRadii) + 1.6;
        donorPos = rowPositions(donorRadii, -rowGap / 2);
        receiverPos = rowPositions(receiverRadii, rowGap / 2);
      }
      const donorSlot = new Map(donors.map((idx, i) => [idx, i]));
      const receiverSlot = new Map(receivers.map((idx, i) => [idx, i]));

      const extents = [
        ...donors.map((_, i) => ({ p: donorPos[i], r: donorRadii[i] })),
        ...receivers.map((_, i) => ({ p: receiverPos[i], r: receiverRadii[i] })),
      ];
      const halfWidth = Math.max(...extents.map((o) => Math.abs(o.p.x) + o.r)) + 0.3;
      const halfHeight = Math.max(...extents.map((o) => {
        const labelScale = labelScaleFor(o.r) * ION_LABEL_BOOST;
        return Math.abs(o.p.y) + o.r + labelScale * 0.55 + 0.2;
      }));
      const frameSize = Math.max(halfWidth, halfHeight * 1.05);
      const dist = Math.max(4.5, (frameSize * 1.08) / Math.tan((21 * Math.PI) / 180));
      camStateRef.current = { theta: 0.08, phi: 1.3, radius: dist };
      camTargetRef.current = new THREE.Vector3(0, halfHeight * 0.22, 0);
      const minR = dist * 0.45;
      const maxR = dist * 2;

      let donorAtoms: SimpleAtom[] = [];
      let receiverAtoms: SimpleAtom[] = [];
      let donorLabels: THREE.Sprite[] = [];
      let receiverLabels: THREE.Sprite[] = [];
      let animState: 'settle' | 'travel' | 'done' = 'settle';
      let animStart = performance.now();
      let travelers: Traveler[] = [];

      function setupAtoms(): void {
        donorAtoms = donorEls.map((el, i) => {
          const a = buildSimpleAtom(el, donorNeed.get(donors[i]) ?? 1);
          a.group.position.copy(donorPos[i]);
          root.add(a.group);
          return a;
        });
        donorLabels = donorEls.map((el, i) => {
          const scale = labelScaleFor(donorRadii[i]);
          const l = makeSignSprite(el, LABEL_COLOR, scale);
          l.position.set(donorPos[i].x, labelYFor(donorPos[i], donorRadii[i], scale), 0.2);
          root.add(l);
          return l;
        });
        receiverAtoms = receiverEls.map((el, i) => {
          const a = buildSimpleAtom(el);
          a.group.position.copy(receiverPos[i]);
          root.add(a.group);
          return a;
        });
        receiverLabels = receiverEls.map((el, i) => {
          const scale = labelScaleFor(receiverRadii[i]);
          const l = makeSignSprite(el, LABEL_COLOR, scale);
          l.position.set(receiverPos[i].x, labelYFor(receiverPos[i], receiverRadii[i], scale), 0.2);
          root.add(l);
          return l;
        });
      }

      function beginTravel(): void {
        const now = performance.now();
        const reserved = new Map<SimpleAtomShell, number>();
        edges.forEach((edge) => {
          const donorAtom = donorAtoms[donorSlot.get(edge.donorIdx)!];
          const receiverAtom = receiverAtoms[receiverSlot.get(edge.receiverIdx)!];
          const donorP = donorPos[donorSlot.get(edge.donorIdx)!];
          const receiverP = receiverPos[receiverSlot.get(edge.receiverIdx)!];
          const receiverOuter = receiverAtom.shells[receiverAtom.shells.length - 1];
          for (let k = 0; k < edge.count; k += 1) {
            const popped = popOuterElectron(donorAtom);
            if (!popped) break;
            const { shell: donorShell, electron: e } = popped;
            const from = worldOf(donorP, donorShell.radius, e.angle0 + now * 0.0006);
            const toAngle = reserveSlot(receiverOuter, reserved);
            const to = worldOf(receiverP, receiverOuter.radius, toAngle);
            const control = new THREE.Vector3((from.x + to.x) / 2, Math.max(from.y, to.y) + 1.6, 0.8);
            root.add(e.mesh);
            e.mesh.position.copy(from);
            travelers.push({
              mesh: e.mesh, from, to, control,
              arrive() {
                receiverAtom.group.add(e.mesh);
                e.mesh.position.set(receiverOuter.radius * Math.cos(toAngle), receiverOuter.radius * Math.sin(toAngle), 0);
                receiverOuter.electrons.push({ mesh: e.mesh, angle0: toAngle });
              },
            });
          }
        });
      }

      function finishResult(): void {
        const donorCharge = new Map(donors.map((idx) => [idx, 0]));
        const receiverCharge = new Map(receivers.map((idx) => [idx, 0]));
        edges.forEach((edge) => {
          donorCharge.set(edge.donorIdx, (donorCharge.get(edge.donorIdx) ?? 0) + edge.count);
          receiverCharge.set(edge.receiverIdx, (receiverCharge.get(edge.receiverIdx) ?? 0) - edge.count);
        });
        donors.forEach((idx, i) => {
          const charge = donorCharge.get(idx) ?? 0;
          if (charge === 0) return;
          const atom = donorAtoms[i];
          hideEmptiedShells(atom);
          const effectiveRadius = visibleRadiusOf(atom);
          root.remove(donorLabels[i]);
          const scale = labelScaleFor(effectiveRadius) * ION_LABEL_BOOST;
          donorLabels[i] = makeSignSprite(formatIonLabel(donorEls[i], charge), CATION_COLOR, scale);
          donorLabels[i].position.set(donorPos[i].x, labelYFor(donorPos[i], effectiveRadius, scale), 0.2);
          root.add(donorLabels[i]);
        });
        receivers.forEach((idx, i) => {
          const charge = receiverCharge.get(idx) ?? 0;
          if (charge === 0) return;
          root.remove(receiverLabels[i]);
          const scale = labelScaleFor(receiverRadii[i]) * ION_LABEL_BOOST;
          receiverLabels[i] = makeSignSprite(formatIonLabel(receiverEls[i], charge), ANION_COLOR, scale);
          receiverLabels[i].position.set(receiverPos[i].x, labelYFor(receiverPos[i], receiverRadii[i], scale), 0.2);
          root.add(receiverLabels[i]);
        });
      }

      setupAtoms();

      function tick(): void {
        const now = performance.now();
        donorAtoms.forEach((a) => orbitAtom(a, now));
        receiverAtoms.forEach((a) => orbitAtom(a, now));

        const t = now - animStart;
        if (animState === 'settle' && t > DURATION_SETTLE) {
          beginTravel();
          animState = 'travel';
          animStart = now;
        } else if (animState === 'travel') {
          const p = ease(Math.min(1, (now - animStart) / DURATION_TRAVEL));
          travelers.forEach((tr) => {
            const a = new THREE.Vector3().lerpVectors(tr.from, tr.control, p);
            const b = new THREE.Vector3().lerpVectors(tr.control, tr.to, p);
            tr.mesh.position.lerpVectors(a, b, p);
          });
          if (p >= 1) {
            travelers.forEach((tr) => tr.arrive());
            finishResult();
            animState = 'done';
          }
        }
      }
      tickRef.current = tick;

      // Rebuilds every atom from scratch, same as the original prototype's
      // own replay — reliably resetting state (which electron came from
      // which shell, frozen flags, emptied rings) is simpler than trying to
      // reverse in-place mutations an already-finished animation left behind.
      function replay(): void {
        donorAtoms.forEach((a) => { root.remove(a.group); disposeSimpleAtom(a); });
        receiverAtoms.forEach((a) => { root.remove(a.group); disposeSimpleAtom(a); });
        [...donorLabels, ...receiverLabels].forEach((sprite) => {
          root.remove(sprite);
          sprite.material.map?.dispose();
          sprite.material.dispose();
        });
        travelers = [];
        setupAtoms();
        animState = 'settle';
        animStart = performance.now();
      }
      replayRef.current = replay;

      const detach = attachOrbitControls(gl.domElement, camStateRef.current, minR, maxR);
      disposers.push(() => {
        detach();
        donorAtoms.forEach(disposeSimpleAtom);
        receiverAtoms.forEach(disposeSimpleAtom);
        [...donorLabels, ...receiverLabels].forEach((sprite) => {
          sprite.material.map?.dispose();
          sprite.material.dispose();
        });
      });
    } else {
      // ---- Covalent hub + spokes: the hub is whichever atom takes part in
      // the most bonds (O in H2O, N in NH3, C in CH4/CO2 — the natural
      // "center" for every simple covalent K-12 molecule).
      const degree = new Map<number, number>();
      def.bonds.forEach(([a, b]) => {
        degree.set(a, (degree.get(a) ?? 0) + 1);
        degree.set(b, (degree.get(b) ?? 0) + 1);
      });
      let hubIndex = 0;
      let bestDegree = -1;
      def.atoms.forEach((_, i) => {
        const d = degree.get(i) ?? 0;
        if (d > bestDegree) { bestDegree = d; hubIndex = i; }
      });
      const hubEl = def.atoms[hubIndex].el;
      const spokes = def.bonds
        .filter(([a, b]) => a === hubIndex || b === hubIndex)
        .map(([a, b, bondType, order]) => {
          const otherIdx = a === hubIndex ? b : a;
          return { el: def.atoms[otherIdx].el, bondType: bondType as BondType, order: order || 1 };
        });
      const N = spokes.length;

      const hubMaxRadius = maxRadiusOf(hubEl);
      const spokeMaxRadii = spokes.map((s) => maxRadiusOf(s.el));

      let hubPos: THREE.Vector3;
      let spokePos: THREE.Vector3[];
      if (N <= 1) {
        const d = N === 1 ? hubMaxRadius + spokeMaxRadii[0] - Math.min(hubMaxRadius, spokeMaxRadii[0]) * 0.85 : 3;
        hubPos = new THREE.Vector3(-d / 2, 0, 0);
        spokePos = N === 1 ? [new THREE.Vector3(d / 2, 0, 0)] : [];
      } else {
        hubPos = new THREE.Vector3(0, 0, 0);
        const span = (Math.min(150, 50 + 25 * (N - 1)) * Math.PI) / 180;
        spokePos = spokes.map((_, i) => {
          const angle = Math.PI / 2 - span / 2 + span * (i / (N - 1));
          const smaller = Math.min(hubMaxRadius, spokeMaxRadii[i]);
          const d = hubMaxRadius + spokeMaxRadii[i] - smaller * 0.85;
          return new THREE.Vector3(d * Math.cos(angle), d * Math.sin(angle), 0);
        });
      }

      const extents = [{ p: hubPos, r: hubMaxRadius }, ...spokePos.map((p, i) => ({ p, r: spokeMaxRadii[i] }))];
      const halfWidth = Math.max(...extents.map((o) => Math.abs(o.p.x) + o.r)) + 0.3;
      const halfHeight = Math.max(...extents.map((o) => {
        const labelScale = labelScaleFor(o.r) * ION_LABEL_BOOST;
        return Math.abs(o.p.y) + o.r + labelScale * 0.55 + 0.2;
      }));
      const frameSize = Math.max(halfWidth, halfHeight * 1.05);
      const dist = Math.max(4.5, (frameSize * 1.08) / Math.tan((21 * Math.PI) / 180));
      camStateRef.current = { theta: 0.08, phi: 1.3, radius: dist };
      camTargetRef.current = new THREE.Vector3(0, halfHeight * 0.22, 0);
      const minR = dist * 0.45;
      const maxR = dist * 2;

      let hubAtom: SimpleAtom;
      let spokeAtoms: SimpleAtom[] = [];
      let hubLabel: THREE.Sprite;
      let spokeLabels: THREE.Sprite[] = [];
      let animState: 'settle' | 'travel' | 'done' = 'settle';
      let animStart = performance.now();
      let travelers: Traveler[] = [];
      let sharedPairs: SharedPair[] = [];

      function setupAtoms(): void {
        hubAtom = buildSimpleAtom(hubEl);
        hubAtom.group.position.copy(hubPos);
        root.add(hubAtom.group);
        const hubScale = labelScaleFor(hubMaxRadius);
        hubLabel = makeSignSprite(hubEl, LABEL_COLOR, hubScale);
        hubLabel.position.set(hubPos.x, labelYFor(hubPos, hubMaxRadius, hubScale), 0.2);
        root.add(hubLabel);

        spokeAtoms = spokes.map((s, i) => {
          const a = buildSimpleAtom(s.el);
          a.group.position.copy(spokePos[i]);
          root.add(a.group);
          return a;
        });
        spokeLabels = spokes.map((s, i) => {
          const scale = labelScaleFor(spokeMaxRadii[i]);
          const l = makeSignSprite(s.el, LABEL_COLOR, scale);
          l.position.set(spokePos[i].x, labelYFor(spokePos[i], spokeMaxRadii[i], scale), 0.2);
          root.add(l);
          return l;
        });
      }

      function beginTravel(): void {
        const now = performance.now();
        const hubOuter = hubAtom.shells[hubAtom.shells.length - 1];
        let hubCursor = hubOuter.electrons.length;

        spokes.forEach((s, i) => {
          const spokeAtom = spokeAtoms[i];
          const spokeOuter = spokeAtom.shells[spokeAtom.shells.length - 1];
          const order = Math.min(s.order, hubOuter.electrons.length, spokeOuter.electrons.length);
          for (let p = 0; p < order; p += 1) {
            hubCursor -= 1;
            const eH = hubOuter.electrons[hubCursor];
            const eS = spokeOuter.electrons[spokeOuter.electrons.length - 1 - p];
            if (!eH || !eS) break;
            eH.frozen = true;
            eS.frozen = true;
            const fromH = worldOf(hubPos, hubOuter.radius, eH.angle0 + now * 0.0006);
            const fromS = worldOf(spokePos[i], spokeOuter.radius, eS.angle0 + now * 0.0006);
            root.add(eH.mesh, eS.mesh);
            eH.mesh.position.copy(fromH);
            eS.mesh.position.copy(fromS);
            const depthOffset = (p - (order - 1) / 2) * 0.45;
            const mid = new THREE.Vector3((hubPos.x + spokePos[i].x) / 2, (hubPos.y + spokePos[i].y) / 2, 0.4 + depthOffset);
            const dir = new THREE.Vector3().subVectors(spokePos[i], hubPos).normalize();
            const perp = new THREE.Vector3(-dir.y, dir.x, 0).multiplyScalar(0.3);
            const toH = new THREE.Vector3(mid.x - perp.x, mid.y - perp.y, mid.z);
            const toS = new THREE.Vector3(mid.x + perp.x, mid.y + perp.y, mid.z);
            travelers.push(
              { mesh: eH.mesh, from: fromH, to: toH, control: new THREE.Vector3((fromH.x + toH.x) / 2, fromH.y + (fromH.y >= mid.y ? 1.3 : -1.3), 0.6 + depthOffset), arrive() {} },
              { mesh: eS.mesh, from: fromS, to: toS, control: new THREE.Vector3((fromS.x + toS.x) / 2, fromS.y + (fromS.y >= mid.y ? 1.3 : -1.3), 0.6 + depthOffset), arrive() {} },
            );
            sharedPairs.push({ a: eH, b: eS, mid });
          }
        });
      }

      setupAtoms();

      // Even a purely covalent bond has real formal oxidation states (water
      // is still O²⁻/H⁺ in the standard bookkeeping sense, even though no
      // electron is actually transferred the way an ionic bond's is) — the
      // docked BondStoryPanel already states these as chips, so once the
      // shared pair(s) finish settling into place, swap the plain element-
      // symbol labels for the same oxidation-state notation rather than
      // leaving the 3D view silent about something the text panel already
      // says. A genuinely 0-charge atom (H2, O2, N2 — equal EN) keeps its
      // plain symbol, same as an ionic atom that never lost/gained anything.
      const oxidation = oxidationBySymbol(formula);
      function revealOxidationLabels(): void {
        function swap(label: THREE.Sprite, el: ElementSymbol, pos: THREE.Vector3, maxRadius: number): THREE.Sprite {
          const charge = oxidation[el] ?? 0;
          if (charge === 0) return label;
          root.remove(label);
          const scale = labelScaleFor(maxRadius) * ION_LABEL_BOOST;
          const color = charge > 0 ? CATION_COLOR : ANION_COLOR;
          const next = makeSignSprite(formatIonLabel(el, charge), color, scale);
          next.position.set(pos.x, labelYFor(pos, maxRadius, scale), 0.2);
          root.add(next);
          return next;
        }
        hubLabel = swap(hubLabel, hubEl, hubPos, hubMaxRadius);
        spokeLabels = spokeLabels.map((label, i) => swap(label, spokes[i].el, spokePos[i], spokeMaxRadii[i]));
      }

      function tick(): void {
        const now = performance.now();
        orbitAtom(hubAtom, now);
        spokeAtoms.forEach((a) => orbitAtom(a, now));

        const t = now - animStart;
        if (animState === 'settle' && t > DURATION_SETTLE) {
          beginTravel();
          animState = 'travel';
          animStart = now;
        } else if (animState === 'travel') {
          const p = ease(Math.min(1, (now - animStart) / DURATION_TRAVEL));
          travelers.forEach((tr) => {
            const a = new THREE.Vector3().lerpVectors(tr.from, tr.control, p);
            const b = new THREE.Vector3().lerpVectors(tr.control, tr.to, p);
            tr.mesh.position.lerpVectors(a, b, p);
          });
          if (p >= 1) {
            travelers.forEach((tr) => tr.arrive());
            revealOxidationLabels();
            animState = 'done';
          }
        } else if (animState === 'done' && sharedPairs.length) {
          const t2 = now * 0.0012;
          sharedPairs.forEach((sp) => {
            sp.a.mesh.position.set(sp.mid.x + 0.22 * Math.cos(t2), sp.mid.y + 0.22 * Math.sin(t2), sp.mid.z);
            sp.b.mesh.position.set(sp.mid.x + 0.22 * Math.cos(t2 + Math.PI), sp.mid.y + 0.22 * Math.sin(t2 + Math.PI), sp.mid.z);
          });
        }
      }
      tickRef.current = tick;

      function replay(): void {
        root.remove(hubAtom.group);
        disposeSimpleAtom(hubAtom);
        spokeAtoms.forEach((a) => { root.remove(a.group); disposeSimpleAtom(a); });
        [hubLabel, ...spokeLabels].forEach((sprite) => {
          root.remove(sprite);
          sprite.material.map?.dispose();
          sprite.material.dispose();
        });
        travelers = [];
        sharedPairs = [];
        setupAtoms();
        animState = 'settle';
        animStart = performance.now();
      }
      replayRef.current = replay;

      const detach = attachOrbitControls(gl.domElement, camStateRef.current, minR, maxR);
      disposers.push(() => {
        detach();
        disposeSimpleAtom(hubAtom);
        spokeAtoms.forEach(disposeSimpleAtom);
        [hubLabel, ...spokeLabels].forEach((sprite) => {
          sprite.material.map?.dispose();
          sprite.material.dispose();
        });
      });
    }

    return () => {
      tickRef.current = null;
      replayRef.current = null;
      disposers.forEach((d) => d());
      scene.remove(root);
    };
    // formula is the only thing that should rebuild this whole diagram —
    // see MoleculeViewer.tsx's identical reasoning for why scene/camera/gl
    // are excluded (stable for the Canvas's lifetime).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formula]);

  // The electron/label animation itself (tickRef) keeps running in VR — only
  // the orbit-camera positioning below needs to stand down, since the
  // headset's head tracking owns the camera transform once a session starts.
  const xrSession = useXR((s) => s.session);
  useFrame(() => {
    tickRef.current?.();
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

  return null;
});
