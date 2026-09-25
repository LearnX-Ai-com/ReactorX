import * as THREE from 'three';
import { ELEMENTS } from '../chemistry/elements';
import type { ElementSymbol } from '../chemistry/types';
import { fibonacciSphere } from './math';

const protonMat = new THREE.MeshStandardMaterial({ color: 0xf5a524, roughness: 0.4, metalness: 0.1 });
const neutronMat = new THREE.MeshStandardMaterial({ color: 0xaeb9d4, roughness: 0.4, metalness: 0.1 });
const electronMat = new THREE.MeshStandardMaterial({ color: 0x5eead4, emissive: 0x2dd4bf, emissiveIntensity: 0.7, roughness: 0.3 });
const ringMat = new THREE.MeshBasicMaterial({ color: 0x3a4a70, transparent: true, opacity: 0.55 });

export interface SimpleAtomElectron {
  mesh: THREE.Mesh;
  angle0: number;
  frozen?: boolean;
}

export interface SimpleAtomShell {
  radius: number;
  ring: THREE.MeshBasicMaterial;
  electrons: SimpleAtomElectron[];
}

export interface SimpleAtom {
  symbol: ElementSymbol;
  group: THREE.Group;
  shells: SimpleAtomShell[];
  /** Same maxRadius formula BohrAtomModel/MoleculeViewer use elsewhere —
   * based on the element's TRUE shell count, not just the one ring this
   * simplified atom actually draws, so framing/spacing math (BondStoryViewer)
   * stays consistent with the rest of the app's atom-sizing conventions. */
  maxRadius: number;
}

/**
 * A stripped-down Bohr-style atom — nucleus cluster + only its outermost
 * occupied shell(s) (inner/core electrons below that are still implied,
 * the same simplification a standard Lewis structure makes) — built for
 * the bond-story diagrams (BondStoryViewer), where the point is the
 * bonding electrons specifically, not the full atom. Ported from the
 * original single-file prototype's buildSimpleAtom(symbol, outerShellOnly).
 *
 * `guaranteedElectrons`: an ionic donor sometimes needs to give up more
 * electrons than its own true outer shell holds — iron giving up to 3 for
 * Fe³⁺ with only 2 in its 4s shell, the 3rd coming from the shell just
 * inside it. Pass the most this atom could plausibly need to donate in
 * this diagram (its ionChargeRange max) and enough shells are drawn,
 * outermost first, to cover it — 0 (the default) draws just the true
 * outer shell, correct for every non-donor and every ordinary donor.
 */
export function buildSimpleAtom(symbol: ElementSymbol, guaranteedElectrons = 0): SimpleAtom {
  const el = ELEMENTS[symbol];
  const neutrons = el.neutrons ?? 0;
  const total = el.number + neutrons;
  const group = new THREE.Group();

  const packRadius = 0.45 + Math.min(0.5, (total - 1) * 0.012);
  const sphereRadius = Math.max(0.11, 0.22 - Math.max(0, total - 16) * 0.0025);
  const nucleusGroup = new THREE.Group();
  let p = el.number;
  let n = neutrons;
  let i = 0;
  const positions = fibonacciSphere(total, packRadius);
  while (p > 0 || n > 0) {
    const isProton = (i % 2 === 0 && p > 0) || n === 0;
    if (isProton) p -= 1; else n -= 1;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(sphereRadius, 14, 12), isProton ? protonMat : neutronMat);
    mesh.position.copy(positions[i] ?? new THREE.Vector3());
    nucleusGroup.add(mesh);
    i += 1;
  }
  group.add(nucleusGroup);

  // Walk inward from the true outermost shell, accumulating electron
  // counts, until there are enough to cover `guaranteedElectrons` (or
  // every shell is included) — then draw exactly that trailing run, so
  // shells[] stays ordered innermost-of-the-kept-set -> true outermost,
  // matching the order buildSimpleAtom's original walked its own
  // hand-picked bondShellDepth.
  let startIdx = el.shells.length - 1;
  let accumulated = 0;
  while (startIdx >= 0) {
    accumulated += el.shells[startIdx] ?? 0;
    if (accumulated >= guaranteedElectrons) break;
    startIdx -= 1;
  }
  startIdx = Math.max(0, startIdx);

  const shells: SimpleAtomShell[] = [];
  for (let idx = startIdx; idx < el.shells.length; idx += 1) {
    const count = el.shells[idx] ?? 0;
    const radius = 1.35 + idx * 0.85;
    const ring = ringMat.clone();
    group.add(new THREE.Mesh(new THREE.TorusGeometry(radius, 0.02, 8, 64), ring));
    const electrons: SimpleAtomElectron[] = [];
    for (let j = 0; j < count; j++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), electronMat.clone());
      group.add(mesh);
      electrons.push({ mesh, angle0: (j / count) * Math.PI * 2 });
    }
    shells.push({ radius, ring, electrons });
  }

  return {
    symbol,
    group,
    shells,
    maxRadius: 1.35 + Math.max(0, el.shells.length - 1) * 0.85,
  };
}

/** Pops one electron off the outermost shell that still has one, walking
 * progressively further in as outer shells empty — the multi-shell
 * counterpart to `atom.shells[atom.shells.length-1].electrons.pop()` for a
 * donor that needs more electrons than its true outer shell alone holds
 * (see buildSimpleAtom's guaranteedElectrons doc). Returns null once the
 * atom has nothing left to give across every shell that was drawn. */
export function popOuterElectron(atom: SimpleAtom): { shell: SimpleAtomShell; electron: SimpleAtomElectron } | null {
  for (let i = atom.shells.length - 1; i >= 0; i -= 1) {
    const shell = atom.shells[i];
    if (shell.electrons.length > 0) return { shell, electron: shell.electrons.pop()! };
  }
  return null;
}

export function disposeSimpleAtom(atom: SimpleAtom): void {
  atom.group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
    else o.material.dispose();
  });
}
