import * as THREE from 'three';
import type { RaceRivalSnapshot, RaceStateSnapshot, RaceStatus, Vec3, VehicleId } from '../types/game';
import {
  CITY_RACE_CHECKPOINTS,
  CITY_RACE_RIVALS,
  CITY_RACE_START_POS,
  ROAD_WIDTH,
} from '../game/gameConfig';
import type { CollisionWorld } from '../utils/collision';
import { createProceduralVehicleModel, type VehicleRig } from './Vehicle';
import type { MovingVehicleThreat } from './Pedestrians';
import { computeVehicleOverpassTarget, type BlockingCarObstacle } from './TeleportEffects';

interface RivalRacerAgent {
  id: string;
  vehicleId: VehicleId;
  color: string;
  paceFactor: number;
  laneOffset: number;
  rig: VehicleRig;
  x: number;
  z: number;
  rotationY: number;
  speed: number;
  wheelSpin: number;
  steerAngle: number;
  checkpointIndex: number;
  finished: boolean;
  finishTime: number;
  teleportCooldown: number;
}

export interface StreetRaceStepResult {
  snapshot: RaceStateSnapshot;
  justStartedGo: boolean;
  justReachedCheckpoint: boolean;
  raceCompletedEvent: {
    playerWon: boolean;
    playerRank: number;
    winnerVehicleId: VehicleId | null;
  } | null;
}

export interface StreetRaceSystem {
  group: THREE.Group;
  startRace: () => { playerStartPos: Vec3; playerStartRotationY: number };
  stopRace: () => void;
  getStatus: () => RaceStatus;
  getCurrentCheckpointTarget: () => Vec3 | null;
  getRivalObstaclesForPlayer: () => Array<{ x: number; z: number; radius: number }>;
  getMovingThreats: () => MovingVehicleThreat[];
  update: (
    dt: number,
    elapsed: number,
    headlightsOn: boolean,
    playerPos: Vec3,
    playerVehicleMaxSpeed: number,
    pedestrianPositions: Array<{ x: number; z: number }>,
    blockingCars: BlockingCarObstacle[],
    collisionWorld: CollisionWorld,
    onTeleportOverpass?: (
      fromX: number,
      fromZ: number,
      overX: number,
      overZ: number,
      toX: number,
      toZ: number,
      colorHex?: number,
    ) => void,
  ) => StreetRaceStepResult;
}

function createCheckeredBannerTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, c.width, c.height);

  // Checkered left & right racing borders
  const sq = 16;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#f8fafc' : '#0f172a';
      ctx.fillRect(col * sq, row * sq, sq, sq);
      ctx.fillRect(c.width - (col + 1) * sq, row * sq, sq, sq);
    }
  }

  // Amber racing accent stripes
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(96, 0, c.width - 192, 8);
  ctx.fillRect(96, c.height - 8, c.width - 192, 8);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GRAND CITY RACE', c.width * 0.5, c.height * 0.5);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createStreetRaceSystem(isSoftwareGl = false): StreetRaceSystem {
  const group = new THREE.Group();

  // 1. GRAND 3D START / FINISH GANTRY ARCH spanning the 34m South Ring Boulevard at (-65, 0, 390)
  const gantryGroup = new THREE.Group();
  gantryGroup.position.set(CITY_RACE_START_POS.x, 0, CITY_RACE_START_POS.z);

  const trussMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.36,
    metalness: 0.82,
  });
  const accentGoldMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 0.45,
    roughness: 0.25,
    metalness: 0.65,
  });

  const pillarSpanZ = ROAD_WIDTH * 0.5 + 1.8; // 18.8m (safely on outer sidewalk, clear of 34m asphalt)
  const gantryHeight = 8.6;

  for (const side of [-1, 1]) {
    const basePad = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 1.8), trussMat);
    basePad.position.set(0, 0.225, side * pillarSpanZ);

    const col = new THREE.Mesh(new THREE.BoxGeometry(0.95, gantryHeight, 0.95), trussMat);
    col.position.set(0, gantryHeight * 0.5, side * pillarSpanZ);
    col.castShadow = !isSoftwareGl;

    const neonTrim = new THREE.Mesh(new THREE.BoxGeometry(1.05, gantryHeight - 1.2, 0.18), accentGoldMat);
    neonTrim.position.set(0, gantryHeight * 0.5, side * (pillarSpanZ - side * 0.52));

    gantryGroup.add(basePad, col, neonTrim);
  }

  // Overhead Cross-Beam + Checkered Banner facing both approaches
  const crossBeam = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 1.45, pillarSpanZ * 2 + 1.2),
    trussMat,
  );
  crossBeam.position.set(0, gantryHeight + 0.5, 0);
  crossBeam.castShadow = !isSoftwareGl;
  gantryGroup.add(crossBeam);

  const bannerTex = createCheckeredBannerTexture();
  const bannerMat = new THREE.MeshStandardMaterial({
    color: bannerTex ? 0xffffff : 0xf59e0b,
    map: bannerTex ?? undefined,
    emissive: 0x1e293b,
    emissiveIntensity: 0.35,
    roughness: 0.3,
  });
  const bannerFront = new THREE.Mesh(new THREE.PlaneGeometry(24, 2.4).rotateY(-Math.PI * 0.5), bannerMat);
  bannerFront.position.set(-0.68, gantryHeight + 0.5, 0);
  const bannerBack = new THREE.Mesh(new THREE.PlaneGeometry(24, 2.4).rotateY(Math.PI * 0.5), bannerMat);
  bannerBack.position.set(0.68, gantryHeight + 0.5, 0);
  gantryGroup.add(bannerFront, bannerBack);

  // 5 Starting Signal Lights suspended beneath gantry
  const startLampMats: THREE.MeshStandardMaterial[] = [];
  for (let li = 0; li < 5; li++) {
    const lMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.35,
      roughness: 0.2,
    });
    startLampMats.push(lMat);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 12), lMat);
    lamp.position.set(-0.7, gantryHeight - 0.55, (li - 2) * 2.4);
    gantryGroup.add(lamp);
  }

  // Painted Checkered Start/Finish Strip on road surface (y = 0.065 with polygonOffset to prevent Z-fighting)
  const roadStripMat = new THREE.MeshBasicMaterial({
    color: 0xf8fafc,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  for (let si = 0; si < 16; si++) {
    const sqMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.9).rotateX(-Math.PI * 0.5), roadStripMat);
    sqMesh.position.set((si % 2 === 0 ? -0.7 : 0.7), 0.065, -14.2 + si * 1.9);
    gantryGroup.add(sqMesh);
  }

  group.add(gantryGroup);

  // 2. ACTIVE CHECKPOINT 3D GATE (Glowing Twin Pylons + Overhead Ring)
  const activeCheckpointGroup = new THREE.Group();
  const cpGlowMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x06b6d4,
    emissiveIntensity: 1.15,
    transparent: true,
    opacity: 0.88,
    roughness: 0.15,
  });
  const cpLeftPylon = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 11, 12), cpGlowMat);
  cpLeftPylon.position.set(-15.5, 5.5, 0);
  const cpRightPylon = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 11, 12), cpGlowMat);
  cpRightPylon.position.set(15.5, 5.5, 0);
  const cpTopArch = new THREE.Mesh(
    new THREE.TorusGeometry(15.5, 0.36, 10, 36, Math.PI),
    cpGlowMat,
  );
  cpTopArch.position.set(0, 5.5, 0);
  const cpGroundRing = new THREE.Mesh(
    new THREE.RingGeometry(9.5, 11.2, 32).rotateX(-Math.PI * 0.5),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  cpGroundRing.position.y = 0.08;
  activeCheckpointGroup.add(cpLeftPylon, cpRightPylon, cpTopArch, cpGroundRing);
  activeCheckpointGroup.visible = false;
  group.add(activeCheckpointGroup);

  // 3. 10 VARIED AI RIVAL CARS (hypercar, track, supercar, electric_gt, roadster, cyber, drift, muscle, rally, lux_suv)
  const rivals: RivalRacerAgent[] = CITY_RACE_RIVALS.map((spec, idx) => {
    const rig = createProceduralVehicleModel(spec.vehicleId, spec.color, !isSoftwareGl && idx < 4);
    // In idle freeroam, park the 10 rival cars neatly along the outer pit shoulders behind the Start Gantry!
    const side = idx % 2 === 0 ? -1 : 1;
    const slotIdx = Math.floor(idx / 2);
    const idleX = CITY_RACE_START_POS.x - 12 - slotIdx * 9.5;
    const idleZ = CITY_RACE_START_POS.z + side * 14.8;

    rig.root.position.set(idleX, 0, idleZ);
    rig.root.rotation.y = Math.PI * 0.5;
    group.add(rig.root);

    return {
      id: spec.id,
      vehicleId: spec.vehicleId,
      color: spec.color,
      paceFactor: spec.paceFactor,
      laneOffset: spec.laneOffset,
      rig,
      x: idleX,
      z: idleZ,
      rotationY: Math.PI * 0.5,
      speed: 0,
      wheelSpin: 0,
      steerAngle: 0,
      checkpointIndex: 0,
      finished: false,
      finishTime: 0,
      teleportCooldown: 0,
    };
  });

  let status: RaceStatus = 'idle';
  let countdown = 0;
  let elapsedRaceSec = 0;
  let playerCheckpointIdx = 0;
  let playerRank = 11;
  let playerWon = false;
  let winnerVehicleId: VehicleId | null = null;
  let firstRivalFinishWaitSec = 0;

  const parkRivalsOnShoulder = () => {
    for (let idx = 0; idx < rivals.length; idx++) {
      const r = rivals[idx];
      const side = idx % 2 === 0 ? -1 : 1;
      const slotIdx = Math.floor(idx / 2);
      r.x = CITY_RACE_START_POS.x - 12 - slotIdx * 9.5;
      r.z = CITY_RACE_START_POS.z + side * 14.8;
      r.rotationY = Math.PI * 0.5;
      r.speed = 0;
      r.steerAngle = 0;
      r.checkpointIndex = 0;
      r.finished = false;
      r.finishTime = 0;
      r.teleportCooldown = 0;
      r.rig.root.position.set(r.x, 0, r.z);
      r.rig.root.rotation.y = r.rotationY;
      r.rig.updateVisuals(0, 0, false, false, 0, 0);
    }
  };

  const arrangeStartingGrid = (): { playerStartPos: Vec3; playerStartRotationY: number } => {
    // 4-wide motorsport grid along Z = 390 facing East (+X, rotationY = PI / 2)
    const gridLanesZ = [
      CITY_RACE_START_POS.z - 10.5,
      CITY_RACE_START_POS.z - 3.5,
      CITY_RACE_START_POS.z + 3.5,
      CITY_RACE_START_POS.z + 10.5,
    ];
    const rowOffsetsX = [-8, -17, -26];

    // Row 0 (4 cars), Row 1 (4 cars), Row 2 outer 2 cars; Player takes center-pole of Row 2!
    const rivalGridCoords: Array<[number, number]> = [
      [CITY_RACE_START_POS.x + rowOffsetsX[0], gridLanesZ[0]],
      [CITY_RACE_START_POS.x + rowOffsetsX[0], gridLanesZ[1]],
      [CITY_RACE_START_POS.x + rowOffsetsX[0], gridLanesZ[2]],
      [CITY_RACE_START_POS.x + rowOffsetsX[0], gridLanesZ[3]],
      [CITY_RACE_START_POS.x + rowOffsetsX[1], gridLanesZ[0]],
      [CITY_RACE_START_POS.x + rowOffsetsX[1], gridLanesZ[1]],
      [CITY_RACE_START_POS.x + rowOffsetsX[1], gridLanesZ[2]],
      [CITY_RACE_START_POS.x + rowOffsetsX[1], gridLanesZ[3]],
      [CITY_RACE_START_POS.x + rowOffsetsX[2], gridLanesZ[0]],
      [CITY_RACE_START_POS.x + rowOffsetsX[2], gridLanesZ[3]],
    ];

    for (let i = 0; i < rivals.length; i++) {
      const r = rivals[i];
      const [gx, gz] = rivalGridCoords[i];
      r.x = gx;
      r.z = gz;
      r.rotationY = Math.PI * 0.5;
      r.speed = 0;
      r.steerAngle = 0;
      r.checkpointIndex = 0;
      r.finished = false;
      r.finishTime = 0;
      r.teleportCooldown = 0;
      r.rig.root.position.set(r.x, 0, r.z);
      r.rig.root.rotation.y = r.rotationY;
      r.rig.updateVisuals(0, 0, true, true, 0, 0);
    }

    return {
      playerStartPos: {
        x: CITY_RACE_START_POS.x + rowOffsetsX[2],
        y: 0,
        z: CITY_RACE_START_POS.z,
      },
      playerStartRotationY: Math.PI * 0.5,
    };
  };

  const buildSnapshot = (): RaceStateSnapshot => ({
    status,
    countdown: Math.max(0, countdown),
    elapsedSeconds: elapsedRaceSec,
    playerRank,
    totalRacers: rivals.length + 1,
    checkpointIndex: playerCheckpointIdx,
    totalCheckpoints: CITY_RACE_CHECKPOINTS.length,
    playerWon,
    winnerVehicleId,
    rivals: rivals.map(
      (r): RaceRivalSnapshot => ({
        id: r.id,
        vehicleId: r.vehicleId,
        color: r.color,
        x: r.x,
        z: r.z,
        rotationY: r.rotationY,
        checkpointIndex: r.checkpointIndex,
        finished: r.finished,
      }),
    ),
  });

  const rivalObstaclesCache: Array<{ x: number; z: number; radius: number }> = [];
  const movingThreatsCache: MovingVehicleThreat[] = [];

  return {
    group,
    startRace: () => {
      status = 'countdown';
      countdown = 3.0;
      elapsedRaceSec = 0;
      playerCheckpointIdx = 0;
      playerRank = 11;
      playerWon = false;
      winnerVehicleId = null;
      firstRivalFinishWaitSec = 0;
      activeCheckpointGroup.visible = true;
      return arrangeStartingGrid();
    },
    stopRace: () => {
      status = 'idle';
      countdown = 0;
      elapsedRaceSec = 0;
      playerCheckpointIdx = 0;
      playerRank = 11;
      playerWon = false;
      winnerVehicleId = null;
      firstRivalFinishWaitSec = 0;
      activeCheckpointGroup.visible = false;
      parkRivalsOnShoulder();
    },
    getStatus: () => status,
    getCurrentCheckpointTarget: () => {
      if (status !== 'countdown' && status !== 'racing') return null;
      return CITY_RACE_CHECKPOINTS[Math.min(playerCheckpointIdx, CITY_RACE_CHECKPOINTS.length - 1)] ?? null;
    },
    getRivalObstaclesForPlayer: () => {
      rivalObstaclesCache.length = 0;
      for (const r of rivals) {
        rivalObstaclesCache.push({ x: r.x, z: r.z, radius: 1.4 });
      }
      return rivalObstaclesCache;
    },
    getMovingThreats: () => {
      movingThreatsCache.length = 0;
      if (status !== 'racing') return movingThreatsCache;
      for (const r of rivals) {
        if (r.speed > 1.5) {
          movingThreatsCache.push({
            x: r.x,
            z: r.z,
            vx: Math.sin(r.rotationY) * r.speed,
            vz: Math.cos(r.rotationY) * r.speed,
            speed: r.speed,
            isPlayer: false,
          });
        }
      }
      return movingThreatsCache;
    },
    update: (
      dt,
      elapsed,
      headlightsOn,
      playerPos,
      playerVehicleMaxSpeed,
      pedestrianPositions,
      blockingCars,
      collisionWorld,
      onTeleportOverpass,
    ) => {
      let justStartedGo = false;
      let justReachedCheckpoint = false;
      let raceCompletedEvent: StreetRaceStepResult['raceCompletedEvent'] = null;

      // Update gantry start lights
      for (let li = 0; li < startLampMats.length; li++) {
        const mat = startLampMats[li];
        if (status === 'countdown') {
          const litCount = Math.min(5, Math.ceil((3.0 - countdown) * 2.0) + 1);
          const on = li < litCount;
          mat.color.setHex(on ? 0xef4444 : 0x1e293b);
          mat.emissive.setHex(on ? 0xef4444 : 0x0f172a);
          mat.emissiveIntensity = on ? 1.4 : 0.15;
        } else if (status === 'racing') {
          mat.color.setHex(0x10b981);
          mat.emissive.setHex(0x10b981);
          mat.emissiveIntensity = 1.3;
        } else {
          mat.color.setHex(0xf59e0b);
          mat.emissive.setHex(0xd97706);
          mat.emissiveIntensity = 0.5 + Math.sin(elapsed * 3 + li * 0.5) * 0.25;
        }
      }

      if (status === 'idle' || status === 'finished') {
        activeCheckpointGroup.visible = false;
        if (status === 'finished') {
          // Coast rivals gently to a halt after race conclusion
          for (const r of rivals) {
            if (r.speed > 0.1) {
              r.speed = Math.max(0, r.speed - 22 * dt);
              r.x += Math.sin(r.rotationY) * r.speed * dt;
              r.z += Math.cos(r.rotationY) * r.speed * dt;
              r.wheelSpin += r.speed * dt * 2.4;
              r.rig.root.position.set(r.x, 0, r.z);
              r.rig.updateVisuals(r.wheelSpin, 0, headlightsOn, true, 0, 0);
            }
          }
        }
        return {
          snapshot: buildSnapshot(),
          justStartedGo,
          justReachedCheckpoint,
          raceCompletedEvent,
        };
      }

      // Position & orient active 3D Checkpoint Gate
      const activeCp = CITY_RACE_CHECKPOINTS[Math.min(playerCheckpointIdx, CITY_RACE_CHECKPOINTS.length - 1)];
      if (activeCp) {
        const isFinish = playerCheckpointIdx === CITY_RACE_CHECKPOINTS.length - 1;
        activeCheckpointGroup.visible = !isFinish; // Finish uses the Grand Checkered Gantry itself!
        activeCheckpointGroup.position.set(activeCp.x, 0, activeCp.z);
        const prevCp =
          playerCheckpointIdx === 0
            ? CITY_RACE_START_POS
            : CITY_RACE_CHECKPOINTS[playerCheckpointIdx - 1];
        const segYaw = Math.atan2(activeCp.x - prevCp.x, activeCp.z - prevCp.z);
        activeCheckpointGroup.rotation.y = segYaw;
        cpGroundRing.scale.setScalar(0.95 + Math.sin(elapsed * 4.5) * 0.06);
      }

      if (status === 'countdown') {
        countdown -= dt;
        if (countdown <= 0) {
          countdown = 0;
          status = 'racing';
          justStartedGo = true;
        }
        return {
          snapshot: buildSnapshot(),
          justStartedGo,
          justReachedCheckpoint,
          raceCompletedEvent,
        };
      }

      // STATUS === 'racing'
      elapsedRaceSec += dt;

      // 1. Evaluate Player Checkpoint Progression
      const currentTargetCp = CITY_RACE_CHECKPOINTS[playerCheckpointIdx];
      if (currentTargetCp) {
        const distPlayerCp = Math.hypot(playerPos.x - currentTargetCp.x, playerPos.z - currentTargetCp.z);
        const triggerRadius = playerCheckpointIdx === CITY_RACE_CHECKPOINTS.length - 1 ? 26 : 30;
        if (distPlayerCp <= triggerRadius) {
          playerCheckpointIdx++;
          justReachedCheckpoint = true;
        }
      }

      // 2. Step all 10 AI Rival Cars around the 3,120m City Perimeter Loop (ground y = 0 strictly)
      const refTopSpeed = Math.max(32, Math.min(62, playerVehicleMaxSpeed));

      for (let i = 0; i < rivals.length; i++) {
        const r = rivals[i];
        if (r.teleportCooldown > 0) r.teleportCooldown = Math.max(0, r.teleportCooldown - dt);

        if (r.finished) {
          r.speed = Math.max(0, r.speed - 18 * dt);
          r.x += Math.sin(r.rotationY) * r.speed * dt;
          r.z += Math.cos(r.rotationY) * r.speed * dt;
          r.rig.root.position.set(r.x, 0, r.z);
          r.rig.updateVisuals(r.wheelSpin, 0, headlightsOn, true, 0, 0);
          continue;
        }

        const cp = CITY_RACE_CHECKPOINTS[r.checkpointIndex];
        const prev = r.checkpointIndex === 0 ? CITY_RACE_START_POS : CITY_RACE_CHECKPOINTS[r.checkpointIndex - 1];
        const segDx = cp.x - prev.x;
        const segDz = cp.z - prev.z;
        const segLen = Math.max(1, Math.hypot(segDx, segDz));
        const unitX = segDx / segLen;
        const unitZ = segDz / segLen;
        // Right-hand perpendicular vector for wide 6-lane spreading
        const rightX = -unitZ;
        const rightZ = unitX;

        const aimX = cp.x + rightX * r.laneOffset * 0.72;
        const aimZ = cp.z + rightZ * r.laneOffset * 0.72;

        const toAimX = aimX - r.x;
        const toAimZ = aimZ - r.z;
        const distToCpCenter = Math.hypot(cp.x - r.x, cp.z - r.z);

        // Advance rival checkpoint when entering corner/gate zone
        if (distToCpCenter <= 24) {
          r.checkpointIndex++;
          if (r.checkpointIndex >= CITY_RACE_CHECKPOINTS.length) {
            r.finished = true;
            r.finishTime = elapsedRaceSec;
            if (!winnerVehicleId) {
              winnerVehicleId = r.vehicleId;
            }
            continue;
          }
        }

        const desiredYaw = Math.atan2(toAimX, toAimZ);
        let yawDiff = (desiredYaw - r.rotationY) % (Math.PI * 2);
        if (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

        const maxTurnStep = 3.4 * dt;
        const appliedTurn = THREE.MathUtils.clamp(yawDiff, -maxTurnStep, maxTurnStep);
        r.rotationY += appliedTurn;
        r.steerAngle = THREE.MathUtils.clamp(yawDiff * 0.85, -0.45, 0.45);

        // Corner speed modulation & competitive rubber-banding
        const isCornerCp =
          Math.abs(cp.x) >= 380 && Math.abs(cp.z) >= 380;
        const cornerFactor = isCornerCp && distToCpCenter < 48 ? 0.74 : 1.0;

        const cpDeltaVsPlayer = r.checkpointIndex - playerCheckpointIdx;
        const rubberBand =
          cpDeltaVsPlayer > 1 ? 0.9 : cpDeltaVsPlayer < -1 ? 1.09 : 1.0;

        let targetSpeed = refTopSpeed * r.paceFactor * cornerFactor * rubberBand;

        // Pedestrian safety: brake smoothly if a pedestrian is ahead in lane
        let brakingForPed = false;
        const fwdX = Math.sin(r.rotationY);
        const fwdZ = Math.cos(r.rotationY);
        for (let pi = 0; pi < pedestrianPositions.length; pi++) {
          const ped = pedestrianPositions[pi];
          const px = ped.x - r.x;
          const pz = ped.z - r.z;
          const forwardProj = px * fwdX + pz * fwdZ;
          if (forwardProj > 0 && forwardProj < 14) {
            const lat = Math.abs(px * -fwdZ + pz * fwdX);
            if (lat < 2.6) {
              targetSpeed = 0;
              brakingForPed = true;
              break;
            }
          }
        }

        if (r.speed < targetSpeed) {
          r.speed = Math.min(targetSpeed, r.speed + 24 * dt);
        } else {
          r.speed = Math.max(targetSpeed, r.speed - 30 * dt);
        }

        // Ground-level quantum phase-pass if any parked/traffic car blocks this rival's lane
        if (r.teleportCooldown <= 0 && blockingCars.length > 0 && r.speed > 4) {
          const tp = computeVehicleOverpassTarget(
            r.x,
            r.z,
            fwdX,
            fwdZ,
            blockingCars,
            5.6,
            2.3,
            collisionWorld,
          );
          if (tp.triggered) {
            const fromX = r.x;
            const fromZ = r.z;
            r.x = tp.landX;
            r.z = tp.landZ;
            r.teleportCooldown = 0.55;
            onTeleportOverpass?.(fromX, fromZ, tp.overX, tp.overZ, tp.landX, tp.landZ, 0xa855f7);
          }
        }

        const nextX = r.x + Math.sin(r.rotationY) * r.speed * dt;
        const nextZ = r.z + Math.cos(r.rotationY) * r.speed * dt;
        const safePos = collisionWorld.resolveCircle(nextX, nextZ, 1.35);
        r.x = safePos.x;
        r.z = safePos.z;
        r.wheelSpin += r.speed * dt * 2.4;

        // Strictly y = 0 ("mashina sakramasin")
        r.rig.root.position.set(r.x, 0, r.z);
        r.rig.root.rotation.y = r.rotationY;
        r.rig.updateVisuals(
          r.wheelSpin,
          r.steerAngle,
          true || headlightsOn,
          brakingForPed || cornerFactor < 1,
          0,
          -r.steerAngle * 0.08,
        );
      }

      // 3. Compute Live Race Standings (1 .. 11)
      const playerTarget =
        CITY_RACE_CHECKPOINTS[Math.min(playerCheckpointIdx, CITY_RACE_CHECKPOINTS.length - 1)];
      const playerDistToNext = playerTarget
        ? Math.hypot(playerPos.x - playerTarget.x, playerPos.z - playerTarget.z)
        : 0;
      const playerFinishedNow = playerCheckpointIdx >= CITY_RACE_CHECKPOINTS.length;
      const playerScore = playerFinishedNow
        ? 1_000_000 - elapsedRaceSec * 100
        : playerCheckpointIdx * 10_000 - playerDistToNext;

      let betterCount = 0;
      for (const r of rivals) {
        let rScore: number;
        if (r.finished) {
          rScore = 1_000_000 - r.finishTime * 100;
        } else {
          const rCp = CITY_RACE_CHECKPOINTS[Math.min(r.checkpointIndex, CITY_RACE_CHECKPOINTS.length - 1)];
          const rDist = rCp ? Math.hypot(r.x - rCp.x, r.z - rCp.z) : 0;
          rScore = r.checkpointIndex * 10_000 - rDist;
        }
        if (rScore > playerScore) {
          betterCount++;
        }
      }
      playerRank = betterCount + 1;

      if (winnerVehicleId && !playerFinishedNow) {
        firstRivalFinishWaitSec += dt;
      }

      // 4. Check Race Finish Condition
      if (playerFinishedNow) {
        status = 'finished';
        if (!winnerVehicleId) {
          // Player crossed Finish Line BEFORE all 10 AI rivals -> 1st Place Winner!
          playerWon = true;
          playerRank = 1;
        } else {
          playerWon = false;
        }
        raceCompletedEvent = {
          playerWon,
          playerRank,
          winnerVehicleId,
        };
      } else if (winnerVehicleId && firstRivalFinishWaitSec >= 22) {
        // Rival already won and timeout elapsed
        status = 'finished';
        playerWon = false;
        raceCompletedEvent = {
          playerWon: false,
          playerRank,
          winnerVehicleId,
        };
      }

      return {
        snapshot: buildSnapshot(),
        justStartedGo,
        justReachedCheckpoint,
        raceCompletedEvent,
      };
    },
  };
}
