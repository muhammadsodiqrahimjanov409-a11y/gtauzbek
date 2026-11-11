import type { Vec3 } from '../types/game';
import { ROAD_COORDS } from '../game/gameConfig';

/**
 * Computes a Manhattan-like street-aligned polyline from `start` to `target`
 * snapped onto the nearest Nexus City avenues and cross streets, with direct fallback.
 */
export function computeNavigationRoute(start: Vec3, target: Vec3): Vec3[] {
  const nearestRoad = (val: number): number => {
    let best: number = ROAD_COORDS[0];
    let bestDist = Math.abs(val - best);
    for (let i = 1; i < ROAD_COORDS.length; i++) {
      const d = Math.abs(val - ROAD_COORDS[i]);
      if (d < bestDist) {
        best = ROAD_COORDS[i];
        bestDist = d;
      }
    }
    return best;
  };

  const dx = target.x - start.x;
  const dz = target.z - start.z;
  if (dx * dx + dz * dz < 400) {
    return [{ ... start }, { ...target }];
  }

  const startRoadX = nearestRoad(start.x);
  const targetRoadZ = nearestRoad(target.z);

  return [
    { x: start.x, y: 0.25, z: start.z },
    { x: startRoadX, y: 0.25, z: start.z },
    { x: startRoadX, y: 0.25, z: targetRoadZ },
    { x: target.x, y: 0.25, z: targetRoadZ },
    { x: target.x, y: 0.25, z: target.z },
  ];
}

export function computeDistance2D(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dz * dz);
}
