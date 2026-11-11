import * as THREE from 'three';
import type { Vec3, VehicleId } from '../types/game';
import { ROAD_COORDS, ROAD_WIDTH, VEHICLE_CONFIGS, WORLD_PLAYABLE_LIMIT } from '../game/gameConfig';
import type { CollisionWorld } from '../utils/collision';
import type { TrafficSignalController } from '../world/Roads';
import type { MovingVehicleThreat } from './Pedestrians';
import { computeVehicleOverpassTarget, type BlockingCarObstacle } from './TeleportEffects';
import { createProceduralVehicleModel, type VehicleRig } from './Vehicle';

export function computeVehicleEdgeDistance(
  px: number,
  pz: number,
  vx: number,
  vz: number,
  rotationY: number,
  halfWidth: number,
  halfLength: number,
): number {
  const dx = px - vx;
  const dz = pz - vz;
  const sinY = Math.sin(rotationY);
  const cosY = Math.cos(rotationY);
  const localForward = dx * sinY + dz * cosY;
  const localRight = dx * cosY - dz * sinY;
  const outX = Math.max(0, Math.abs(localRight) - halfWidth);
  const outZ = Math.max(0, Math.abs(localForward) - halfLength);
  return Math.hypot(outX, outZ);
}

interface TrafficAgent {
  vehicleId: VehicleId;
  color: string;
  rig: VehicleRig;
  x: number;
  z: number;
  axis: 'ns' | 'ew';
  dir: 1 | -1;
  roadLine: number;
  speed: number;
  maxSpeed: number;
  wheelSpin: number;
  active: boolean;
  teleportTimer: number;
  teleportCooldown: number;
}

export interface BoardableTrafficCandidate {
  index: number;
  vehicleId: VehicleId;
  color: string;
  x: number;
  z: number;
  rotationY: number;
  edgeDist: number;
}

const AI_COLORS = ['#E2E8F0', '#EA580C', '#0284C7', '#D97706', '#DC2626', '#0D9488', '#334155', '#2563EB'];
const AI_TYPES: VehicleId[] = [
  'sedan',
  'gazel',
  'fura',
  'suv',
  'labo',
  'kamaz',
  'sport',
  'isuzu',
  'zil',
  'howo',
  'pickup',
  'lux_suv',
  'armored',
  'coupe',
  'excavator',
];
// 3 spacious lanes per direction on the 34m-wide boulevard (half-width 17m)
const LANE_OFFSETS = [4.5, 9.2, 13.6] as const;

export interface TrafficAISystem {
  group: THREE.Group;
  getActiveObstacles: () => Array<{ x: number; z: number; radius: number }>;
  getMovingThreats: () => MovingVehicleThreat[];
  findNearestBoardableAgent: (px: number, pz: number, maxEdgeDist?: number) => BoardableTrafficCandidate | null;
  claimBoardedAgent: (index: number) => BoardableTrafficCandidate | null;
  update: (
    dt: number,
    desiredCount: number,
    headlightsOn: boolean,
    signals: TrafficSignalController,
    playerPos: Vec3,
    pedestrianPositions: Array<{ x: number; z: number }>,
    blockingCars?: BlockingCarObstacle[],
    playerInVehicle?: boolean,
    collisionWorld?: CollisionWorld,
    onTeleportOverpass?: (
      fromX: number,
      fromZ: number,
      overX: number,
      overZ: number,
      toX: number,
      toZ: number,
    ) => void,
  ) => void;
}

export function createTrafficAISystem(maxAgents = 28, isSoftwareGl = false): TrafficAISystem {
  const group = new THREE.Group();
  const agents: TrafficAgent[] = [];

  const innerIntersections = ROAD_COORDS.slice(1, -1); // [-260, -130, 0, 130, 260]
  const wrapLimit = WORLD_PLAYABLE_LIMIT - 14;
  const stopLineOffset = ROAD_WIDTH * 0.5 + 3.5;

  const segOffsets: number[] = [];
  for (let i = 0; i < ROAD_COORDS.length - 1; i++) {
    const mid = (ROAD_COORDS[i] + ROAD_COORDS[i + 1]) * 0.5;
    segOffsets.push(mid - 22, mid + 22);
  }

  for (let i = 0; i < maxAgents; i++) {
    const vType = AI_TYPES[i % AI_TYPES.length];
    const color = AI_COLORS[i % AI_COLORS.length];
    const rig = createProceduralVehicleModel(vType, color, !isSoftwareGl);

    const axis: 'ns' | 'ew' = i % 2 === 0 ? 'ns' : 'ew';
    const dir: 1 | -1 = i % 4 < 2 ? 1 : -1;
    const roadLine = ROAD_COORDS[i % ROAD_COORDS.length];
    const laneOffset = LANE_OFFSETS[i % LANE_OFFSETS.length];
    const along = segOffsets[(i * 3) % segOffsets.length];

    let x = 0;
    let z = 0;
    if (axis === 'ns') {
      x = roadLine + (dir === 1 ? -laneOffset : laneOffset);
      z = along;
    } else {
      x = along;
      z = roadLine + (dir === 1 ? laneOffset : -laneOffset);
    }

    const vCfg = VEHICLE_CONFIGS[vType];
    const isHeavy = vCfg.category === 'heavy_machinery';
    const maxSpeed = isHeavy ? 11.5 + (i % 3) * 1.6 : 13.5 + (i % 5) * 2.1;
    const agent: TrafficAgent = {
      vehicleId: vType,
      color: isHeavy ? vCfg.defaultColor : color,
      rig,
      x,
      z,
      axis,
      dir,
      roadLine,
      speed: maxSpeed * 0.75,
      maxSpeed,
      wheelSpin: 0,
      active: i < 16,
      teleportTimer: 0,
      teleportCooldown: 0,
    };
    if (isHeavy) {
      rig.setPaintColor(vCfg.defaultColor);
    }
    rig.root.position.set(x, 0, z);
    rig.root.visible = agent.active;
    group.add(rig.root);
    agents.push(agent);
  }

  const obstaclesCache: Array<{ x: number; z: number; radius: number }> = [];
  const threatsCache: MovingVehicleThreat[] = [];
  const laneBlockingScratch: BlockingCarObstacle[] = [];

  return {
    group,
    getActiveObstacles: () => {
      obstaclesCache.length = 0;
      for (let i = 0; i < agents.length; i++) {
        if (agents[i].active) {
          obstaclesCache.push({ x: agents[i].x, z: agents[i].z, radius: 1.65 });
        }
      }
      return obstaclesCache;
    },
    getMovingThreats: () => {
      threatsCache.length = 0;
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (!a.active || a.speed < 0.5) continue;
        threatsCache.push({
          x: a.x,
          z: a.z,
          vx: a.axis === 'ew' ? a.dir * a.speed : 0,
          vz: a.axis === 'ns' ? a.dir * a.speed : 0,
          speed: a.speed,
          isPlayer: false,
        });
      }
      return threatsCache;
    },
    findNearestBoardableAgent: (px, pz, maxEdgeDist = 3.6) => {
      let best: BoardableTrafficCandidate | null = null;
      let bestDist = maxEdgeDist;
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (!a.active) continue;
        const headingYaw =
          a.axis === 'ns'
            ? a.dir === 1
              ? 0
              : Math.PI
            : a.dir === 1
              ? Math.PI * 0.5
              : -Math.PI * 0.5;
        const cfg = VEHICLE_CONFIGS[a.vehicleId];
        const edgeDist = computeVehicleEdgeDistance(
          px,
          pz,
          a.x,
          a.z,
          headingYaw,
          cfg.halfWidth,
          cfg.halfLength,
        );
        if (edgeDist <= bestDist) {
          bestDist = edgeDist;
          best = {
            index: i,
            vehicleId: a.vehicleId,
            color: a.color,
            x: a.x,
            z: a.z,
            rotationY: headingYaw,
            edgeDist,
          };
        }
      }
      return best;
    },
    claimBoardedAgent: (index) => {
      const a = agents[index];
      if (!a || !a.active) return null;
      const headingYaw =
        a.axis === 'ns'
          ? a.dir === 1
            ? 0
            : Math.PI
          : a.dir === 1
            ? Math.PI * 0.5
            : -Math.PI * 0.5;
      const claimed: BoardableTrafficCandidate = {
        index,
        vehicleId: a.vehicleId,
        color: a.color,
        x: a.x,
        z: a.z,
        rotationY: headingYaw,
        edgeDist: 0,
      };
      // Recycle AI slot to the far perimeter so the player seamlessly takes over this exact vehicle
      if (a.axis === 'ns') {
        a.z = -a.dir * (wrapLimit - 24);
      } else {
        a.x = -a.dir * (wrapLimit - 24);
      }
      a.speed = a.maxSpeed * 0.6;
      a.rig.root.position.set(a.x, 0, a.z);
      return claimed;
    },
    update: (
      dt,
      desiredCount,
      headlightsOn,
      signals,
      playerPos,
      pedestrianPositions,
      blockingCars = [],
      playerInVehicle = false,
      collisionWorld,
      onTeleportOverpass,
    ) => {
      const clampedCount = Math.max(0, Math.min(maxAgents, desiredCount));

      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        const shouldBeActive = i < clampedCount;
        if (a.active !== shouldBeActive) {
          a.active = shouldBeActive;
          a.rig.root.visible = shouldBeActive;
        }
        if (!a.active) continue;

        if (a.teleportTimer > 0) a.teleportTimer = Math.max(0, a.teleportTimer - dt);
        if (a.teleportCooldown > 0) a.teleportCooldown = Math.max(0, a.teleportCooldown - dt);

        const headingYaw =
          a.axis === 'ns'
            ? a.dir === 1
              ? 0
              : Math.PI
            : a.dir === 1
              ? Math.PI * 0.5
              : -Math.PI * 0.5;

        const fwdX = Math.sin(headingYaw);
        const fwdZ = Math.cos(headingYaw);

        let shouldStop = false;

        // 1. Obey inner traffic lights across all 25 inner intersections
        const greenForAxis =
          a.axis === 'ns'
            ? signals.nsGreen && !signals.yellowPhase
            : !signals.nsGreen && !signals.yellowPhase;
        if (!greenForAxis) {
          const coordAlong = a.axis === 'ns' ? a.z : a.x;
          for (let k = 0; k < innerIntersections.length; k++) {
            const inter = innerIntersections[k];
            const distToStopLine = (inter - a.dir * stopLineOffset - coordAlong) * a.dir;
            if (distToStopLine > 0.5 && distToStopLine < 11.5) {
              shouldStop = true;
              break;
            }
          }
        }

        const halfLen = VEHICLE_CONFIGS[a.vehicleId].halfLength;

        // 2. Yield to Player ONLY when Player is walking on foot
        if (!shouldStop && !playerInVehicle) {
          const pdx = playerPos.x - a.x;
          const pdz = playerPos.z - a.z;
          const fwdP = pdx * fwdX + pdz * fwdZ;
          const latP = Math.abs(pdx * fwdZ - pdz * fwdX);
          if (fwdP > -halfLen && fwdP < halfLen + 11.0 && latP < 3.6) {
            shouldStop = true;
          }
        }

        // 3. Strictly yield to any pedestrian near or crossing the lane so AI cars NEVER hit people!
        let yieldingToPerson = !playerInVehicle && shouldStop;
        if (!shouldStop) {
          for (let pIdx = 0; pIdx < pedestrianPositions.length; pIdx++) {
            const ped = pedestrianPositions[pIdx];
            const dx = ped.x - a.x;
            const dz = ped.z - a.z;
            const fwdPed = dx * fwdX + dz * fwdZ;
            const latPed = Math.abs(dx * fwdZ - dz * fwdX);
            if (fwdPed > -halfLen && fwdPed < halfLen + 10.5 && latPed < 3.6) {
              shouldStop = true;
              yieldingToPerson = true;
              break;
            }
          }
        }

        const targetSpd = shouldStop ? 0 : a.maxSpeed;
        a.speed = THREE.MathUtils.damp(a.speed, targetSpd, shouldStop ? 11.0 : 3.2, dt);

        if (a.axis === 'ns') {
          a.z += a.dir * a.speed * dt;
          if (a.z > wrapLimit) a.z = -wrapLimit;
          if (a.z < -wrapLimit) a.z = wrapLimit;
        } else {
          a.x += a.dir * a.speed * dt;
          if (a.x > wrapLimit) a.x = -wrapLimit;
          if (a.x < -wrapLimit) a.x = wrapLimit;
        }

        // 4. Ground-level Teleport-Phase past blocking cars when a clear pocket exists; otherwise brake cleanly
        let blockedWithoutClearPocket = false;
        if (!yieldingToPerson) {
          laneBlockingScratch.length = 0;
          for (let bIdx = 0; bIdx < blockingCars.length; bIdx++) {
            laneBlockingScratch.push(blockingCars[bIdx]);
          }
          for (let j = 0; j < agents.length; j++) {
            if (i === j || !agents[j].active) continue;
            laneBlockingScratch.push({ x: agents[j].x, z: agents[j].z, radius: 1.6 });
          }

          if (a.teleportCooldown <= 0 && a.speed > 1.8) {
            const tp = computeVehicleOverpassTarget(
              a.x,
              a.z,
              fwdX,
              fwdZ,
              laneBlockingScratch,
              5.8,
              2.55,
              collisionWorld,
            );
            if (tp.triggered) {
              const fromX = a.x;
              const fromZ = a.z;
              if (a.axis === 'ns') {
                a.z = tp.landZ;
              } else {
                a.x = tp.landX;
              }
              a.teleportTimer = 0.25;
              a.teleportCooldown = 0.45;
              onTeleportOverpass?.(fromX, fromZ, tp.overX, tp.overZ, a.x, a.z);
            }
          }

          for (let k = 0; k < laneBlockingScratch.length; k++) {
            const bc = laneBlockingScratch[k];
            const dx = bc.x - a.x;
            const dz = bc.z - a.z;
            const fwdC = dx * fwdX + dz * fwdZ;
            const latC = Math.abs(dx * fwdZ - dz * fwdX);
            if (fwdC > 0 && fwdC < 7.2 && latC < 2.55) {
              blockedWithoutClearPocket = true;
              break;
            }
          }
        }

        if (blockedWithoutClearPocket) {
          shouldStop = true;
          a.speed = THREE.MathUtils.damp(a.speed, 0, 14, dt);
        }

        a.wheelSpin += (a.speed * dt) / 0.37;
        a.rig.root.position.set(a.x, 0, a.z);
        a.rig.root.rotation.y = headingYaw;
        a.rig.updateVisuals(a.wheelSpin, 0, headlightsOn, shouldStop && a.speed > 0.3, 0, 0);
      }
    },
  };
}
