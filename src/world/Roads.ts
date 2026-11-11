import * as THREE from 'three';
import {
  PARKING_CHALLENGE_BAY,
  ROAD_COORDS,
  ROAD_WIDTH,
  SIDEWALK_WIDTH,
  WORLD_PLAYABLE_LIMIT,
} from '../game/gameConfig';
import type { ProceduralTextureSet } from './textures';

export interface TrafficSignalController {
  nsGreen: boolean;
  yellowPhase: boolean;
  update: (elapsedTime: number) => void;
}

export interface RoadSystemHandle {
  group: THREE.Group;
  asphaltMaterial: THREE.MeshStandardMaterial;
  intersectionMaterial: THREE.MeshStandardMaterial;
  lampBulbMaterial: THREE.MeshStandardMaterial;
  trafficController: TrafficSignalController;
}

export function buildRoadNetwork(textures: ProceduralTextureSet): RoadSystemHandle {
  const group = new THREE.Group();

  // Base city peninsula concrete promenade foundation so wide sidewalks & plazas are continuous
  const slabSize = WORLD_PLAYABLE_LIMIT * 2;
  const citySlabGeo = new THREE.PlaneGeometry(slabSize, slabSize);
  citySlabGeo.rotateX(-Math.PI / 2);
  const sidewalkMat = new THREE.MeshStandardMaterial({
    map: textures.sidewalk,
    roughness: 0.85,
    metalness: 0.05,
  });
  const citySlab = new THREE.Mesh(citySlabGeo, sidewalkMat);
  citySlab.position.y = 0.02;
  citySlab.receiveShadow = true;
  group.add(citySlab);

  const intersectionMaterial = new THREE.MeshStandardMaterial({
    map: textures.roadIntersection,
    roughness: 0.7,
    metalness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  // Dynamically build straight boulevard segments between every consecutive ROAD_COORDS pair
  const blockPitch = ROAD_COORDS[1] - ROAD_COORDS[0]; // 130m
  const segmentLen = blockPitch - ROAD_WIDTH; // 96m
  const segmentCenters: number[] = [];
  for (let i = 0; i < ROAD_COORDS.length - 1; i++) {
    segmentCenters.push((ROAD_COORDS[i] + ROAD_COORDS[i + 1]) * 0.5);
  }

  const nsSegTex = textures.roadStraight.clone();
  nsSegTex.colorSpace = THREE.SRGBColorSpace;
  nsSegTex.wrapS = THREE.RepeatWrapping;
  nsSegTex.wrapT = THREE.RepeatWrapping;
  nsSegTex.repeat.set(1, Math.max(2, Math.round(segmentLen / 30)));
  nsSegTex.needsUpdate = true;

  const segMat = new THREE.MeshStandardMaterial({
    map: nsSegTex,
    roughness: 0.72,
    metalness: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const nsGeo = new THREE.PlaneGeometry(ROAD_WIDTH, segmentLen);
  nsGeo.rotateX(-Math.PI / 2);

  const ewGeo = new THREE.PlaneGeometry(ROAD_WIDTH, segmentLen);
  ewGeo.rotateX(-Math.PI / 2);
  ewGeo.rotateY(Math.PI / 2);

  for (const r of ROAD_COORDS) {
    for (const sc of segmentCenters) {
      // North-South grand boulevard segment at X = r, Z = sc
      const nsMesh = new THREE.Mesh(nsGeo, segMat);
      nsMesh.position.set(r, 0.035, sc);
      nsMesh.receiveShadow = true;
      group.add(nsMesh);

      // East-West grand boulevard segment at X = sc, Z = r
      const ewMesh = new THREE.Mesh(ewGeo, segMat);
      ewMesh.position.set(sc, 0.035, r);
      ewMesh.receiveShadow = true;
      group.add(ewMesh);
    }
  }

  // 49 Grand 34m x 34m Intersections
  const interGeo = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_WIDTH);
  interGeo.rotateX(-Math.PI / 2);
  for (const rx of ROAD_COORDS) {
    for (const rz of ROAD_COORDS) {
      const inter = new THREE.Mesh(interGeo, intersectionMaterial);
      inter.position.set(rx, 0.04, rz);
      inter.receiveShadow = true;
      group.add(inter);
    }
  }

  // Precision Parking Bay near Dealership
  const bayGeo = new THREE.PlaneGeometry(7.2, 10.4);
  bayGeo.rotateX(-Math.PI / 2);
  const bayMat = new THREE.MeshStandardMaterial({
    map: textures.parkingBay,
    roughness: 0.65,
    metalness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const bayMesh = new THREE.Mesh(bayGeo, bayMat);
  bayMesh.position.set(PARKING_CHALLENGE_BAY.x, 0.045, PARKING_CHALLENGE_BAY.z);
  bayMesh.receiveShadow = true;
  group.add(bayMesh);

  // Highway Coastal Suspension Bridge Arches along South Seafront Expressway (Z = +390)
  const archSteelMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.35,
    metalness: 0.82,
  });
  const cableMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.4,
    metalness: 0.85,
  });

  const southHighwayZ = ROAD_COORDS[ROAD_COORDS.length - 1];
  const archLateralZ = ROAD_WIDTH * 0.5 + 1.8; // safely outside the 34m-wide highway
  const archHalfSpan = Math.min(40, segmentLen * 0.44);

  for (const bx of segmentCenters) {
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(bx, 0, southHighwayZ);

    const archCurveN = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-archHalfSpan, 0, -archLateralZ),
      new THREE.Vector3(-archHalfSpan * 0.5, 18.5, -archLateralZ),
      new THREE.Vector3(0, 24, -archLateralZ),
      new THREE.Vector3(archHalfSpan * 0.5, 18.5, -archLateralZ),
      new THREE.Vector3(archHalfSpan, 0, -archLateralZ),
    ]);
    const archCurveS = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-archHalfSpan, 0, archLateralZ),
      new THREE.Vector3(-archHalfSpan * 0.5, 18.5, archLateralZ),
      new THREE.Vector3(0, 24, archLateralZ),
      new THREE.Vector3(archHalfSpan * 0.5, 18.5, archLateralZ),
      new THREE.Vector3(archHalfSpan, 0, archLateralZ),
    ]);

    const archGeoN = new THREE.TubeGeometry(archCurveN, 22, 0.58, 8, false);
    const archGeoS = new THREE.TubeGeometry(archCurveS, 22, 0.58, 8, false);
    bridgeGroup.add(new THREE.Mesh(archGeoN, archSteelMat));
    bridgeGroup.add(new THREE.Mesh(archGeoS, archSteelMat));

    for (let cx = -30; cx <= 30; cx += 10) {
      const ratio = cx / (archHalfSpan + 2);
      const h = 23.2 * (1 - ratio * ratio);
      const cGeo = new THREE.CylinderGeometry(0.08, 0.08, h, 5);
      const cN = new THREE.Mesh(cGeo, cableMat);
      cN.position.set(cx, h * 0.5, -archLateralZ);
      const cS = new THREE.Mesh(cGeo, cableMat);
      cS.position.set(cx, h * 0.5, archLateralZ);
      bridgeGroup.add(cN, cS);
    }

    group.add(bridgeGroup);
  }

  // Instanced Tall Boulevard Street Lamps along all inner avenues (outside ROAD_WIDTH / 2)
  const innerCoords = ROAD_COORDS.slice(1, -1); // [-260, -130, 0, 130, 260]
  const outerRoadAbs = Math.abs(ROAD_COORDS[0]);
  const lampPositions: Array<{ x: number; z: number; rotY: number }> = [];
  const offset = ROAD_WIDTH * 0.5 + SIDEWALK_WIDTH * 0.45; // 19.0m from road center
  const interClearance = ROAD_WIDTH * 0.5 + 6; // 23m clearance from cross streets

  for (const rx of innerCoords) {
    for (let z = -outerRoadAbs + 34; z <= outerRoadAbs - 34; z += 44) {
      if (ROAD_COORDS.some((rc) => Math.abs(z - rc) < interClearance)) continue;
      lampPositions.push({ x: rx - offset, z, rotY: 0 });
      lampPositions.push({ x: rx + offset, z, rotY: Math.PI });
    }
  }
  for (const rz of innerCoords) {
    for (let x = -outerRoadAbs + 34; x <= outerRoadAbs - 34; x += 48) {
      if (ROAD_COORDS.some((rc) => Math.abs(x - rc) < interClearance)) continue;
      lampPositions.push({ x, z: rz - offset, rotY: -Math.PI / 2 });
      lampPositions.push({ x, z: rz + offset, rotY: Math.PI / 2 });
    }
  }

  const poleGeo = new THREE.CylinderGeometry(0.12, 0.18, 7.6, 7);
  poleGeo.translate(0, 3.8, 0);
  const armGeo = new THREE.BoxGeometry(2.6, 0.14, 0.16);
  armGeo.translate(1.25, 7.55, 0);
  const bulbGeo = new THREE.BoxGeometry(0.75, 0.14, 0.34);
  bulbGeo.translate(2.2, 7.44, 0);

  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.45,
    metalness: 0.78,
  });
  const lampBulbMaterial = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xfbbf24,
    emissiveIntensity: 0.1,
    roughness: 0.2,
  });

  const count = lampPositions.length;
  const polesInst = new THREE.InstancedMesh(poleGeo, poleMat, count);
  const armsInst = new THREE.InstancedMesh(armGeo, poleMat, count);
  const bulbsInst = new THREE.InstancedMesh(bulbGeo, lampBulbMaterial, count);

  const dummy = new THREE.Object3D();
  lampPositions.forEach((lp, idx) => {
    dummy.position.set(lp.x, 0, lp.z);
    dummy.rotation.set(0, lp.rotY, 0);
    dummy.updateMatrix();
    polesInst.setMatrixAt(idx, dummy.matrix);
    armsInst.setMatrixAt(idx, dummy.matrix);
    bulbsInst.setMatrixAt(idx, dummy.matrix);
  });

  polesInst.instanceMatrix.needsUpdate = true;
  armsInst.instanceMatrix.needsUpdate = true;
  bulbsInst.instanceMatrix.needsUpdate = true;
  polesInst.computeBoundingSphere();
  armsInst.computeBoundingSphere();
  bulbsInst.computeBoundingSphere();
  group.add(polesInst, armsInst, bulbsInst);

  // Interactive 3-color Overhead Cantilever Traffic Signals at all 25 inner intersections
  const nsRedMat = new THREE.MeshStandardMaterial({ color: 0x450a0a, emissive: 0xef4444, emissiveIntensity: 0 });
  const nsYellowMat = new THREE.MeshStandardMaterial({ color: 0x451a03, emissive: 0xf59e0b, emissiveIntensity: 0 });
  const nsGreenMat = new THREE.MeshStandardMaterial({ color: 0x052e16, emissive: 0x22c55e, emissiveIntensity: 2.2 });

  const ewRedMat = new THREE.MeshStandardMaterial({ color: 0x450a0a, emissive: 0xef4444, emissiveIntensity: 2.2 });
  const ewYellowMat = new THREE.MeshStandardMaterial({ color: 0x451a03, emissive: 0xf59e0b, emissiveIntensity: 0 });
  const ewGreenMat = new THREE.MeshStandardMaterial({ color: 0x052e16, emissive: 0x22c55e, emissiveIntensity: 0 });

  const housingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5, metalness: 0.6 });
  const signalPostGeo = new THREE.CylinderGeometry(0.14, 0.18, 6.4, 7);
  const mastArmGeo = new THREE.BoxGeometry(4.6, 0.16, 0.18);
  const housingGeo = new THREE.BoxGeometry(0.48, 1.3, 0.4);
  const lensGeo = new THREE.SphereGeometry(0.13, 8, 8);

  const cornerOffset = ROAD_WIDTH * 0.5 + 1.8; // 18.8m from center -> cleanly on sidewalk corner!

  for (const ix of innerCoords) {
    for (const iz of innerCoords) {
      // NS signal post on NE corner overhanging southbound/northbound lanes
      const nsSig = new THREE.Group();
      nsSig.position.set(ix + cornerOffset, 0, iz - cornerOffset);
      const p1 = new THREE.Mesh(signalPostGeo, poleMat);
      p1.position.y = 3.2;
      const arm1 = new THREE.Mesh(mastArmGeo, poleMat);
      arm1.position.set(-2.2, 6.2, 0);
      const h1 = new THREE.Mesh(housingGeo, housingMat);
      h1.position.set(-3.4, 5.75, 0);
      const r1 = new THREE.Mesh(lensGeo, nsRedMat);
      r1.position.set(-3.4, 6.14, 0.19);
      const y1 = new THREE.Mesh(lensGeo, nsYellowMat);
      y1.position.set(-3.4, 5.75, 0.19);
      const g1 = new THREE.Mesh(lensGeo, nsGreenMat);
      g1.position.set(-3.4, 5.36, 0.19);
      nsSig.add(p1, arm1, h1, r1, y1, g1);
      group.add(nsSig);

      // EW signal post on SW corner overhanging eastbound/westbound lanes
      const ewSig = new THREE.Group();
      ewSig.position.set(ix - cornerOffset, 0, iz + cornerOffset);
      ewSig.rotation.y = Math.PI / 2;
      const p2 = new THREE.Mesh(signalPostGeo, poleMat);
      p2.position.y = 3.2;
      const arm2 = new THREE.Mesh(mastArmGeo, poleMat);
      arm2.position.set(-2.2, 6.2, 0);
      const h2 = new THREE.Mesh(housingGeo, housingMat);
      h2.position.set(-3.4, 5.75, 0);
      const r2 = new THREE.Mesh(lensGeo, ewRedMat);
      r2.position.set(-3.4, 6.14, 0.19);
      const y2 = new THREE.Mesh(lensGeo, ewYellowMat);
      y2.position.set(-3.4, 5.75, 0.19);
      const g2 = new THREE.Mesh(lensGeo, ewGreenMat);
      g2.position.set(-3.4, 5.36, 0.19);
      ewSig.add(p2, arm2, h2, r2, y2, g2);
      group.add(ewSig);
    }
  }

  const trafficController: TrafficSignalController = {
    nsGreen: true,
    yellowPhase: false,
    update: (elapsedTime: number) => {
      const phase = elapsedTime % 20;
      if (phase < 8) {
        trafficController.nsGreen = true;
        trafficController.yellowPhase = false;
        nsGreenMat.emissiveIntensity = 2.4;
        nsYellowMat.emissiveIntensity = 0;
        nsRedMat.emissiveIntensity = 0;

        ewGreenMat.emissiveIntensity = 0;
        ewYellowMat.emissiveIntensity = 0;
        ewRedMat.emissiveIntensity = 2.4;
      } else if (phase < 10) {
        trafficController.nsGreen = false;
        trafficController.yellowPhase = true;
        nsGreenMat.emissiveIntensity = 0;
        nsYellowMat.emissiveIntensity = 2.4;
        nsRedMat.emissiveIntensity = 0;

        ewGreenMat.emissiveIntensity = 0;
        ewYellowMat.emissiveIntensity = 0;
        ewRedMat.emissiveIntensity = 2.4;
      } else if (phase < 18) {
        trafficController.nsGreen = false;
        trafficController.yellowPhase = false;
        nsGreenMat.emissiveIntensity = 0;
        nsYellowMat.emissiveIntensity = 0;
        nsRedMat.emissiveIntensity = 2.4;

        ewGreenMat.emissiveIntensity = 2.4;
        ewYellowMat.emissiveIntensity = 0;
        ewRedMat.emissiveIntensity = 0;
      } else {
        trafficController.nsGreen = false;
        trafficController.yellowPhase = true;
        nsGreenMat.emissiveIntensity = 0;
        nsYellowMat.emissiveIntensity = 0;
        nsRedMat.emissiveIntensity = 2.4;

        ewGreenMat.emissiveIntensity = 0;
        ewYellowMat.emissiveIntensity = 2.4;
        ewRedMat.emissiveIntensity = 0;
      }
    },
  };

  return {
    group,
    asphaltMaterial: segMat,
    intersectionMaterial,
    lampBulbMaterial,
    trafficController,
  };
}
