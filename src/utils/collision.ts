import type { AABB } from '../types/game';
import { WORLD_PLAYABLE_LIMIT } from '../game/gameConfig';

export class CollisionWorld {
  public colliders: AABB[] = [];

  public getBoxes(): AABB[] {
    return this.colliders;
  }

  public clear(): void {
    this.colliders.length = 0;
  }

  public addBox(
    id: string,
    centerX: number,
    centerZ: number,
    width: number,
    depth: number,
    height: number,
    tag: AABB['tag'] = 'building',
  ): void {
    const hw = width * 0.5;
    const hd = depth * 0.5;
    this.colliders.push({
      id,
      minX: centerX - hw,
      maxX: centerX + hw,
      minZ: centerZ - hd,
      maxZ: centerZ + hd,
      height,
      tag,
    });
  }

  /**
   * Fast circle-vs-AABB overlap test with optional vertical height check.
   */
  public intersectsPoint(x: number, z: number, radius = 0.1, y = 0.5): boolean {
    for (let i = 0; i < this.colliders.length; i++) {
      const box = this.colliders[i];
      if (y > box.height) continue;
      if (
        x + radius >= box.minX &&
        x - radius <= box.maxX &&
        z + radius >= box.minZ &&
        z - radius <= box.maxZ
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Resolves a circle (x, z, radius) against all static AABBs and playable world bounds.
   * Returns whether any significant impact occurred along with corrected coordinates.
   */
  public resolveCircle(
    x: number,
    z: number,
    radius: number,
  ): { x: number; z: number; hit: boolean; hitNormalX: number; hitNormalZ: number } {
    let rx = x;
    let rz = z;
    let hit = false;
    let hitNormalX = 0;
    let hitNormalZ = 0;

    // World boundary clamp (natural coastal promenade perimeter)
    const limit = WORLD_PLAYABLE_LIMIT - radius;
    if (rx < -limit) {
      rx = -limit;
      hit = true;
      hitNormalX = 1;
    } else if (rx > limit) {
      rx = limit;
      hit = true;
      hitNormalX = -1;
    }
    if (rz < -limit) {
      rz = -limit;
      hit = true;
      hitNormalZ = 1;
    } else if (rz > limit) {
      rz = limit;
      hit = true;
      hitNormalZ = -1;
    }

    for (let i = 0; i < this.colliders.length; i++) {
      const box = this.colliders[i];
      if (rx + radius < box.minX || rx - radius > box.maxX || rz + radius < box.minZ || rz - radius > box.maxZ) {
        continue;
      }

      const closestX = rx < box.minX ? box.minX : rx > box.maxX ? box.maxX : rx;
      const closestZ = rz < box.minZ ? box.minZ : rz > box.maxZ ? box.maxZ : rz;

      const dx = rx - closestX;
      const dz = rz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        hit = true;
        if (distSq > 0.00001) {
          const dist = Math.sqrt(distSq);
          const overlap = radius - dist;
          const nx = dx / dist;
          const nz = dz / dist;
          rx += nx * overlap;
          rz += nz * overlap;
          hitNormalX = nx;
          hitNormalZ = nz;
        } else {
          // Inside box fallback: push out via nearest edge
          const dLeft = Math.abs(rx - box.minX);
          const dRight = Math.abs(box.maxX - rx);
          const dTop = Math.abs(rz - box.minZ);
          const dBottom = Math.abs(box.maxZ - rz);
          const minEdge = Math.min(dLeft, dRight, dTop, dBottom);
          if (minEdge === dLeft) {
            rx = box.minX - radius;
            hitNormalX = -1;
          } else if (minEdge === dRight) {
            rx = box.maxX + radius;
            hitNormalX = 1;
          } else if (minEdge === dTop) {
            rz = box.minZ - radius;
            hitNormalZ = -1;
          } else {
            rz = box.maxZ + radius;
            hitNormalZ = 1;
          }
        }
      }
    }

    return { x: rx, z: rz, hit, hitNormalX, hitNormalZ };
  }

  /**
   * Analytic segment-vs-AABB intersection in 3D so the camera never clips inside buildings.
   * Returns parametric t in [0.15, 1] along segment from target -> desiredCam.
   */
  public clipCameraSegment(
    tx: number,
    ty: number,
    tz: number,
    cx: number,
    cy: number,
    cz: number,
    margin = 0.6,
  ): number {
    let minT = 1.0;
    const dx = cx - tx;
    const dy = cy - ty;
    const dz = cz - tz;

    for (let i = 0; i < this.colliders.length; i++) {
      const b = this.colliders[i];
      if (b.height < 2.2) continue;

      const minX = b.minX - margin;
      const maxX = b.maxX + margin;
      const minZ = b.minZ - margin;
      const maxZ = b.maxZ + margin;
      const maxY = b.height + margin;

      let tmin = 0;
      let tmax = 1;

      if (Math.abs(dx) < 1e-6) {
        if (tx < minX || tx > maxX) continue;
      } else {
        const inv = 1 / dx;
        let t1 = (minX - tx) * inv;
        let t2 = (maxX - tx) * inv;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      if (Math.abs(dz) < 1e-6) {
        if (tz < minZ || tz > maxZ) continue;
      } else {
        const inv = 1 / dz;
        let t1 = (minZ - tz) * inv;
        let t2 = (maxZ - tz) * inv;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      if (Math.abs(dy) < 1e-6) {
        if (ty < 0 || ty > maxY) continue;
      } else {
        const inv = 1 / dy;
        let t1 = (0 - ty) * inv;
        let t2 = (maxY - ty) * inv;
        if (t1 > t2) {
          const tmp = t1;
          t1 = t2;
          t2 = tmp;
        }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      if (tmin >= 0 && tmin < minT) {
        minT = Math.max(0.22, tmin - 0.04);
      }
    }

    return minT;
  }
}
