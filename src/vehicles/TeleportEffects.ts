import * as THREE from 'three';
import { WORLD_PLAYABLE_LIMIT } from '../game/gameConfig';
import type { CollisionWorld } from '../utils/collision';

export interface BlockingCarObstacle {
  x: number;
  z: number;
  radius: number;
}

export interface OverpassTeleportComputation {
  triggered: boolean;
  overX: number;
  overZ: number;
  landX: number;
  landZ: number;
}

/**
 * Checks if a blocking vehicle sits in the actor's immediate forward corridor and computes
 * a clean teleportation landing spot on the far side of any stacked cars.
 */
export function computeVehicleOverpassTarget(
  actorX: number,
  actorZ: number,
  fwdX: number,
  fwdZ: number,
  blockingCars: BlockingCarObstacle[],
  lookaheadMax = 5.4,
  lateralMax = 2.55,
  collisionWorld?: CollisionWorld,
): OverpassTeleportComputation {
  let hitCar: BlockingCarObstacle | null = null;
  let closestFwd = Infinity;

  for (let i = 0; i < blockingCars.length; i++) {
    const c = blockingCars[i];
    const dx = c.x - actorX;
    const dz = c.z - actorZ;
    const fwdProj = dx * fwdX + dz * fwdZ;
    const latProj = Math.abs(dx * fwdZ - dz * fwdX);

    if (fwdProj > -0.6 && fwdProj < lookaheadMax && latProj < lateralMax) {
      if (fwdProj < closestFwd) {
        closestFwd = fwdProj;
        hitCar = c;
      }
    }
  }

  if (!hitCar) {
    return { triggered: false, overX: actorX, overZ: actorZ, landX: actorX, landZ: actorZ };
  }

  // Step forward past all contiguous cars in the lane until a genuinely clear landing pocket is found
  let chosenDist = Math.max(6.8, closestFwd + 5.2);
  let foundClearPocket = false;

  for (let stepDist = chosenDist; stepDist <= 30; stepDist += 3.8) {
    const candX = actorX + fwdX * stepDist;
    const candZ = actorZ + fwdZ * stepDist;

    if (Math.abs(candX) > WORLD_PLAYABLE_LIMIT - 2 || Math.abs(candZ) > WORLD_PLAYABLE_LIMIT - 2) {
      break;
    }

    let overlapsCar = false;
    for (let j = 0; j < blockingCars.length; j++) {
      const bc = blockingCars[j];
      const dSq = (candX - bc.x) * (candX - bc.x) + (candZ - bc.z) * (candZ - bc.z);
      const minClear = bc.radius + 1.85;
      if (dSq < minClear * minClear) {
        overlapsCar = true;
        break;
      }
    }

    if (!overlapsCar && (!collisionWorld || !collisionWorld.intersectsPoint(candX, candZ, 1.4, 0.8))) {
      chosenDist = stepDist;
      foundClearPocket = true;
      break;
    }
  }

  if (!foundClearPocket) {
    return { triggered: false, overX: actorX, overZ: actorZ, landX: actorX, landZ: actorZ };
  }

  let landX = THREE.MathUtils.clamp(actorX + fwdX * chosenDist, -WORLD_PLAYABLE_LIMIT + 3, WORLD_PLAYABLE_LIMIT - 3);
  let landZ = THREE.MathUtils.clamp(actorZ + fwdZ * chosenDist, -WORLD_PLAYABLE_LIMIT + 3, WORLD_PLAYABLE_LIMIT - 3);

  if (collisionWorld) {
    const safe = collisionWorld.resolveCircle(landX, landZ, 1.35);
    landX = safe.x;
    landZ = safe.z;
  }

  return {
    triggered: true,
    overX: hitCar.x,
    overZ: hitCar.z,
    landX,
    landZ,
  };
}

interface WarpNodeSlot {
  group: THREE.Group;
  ringMat: THREE.MeshBasicMaterial;
  beamMat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

export interface TeleportEffectsSystem {
  group: THREE.Group;
  spawnOverpassFX: (
    fromX: number,
    fromZ: number,
    overX: number,
    overZ: number,
    toX: number,
    toZ: number,
    colorHex?: number,
  ) => void;
  update: (dt: number) => void;
}

export function createTeleportEffectsSystem(poolSize = 24): TeleportEffectsSystem {
  const group = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(0.65, 1.45, 24);
  ringGeo.rotateX(-Math.PI * 0.5);
  const beamGeo = new THREE.CylinderGeometry(1.05, 1.25, 2.2, 16, 1, true);
  beamGeo.translate(0, 1.1, 0);

  const slots: WarpNodeSlot[] = [];
  let cursor = 0;

  for (let i = 0; i < poolSize; i++) {
    const slotGroup = new THREE.Group();
    slotGroup.visible = false;

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const ring = new THREE.Mesh(ringGeo, ringMat);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    slotGroup.add(ring, beam);
    group.add(slotGroup);

    slots.push({
      group: slotGroup,
      ringMat,
      beamMat,
      life: 0,
      maxLife: 0.34,
    });
  }

  const triggerNode = (x: number, y: number, z: number, colorHex: number, scale = 1.0, duration = 0.34) => {
    const slot = slots[cursor % slots.length];
    cursor++;
    slot.life = duration;
    slot.maxLife = duration;
    slot.ringMat.color.setHex(colorHex);
    slot.beamMat.color.setHex(colorHex);
    slot.ringMat.opacity = 0.9;
    slot.beamMat.opacity = 0.38;
    slot.group.position.set(x, y, z);
    slot.group.scale.setScalar(scale * 0.72);
    slot.group.visible = true;
  };

  return {
    group,
    spawnOverpassFX: (fromX, fromZ, _overX, _overZ, toX, toZ, colorHex = 0x22d3ee) => {
      // Ground-level departure & arrival phase rings (no vertical airborne jump)
      triggerNode(fromX, 0.06, fromZ, colorHex, 0.95, 0.26);
      triggerNode(toX, 0.06, toZ, colorHex, 1.05, 0.32);
    },
    update: (dt) => {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (s.life <= 0) continue;
        s.life -= dt;
        if (s.life <= 0) {
          s.life = 0;
          s.group.visible = false;
          continue;
        }
        const t = 1 - s.life / s.maxLife; // 0 -> 1
        const fade = 1 - t;
        s.ringMat.opacity = fade * 0.88;
        s.beamMat.opacity = fade * fade * 0.36;
        const pulseScale = 0.75 + t * 0.68;
        s.group.scale.set(pulseScale, 1 - t * 0.35, pulseScale);
      }
    },
  };
}
