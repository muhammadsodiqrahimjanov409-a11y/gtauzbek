import * as THREE from 'three';
import type { Vec3 } from '../types/game';
import {
  ENTERABLE_BUILDINGS,
  ROAD_COORDS,
  ROAD_WIDTH,
  SIDEWALK_WIDTH,
  WORLD_PLAYABLE_LIMIT,
} from '../game/gameConfig';
import type { CollisionWorld } from '../utils/collision';
import { createProceduralHumanoid, type HumanoidRig } from '../player/Player';
import { computeVehicleOverpassTarget, type BlockingCarObstacle } from './TeleportEffects';
import { getBuildingBrowseSpots } from '../world/Interiors';

type VisitState = 'none' | 'to_door' | 'to_spot' | 'browsing' | 'to_exit_door' | 'to_sidewalk';

interface PedestrianAgent {
  id: number;
  rig: HumanoidRig;
  x: number;
  z: number;
  axis: 'ns' | 'ew';
  dir: 1 | -1;
  roadCoord: number;
  sideSign: 1 | -1;
  walkSpeed: number;
  evadeTimer: number;
  recoverTimer: number;
  evadeVelX: number;
  evadeVelZ: number;
  teleportTimer: number;
  teleportCooldown: number;
  dead: boolean;
  deadTimer: number;
  fallYaw: number;
  visitState: VisitState;
  visitBuildingIdx: number;
  visitSpotX: number;
  visitSpotZ: number;
  visitSpotYaw: number;
  browseTimer: number;
  visitCooldown: number;
  fleeingExit: boolean;
}

const PED_JACKETS = [0x0284c7, 0xd97706, 0x059669, 0x7c3aed, 0xe11d48, 0x475569, 0x0f766e, 0xca8a04];
const PED_PANTS = [0x1e293b, 0x334155, 0x0f172a, 0x44403c];
const PED_SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0xffdbac];

export interface MovingVehicleThreat {
  x: number;
  z: number;
  vx: number;
  vz: number;
  speed: number;
  isPlayer: boolean;
}

export interface PedestrianTarget {
  id: number;
  x: number;
  z: number;
}

export interface PedestrianSystem {
  group: THREE.Group;
  getActivePositions: () => Array<{ x: number; z: number }>;
  getActiveTargets: () => PedestrianTarget[];
  eliminatePedestrian: (id: number, impactDirX?: number, impactDirZ?: number) => boolean;
  scatterFromSound: (originX: number, originZ: number, radius: number) => void;
  update: (
    dt: number,
    playerPos: Vec3,
    maxActiveCount: number,
    vehicleThreats: MovingVehicleThreat[],
    collisionWorld: CollisionWorld,
    parkedCars?: BlockingCarObstacle[],
    onTeleportOverpass?: (
      fromX: number,
      fromZ: number,
      overX: number,
      overZ: number,
      toX: number,
      toZ: number,
    ) => void,
  ) => { playerHitPedestrian: boolean };
}

function getDoorThresholdZ(bIdx: number, insideOffset = 0): number {
  const b = ENTERABLE_BUILDINGS[bIdx];
  const fSign = b.doorFacing === 'south' ? 1 : -1;
  return b.centerZ + fSign * (b.depth * 0.5 - insideOffset);
}

export function createPedestrianSystem(totalCount = 58, isSoftwareGl = false): PedestrianSystem {
  const group = new THREE.Group();
  const agents: PedestrianAgent[] = [];

  const sidewalkOffset = ROAD_WIDTH * 0.5 + SIDEWALK_WIDTH * 0.5; // 19.25m from road center
  const innerRoads = ROAD_COORDS.slice(1, -1); // [-260, -130, 0, 130, 260]
  const walkBound = WORLD_PLAYABLE_LIMIT - 44;

  for (let i = 0; i < totalCount; i++) {
    const rig = createProceduralHumanoid(
      PED_JACKETS[i % PED_JACKETS.length],
      PED_PANTS[i % PED_PANTS.length],
      PED_SKINS[i % PED_SKINS.length],
      !isSoftwareGl && i < 12,
    );

    // Seed the first N pedestrians already inside all enterable buildings so every skyscraper & venue has visitors immediately!
    if (i < ENTERABLE_BUILDINGS.length) {
      const b = ENTERABLE_BUILDINGS[i];
      const spots = getBuildingBrowseSpots(b);
      const spot = spots[i % spots.length];
      const sideSign: 1 | -1 = b.sidewalkZ > b.roadZ ? 1 : -1;

      rig.root.position.set(spot.x, 0.1, spot.z);
      rig.root.rotation.y = spot.yaw;
      group.add(rig.root);

      agents.push({
        id: i,
        rig,
        x: spot.x,
        z: spot.z,
        axis: 'ew',
        dir: i % 2 === 0 ? 1 : -1,
        roadCoord: b.roadZ,
        sideSign,
        walkSpeed: 1.58 + (i % 4) * 0.22,
        evadeTimer: 0,
        recoverTimer: 0,
        evadeVelX: 0,
        evadeVelZ: 0,
        teleportTimer: 0,
        teleportCooldown: 0,
        dead: false,
        deadTimer: 0,
        fallYaw: 0,
        visitState: 'browsing',
        visitBuildingIdx: i,
        visitSpotX: spot.x,
        visitSpotZ: spot.z,
        visitSpotYaw: spot.yaw,
        browseTimer: 4.5 + (i % 5) * 1.8,
        visitCooldown: 0,
        fleeingExit: false,
      });
      continue;
    }

    // Make ~70% EW pedestrians along all 5 inner boulevards [-260, -130, 0, 130, 260] so people visit all 20 buildings!
    const axis: 'ns' | 'ew' = i % 3 === 0 ? 'ns' : 'ew';
    const dir: 1 | -1 = i % 2 === 0 ? 1 : -1;
    const ewVenueRoads = [-260, -130, 0, 130, 260];
    const roadCoord =
      axis === 'ew' ? ewVenueRoads[i % ewVenueRoads.length] : innerRoads[i % innerRoads.length];
    const sideSign: 1 | -1 = i % 4 < 2 ? 1 : -1;
    const along = -320 + ((i * 53) % 640);

    const x = axis === 'ns' ? roadCoord + sideSign * sidewalkOffset : along;
    const z = axis === 'ns' ? along : roadCoord + sideSign * sidewalkOffset;

    rig.root.position.set(x, 0, z);
    group.add(rig.root);

    agents.push({
      id: i,
      rig,
      x,
      z,
      axis,
      dir,
      roadCoord,
      sideSign,
      walkSpeed: 1.58 + (i % 4) * 0.24,
      evadeTimer: 0,
      recoverTimer: 0,
      evadeVelX: 0,
      evadeVelZ: 0,
      teleportTimer: 0,
      teleportCooldown: 0,
      dead: false,
      deadTimer: 0,
      fallYaw: 0,
      visitState: 'none',
      visitBuildingIdx: -1,
      visitSpotX: 0,
      visitSpotZ: 0,
      visitSpotYaw: 0,
      browseTimer: 0,
      visitCooldown: (i % 5) * 2.2,
      fleeingExit: false,
    });
  }

  const activePositionsCache: Array<{ x: number; z: number }> = [];
  const activeTargetsCache: PedestrianTarget[] = [];

  const respawnPedestrianAwayFromPlayer = (p: PedestrianAgent, playerPos: Vec3) => {
    p.dead = false;
    p.deadTimer = 0;
    p.evadeTimer = 0;
    p.recoverTimer = 0;
    p.visitState = 'none';
    p.visitBuildingIdx = -1;
    p.fleeingExit = false;
    p.visitCooldown = 8;
    p.rig.bodyGroup.rotation.set(0, 0, 0);
    p.rig.bodyGroup.position.set(0, 0, 0);
    p.rig.leftArmPivot.rotation.set(0, 0, 0);
    p.rig.rightArmPivot.rotation.set(0, 0, 0);
    p.rig.leftLegPivot.rotation.set(0, 0, 0);
    p.rig.rightLegPivot.rotation.set(0, 0, 0);

    for (let attempt = 0; attempt < 8; attempt++) {
      const rCoord = innerRoads[(p.id + attempt * 2) % innerRoads.length];
      const candAlong = -280 + (((p.id * 73 + attempt * 110) % 560) + 560) % 560;
      const candX = p.axis === 'ns' ? rCoord + p.sideSign * sidewalkOffset : candAlong;
      const candZ = p.axis === 'ns' ? candAlong : rCoord + p.sideSign * sidewalkOffset;
      if (Math.hypot(candX - playerPos.x, candZ - playerPos.z) > 85) {
        p.roadCoord = rCoord;
        p.x = candX;
        p.z = candZ;
        p.rig.root.position.set(p.x, 0, p.z);
        return;
      }
    }
  };

  return {
    group,
    getActivePositions: () => {
      activePositionsCache.length = 0;
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (a.rig.root.visible && !a.dead) {
          activePositionsCache.push({ x: a.x, z: a.z });
        }
      }
      return activePositionsCache;
    },
    getActiveTargets: () => {
      activeTargetsCache.length = 0;
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (!a.dead && a.rig.root.visible) {
          activeTargetsCache.push({ id: a.id, x: a.x, z: a.z });
        }
      }
      return activeTargetsCache;
    },
    eliminatePedestrian: (id, impactDirX = 0, impactDirZ = 1) => {
      const p = agents.find((ag) => ag.id === id);
      if (!p || p.dead) return false;
      p.dead = true;
      p.deadTimer = 14.0;
      p.evadeTimer = 0;
      p.recoverTimer = 0;
      p.fallYaw = Math.atan2(impactDirX, impactDirZ);
      p.rig.root.rotation.y = p.fallYaw;
      return true;
    },
    scatterFromSound: (originX, originZ, radius) => {
      const rSq = radius * radius;
      for (const p of agents) {
        if (!p.rig.root.visible || p.dead) continue;
        const dx = p.x - originX;
        const dz = p.z - originZ;
        const dSq = dx * dx + dz * dz;
        if (dSq > 0.01 && dSq < rSq) {
          // If pedestrian is inside a building, make them sprint cleanly out the doorway!
          if (p.visitState !== 'none' && p.visitBuildingIdx >= 0) {
            p.visitState = 'to_exit_door';
            p.fleeingExit = true;
          } else {
            const d = Math.sqrt(dSq);
            p.evadeTimer = 1.8;
            p.evadeVelX = (dx / d) * 6.8;
            p.evadeVelZ = (dz / d) * 6.8;
          }
        }
      }
    },
    update: (
      dt,
      playerPos,
      maxActiveCount,
      vehicleThreats,
      collisionWorld,
      parkedCars = [],
      onTeleportOverpass,
    ) => {
      const cullDistSq = 260 * 260;
      let playerHitPedestrian = false;
      const effectiveMax = Math.max(maxActiveCount, 18);

      for (let i = 0; i < agents.length; i++) {
        const p = agents[i];
        if (i >= effectiveMax) {
          p.rig.root.visible = false;
          continue;
        }

        const indoorY = p.visitState === 'to_spot' || p.visitState === 'browsing' || p.visitState === 'to_exit_door' ? 0.1 : 0;

        // Handle eliminated / fallen pedestrian state
        if (p.dead) {
          p.deadTimer -= dt;
          if (p.deadTimer <= 0) {
            respawnPedestrianAwayFromPlayer(p, playerPos);
            continue;
          }
          p.rig.root.visible = true;
          p.rig.root.position.set(p.x, indoorY, p.z);
          p.rig.root.rotation.y = p.fallYaw;
          p.rig.bodyGroup.rotation.x = THREE.MathUtils.damp(p.rig.bodyGroup.rotation.x, Math.PI * 0.48, 12, dt);
          p.rig.bodyGroup.rotation.z = THREE.MathUtils.damp(p.rig.bodyGroup.rotation.z, 0, 10, dt);
          p.rig.bodyGroup.position.y = THREE.MathUtils.damp(p.rig.bodyGroup.position.y, 0.14, 12, dt);
          p.rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(p.rig.leftArmPivot.rotation.x, -0.85, 10, dt);
          p.rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(p.rig.rightArmPivot.rotation.x, -0.65, 10, dt);
          p.rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(p.rig.leftLegPivot.rotation.x, 0.12, 10, dt);
          p.rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(p.rig.rightLegPivot.rotation.x, -0.14, 10, dt);
          continue;
        }

        // Ensure upright transform when alive
        p.rig.bodyGroup.rotation.x = THREE.MathUtils.damp(p.rig.bodyGroup.rotation.x, 0, 10, dt);
        p.rig.bodyGroup.position.y = THREE.MathUtils.damp(p.rig.bodyGroup.position.y, 0, 10, dt);

        if (p.recoverTimer > 0) p.recoverTimer = Math.max(0, p.recoverTimer - dt);
        if (p.teleportTimer > 0) p.teleportTimer = Math.max(0, p.teleportTimer - dt);
        if (p.teleportCooldown > 0) p.teleportCooldown = Math.max(0, p.teleportCooldown - dt);
        if (p.visitCooldown > 0) p.visitCooldown = Math.max(0, p.visitCooldown - dt);

        const dxP = p.x - playerPos.x;
        const dzP = p.z - playerPos.z;
        const distSqP = dxP * dxP + dzP * dzP;

        if (distSqP > cullDistSq) {
          p.rig.root.visible = false;
          if (p.visitState === 'none') {
            if (p.axis === 'ns') {
              p.z += p.dir * p.walkSpeed * dt;
              if (p.z > walkBound || p.z < -walkBound) p.dir = (p.dir * -1) as 1 | -1;
            } else {
              p.x += p.dir * p.walkSpeed * dt;
              if (p.x > walkBound || p.x < -walkBound) p.dir = (p.dir * -1) as 1 | -1;
            }
          }
          continue;
        }

        p.rig.root.visible = true;

        // ==================== BUILDING VISIT STATE MACHINE (Walk-In / Browse / Walk-Out) ====================
        if (p.visitState !== 'none' && p.visitBuildingIdx >= 0) {
          const b = ENTERABLE_BUILDINGS[p.visitBuildingIdx];
          const moveSpd = p.fleeingExit ? 5.6 : p.walkSpeed;
          let targetX = p.x;
          let targetZ = p.z;
          let yaw = p.rig.root.rotation.y;
          let animSpd = moveSpd;

          if (p.visitState === 'browsing') {
            p.browseTimer -= dt;
            animSpd = 0;
            yaw = p.visitSpotYaw + Math.sin(p.browseTimer * 1.1) * 0.25;
            if (p.browseTimer <= 0) {
              p.visitState = 'to_exit_door';
            }
          } else {
            if (p.visitState === 'to_door') {
              targetX = b.centerX + ((p.id % 3) - 1) * 0.65;
              targetZ = getDoorThresholdZ(p.visitBuildingIdx, 1.1);
            } else if (p.visitState === 'to_spot') {
              targetX = p.visitSpotX;
              targetZ = p.visitSpotZ;
            } else if (p.visitState === 'to_exit_door') {
              targetX = b.centerX + ((p.id % 3) - 1) * 0.65;
              targetZ = getDoorThresholdZ(p.visitBuildingIdx, -1.2);
            } else if (p.visitState === 'to_sidewalk') {
              targetX = b.centerX;
              targetZ = b.sidewalkZ;
            }

            const vx = targetX - p.x;
            const vz = targetZ - p.z;
            const d = Math.hypot(vx, vz);
            if (d < 0.65) {
              if (p.visitState === 'to_door') {
                p.visitState = 'to_spot';
              } else if (p.visitState === 'to_spot') {
                p.visitState = 'browsing';
                p.browseTimer = 7.0 + (p.id % 6) * 1.4;
              } else if (p.visitState === 'to_exit_door') {
                p.visitState = 'to_sidewalk';
              } else if (p.visitState === 'to_sidewalk') {
                p.visitState = 'none';
                p.visitBuildingIdx = -1;
                p.fleeingExit = false;
                p.visitCooldown = 16.0;
              }
              animSpd = 0;
            } else {
              const step = Math.min(d, moveSpd * dt);
              const nx = p.x + (vx / d) * step;
              const nz = p.z + (vz / d) * step;
              const resolved = collisionWorld.resolveCircle(nx, nz, 0.36);
              p.x = resolved.x;
              p.z = resolved.z;
              yaw = Math.atan2(vx, vz);
            }
          }

          p.rig.root.position.set(p.x, indoorY, p.z);
          p.rig.root.rotation.y = yaw;
          p.rig.animate(dt, animSpd, p.fleeingExit && animSpd > 2, true);
          continue;
        }

        // Check if sidewalk pedestrian is walking past an open enterable building entrance and wants to go inside!
        if (p.axis === 'ew' && p.evadeTimer <= 0 && p.visitCooldown <= 0) {
          for (let bIdx = 0; bIdx < ENTERABLE_BUILDINGS.length; bIdx++) {
            const b = ENTERABLE_BUILDINGS[bIdx];
            if (Math.abs(p.z - b.sidewalkZ) < 4.2 && Math.abs(p.x - b.centerX) < 6.5) {
              // Count current visitors in this building so max ~4 pedestrians browse one building at a time
              let insideCount = 0;
              for (let k = 0; k < agents.length; k++) {
                if (agents[k].visitBuildingIdx === bIdx && agents[k].visitState !== 'none') insideCount++;
              }
              if (insideCount < 4) {
                const spots = getBuildingBrowseSpots(b);
                const chosen = spots[(p.id + insideCount) % spots.length];
                p.visitBuildingIdx = bIdx;
                p.visitSpotX = chosen.x;
                p.visitSpotZ = chosen.z;
                p.visitSpotYaw = chosen.yaw;
                p.visitState = 'to_door';
                p.fleeingExit = false;
                break;
              } else {
                p.visitCooldown = 8.0;
              }
            }
          }
        }

        let triggeredEvade = false;
        for (let tIdx = 0; tIdx < vehicleThreats.length; tIdx++) {
          const vt = vehicleThreats[tIdx];
          const rx = p.x - vt.x;
          const rz = p.z - vt.z;
          const dSq = rx * rx + rz * rz;

          if (vt.isPlayer && Math.abs(vt.speed) > 4.2 && dSq < 1.38 * 1.38 && p.recoverTimer <= 0) {
            playerHitPedestrian = true;
            p.recoverTimer = 4.2;
            p.evadeTimer = 1.6;

            const d = Math.max(0.1, Math.sqrt(dSq));
            const pushX = (rx / d) * 2.4;
            const pushZ = (rz / d) * 2.4;
            const safe = collisionWorld.resolveCircle(p.x + pushX, p.z + pushZ, 0.42);
            p.x = safe.x;
            p.z = safe.z;
            p.evadeVelX = (rx / d) * 6.2;
            p.evadeVelZ = (rz / d) * 6.2;
            triggeredEvade = true;
            break;
          }

          if (Math.abs(vt.speed) > 1.8 && dSq < 12.5 * 12.5) {
            const d = Math.max(0.01, Math.sqrt(dSq));
            const spd = Math.hypot(vt.vx, vt.vz);
            const dotHeading = spd > 0.2 ? (rx * vt.vx + rz * vt.vz) / (d * spd) : 0;

            if (dotHeading > 0.32 || d < 4.4) {
              let escX = rx / d;
              let escZ = rz / d;
              if (spd > 0.5) {
                const perpX = -vt.vz / spd;
                const perpZ = vt.vx / spd;
                const sideDot = rx * perpX + rz * perpZ;
                const sign = sideDot >= 0 ? 1 : -1;
                escX = perpX * sign * 0.75 + (rx / d) * 0.45;
                escZ = perpZ * sign * 0.75 + (rz / d) * 0.45;
              }
              const escLen = Math.max(0.01, Math.hypot(escX, escZ));
              p.evadeVelX = (escX / escLen) * 5.8;
              p.evadeVelZ = (escZ / escLen) * 5.8;
              p.evadeTimer = Math.max(p.evadeTimer, 0.85);
              triggeredEvade = true;
            }
          }
        }

        let animSpeed = p.walkSpeed;
        let isSprinting = false;
        let yaw =
          p.axis === 'ns'
            ? p.dir === 1
              ? 0
              : Math.PI
            : p.dir === 1
              ? Math.PI * 0.5
              : -Math.PI * 0.5;

        if (p.evadeTimer > 0) {
          p.evadeTimer = Math.max(0, p.evadeTimer - dt);
          const rawX = p.x + p.evadeVelX * dt;
          const rawZ = p.z + p.evadeVelZ * dt;
          const resolved = collisionWorld.resolveCircle(rawX, rawZ, 0.42);
          p.x = resolved.x;
          p.z = resolved.z;

          if (p.axis === 'ns') {
            const relX = p.x - p.roadCoord;
            if (Math.abs(relX) < ROAD_WIDTH * 0.5 + 0.6) {
              p.x = p.roadCoord + (relX >= 0 ? 1 : -1) * (ROAD_WIDTH * 0.5 + 1.0);
            }
          } else {
            const relZ = p.z - p.roadCoord;
            if (Math.abs(relZ) < ROAD_WIDTH * 0.5 + 0.6) {
              p.z = p.roadCoord + (relZ >= 0 ? 1 : -1) * (ROAD_WIDTH * 0.5 + 1.0);
            }
          }

          yaw = Math.atan2(p.evadeVelX, p.evadeVelZ);
          animSpeed = 6.2;
          isSprinting = true;
        } else if (!triggeredEvade) {
          const targetSideCoord = p.roadCoord + p.sideSign * sidewalkOffset;
          if (p.axis === 'ns') {
            p.x = THREE.MathUtils.damp(p.x, targetSideCoord, 3.5, dt);
            const tooCloseToPlayerOnFoot = distSqP < 2.2 * 2.2;
            const spd = tooCloseToPlayerOnFoot ? 0 : p.walkSpeed;
            p.z += p.dir * spd * dt;
            if (p.z > walkBound) {
              p.z = walkBound;
              p.dir = -1;
            } else if (p.z < -walkBound) {
              p.z = -walkBound;
              p.dir = 1;
            }
            animSpeed = spd;
          } else {
            p.z = THREE.MathUtils.damp(p.z, targetSideCoord, 3.5, dt);
            const tooCloseToPlayerOnFoot = distSqP < 2.2 * 2.2;
            const spd = tooCloseToPlayerOnFoot ? 0 : p.walkSpeed;
            p.x += p.dir * spd * dt;
            if (p.x > walkBound) {
              p.x = walkBound;
              p.dir = -1;
            } else if (p.x < -walkBound) {
              p.x = -walkBound;
              p.dir = 1;
            }
            animSpeed = spd;
          }
        }

        if (p.teleportCooldown <= 0 && parkedCars.length > 0 && animSpeed > 0.2) {
          const fwdX = Math.sin(yaw);
          const fwdZ = Math.cos(yaw);
          const tp = computeVehicleOverpassTarget(p.x, p.z, fwdX, fwdZ, parkedCars, 2.7, 1.65, collisionWorld);
          if (tp.triggered) {
            const fromX = p.x;
            const fromZ = p.z;
            p.x = tp.landX;
            p.z = tp.landZ;
            p.teleportTimer = 0.26;
            p.teleportCooldown = 0.6;
            onTeleportOverpass?.(fromX, fromZ, tp.overX, tp.overZ, tp.landX, tp.landZ);
          }
        }

        p.rig.root.position.set(p.x, 0, p.z);
        p.rig.root.rotation.y = yaw;
        p.rig.animate(dt, animSpeed, isSprinting, true);

        if (p.recoverTimer > 2.8) {
          p.rig.bodyGroup.rotation.z = Math.sin(p.recoverTimer * 14) * 0.24;
        } else {
          p.rig.bodyGroup.rotation.z = THREE.MathUtils.damp(p.rig.bodyGroup.rotation.z, 0, 8, dt);
        }
      }

      return { playerHitPedestrian };
    },
  };
}
