import * as THREE from 'three';
import {
  DEALERSHIP_LOCATION,
  GAS_STATION_LOCATION,
  SAFEHOUSE_LOCATION,
} from '../game/gameConfig';
import type { CollisionWorld } from '../utils/collision';
import type { ProceduralTextureSet } from './textures';

export interface BuildingsSystemHandle {
  group: THREE.Group;
  nightMaterials: THREE.MeshStandardMaterial[];
  showroomTurntable: THREE.Group;
}

/**
 * Builds the 36-block expanded Nexus City skyline & district architecture.
 * Road centers sit at [-390, -260, -130, 0, 130, 260, 390] with ROAD_WIDTH=34 + SIDEWALK_WIDTH=4.5
 * (road + sidewalk corridor = ±21.5m around each road coordinate).
 * Every city block therefore has an 87m x 87m buildable interior centered at:
 *   [-325, -195, -65, +65, +195, +325] (safe interior bounds [center - 42, center + 42]).
 */
export function buildCityBuildings(
  textures: ProceduralTextureSet,
  collisionWorld: CollisionWorld,
  isSoftwareGl: boolean,
): BuildingsSystemHandle {
  const group = new THREE.Group();
  const nightMaterials: THREE.MeshStandardMaterial[] = [];

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.78,
    metalness: 0.08,
  });
  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.35,
    metalness: 0.82,
  });
  const brushedAlumMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.28,
    metalness: 0.85,
  });
  const cyanAccentMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.65,
    roughness: 0.25,
  });
  const amberAccentMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.7,
    roughness: 0.25,
  });

  const makeOfficeMat = (tint: number): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({
      color: tint,
      map: textures.officeFacade,
      emissive: 0xffffff,
      emissiveMap: textures.officeEmissive,
      emissiveIntensity: 0.08,
      roughness: 0.22,
      metalness: 0.68,
    });
    nightMaterials.push(m);
    return m;
  };

  const makeResMat = (tint: number): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({
      color: tint,
      map: textures.residentialFacade,
      emissive: 0xffffff,
      emissiveMap: textures.residentialEmissive,
      emissiveIntensity: 0.08,
      roughness: 0.65,
      metalness: 0.12,
    });
    nightMaterials.push(m);
    return m;
  };

  const officePalette = [
    makeOfficeMat(0xe2e8f0),
    makeOfficeMat(0xbae6fd),
    makeOfficeMat(0xcbd5e1),
    makeOfficeMat(0x93c5fd),
  ];
  const resPalette = [
    makeResMat(0xf1f5f9),
    makeResMat(0xfde68a),
    makeResMat(0xe2e8f0),
    makeResMat(0xfecdd3),
  ];

  // Multi-part Downtown Skyscraper (Podium + Main Shaft + Upper Setback + Crown + Spire + Rooftop HVAC)
  const addSkyscraper = (
    id: string,
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    matIndex: number,
    hasSpire = true,
  ) => {
    const tower = new THREE.Group();
    tower.position.set(x, 0, z);

    const podiumH = 4.6;
    const podium = new THREE.Mesh(new THREE.BoxGeometry(w + 2.2, podiumH, d + 2.2), darkSteelMat);
    podium.position.y = podiumH * 0.5;
    podium.castShadow = !isSoftwareGl;
    podium.receiveShadow = true;
    tower.add(podium);

    const shaftH = h * 0.72;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(w, shaftH, d), officePalette[matIndex % officePalette.length]);
    shaft.position.y = podiumH + shaftH * 0.5;
    shaft.castShadow = !isSoftwareGl;
    shaft.receiveShadow = true;
    tower.add(shaft);

    const upperW = w * 0.78;
    const upperD = d * 0.78;
    const upperH = h * 0.28;
    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(upperW, upperH, upperD),
      officePalette[(matIndex + 1) % officePalette.length],
    );
    upper.position.y = podiumH + shaftH + upperH * 0.5;
    upper.castShadow = !isSoftwareGl;
    tower.add(upper);

    const crownY = podiumH + shaftH + upperH;
    const crownTrim = new THREE.Mesh(new THREE.BoxGeometry(upperW + 0.6, 0.8, upperD + 0.6), cyanAccentMat);
    crownTrim.position.y = crownY + 0.4;
    tower.add(crownTrim);

    const hvac = new THREE.Mesh(new THREE.BoxGeometry(upperW * 0.35, 2.0, upperD * 0.35), brushedAlumMat);
    hvac.position.set(upperW * 0.16, crownY + 1.6, -upperD * 0.14);
    tower.add(hvac);

    if (hasSpire) {
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.44, 12, 8), brushedAlumMat);
      spire.position.y = crownY + 6.5;
      tower.add(spire);
    }

    group.add(tower);
    collisionWorld.addBox(id, x, z, w + 2.2, d + 2.2, crownY + 2, 'building');
  };

  // ==================== 1. DOWNTOWN SKYLINE (6 GRAND BLOCKS: X in [-130..130], Z in [-390..0]) ====================
  // North-West Downtown Block — (-90, -298) is Walk-In Panorama Cinema Tower; (-65, -292) is Track hypercar plaza!
  addSkyscraper('dt_nw_1', -86, -344, 24, 24, 88, 0, true);
  addSkyscraper('dt_nw_2', -44, -344, 22, 22, 72, 1, false);

  // North-East Downtown Block — (46, -298) is Walk-In 96m Auto-Tech Museum Skyscraper!
  addSkyscraper('dt_ne_1', 45, -344, 25, 25, 96, 1, true);
  addSkyscraper('dt_ne_2', 86, -344, 22, 22, 68, 2, false);
  addSkyscraper('dt_ne_4', 86, -302, 20, 20, 56, 3, false);

  // Mid-West Downtown Block — (-86, -170) is Walk-In History Museum Tower & (-44, -170) is Walk-In Apex Bank HQ!
  addSkyscraper('dt_mw_1', -86, -216, 24, 24, 82, 3, true);
  addSkyscraper('dt_mw_2', -44, -216, 22, 22, 64, 0, false);

  // Mid-East Downtown Block — (46, -168) is Nexus IT Holding & (86, -170) is Orion Media Holding Skyscraper!
  addSkyscraper('dt_me_1', 46, -216, 26, 24, 92, 2, true);
  addSkyscraper('dt_me_2', 86, -216, 20, 22, 62, 3, false);

  // South-West Downtown Civic Block — (-86, -44) is Walk-In IMAX Grand Cinema Skyscraper!
  addSkyscraper('dt_sw_1', -86, -86, 24, 24, 78, 3, true);
  addSkyscraper('dt_sw_2', -46, -90, 22, 18, 58, 0, false);

  // Civic Monument Sculpture at (-52, -44) facing Central Intersection
  const plazaBase = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7.4, 0.7, 18), concreteMat);
  plazaBase.position.set(-52, 0.35, -44);
  const plazaRing = new THREE.Mesh(new THREE.TorusKnotGeometry(2.6, 0.45, 48, 10), brushedAlumMat);
  plazaRing.position.set(-52, 4.4, -44);
  group.add(plazaBase, plazaRing);
  collisionWorld.addBox('dt_plaza_monument', -52, -44, 9.0, 9.0, 7, 'prop');

  // South-East Downtown Block — (48, -42) is Fine Art Museum & (84, -44) is Walk-In Cyber-Arena Arcade Skyscraper!
  addSkyscraper('dt_se_1', 54, -90, 24, 20, 84, 2, true);
  addSkyscraper('dt_se_2', 88, -86, 22, 22, 64, 1, false);

  // ==================== 2. RESIDENTIAL DISTRICT & PLAYER SAFEHOUSE ====================
  // Player Safehouse at (-65, 0, 178) inside Residential Block [-107..-23] x [153..237], facing North toward Boulevard Z=130
  const safehouse = new THREE.Group();
  safehouse.position.set(SAFEHOUSE_LOCATION.x, 0, SAFEHOUSE_LOCATION.z);

  const drivewayGeo = new THREE.PlaneGeometry(18, 28);
  drivewayGeo.rotateX(-Math.PI / 2);
  const drivewayMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const driveway = new THREE.Mesh(drivewayGeo, drivewayMat);
  driveway.position.set(6, 0.03, -16);
  safehouse.add(driveway);

  const houseMain = new THREE.Mesh(
    new THREE.BoxGeometry(16, 7.6, 12),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.65 }),
  );
  houseMain.position.set(-2, 3.8, 0);
  houseMain.castShadow = !isSoftwareGl;
  houseMain.receiveShadow = true;

  const garageWing = new THREE.Mesh(
    new THREE.BoxGeometry(9.5, 4.6, 10.5),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.7 }),
  );
  garageWing.position.set(10.2, 2.3, -0.5);
  garageWing.castShadow = !isSoftwareGl;

  const garageDoor = new THREE.Mesh(new THREE.BoxGeometry(6.8, 3.6, 0.25), darkSteelMat);
  garageDoor.position.set(10.2, 1.8, -5.76);

  const mainRoof = new THREE.Mesh(new THREE.BoxGeometry(17.6, 0.7, 13.6), darkSteelMat);
  mainRoof.position.set(-2, 7.9, 0);
  const garageRoof = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.55, 11.5), darkSteelMat);
  garageRoof.position.set(10.2, 4.85, -0.5);

  const porchCanopy = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.35, 3.4), darkSteelMat);
  porchCanopy.position.set(-2, 4.0, -7.2);
  const frontDoor = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 3.0, 0.25),
    new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.55 }),
  );
  frontDoor.position.set(-2, 1.5, -6.02);
  const porchGlow = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.18, 0.25), amberAccentMat);
  porchGlow.position.set(-2, 3.8, -8.6);

  safehouse.add(houseMain, garageWing, garageDoor, mainRoof, garageRoof, porchCanopy, frontDoor, porchGlow);
  group.add(safehouse);
  collisionWorld.addBox('player_safehouse', SAFEHOUSE_LOCATION.x + 2.5, SAFEHOUSE_LOCATION.z, 26, 13, 8.5, 'building');

  const addApartment = (id: string, x: number, z: number, w: number, d: number, h: number, idx: number) => {
    const apt = new THREE.Group();
    apt.position.set(x, 0, z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), resPalette[idx % resPalette.length]);
    body.position.y = h * 0.5;
    body.castShadow = !isSoftwareGl;
    body.receiveShadow = true;

    const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.9, d + 0.8), darkSteelMat);
    parapet.position.y = h + 0.45;

    for (let by = 4.2; by < h - 2; by += 4.4) {
      const bal = new THREE.Mesh(new THREE.BoxGeometry(w + 1.0, 0.36, d * 0.55), concreteMat);
      bal.position.y = by;
      apt.add(bal);
    }

    apt.add(body, parapet);
    group.add(apt);
    collisionWorld.addBox(id, x, z, w + 0.8, d + 0.8, h + 1, 'building');
  };

  // Neighboring villas/apartments around Safehouse block [-107..-23] x [153..237]
  addApartment('res_sh_1', -88, 218, 22, 18, 24, 0);
  addApartment('res_sh_2', -42, 218, 22, 18, 20, 1);

  // Remaining Residential Blocks in SW Quadrant (X in [-390..0], Z in [130..390]) + West Parkside [-390..-260, 0..130]
  const resBlocks: Array<[number, number]> = [
    [-195, 195],
    [-325, 195],
    [-65, 325],
    [-195, 325],
    [-325, 325],
    [-325, 65],
  ];
  resBlocks.forEach(([bx, bz], bIdx) => {
    // Keep (-162, 160) open for Classic car spawn & (-216, 168) open for Walk-In Parkside Restaurant!
    if (bx === -195 && bz === 195) {
      addApartment(`res_b${bIdx}_2`, -218, 216, 24, 20, 24, 3);
      addApartment(`res_b${bIdx}_3`, -174, 216, 22, 20, 26, 0);
    } else if (bx === -325 && bz === 65) {
      // Keep (-302, 42) open for Walk-In Cosmos & Science Museum!
      addApartment(`res_b${bIdx}_1`, bx - 22, bz - 22, 24, 20, 22 + (bIdx % 3) * 5, bIdx);
      addApartment(`res_b${bIdx}_3`, bx - 22, bz + 22, 22, 20, 28 + (bIdx % 3) * 4, bIdx + 2);
      addApartment(`res_b${bIdx}_4`, bx + 22, bz + 22, 24, 20, 20 + (bIdx % 4) * 4, bIdx + 3);
    } else if (bx === -65 && bz === 325) {
      // Keep (-44, 300) open for Walk-In Galaxy Arcade & Bowling Tower!
      addApartment(`res_b${bIdx}_1`, bx - 22, bz - 22, 24, 20, 22 + (bIdx % 3) * 5, bIdx);
      addApartment(`res_b${bIdx}_3`, bx - 22, bz + 22, 22, 20, 28 + (bIdx % 3) * 4, bIdx + 2);
      addApartment(`res_b${bIdx}_4`, bx + 22, bz + 22, 24, 20, 20 + (bIdx % 4) * 4, bIdx + 3);
    } else {
      addApartment(`res_b${bIdx}_1`, bx - 22, bz - 22, 24, 20, 22 + (bIdx % 3) * 5, bIdx);
      addApartment(`res_b${bIdx}_2`, bx + 22, bz - 22, 22, 20, 26 + (bIdx % 2) * 6, bIdx + 1);
      addApartment(`res_b${bIdx}_3`, bx - 22, bz + 22, 22, 20, 28 + (bIdx % 3) * 4, bIdx + 2);
      addApartment(`res_b${bIdx}_4`, bx + 22, bz + 22, 24, 20, 20 + (bIdx % 4) * 4, bIdx + 3);
    }
  });

  // ==================== 3. COMMERCIAL DISTRICT, DEALERSHIP & GAS STATION ====================
  // Nexus Auto Dealership Showroom at (65, 0, 56) inside Block [23..107] x [23..107]
  const dealership = new THREE.Group();
  dealership.position.set(DEALERSHIP_LOCATION.x, 0, DEALERSHIP_LOCATION.z);

  const showroomFloor = new THREE.Mesh(
    new THREE.BoxGeometry(30, 0.35, 24),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.25, metalness: 0.4 }),
  );
  showroomFloor.position.y = 0.175;
  showroomFloor.receiveShadow = true;

  const rearWall = new THREE.Mesh(new THREE.BoxGeometry(30, 9.2, 2.4), darkSteelMat);
  rearWall.position.set(0, 4.6, 10.6);
  rearWall.castShadow = !isSoftwareGl;

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbae6fd,
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
  });
  const glassWalls = new THREE.Mesh(new THREE.BoxGeometry(28.4, 8.4, 20.4), glassMat);
  glassWalls.position.set(0, 4.4, -0.5);
  glassWalls.renderOrder = 2;

  const showroomRoof = new THREE.Mesh(new THREE.BoxGeometry(33, 1.2, 27), darkSteelMat);
  showroomRoof.position.set(-0.5, 9.2, 0);
  showroomRoof.castShadow = !isSoftwareGl;

  const fasciaNeon = new THREE.Mesh(new THREE.BoxGeometry(33.4, 0.5, 27.4), cyanAccentMat);
  fasciaNeon.position.set(-0.5, 9.7, 0);

  const showroomTurntable = new THREE.Group();
  showroomTurntable.position.set(-5, 0.4, -1);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.3, 0.28, 24), brushedAlumMat);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.15, 0.09, 8, 32), cyanAccentMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.12;
  showroomTurntable.add(pad, ring);

  dealership.add(showroomFloor, rearWall, glassWalls, showroomRoof, fasciaNeon, showroomTurntable);
  group.add(dealership);
  collisionWorld.addBox('nexus_dealership', DEALERSHIP_LOCATION.x, DEALERSHIP_LOCATION.z, 30, 24, 10.2, 'building');

  // Gas Station at (186, 0, 182) inside Block [153..237] x [153..237]
  const gasStation = new THREE.Group();
  gasStation.position.set(GAS_STATION_LOCATION.x, 0, GAS_STATION_LOCATION.z);

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(20, 0.95, 15), concreteMat);
  canopy.position.set(-4, 6.4, 0);
  canopy.castShadow = !isSoftwareGl;
  const canopyStripe = new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.48, 15.4), amberAccentMat);
  canopyStripe.position.set(-4, 6.58, 0);

  for (const px of [-11, 3]) {
    for (const pz of [-5.2, 5.2]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 6.4, 10), brushedAlumMat);
      col.position.set(px, 3.2, pz);
      gasStation.add(col);
    }
  }
  for (const pz of [-3.6, 3.6]) {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.2, 0.85), darkSteelMat);
    pump.position.set(-4, 1.1, pz);
    gasStation.add(pump);
  }
  const miniMart = new THREE.Mesh(new THREE.BoxGeometry(11, 5.2, 16), makeOfficeMat(0xf8fafc));
  miniMart.position.set(12, 2.6, 0);
  miniMart.castShadow = !isSoftwareGl;
  gasStation.add(canopy, canopyStripe, miniMart);
  group.add(gasStation);
  collisionWorld.addBox('gas_station_mart', GAS_STATION_LOCATION.x + 12, GAS_STATION_LOCATION.z, 11.5, 16.5, 5.5, 'building');
  collisionWorld.addBox('gas_pumps', GAS_STATION_LOCATION.x - 4, GAS_STATION_LOCATION.z, 3.4, 9.5, 3.2, 'prop');

  // Companion commercial tower in Gas Station block (east side)
  addSkyscraper('com_gs_1', 218, 218, 22, 20, 38, 2, false);

  // Remaining Commercial Blocks in SE Quadrant (X in [0..390], Z in [0..390])
  const comBlocks: Array<[number, number]> = [
    [195, 65],
    [325, 65],
    [65, 195],
    [325, 195],
    [65, 325],
    [195, 325],
    [325, 325],
  ];
  comBlocks.forEach(([bx, bz], cIdx) => {
    // Keep (162, 102) open for GT Tourer, (176, 42) for Galleria Mega-Mall & (218, 42) for Global Trade Enterprise Tower!
    if (bx === 195 && bz === 65) {
      addSkyscraper(`com_b${cIdx}_3`, 216, 88, 24, 22, 52, 0, true);
    } else if (bx === 65 && bz === 195) {
      // Keep (44, 168) open for Orzu Supermarket & (86, 170) open for Walk-In Yulduz 3D Cinema Tower!
      addSkyscraper(`com_b${cIdx}_3`, bx + 20, bz + 22, 24, 20, 40 + (cIdx % 3) * 6, cIdx + 2, false);
    } else {
      addSkyscraper(`com_b${cIdx}_1`, bx - 22, bz - 22, 24, 20, 34 + (cIdx % 4) * 8, cIdx, cIdx % 2 === 0);
      addSkyscraper(`com_b${cIdx}_2`, bx + 22, bz - 22, 20, 20, 28 + (cIdx % 3) * 7, cIdx + 1, false);
      addSkyscraper(`com_b${cIdx}_3`, bx + 20, bz + 22, 24, 20, 40 + (cIdx % 3) * 6, cIdx + 2, false);
    }
  });

  // ==================== 4. INDUSTRIAL LOGISTICS & HARBOR ZONES ====================
  const warehouseMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.72,
    metalness: 0.48,
  });
  const rustAccentMat = new THREE.MeshStandardMaterial({
    color: 0xb45309,
    roughness: 0.68,
    metalness: 0.42,
  });

  const addWarehouse = (id: string, x: number, z: number, w: number, d: number, h: number, withStack = false) => {
    const wh = new THREE.Group();
    wh.position.set(x, 0, z);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), warehouseMat);
    hull.position.y = h * 0.5;
    hull.castShadow = !isSoftwareGl;
    hull.receiveShadow = true;

    const roofRidge = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 1.0, d * 0.45), rustAccentMat);
    roofRidge.position.y = h + 0.5;
    wh.add(hull, roofRidge);

    if (withStack) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 26, 12), concreteMat);
      stack.position.set(w * 0.3, 13, -d * 0.25);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.28, 1.32, 2.0, 12), amberAccentMat);
      band.position.set(w * 0.3, 22.5, -d * 0.25);
      wh.add(stack, band);
    }

    group.add(wh);
    collisionWorld.addBox(id, x, z, w + 0.8, d + 0.8, h + 2, 'building');
  };

  // East Industrial Blocks [195, 325] x [-325, -195, -65] + NW Harbor Blocks [-325, -195] x [-325, -195, -65]
  const indBlocks: Array<[number, number]> = [
    [195, -65],
    [325, -65],
    [195, -195],
    [325, -195],
    [195, -325],
    [325, -325],
    [-195, -65],
    [-325, -65],
    [-195, -195],
    [-325, -195],
    [-195, -325],
    [-325, -325],
  ];

  indBlocks.forEach(([bx, bz], iIdx) => {
    // Keep (162, -42) open for Pickup, (212, -42) for Robotics Enterprise, (214, -170) for Energy Corp, (-177, -42) for Harbor Logistics, & (294, -158) for Drift car!
    addWarehouse(`ind_b${iIdx}_1`, bx + 18, bz - 20, 30, 22, 13 + (iIdx % 3) * 2, iIdx % 2 === 0);
    addWarehouse(`ind_b${iIdx}_2`, bx - 16, bz - 22, 24, 20, 12, false);
    const hasWalkInSouthComplex =
      (bx === 195 && bz === -65) || (bx === 195 && bz === -195) || (bx === -195 && bz === -65);
    if (!hasWalkInSouthComplex) {
      addWarehouse(`ind_b${iIdx}_3`, bx + 18, bz + 20, 28, 22, 14, iIdx % 3 === 0);
    }
  });

  // Cylindrical Industrial Storage Silos
  const siloSpots: Array<[number, number]> = [
    [172, -172],
    [184, -172],
    [304, -304],
    [316, -304],
    [-172, -172],
    [-304, -304],
  ];
  siloSpots.forEach(([sx, sz], idx) => {
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 18, 16), brushedAlumMat);
    silo.position.set(sx, 9, sz);
    silo.castShadow = !isSoftwareGl;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(4.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), brushedAlumMat);
    cap.position.set(sx, 18, sz);
    group.add(silo, cap);
    collisionWorld.addBox(`silo_${idx}`, sx, sz, 8.6, 8.6, 20, 'building');
  });

  return {
    group,
    nightMaterials,
    showroomTurntable,
  };
}
