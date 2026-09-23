// Deterministic 3D layout computed from a bond graph — the AI is only ever
// asked for structure (which atoms bond to which, bond order/type), never
// positions and never rendering code. Same principle as the rest of the app:
// the model proposes data, our own code turns it into geometry.

const BOND_LENGTH = 1.0;

/** Evenly distribute `count` directions across a sphere (same technique as
 * the frontend's fibonacciSphere, reimplemented here since this is a
 * separate deployable unit from web/). */
function fibonacciDirections(count: number): [number, number, number][] {
  const dirs: [number, number, number][] = [];
  if (count <= 0) return dirs;
  const offset = 2 / count;
  const increment = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = i * offset - 1 + offset / 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = i * increment;
    dirs.push([Math.cos(phi) * r, y, Math.sin(phi) * r]);
  }
  return dirs;
}

export interface LayoutBond {
  a: number;
  b: number;
}

/** BFS out from the highest-degree atom, placing each newly-visited atom one
 * bond-length from its parent along an evenly-spread direction. Not
 * chemically accurate (no real bond angles) — just non-overlapping and
 * reasonable to render, matching how the app's own hand-authored molecule
 * positions are already simplified/illustrative rather than physically exact. */
export function layoutMolecule(atomCount: number, bonds: LayoutBond[]): [number, number, number][] {
  const adjacency: number[][] = Array.from({ length: atomCount }, () => []);
  bonds.forEach(({ a, b }) => {
    if (a === b || a < 0 || b < 0 || a >= atomCount || b >= atomCount) return;
    adjacency[a].push(b);
    adjacency[b].push(a);
  });

  const positions: ([number, number, number] | undefined)[] = new Array(atomCount);
  const visited = new Array(atomCount).fill(false);

  let start = 0;
  for (let i = 1; i < atomCount; i++) {
    if (adjacency[i].length > adjacency[start].length) start = i;
  }
  positions[start] = [0, 0, 0];
  visited[start] = true;

  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    const curPos = positions[cur]!;
    const neighbors = adjacency[cur].filter((n) => !visited[n]);
    const dirs = fibonacciDirections(neighbors.length);
    neighbors.forEach((n, i) => {
      const [dx, dy, dz] = dirs[i];
      positions[n] = [curPos[0] + dx * BOND_LENGTH, curPos[1] + dy * BOND_LENGTH, curPos[2] + dz * BOND_LENGTH];
      visited[n] = true;
      queue.push(n);
    });
  }

  // Disconnected atoms shouldn't happen (validated before this runs), but
  // give them a deterministic fallback spot rather than crashing.
  for (let i = 0; i < atomCount; i++) {
    if (!positions[i]) positions[i] = [i * 1.6, 0, 0];
  }
  return positions as [number, number, number][];
}
