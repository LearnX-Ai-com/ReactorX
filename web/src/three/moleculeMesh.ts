import * as THREE from 'three';
import { ELEMENTS } from '../chemistry/elements';
import { getKnownMolecule } from '../chemistry/moleculeSource';
import type { BondType, ElementSymbol } from '../chemistry/types';

const sphereGeoCache = new Map<ElementSymbol, THREE.SphereGeometry>();
export function getSphereGeo(el: ElementSymbol): THREE.SphereGeometry {
  let geo = sphereGeoCache.get(el);
  if (!geo) {
    geo = new THREE.SphereGeometry(ELEMENTS[el].r, 20, 16);
    sphereGeoCache.set(el, geo);
  }
  return geo;
}

const sphereMatCache = new Map<ElementSymbol, THREE.MeshStandardMaterial>();
export function getSphereMat(el: ElementSymbol): THREE.MeshStandardMaterial {
  let mat = sphereMatCache.get(el);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: ELEMENTS[el].color, roughness: 0.4, metalness: 0.1,
      emissive: ELEMENTS[el].color, emissiveIntensity: 0.06,
    });
    sphereMatCache.set(el, mat);
  }
  return mat;
}

const bondMatCovalent = new THREE.MeshStandardMaterial({ color: 0xaeb9d4, roughness: 0.5, metalness: 0.05 });
const bondMatIonic = new THREE.MeshStandardMaterial({ color: 0xf5a524, roughness: 0.4, metalness: 0.05, emissive: 0x7a4a0a, emissiveIntensity: 0.5 });

/**
 * `atomRadius` is the smaller of the two bonded atoms' own sphere radii
 * (ELEMENTS[el].r) — bond thickness is a fraction of THAT, not a flat
 * number. A fixed absolute radius (what this used to be) can only ever be
 * tuned right for one atom pair at a time: thick enough for a Cl-Cl bond
 * reads as a hair next to an actual H atom, and any single fixed number
 * left H-containing bonds (H2, HCl, H2O, ...) looking bond-less at a glance
 * even after bumping it once already. Scaling with the atom itself makes
 * every bond a consistent, clearly-visible fraction of what it's attached
 * to, for any element pair, without re-tuning per formula.
 */
export function buildBond(
  posA: [number, number, number], posB: [number, number, number], type: BondType, order: number | undefined, atomRadius: number,
): THREE.Mesh[] {
  const a = new THREE.Vector3(...posA);
  const b = new THREE.Vector3(...posB);
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

  if (type === 'covalent') {
    // Bond order (1/2/3 shared pairs, e.g. O=O or N#N) renders as that many
    // thinner parallel cylinders rather than one bond of the same thickness —
    // otherwise a double bond looks structurally identical to a single one.
    const n = order || 1;
    const radius = (n === 1 ? 0.55 : 0.42) * atomRadius;
    const geo = new THREE.CylinderGeometry(radius, radius, len, 8);
    const axis = dir.clone().normalize();
    const arbitrary = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const perp = new THREE.Vector3().crossVectors(axis, arbitrary).normalize().multiplyScalar(0.85 * atomRadius);
    const meshes: THREE.Mesh[] = [];
    for (let k = 0; k < n; k++) {
      const mesh = new THREE.Mesh(geo, bondMatCovalent);
      mesh.position.copy(mid).addScaledVector(perp, k - (n - 1) / 2);
      mesh.quaternion.copy(quat);
      mesh.userData.disposeGeo = k === n - 1; // geometry is shared across the parallel meshes — dispose it once
      meshes.push(mesh);
    }
    return meshes;
  }
  // ionic: solid and a touch thicker/brighter than a covalent bond, so the
  // electrostatic attraction reads as clearly as the shared-electron bond
  // does. Ionic bonding is electrostatic rather than discrete shared pairs,
  // so it always renders as one line regardless of how many electrons
  // actually transfer.
  const radius = 0.62 * atomRadius;
  const geo = new THREE.CylinderGeometry(radius, radius, len, 8);
  const mesh = new THREE.Mesh(geo, bondMatIonic);
  mesh.position.copy(mid);
  mesh.quaternion.copy(quat);
  mesh.userData.disposeGeo = true;
  return [mesh];
}

export function buildMoleculeMesh(formula: string): THREE.Group {
  const group = new THREE.Group();
  const def = getKnownMolecule(formula);
  // Not resolved yet (a multi-element custom composition still awaiting its
  // AI-backend fetch) — render nothing rather than crash; the caller
  // re-populates the group once the fetch resolves and caches it.
  if (!def) {
    group.userData.formula = formula;
    return group;
  }
  def.atoms.forEach((atom) => {
    const mesh = new THREE.Mesh(getSphereGeo(atom.el), getSphereMat(atom.el));
    mesh.position.set(atom.pos[0], atom.pos[1], atom.pos[2]);
    group.add(mesh);
  });
  def.bonds.forEach(([i, j, type, count]) => {
    const atomRadius = Math.min(ELEMENTS[def.atoms[i].el].r, ELEMENTS[def.atoms[j].el].r);
    buildBond(def.atoms[i].pos, def.atoms[j].pos, type, count, atomRadius).forEach((m) => {
      m.userData.bondType = type;
      m.userData.elementA = def.atoms[i].el;
      m.userData.elementB = def.atoms[j].el;
      m.userData.order = count || 1;
      group.add(m);
    });
  });
  group.userData.formula = formula;
  return group;
}

/** Disposes bond geometry created by buildBond/buildMoleculeMesh. Shared
 * sphere/bond-material caches above are intentionally left alone. */
export function disposeMoleculeMesh(group: THREE.Object3D): void {
  group.traverse((o) => {
    if (o.userData?.disposeGeo && o instanceof THREE.Mesh) o.geometry.dispose();
  });
}

function layoutPositions(count: number, cols: number, spacing: number): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  const totalCols = Math.min(count, cols);
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push(new THREE.Vector3(
      (col - (totalCols - 1) / 2) * spacing,
      row * spacing * 0.85,
      (Math.random() - 0.5) * 0.4,
    ));
  }
  return positions;
}

export interface MoleculeInstance {
  mesh: THREE.Group;
  bob: { phase: number; speed: number; baseY: number };
  spin: THREE.Vector3;
}

/** Adds `count` copies of `formula`, laid out in a small grid, to `group`.
 * Each instance carries a random bob/spin so a crowd of the same molecule
 * doesn't read as one frozen copy pasted repeatedly. */
export function addInstances(group: THREE.Group, formula: string, count: number): void {
  const positions = layoutPositions(count, 2, 1.7);
  positions.forEach((pos) => {
    const mesh = buildMoleculeMesh(formula);
    mesh.position.copy(pos);
    mesh.userData.bob = { phase: Math.random() * Math.PI * 2, speed: 0.6 + Math.random() * 0.4, baseY: pos.y };
    mesh.userData.spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .normalize().multiplyScalar(0.15 + Math.random() * 0.2);
    group.add(mesh);
  });
}

export function clearGroup(group: THREE.Group): void {
  while (group.children.length) {
    const obj = group.children.pop()!;
    disposeMoleculeMesh(obj);
    group.remove(obj);
  }
}

/** Bond cylinders run along their local Y axis, so scaling Y shrinks a bond
 * to nothing at its midpoint (and grows it back) — used to animate bonds
 * breaking/forming. */
export function setBondScale(group: THREE.Object3D, s: number): void {
  group.traverse((o) => {
    if (o.userData?.bondType) o.scale.y = s;
  });
}

