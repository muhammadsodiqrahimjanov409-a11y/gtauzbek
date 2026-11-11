import * as THREE from 'three';
import type { PoliceUnitSnapshot, Vec3 } from '../types/game';
import { ROAD_COORDS, WORLD_PLAYABLE_LIMIT } from '../game/gameConfig';
import type { CollisionWorld } from '../utils/collision';
import type { MovingVehicleThreat } from './Pedestrians';
import { createProceduralVehicleModel, type VehicleRig } from './Vehicle';
import { computeVehicleOverpassTarget, type BlockingCarObstacle } from './TeleportEffects';

interface PoliceCruiserUnit {
  id: string;
  rig: VehicleRig;
  redBeaconMat: THREE.MeshStandardMaterial;
  blueBeaconMat: THREE.MeshStandardMaterial;
  x: number;
  z: number;
  rotationY: number;
  speed: number;
  wheelSpin: number;
  patrolAxis: 'ns' | 'ew';
  patrolDir: 1 | -1;
  patrolRoad: number;
  arrestContactTimer: number;
  teleportTimer: number;
  teleportCooldown: number;
}

export interface PoliceStepOutcome {
  closestDist: number;
  busted: boolean;
  escaped: boolean;
  escapeRatio: number; // 0..1 progress toward losing police
  snapshots: PoliceUnitSnapshot[];
}

export interface PoliceAISystem {
  group: THREE.Group;
  getActiveObstacles: () => Array<{ x: number; z: number; radius: number }>;
  getMovingThreats: () => MovingVehicleThreat[];
  resetPursuitTimers: () => void;
  repositionNearPlayerForChase: (playerPos: Vec3, wantedLevel: number, collisionWorld: CollisionWorld) => void;
  update: (
    dt: number,
    elapsed: number,
    wantedLevel: number,
    headlightsOn: boolean,
    playerPos: Vec3,
    playerSpeedMps: number,
    inVehicle: boolean,
    pedestrianPositions: Array<{ x: number; z: number }>,
    collisionWorld: CollisionWorld,
    blockingVehicles?: BlockingCarObstacle[],
    onTeleportOverpass?: (
      fromX: number,
      fromZ: number,
      overX: number,
      overZ: number,
      toX: number,
      toZ: number,
    ) => void,
  ) => PoliceStepOutcome;
}

function normalizeAngleDelta(a: number): number {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const PATROL_LANE_OFFSET = 8.5;

function createPoliceCruiser(
  id: string,
  startX: number,
  startZ: number,
  axis: 'ns' | 'ew',
  dir: 1 | -1,
  road: number,
  isSoftwareGl: boolean,
): PoliceCruiserUnit {
  const rig = createProceduralVehicleModel('sedan', '#0F172A', !isSoftwareGl);

  const doorAccentMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.3,
    metalness: 0.5,
  });
  const sidePanels = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.44, 1.85), doorAccentMat);
  sidePanels.position.set(0, 0.56, -0.05);
  rig.chassisGroup.add(sidePanels);

  const pushBarMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.8 });
  const pushBar = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.44, 0.18), pushBarMat);
  pushBar.position.set(0, 0.52, 2.34);
  rig.chassisGroup.add(pushBar);

  const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.08, 0.26), pushBarMat);
  barBase.position.set(0, 1.43, -0.1);

  const redBeaconMat = new THREE.MeshStandardMaterial({
    color: 0x7f1d1d,
    emissive: 0xef4444,
    emissiveIntensity: 0.15,
    roughness: 0.2,
  });
  const blueBeaconMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a8a,
    emissive: 0x3b82f6,
    emissiveIntensity: 0.15,
    roughness: 0.2,
  });

  const redLens = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.11, 0.22), redBeaconMat);
  redLens.position.set(0.3, 1.5, -0.1);
  const blueLens = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.11, 0.22), blueBeaconMat);
  blueLens.position.set(-0.3, 1.5, -0.1);

  rig.chassisGroup.add(barBase, redLens, blueLens);

  const initYaw = axis === 'ns' ? (dir === 1 ? 0 : Math.PI) : dir === 1 ? Math.PI * 0.5 : -Math.PI * 0.5;
  rig.root.position.set(startX, 0, startZ);
  rig.root.rotation.y = initYaw;

  return {
    id,
    rig,
    redBeaconMat,
    blueBeaconMat,
    x: startX,
    z: startZ,
    rotationY: initYaw,
    speed: 12,
    wheelSpin: 0,
    patrolAxis: axis,
    patrolDir: dir,
    patrolRoad: road,
    arrestContactTimer: 0,
    teleportTimer: 0,
    teleportCooldown: 0,
  };
}

export function createPoliceAISystem(isSoftwareGl = false): PoliceAISystem {
  const group = new THREE.Group();

  const units: PoliceCruiserUnit[] = [
    createPoliceCruiser('police_1', -PATROL_LANE_OFFSET, -65, 'ns', 1, 0, isSoftwareGl),
    createPoliceCruiser('police_2', 65, PATROL_LANE_OFFSET, 'ew', 1, 0, isSoftwareGl),
    createPoliceCruiser('police_3', -130 + PATROL_LANE_OFFSET, 105, 'ns', -1, -130, isSoftwareGl),
    createPoliceCruiser('police_4', 130 - PATROL_LANE_OFFSET, -195, 'ns', 1, 130, isSoftwareGl),
    createPoliceCruiser('police_5', -195, 130 - PATROL_LANE_OFFSET, 'ew', -1, 130, isSoftwareGl),
  ];

  for (const u of units) {
    group.add(u.rig.root);
  }

  const patrolTurnLimit = WORLD_PLAYABLE_LIMIT - 22;
  let escapeClock = 0;
  const ESCAPE_REQUIRED_SEC = 20;
  const obstaclesCache: Array<{ x: number; z: number; radius: number }> = [];
  const threatsCache: MovingVehicleThreat[] = [];
  const unitBlockingScratch: BlockingCarObstacle[] = [];

  return {
    group,
    resetPursuitTimers: () => {
      escapeClock = 0;
      for (const u of units) {
        u.arrestContactTimer = 0;
      }
    },
    repositionNearPlayerForChase: (playerPos, wantedLevel, collisionWorld) => {
      escapeClock = 0;
      let nearestRoad: number = ROAD_COORDS[0];
      let bestDist = Math.abs(playerPos.x - nearestRoad);
      for (const r of ROAD_COORDS) {
        const d = Math.abs(playerPos.x - r);
        if (d < bestDist) {
          bestDist = d;
          nearestRoad = r;
        }
      }
      const primary = units[0];
      const dCurrent = Math.hypot(primary.x - playerPos.x, primary.z - playerPos.z);
      if (dCurrent > 72) {
        const offsetZ = playerPos.z > 0 ? -48 : 48;
        const safe = collisionWorld.resolveCircle(nearestRoad + PATROL_LANE_OFFSET, playerPos.z + offsetZ, 1.5);
        primary.x = safe.x;
        primary.z = safe.z;
        primary.rotationY = Math.atan2(playerPos.x - primary.x, playerPos.z - primary.z);
      }
      void wantedLevel;
    },
    getActiveObstacles: () => {
      obstaclesCache.length = 0;
      for (const u of units) {
        obstaclesCache.push({ x: u.x, z: u.z, radius: 1.65 });
      }
      return obstaclesCache;
    },
    getMovingThreats: () => {
      threatsCache.length = 0;
      for (const u of units) {
        if (Math.abs(u.speed) < 0.5) continue;
        threatsCache.push({
          x: u.x,
          z: u.z,
          vx: Math.sin(u.rotationY) * u.speed,
          vz: Math.cos(u.rotationY) * u.speed,
          speed: u.speed,
          isPlayer: false,
        });
      }
      return threatsCache;
    },
    update: (
      dt,
      elapsed,
      wantedLevel,
      headlightsOn,
      playerPos,
      playerSpeedMps,
      inVehicle,
      pedestrianPositions,
      collisionWorld,
      blockingVehicles = [],
      onTeleportOverpass,
    ) => {
      let closestDist = Infinity;
      let busted = false;
      const activeChasers = wantedLevel > 0 ? Math.min(units.length, Math.max(1, wantedLevel)) : 0;

      const flashPhase = Math.floor(elapsed * 9) % 2 === 0;

      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        const isChasing = i < activeChasers;
        if (u.teleportTimer > 0) u.teleportTimer = Math.max(0, u.teleportTimer - dt);
        if (u.teleportCooldown > 0) u.teleportCooldown = Math.max(0, u.teleportCooldown - dt);

        if (isChasing) {
          u.redBeaconMat.emissiveIntensity = flashPhase ? 3.8 : 0.25;
          u.blueBeaconMat.emissiveIntensity = flashPhase ? 0.25 : 3.8;
        } else {
          u.redBeaconMat.emissiveIntensity = 0.1;
          u.blueBeaconMat.emissiveIntensity = 0.1;
          u.arrestContactTimer = 0;
        }

        const dxToPlayer = playerPos.x - u.x;
        const dzToPlayer = playerPos.z - u.z;
        const distToPlayer = Math.hypot(dxToPlayer, dzToPlayer);
        if (isChasing && distToPlayer < closestDist) {
          closestDist = distToPlayer;
        }

        const fwdX = Math.sin(u.rotationY);
        const fwdZ = Math.cos(u.rotationY);

        // Always avoid hitting pedestrians even during pursuit!
        let yieldForPedestrian = false;
        for (let pIdx = 0; pIdx < pedestrianPositions.length; pIdx++) {
          const ped = pedestrianPositions[pIdx];
          const pdx = ped.x - u.x;
          const pdz = ped.z - u.z;
          const fwdP = pdx * fwdX + pdz * fwdZ;
          const latP = Math.abs(pdx * fwdZ - pdz * fwdX);
          if (fwdP > 0 && fwdP < 8.5 && latP < 2.4) {
            yieldForPedestrian = true;
            break;
          }
        }

        if (isChasing) {
          let targetX = playerPos.x;
          let targetZ = playerPos.z;

          const probeRes = collisionWorld.resolveCircle(u.x + fwdX * 7.5, u.z + fwdZ * 7.5, 1.5);
          if (probeRes.hit) {
            let bestR: number = ROAD_COORDS[0];
            let bestRD = Math.abs(u.x - bestR);
            for (const r of ROAD_COORDS) {
              const d = Math.abs(u.x - r);
              if (d < bestRD) {
                bestRD = d;
                bestR = r;
              }
            }
            targetX = bestR;
          }

          const desiredYaw = Math.atan2(targetX - u.x, targetZ - u.z);
          const deltaYaw = normalizeAngleDelta(desiredYaw - u.rotationY);
          u.rotationY += THREE.MathUtils.clamp(deltaYaw, -2.5 * dt, 2.5 * dt);

          const chaseMaxSpeed = 27 + wantedLevel * 2.5;
          const stopDist = inVehicle ? 3.4 : 2.1;
          const targetSpd = yieldForPedestrian
            ? 2.0
            : distToPlayer < stopDist
              ? 0
              : Math.abs(deltaYaw) > 1.1
                ? chaseMaxSpeed * 0.55
                : chaseMaxSpeed;

          u.speed = THREE.MathUtils.damp(u.speed, targetSpd, 4.5, dt);

          const rawX = u.x + Math.sin(u.rotationY) * u.speed * dt;
          const rawZ = u.z + Math.cos(u.rotationY) * u.speed * dt;
          const res = collisionWorld.resolveCircle(rawX, rawZ, 1.35);
          u.x = res.x;
          u.z = res.z;
          if (res.hit) {
            u.rotationY += 0.9 * dt;
          }

          for (let j = 0; j < i; j++) {
            const other = units[j];
            const ox = u.x - other.x;
            const oz = u.z - other.z;
            const od = Math.hypot(ox, oz);
            if (od < 3.4 && od > 0.01) {
              u.x += (ox / od) * (3.4 - od);
              u.z += (oz / od) * (3.4 - od);
            }
          }

          const closeEnough = inVehicle ? distToPlayer < 4.8 : distToPlayer < 3.1;
          const playerSlow = Math.abs(playerSpeedMps) < 3.2;
          if (closeEnough && playerSlow) {
            u.arrestContactTimer += dt;
            if (u.arrestContactTimer >= (inVehicle ? 2.1 : 1.1)) {
              busted = true;
            }
          } else {
            u.arrestContactTimer = Math.max(0, u.arrestContactTimer - dt * 0.6);
          }
        } else {
          const patrolYaw =
            u.patrolAxis === 'ns'
              ? u.patrolDir === 1
                ? 0
                : Math.PI
              : u.patrolDir === 1
                ? Math.PI * 0.5
                : -Math.PI * 0.5;
          u.rotationY = patrolYaw;

          const tooCloseToPedPlayer = !inVehicle && distToPlayer < 8.5;
          const targetSpd = yieldForPedestrian || tooCloseToPedPlayer ? 0 : 13.5;
          u.speed = THREE.MathUtils.damp(u.speed, targetSpd, 6, dt);

          if (u.patrolAxis === 'ns') {
            u.x = THREE.MathUtils.damp(
              u.x,
              u.patrolRoad + (u.patrolDir === 1 ? -PATROL_LANE_OFFSET : PATROL_LANE_OFFSET),
              4,
              dt,
            );
            u.z += u.patrolDir * u.speed * dt;
            if (u.z > patrolTurnLimit || u.z < -patrolTurnLimit) u.patrolDir = (u.patrolDir * -1) as 1 | -1;
          } else {
            u.z = THREE.MathUtils.damp(
              u.z,
              u.patrolRoad + (u.patrolDir === 1 ? PATROL_LANE_OFFSET : -PATROL_LANE_OFFSET),
              4,
              dt,
            );
            u.x += u.patrolDir * u.speed * dt;
            if (u.x > patrolTurnLimit || u.x < -patrolTurnLimit) u.patrolDir = (u.patrolDir * -1) as 1 | -1;
          }
        }

        // Ground-level Teleport-Phase past blocking cars in the cruiser's forward corridor
        if (u.teleportCooldown <= 0 && u.speed > 2.2 && !yieldForPedestrian) {
          const curFwdX = Math.sin(u.rotationY);
          const curFwdZ = Math.cos(u.rotationY);
          unitBlockingScratch.length = 0;
          for (let bIdx = 0; bIdx < blockingVehicles.length; bIdx++) {
            unitBlockingScratch.push(blockingVehicles[bIdx]);
          }
          for (let j = 0; j < units.length; j++) {
            if (j !== i) unitBlockingScratch.push({ x: units[j].x, z: units[j].z, radius: 1.6 });
          }

          const tp = computeVehicleOverpassTarget(
            u.x,
            u.z,
            curFwdX,
            curFwdZ,
            unitBlockingScratch,
            5.6,
            2.65,
            collisionWorld,
          );
          if (tp.triggered) {
            const fromX = u.x;
            const fromZ = u.z;
            u.x = tp.landX;
            u.z = tp.landZ;
            u.teleportTimer = 0.28;
            u.teleportCooldown = 0.42;
            onTeleportOverpass?.(fromX, fromZ, tp.overX, tp.overZ, tp.landX, tp.landZ);
          }
        }

        u.wheelSpin += (u.speed * dt) / 0.37;
        u.rig.root.position.set(u.x, 0, u.z);
        u.rig.root.rotation.y = u.rotationY;
        u.rig.updateVisuals(u.wheelSpin, 0, headlightsOn || isChasing, u.speed < 1.0, 0, 0);
      }

      let escaped = false;
      if (wantedLevel > 0 && !busted) {
        if (closestDist > 64) {
          escapeClock += dt;
          if (escapeClock >= ESCAPE_REQUIRED_SEC) {
            escaped = true;
            escapeClock = 0;
          }
        } else {
          escapeClock = Math.max(0, escapeClock - dt * 1.4);
        }
      } else {
        escapeClock = 0;
      }

      const snapshots: PoliceUnitSnapshot[] = units.map((u, idx) => ({
        id: u.id,
        position: { x: u.x, y: 0, z: u.z },
        rotationY: u.rotationY,
        pursuing: idx < activeChasers,
      }));

      return {
        closestDist,
        busted,
        escaped,
        escapeRatio: Math.min(1, escapeClock / ESCAPE_REQUIRED_SEC),
        snapshots,
      };
    },
  };
}
