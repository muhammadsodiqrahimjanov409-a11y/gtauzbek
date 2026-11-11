import * as THREE from 'three';
import type { MissionProgress, Vec3 } from '../types/game';
import {
  ROAD_COORDS,
  ROAD_WIDTH,
  SIDEWALK_WIDTH,
  TERRAIN_SIZE,
  WORLD_PLAYABLE_LIMIT,
} from '../game/gameConfig';
import { MISSION_DEFINITIONS } from '../missions/missionDefinitions';
import type { CollisionWorld } from '../utils/collision';
import type { ProceduralTextureSet } from './textures';

export interface CityWorldLandmarksHandle {
  group: THREE.Group;
  updateMarkers: (
    elapsed: number,
    missions: Record<string, MissionProgress>,
    activeMissionId: string | null,
    customWaypoint: Vec3 | null,
  ) => void;
}

export function buildCityEnvironmentAndPark(
  textures: ProceduralTextureSet,
  collisionWorld: CollisionWorld,
  isSoftwareGl: boolean,
): CityWorldLandmarksHandle {
  const group = new THREE.Group();

  // 1. Expansive Ocean Bay Surrounding Nexus City Peninsula
  const oceanGeo = new THREE.PlaneGeometry(TERRAIN_SIZE * 2, TERRAIN_SIZE * 2);
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanMat = new THREE.MeshStandardMaterial({
    color: 0x0e4f70,
    roughness: 0.18,
    metalness: 0.65,
  });
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.position.y = -1.35;
  group.add(ocean);

  // Island peninsula stone seawall & promenade foundation
  const islandFoundation = new THREE.Mesh(
    new THREE.BoxGeometry(WORLD_PLAYABLE_LIMIT * 2 + 8, 2.2, WORLD_PLAYABLE_LIMIT * 2 + 8),
    new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 }),
  );
  islandFoundation.position.y = -1.09;
  islandFoundation.receiveShadow = true;
  group.add(islandFoundation);

  // Low coastal promenade bollards / safety rail around island edge
  const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.45, metalness: 0.7 });
  const nsRailGeo = new THREE.BoxGeometry(WORLD_PLAYABLE_LIMIT * 2, 0.9, 0.5);
  const ewRailGeo = new THREE.BoxGeometry(0.5, 0.9, WORLD_PLAYABLE_LIMIT * 2);
  for (const sign of [-1, 1]) {
    const rN = new THREE.Mesh(nsRailGeo, railMat);
    rN.position.set(0, 0.45, sign * WORLD_PLAYABLE_LIMIT);
    const rE = new THREE.Mesh(ewRailGeo, railMat);
    rE.position.set(sign * WORLD_PLAYABLE_LIMIT, 0.45, 0);
    group.add(rN, rE);
  }

  // Distant Scenic Mountain / Hill Silhouettes across the Bay (outside ±650m)
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x1e3a2f, roughness: 0.92 });
  const hillPositions = [
    { x: -690, z: -640, r: 190, h: 96 },
    { x: 0, z: -740, r: 240, h: 125 },
    { x: 680, z: -620, r: 210, h: 108 },
    { x: -730, z: 180, r: 185, h: 88 },
    { x: 740, z: 220, r: 195, h: 92 },
    { x: 0, z: 760, r: 215, h: 84 },
  ];
  for (const hp of hillPositions) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(hp.r, hp.h, 7), hillMat);
    cone.position.set(hp.x, hp.h * 0.42 - 2, hp.z);
    group.add(cone);
  }

  // ==================== 2. TWIN GRAND GREEN PARKS ====================
  // East Green Park Block [-108..-22, 22..108] (center -65, 65) + West Botanical Park [-238..-152, 22..108] (center -195, 65)
  const parkLawnMat = new THREE.MeshStandardMaterial({
    map: textures.grass,
    roughness: 0.9,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const pathMat = new THREE.MeshStandardMaterial({
    color: 0xd6d3d1,
    roughness: 0.88,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  for (const parkCenterX of [-65, -195]) {
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(86, 86).rotateX(-Math.PI / 2), parkLawnMat);
    lawn.position.set(parkCenterX, 0.035, 65);
    lawn.receiveShadow = true;
    group.add(lawn);

    const pathNS = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 86).rotateX(-Math.PI / 2), pathMat);
    pathNS.position.set(parkCenterX, 0.042, 65);
    const pathEW = new THREE.Mesh(new THREE.PlaneGeometry(86, 4.6).rotateX(-Math.PI / 2), pathMat);
    pathEW.position.set(parkCenterX, 0.042, 65);
    group.add(pathNS, pathEW);
  }

  // Reflective Park Lake at (-86, 44) inside East Green Park
  const pondRing = new THREE.Mesh(new THREE.RingGeometry(10.2, 11.6, 28).rotateX(-Math.PI / 2), pathMat);
  pondRing.position.set(-86, 0.048, 44);
  const pondWater = new THREE.Mesh(
    new THREE.CircleGeometry(10.3, 28).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.12, metalness: 0.72 }),
  );
  pondWater.position.set(-86, 0.05, 44);
  group.add(pondRing, pondWater);
  collisionWorld.addBox('park_pond', -86, 44, 19.5, 19.5, 2.5, 'water');

  // Green Park Central Gazebo Pavilion at (-65, 0, 65) — Walk-through open landmark!
  const buildGazebo = (gx: number, gz: number) => {
    const gazebo = new THREE.Group();
    gazebo.position.set(gx, 0, gz);
    const gazBase = new THREE.Mesh(
      new THREE.CylinderGeometry(5.6, 6.2, 0.28, 8),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.7 }),
    );
    gazBase.position.y = 0.14;
    const gazRoof = new THREE.Mesh(
      new THREE.ConeGeometry(6.4, 2.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.45, metalness: 0.35 }),
    );
    gazRoof.position.y = 5.0;
    gazebo.add(gazBase, gazRoof);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.18, 3.8, 8),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 }),
      );
      col.position.set(Math.cos(a) * 4.7, 1.9, Math.sin(a) * 4.7);
      gazebo.add(col);
    }
    group.add(gazebo);
  };
  buildGazebo(-65, 65);
  buildGazebo(-195, 65);

  // ==================== 3. INSTANCED MULTI-PART TREES (Trunk + Lower Canopy + Upper Crown) ====================
  const treeCoords: Array<{ x: number; z: number; scale: number; tint: number }> = [];
  const corridorHalf = ROAD_WIDTH * 0.5 + SIDEWALK_WIDTH + 0.6; // 22.1m — never place a tree on road or sidewalk!
  const isNearAnyRoad = (val: number) => ROAD_COORDS.some((rc) => Math.abs(val - rc) < corridorHalf);

  const addTree = (x: number, z: number, seed: number) => {
    if (isNearAnyRoad(x) && isNearAnyRoad(z)) return;
    const scale = 0.9 + ((seed * 37) % 34) / 100;
    const greens = [0x15803d, 0x166534, 0x16a34a, 0x0f766e];
    treeCoords.push({ x, z, scale, tint: greens[seed % greens.length] });
  };

  // East & West Green Park groves (avoiding Rally spawn (-102, 32) and Roadster spawn (-32, 102))
  const parkOffsets: Array<[number, number]> = [
    [-32, -26], [-18, -32], [22, -30], [34, -22],
    [-34, 22], [-22, 34], [20, 26], [34, 18],
    [-36, 8], [36, -8], [14, -36], [-14, 36],
  ];
  parkOffsets.forEach(([ox, oz], idx) => {
    // Skip pond area around (-86, 44) -> ox=-21, oz=-21
    if (Math.hypot(-65 + ox - -86, 65 + oz - 44) > 14) {
      addTree(-65 + ox, 65 + oz, idx + 1);
    }
    addTree(-195 + ox, 65 + oz, idx + 40);
  });

  // Grand Boulevard avenue trees lining the outer edge of sidewalks along X=0 and Z=130
  const treeLineOffset = ROAD_WIDTH * 0.5 + SIDEWALK_WIDTH + 1.2; // 22.7m from road center
  for (let i = 0; i < 28; i++) {
    const pos = -350 + i * 26;
    if (ROAD_COORDS.some((rc) => Math.abs(pos - rc) < corridorHalf + 4)) continue;
    addTree(-treeLineOffset, pos, i + 100);
    addTree(treeLineOffset, pos, i + 140);
    addTree(pos, 130 - treeLineOffset, i + 180);
  }

  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.32, 2.4, 7);
  trunkGeo.translate(0, 1.2, 0);
  const lowCrownGeo = new THREE.DodecahedronGeometry(1.85, 1);
  lowCrownGeo.translate(0, 3.3, 0);
  const topCrownGeo = new THREE.DodecahedronGeometry(1.28, 1);
  topCrownGeo.translate(0, 4.8, 0);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 });

  const tCount = treeCoords.length;
  const trunksInst = new THREE.InstancedMesh(trunkGeo, trunkMat, tCount);
  const lowCrownInst = new THREE.InstancedMesh(lowCrownGeo, foliageMat, tCount);
  const topCrownInst = new THREE.InstancedMesh(topCrownGeo, foliageMat, tCount);

  trunksInst.castShadow = !isSoftwareGl;
  lowCrownInst.castShadow = !isSoftwareGl;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  treeCoords.forEach((tc, idx) => {
    dummy.position.set(tc.x, 0, tc.z);
    dummy.rotation.set(0, idx * 1.1, 0);
    dummy.scale.setScalar(tc.scale);
    dummy.updateMatrix();
    trunksInst.setMatrixAt(idx, dummy.matrix);
    lowCrownInst.setMatrixAt(idx, dummy.matrix);
    topCrownInst.setMatrixAt(idx, dummy.matrix);

    color.setHex(tc.tint);
    lowCrownInst.setColorAt(idx, color);
    color.offsetHSL(0.02, 0, 0.06);
    topCrownInst.setColorAt(idx, color);
  });

  trunksInst.instanceMatrix.needsUpdate = true;
  lowCrownInst.instanceMatrix.needsUpdate = true;
  topCrownInst.instanceMatrix.needsUpdate = true;
  if (lowCrownInst.instanceColor) lowCrownInst.instanceColor.needsUpdate = true;
  if (topCrownInst.instanceColor) topCrownInst.instanceColor.needsUpdate = true;
  trunksInst.computeBoundingSphere();
  lowCrownInst.computeBoundingSphere();
  topCrownInst.computeBoundingSphere();

  group.add(trunksInst, lowCrownInst, topCrownInst);

  // ==================== 4. INTERACTIVE WORLD BEACONS (Missions, Checkpoints, Waypoint) ====================
  const missionRings: Record<string, THREE.Group> = {};
  const ringMatAvailable = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  });

  for (const def of MISSION_DEFINITIONS) {
    const rg = new THREE.Group();
    rg.position.set(def.startPosition.x, 0.08, def.startPosition.z);
    const torus = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.7, 28).rotateX(-Math.PI / 2), ringMatAvailable);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 5.5, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    beam.position.y = 2.75;
    rg.add(torus, beam);
    group.add(rg);
    missionRings[def.id] = rg;
  }

  // Active Mission Checkpoint Beacon (Amber Gold)
  const activeBeacon = new THREE.Group();
  const cpRing = new THREE.Mesh(
    new THREE.RingGeometry(3.2, 4.2, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide }),
  );
  const cpColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.2, 24, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  cpColumn.position.y = 12;
  activeBeacon.add(cpRing, cpColumn);
  activeBeacon.visible = false;
  group.add(activeBeacon);

  // Custom Map Waypoint Beacon (Sky Blue)
  const waypointBeacon = new THREE.Group();
  const wpRing = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.2, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide }),
  );
  const wpCol = new THREE.Mesh(
    new THREE.CylinderGeometry(2.0, 2.0, 30, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  wpCol.position.y = 15;
  waypointBeacon.add(wpRing, wpCol);
  waypointBeacon.visible = false;
  group.add(waypointBeacon);

  const updateMarkers: CityWorldLandmarksHandle['updateMarkers'] = (
    elapsed,
    missions,
    activeMissionId,
    customWaypoint,
  ) => {
    const pulseScale = 1 + Math.sin(elapsed * 3.2) * 0.06;

    for (const def of MISSION_DEFINITIONS) {
      const rg = missionRings[def.id];
      const st = missions[def.id]?.status;
      const showStart = !activeMissionId && (st === 'available' || st === 'failed');
      rg.visible = showStart;
      if (showStart) {
        rg.scale.set(pulseScale, 1, pulseScale);
      }
    }

    if (activeMissionId) {
      const def = MISSION_DEFINITIONS.find((m) => m.id === activeMissionId);
      const prog = missions[activeMissionId];
      const cp = def && prog ? def.checkpoints[prog.currentStep] : undefined;
      if (cp) {
        activeBeacon.visible = true;
        activeBeacon.position.set(cp.position.x, 0.08, cp.position.z);
        activeBeacon.scale.set(pulseScale, 1, pulseScale);
      } else {
        activeBeacon.visible = false;
      }
    } else {
      activeBeacon.visible = false;
    }

    if (customWaypoint) {
      waypointBeacon.visible = true;
      waypointBeacon.position.set(customWaypoint.x, 0.08, customWaypoint.z);
      waypointBeacon.scale.set(pulseScale, 1, pulseScale);
    } else {
      waypointBeacon.visible = false;
    }
  };

  return {
    group,
    updateMarkers,
  };
}
