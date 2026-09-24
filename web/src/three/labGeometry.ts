/**
 * Meter-scale U-shaped lab geometry, per the ReactorX spec's `labConfig`:
 * a 5m center wall (the reaction theater) with two 3m side walls angled
 * inward toward a fixed student position, so all three walls stay in view
 * without the student needing to walk around. Numbers here trace directly
 * back to the spec document rather than being guessed — if the spec's
 * angle or wall sizes change, only this file needs updating.
 */
export const LAB = {
  student: { position: [0, 1.6, 0] as [number, number, number] },
  center: { position: [0, 2, -3] as [number, number, number], width: 5, height: 2.8 },
  side: { width: 3, height: 2.8, inwardAngleDeg: 40 },
  floor: 12,
};

export interface WallTransform {
  position: [number, number, number];
  rotationY: number;
}

/**
 * A side wall's center + yaw, derived (not hand-picked) from the center
 * wall's edge and the inward angle: pivot at the center wall's corresponding
 * edge, then extend outward along a direction rotated `inwardAngleDeg`
 * toward the student (+Z, since the walls sit at negative Z). rotation.y is
 * the negative of that same angle (mirrored for the right wall) so the
 * wall's local +Z front face — the convention every wall in this room uses
 * — ends up facing back toward the student instead of edge-on.
 */
export function computeSideWallTransform(side: 'left' | 'right'): WallTransform {
  const sign = side === 'left' ? -1 : 1;
  const angle = (LAB.side.inwardAngleDeg * Math.PI) / 180;
  const half = LAB.side.width / 2;
  const dirX = sign * Math.cos(angle);
  const dirZ = Math.sin(angle);
  return {
    position: [
      sign * (LAB.center.width / 2) + dirX * half,
      LAB.center.position[1],
      LAB.center.position[2] + dirZ * half,
    ],
    rotationY: -sign * angle,
  };
}

/**
 * Yaw (radians) the look-controls need, at `from`, to face `to` — matches
 * the camera direction convention in ChamberRoom's useFrame:
 * dir = (sin(yaw)cos(pitch), sin(pitch), -cos(yaw)cos(pitch)). The "from"
 * point matters: a wall off to the side needs a much smaller turn once
 * you're standing close to it than it does from across the room, so a yaw
 * computed from one vantage point doesn't stay correct from another.
 */
export function yawBetween(from: [number, number], to: [number, number]): number {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  return Math.atan2(dx, -dz);
}

/**
 * Yaw (radians) the student's look-controls need so the camera faces a
 * given world (x, z) point from the student's fixed standing position —
 * used to drive the wall-focus buttons at the default (not zoomed-in)
 * distance so their target angle always matches the wall's actual position
 * instead of a separately hand-tuned constant.
 */
export function yawToFace(target: [number, number]): number {
  return yawBetween([LAB.student.position[0], LAB.student.position[2]], target);
}
