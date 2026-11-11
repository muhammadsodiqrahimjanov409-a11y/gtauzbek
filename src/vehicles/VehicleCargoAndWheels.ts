import * as THREE from 'three';
import type { CargoLoadId, RimStyleId, VehicleBodyStyle } from '../types/game';

export interface WheelAssemblyHandle {
  group: THREE.Group;
  setRimStyle: (style: RimStyleId) => void;
}

export function createCustomizableWheelAssembly(
  wheelRadius: number,
  wheelWidth: number,
  tireMat: THREE.MeshStandardMaterial,
  rimMat: THREE.MeshStandardMaterial,
  trimDarkMat: THREE.MeshStandardMaterial,
  castShadow: boolean,
  isDualWheel = false,
): WheelAssemblyHandle {
  const wg = new THREE.Group();
  const actualWidth = isDualWheel ? wheelWidth * 1.65 : wheelWidth;

  // Main rubber tread + outer sidewall torus bevels
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(wheelRadius, wheelRadius, actualWidth, 20).rotateZ(Math.PI / 2),
    tireMat,
  );
  tire.castShadow = castShadow;
  tire.receiveShadow = true;
  wg.add(tire);

  for (const side of [-1, 1] as const) {
    const sidewallTorus = new THREE.Mesh(
      new THREE.TorusGeometry(wheelRadius * 0.8, wheelRadius * 0.16, 10, 22).rotateY(Math.PI / 2),
      tireMat,
    );
    sidewallTorus.position.x = side * (actualWidth * 0.45);
    wg.add(sidewallTorus);
  }

  // Inner brake disc / drum backing
  const brakeDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(wheelRadius * 0.56, wheelRadius * 0.56, actualWidth * 0.72, 14).rotateZ(Math.PI / 2),
    trimDarkMat,
  );
  wg.add(brakeDisc);

  // Outer alloy barrel ring
  const barrelLip = new THREE.Mesh(
    new THREE.TorusGeometry(wheelRadius * 0.64, wheelRadius * 0.055, 8, 20).rotateY(Math.PI / 2),
    rimMat,
  );
  barrelLip.position.x = actualWidth * 0.48;
  const barrelLipIn = barrelLip.clone();
  barrelLipIn.position.x = -actualWidth * 0.48;
  wg.add(barrelLip, barrelLipIn);

  // 1. CLASSIC 5-SPOKE STAR RIM
  const classicGroup = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(actualWidth + 0.035, wheelRadius * 0.62, wheelRadius * 0.16),
      rimMat,
    );
    spoke.rotation.x = ang;
    spoke.position.set(0, Math.cos(ang) * wheelRadius * 0.3, Math.sin(ang) * wheelRadius * 0.3);
    classicGroup.add(spoke);
  }
  const classicHub = new THREE.Mesh(
    new THREE.CylinderGeometry(wheelRadius * 0.2, wheelRadius * 0.2, actualWidth + 0.05, 12).rotateZ(Math.PI / 2),
    rimMat,
  );
  classicGroup.add(classicHub);

  // 2. SPORT 10-SPOKE RACING RIM + RED CALIPER
  const sportGroup = new THREE.Group();
  const caliperMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    roughness: 0.3,
    metalness: 0.6,
  });
  const caliper = new THREE.Mesh(
    new THREE.BoxGeometry(actualWidth * 0.82, wheelRadius * 0.36, wheelRadius * 0.22),
    caliperMat,
  );
  caliper.position.set(0, wheelRadius * 0.32, wheelRadius * 0.18);
  sportGroup.add(caliper);

  for (let i = 0; i < 5; i++) {
    const baseAng = (i / 5) * Math.PI * 2;
    for (const split of [-0.11, 0.11]) {
      const ang = baseAng + split;
      const thinSpoke = new THREE.Mesh(
        new THREE.BoxGeometry(actualWidth + 0.04, wheelRadius * 1.22, wheelRadius * 0.065),
        rimMat,
      );
      thinSpoke.rotation.x = ang;
      sportGroup.add(thinSpoke);
    }
  }
  const sportCenter = new THREE.Mesh(
    new THREE.CylinderGeometry(wheelRadius * 0.16, wheelRadius * 0.16, actualWidth + 0.06, 12).rotateZ(Math.PI / 2),
    trimDarkMat,
  );
  sportGroup.add(sportCenter);

  // 3. LUXURY MONOBLOCK TURBINE DISH RIM
  const luxuryGroup = new THREE.Group();
  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(wheelRadius * 0.56, wheelRadius * 0.56, actualWidth + 0.025, 20).rotateZ(Math.PI / 2),
    rimMat,
  );
  luxuryGroup.add(dish);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(actualWidth + 0.048, wheelRadius * 1.18, wheelRadius * 0.05),
      trimDarkMat,
    );
    fin.rotation.x = ang + 0.2;
    luxuryGroup.add(fin);
  }
  const luxCap = new THREE.Mesh(
    new THREE.CylinderGeometry(wheelRadius * 0.26, wheelRadius * 0.26, actualWidth + 0.065, 16).rotateZ(Math.PI / 2),
    rimMat,
  );
  luxuryGroup.add(luxCap);

  // 4. HEAVY INDUSTRIAL / OFF-ROAD BEADLOCK RIM
  const heavyGroup = new THREE.Group();
  const steelPlate = new THREE.Mesh(
    new THREE.CylinderGeometry(wheelRadius * 0.6, wheelRadius * 0.6, actualWidth * 0.88, 16).rotateZ(Math.PI / 2),
    rimMat,
  );
  const heavyAxleCap = new THREE.Mesh(
    new THREE.CylinderGeometry(wheelRadius * 0.28, wheelRadius * 0.32, actualWidth + 0.08, 10).rotateZ(Math.PI / 2),
    trimDarkMat,
  );
  heavyGroup.add(steelPlate, heavyAxleCap);
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const lug = new THREE.Mesh(
      new THREE.BoxGeometry(actualWidth + 0.055, wheelRadius * 0.11, wheelRadius * 0.11),
      trimDarkMat,
    );
    lug.position.set(0, Math.cos(ang) * wheelRadius * 0.44, Math.sin(ang) * wheelRadius * 0.44);
    heavyGroup.add(lug);
  }

  wg.add(classicGroup, sportGroup, luxuryGroup, heavyGroup);

  const setRimStyle = (style: RimStyleId) => {
    classicGroup.visible = style === 'classic';
    sportGroup.visible = style === 'sport';
    luxuryGroup.visible = style === 'luxury';
    heavyGroup.visible = style === 'heavy';
  };
  setRimStyle('classic');

  return { group: wg, setRimStyle };
}

export interface CabinInteriorHandle {
  group: THREE.Group;
  steeringWheel: THREE.Group;
}

export function buildCabinInterior(
  style: VehicleBodyStyle,
  interiorMat: THREE.MeshStandardMaterial,
  trimDarkMat: THREE.MeshStandardMaterial,
  chromeMat: THREE.MeshStandardMaterial,
): CabinInteriorHandle {
  const group = new THREE.Group();

  // Calibrate cabin floor Y, Z center, and cabin width per vehicle body style
  let floorY = 0.62;
  let cabZ = -0.05;
  let seatSpreadX = 0.44;
  let dashZOffset = 0.68;
  let seatScale = 1.0;
  let addRearBench = false;

  if (style === 'hypercar' || style === 'sport') {
    floorY = 0.46;
    cabZ = -0.08;
    seatSpreadX = 0.4;
    dashZOffset = 0.58;
    seatScale = 0.88;
  } else if (style === 'muscle') {
    floorY = 0.56;
    cabZ = -0.18;
    seatSpreadX = 0.44;
    dashZOffset = 0.62;
    seatScale = 0.94;
  } else if (style === 'suv') {
    floorY = 0.82;
    cabZ = -0.15;
    seatSpreadX = 0.5;
    dashZOffset = 0.82;
    seatScale = 1.06;
    addRearBench = true;
  } else if (style === 'pickup') {
    floorY = 0.84;
    cabZ = 0.36;
    seatSpreadX = 0.5;
    dashZOffset = 0.66;
    seatScale = 1.04;
  } else if (style === 'limo') {
    floorY = 0.64;
    cabZ = 0.32;
    seatSpreadX = 0.46;
    dashZOffset = 0.92;
    addRearBench = true;
  } else if (style === 'hatchback') {
    floorY = 0.58;
    cabZ = -0.22;
    seatSpreadX = 0.42;
    dashZOffset = 0.62;
    seatScale = 0.94;
  } else if (style === 'labo') {
    floorY = 0.88;
    cabZ = 1.18;
    seatSpreadX = 0.38;
    dashZOffset = 0.52;
    seatScale = 0.92;
  } else if (style === 'gazel') {
    floorY = 1.06;
    cabZ = 1.16;
    seatSpreadX = 0.48;
    dashZOffset = 0.62;
    seatScale = 1.02;
  } else if (style === 'isuzu') {
    floorY = 1.18;
    cabZ = 2.02;
    seatSpreadX = 0.52;
    dashZOffset = 0.58;
    seatScale = 1.04;
  } else if (style === 'howo') {
    floorY = 1.54;
    cabZ = 2.62;
    seatSpreadX = 0.6;
    dashZOffset = 0.68;
    seatScale = 1.1;
  } else if (style === 'fura') {
    floorY = 1.52;
    cabZ = 2.68;
    seatSpreadX = 0.62;
    dashZOffset = 0.72;
    seatScale = 1.12;
  } else if (style === 'kamaz') {
    floorY = 1.44;
    cabZ = 2.15;
    seatSpreadX = 0.58;
    dashZOffset = 0.64;
    seatScale = 1.08;
  } else if (style === 'zil') {
    floorY = 1.18;
    cabZ = 0.88;
    seatSpreadX = 0.52;
    dashZOffset = 0.58;
    seatScale = 1.04;
  } else if (style === 'airplane') {
    floorY = 1.05;
    cabZ = 1.5;
    seatSpreadX = 0;
    dashZOffset = 0.55;
    seatScale = 0.9;
  } else if (style === 'tank') {
    floorY = -10;
  } else if (style === 'excavator') {
    // Single left-offset operator cab!
    floorY = 1.38;
    cabZ = 0.22;
    seatSpreadX = 0;
    dashZOffset = 0.52;
    seatScale = 1.05;
  } else {
    // sedan
    addRearBench = true;
  }

  const cabOriginX = style === 'excavator' ? 0.56 : 0;

  // Cabin Carpet / Console Tunnel
  const consoleW = style === 'excavator' ? 0.72 : seatSpreadX * 2 + 0.62;
  const floorTub = new THREE.Mesh(
    new THREE.BoxGeometry(consoleW, 0.08, dashZOffset * 1.85),
    trimDarkMat,
  );
  floorTub.position.set(cabOriginX, floorY, cabZ);
  group.add(floorTub);

  if (style !== 'excavator') {
    const centerConsole = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.24, dashZOffset * 1.4),
      interiorMat,
    );
    centerConsole.position.set(0, floorY + 0.14, cabZ + 0.08);
    group.add(centerConsole);
  }

  // Sculpted Seats (Cushion + Reclined Backrest + Side Bolsters + Headrest)
  const seatXs = style === 'excavator' ? [cabOriginX] : [-seatSpreadX, seatSpreadX];
  for (const sx of seatXs) {
    const seatGrp = new THREE.Group();
    seatGrp.position.set(sx, floorY + 0.08, cabZ - 0.12);
    seatGrp.scale.setScalar(seatScale);

    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.48), interiorMat);
    cushion.position.y = 0.08;

    const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.54, 0.12), interiorMat);
    backrest.position.set(0, 0.36, -0.2);
    backrest.rotation.x = -0.18;

    const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.17, 0.1), interiorMat);
    headrest.position.set(0, 0.68, -0.26);

    seatGrp.add(cushion, backrest, headrest);
    group.add(seatGrp);
  }

  if (addRearBench) {
    const rearCushion = new THREE.Mesh(
      new THREE.BoxGeometry(seatSpreadX * 2 + 0.44, 0.14, 0.46),
      interiorMat,
    );
    rearCushion.position.set(0, floorY + 0.14, cabZ - 0.88);
    const rearBack = new THREE.Mesh(
      new THREE.BoxGeometry(seatSpreadX * 2 + 0.44, 0.48, 0.14),
      interiorMat,
    );
    rearBack.position.set(0, floorY + 0.4, cabZ - 1.12);
    group.add(rearCushion, rearBack);
  }

  // Dashboard + Glowing Digital Instrument Screen
  const dashW = style === 'excavator' ? 0.72 : seatSpreadX * 2 + 0.56;
  const dashUpper = new THREE.Mesh(new THREE.BoxGeometry(dashW, 0.24, 0.36), interiorMat);
  dashUpper.position.set(cabOriginX, floorY + 0.42 * seatScale, cabZ + dashZOffset);

  const gaugeGlowMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 1.15,
    roughness: 0.2,
  });
  const screenW = style === 'excavator' ? 0.28 : 0.46;
  const infotain = new THREE.Mesh(new THREE.BoxGeometry(screenW, 0.13, 0.04), gaugeGlowMat);
  infotain.position.set(
    style === 'excavator' ? cabOriginX : 0,
    floorY + 0.48 * seatScale,
    cabZ + dashZOffset - 0.18,
  );
  group.add(dashUpper, infotain);

  // Driver Steering Column + 3D Steering Wheel (Left-hand drive = +X in +Z forward vehicle coords!)
  const driverX = style === 'excavator' ? cabOriginX : seatSpreadX;
  const steeringMount = new THREE.Group();
  steeringMount.position.set(
    driverX,
    floorY + 0.48 * seatScale,
    cabZ + dashZOffset - 0.24,
  );
  steeringMount.rotation.x =
    style === 'fura' ||
    style === 'kamaz' ||
    style === 'zil' ||
    style === 'howo' ||
    style === 'isuzu' ||
    style === 'labo'
      ? -0.58
      : -0.32;

  const columnShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.04, 0.24, 8).rotateX(Math.PI / 2),
    trimDarkMat,
  );
  columnShaft.position.z = 0.1;
  steeringMount.add(columnShaft);

  const steeringWheel = new THREE.Group();
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.024, 8, 18), trimDarkMat);
  const wheelAccent = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.025), interiorMat);
  const centerPad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.035, 10).rotateX(Math.PI / 2),
    chromeMat,
  );
  steeringWheel.add(rimRing, wheelAccent, centerPad);
  steeringMount.add(steeringWheel);
  group.add(steeringMount);

  return { group, steeringWheel };
}

export interface CargoLoadController {
  group: THREE.Group;
  setCargoType: (cargo: CargoLoadId) => void;
}

export function createCargoLoadController(
  bedWidth: number,
  bedLength: number,
  bedHeightScale = 1.0,
  castShadow = true,
): CargoLoadController {
  const group = new THREE.Group();

  // 1. WOOD / TIMBER PLANKS & LOGS ('wood' — Taxta va yog'och)
  const woodGroup = new THREE.Group();
  const lumberLightMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.82,
    metalness: 0.04,
  });
  const lumberDarkMat = new THREE.MeshStandardMaterial({
    color: 0x92400e,
    roughness: 0.88,
    metalness: 0.04,
  });
  const strapMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.5,
    metalness: 0.2,
  });

  const plankCols = 3;
  const plankLayers = 3;
  const plankW = (bedWidth * 0.86) / plankCols;
  const plankH = 0.16 * bedHeightScale;
  const plankL = bedLength * 0.9;

  for (let row = 0; row < plankLayers; row++) {
    for (let col = 0; col < plankCols; col++) {
      const px = -bedWidth * 0.43 + plankW * (col + 0.5);
      const py = plankH * (row + 0.5) + row * 0.015;
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(plankW * 0.92, plankH, plankL),
        (row + col) % 2 === 0 ? lumberLightMat : lumberDarkMat,
      );
      plank.position.set(px, py, 0);
      plank.castShadow = castShadow;
      woodGroup.add(plank);
    }
  }
  // Top timber logs + ratchet straps
  for (const lx of [-bedWidth * 0.24, 0, bedWidth * 0.24]) {
    const log = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13 * bedHeightScale, 0.14 * bedHeightScale, plankL * 0.96, 10).rotateX(
        Math.PI / 2,
      ),
      lumberDarkMat,
    );
    log.position.set(lx, plankLayers * plankH + 0.14 * bedHeightScale, 0);
    woodGroup.add(log);
  }
  for (const sz of [-plankL * 0.3, plankL * 0.3]) {
    const strap = new THREE.Mesh(
      new THREE.BoxGeometry(bedWidth * 0.9, plankLayers * plankH + 0.3 * bedHeightScale, 0.06),
      strapMat,
    );
    strap.position.set(0, (plankLayers * plankH + 0.28 * bedHeightScale) * 0.5, sz);
    woodGroup.add(strap);
  }

  // 2. STEEL BEAMS & PIPES ('steel' — Temir va po'lat armatura)
  const steelGroup = new THREE.Group();
  const steelBeamMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.28,
    metalness: 0.88,
  });
  const galvPipeMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.22,
    metalness: 0.92,
  });
  const rustRebarMat = new THREE.MeshStandardMaterial({
    color: 0x7c2d12,
    roughness: 0.62,
    metalness: 0.72,
  });

  const beamL = bedLength * 0.92;
  for (const bx of [-bedWidth * 0.28, 0, bedWidth * 0.28]) {
    // Sculpted I-Beam (bottom flange + web + top flange)
    const web = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.28 * bedHeightScale, beamL),
      steelBeamMat,
    );
    web.position.set(bx, 0.16 * bedHeightScale, 0);
    const botFlange = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.05, beamL),
      steelBeamMat,
    );
    botFlange.position.set(bx, 0.03, 0);
    const topFlange = botFlange.clone();
    topFlange.position.set(bx, 0.3 * bedHeightScale, 0);
    steelGroup.add(web, botFlange, topFlange);
  }
  // Galvanized steel pipes & rebar bundle on top
  for (const px of [-bedWidth * 0.24, 0, bedWidth * 0.24]) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13 * bedHeightScale, 0.13 * bedHeightScale, beamL * 0.95, 12).rotateX(
        Math.PI / 2,
      ),
      px === 0 ? rustRebarMat : galvPipeMat,
    );
    pipe.position.set(px, 0.46 * bedHeightScale, 0);
    pipe.castShadow = castShadow;
    steelGroup.add(pipe);
  }

  // 3. CONCRETE SLABS & PRECAST BLOCKS ('concrete' — Beton plitalar va bloklar)
  const concreteGroup = new THREE.Group();
  const concreteSlabMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.92,
    metalness: 0.05,
  });
  const darkConcreteMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.94,
    metalness: 0.06,
  });

  // Lower reinforced road slabs
  for (let s = 0; s < 2; s++) {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(bedWidth * 0.86, 0.18 * bedHeightScale, bedLength * 0.86),
      s === 0 ? concreteSlabMat : darkConcreteMat,
    );
    slab.position.y = (0.1 + s * 0.2) * bedHeightScale;
    slab.castShadow = castShadow;
    concreteGroup.add(slab);
  }
  // Upper precast foundation blocks + concrete culvert ring
  const blockCount = bedLength > 3.2 ? 3 : 2;
  for (let b = 0; b < blockCount; b++) {
    const bz = -bedLength * 0.28 + (b / (blockCount - 1)) * (bedLength * 0.56);
    const blk = new THREE.Mesh(
      new THREE.BoxGeometry(bedWidth * 0.72, 0.34 * bedHeightScale, (bedLength * 0.68) / blockCount),
      concreteSlabMat,
    );
    blk.position.set(0, 0.56 * bedHeightScale, bz);
    blk.castShadow = castShadow;
    concreteGroup.add(blk);
  }

  // 4. GRAVEL & QUARRY AGGREGATE MOUND ('gravel' — Shag'al va tosh)
  const gravelGroup = new THREE.Group();
  const gravelMat = new THREE.MeshStandardMaterial({
    color: 0x78716c,
    roughness: 0.96,
    metalness: 0.04,
    flatShading: true,
  });
  const sandMat = new THREE.MeshStandardMaterial({
    color: 0xa8a29e,
    roughness: 0.95,
    metalness: 0.02,
    flatShading: true,
  });

  const moundCount = bedLength > 3.2 ? 4 : 2;
  for (let m = 0; m < moundCount; m++) {
    const mz = -bedLength * 0.3 + (m / (moundCount - 1)) * (bedLength * 0.6);
    const heap = new THREE.Mesh(new THREE.DodecahedronGeometry(bedWidth * 0.44, 1), m % 2 === 0 ? gravelMat : sandMat);
    heap.scale.set(1.0, 0.58 * bedHeightScale, (bedLength * 0.55) / (moundCount * bedWidth * 0.44));
    heap.position.set(0, 0.24 * bedHeightScale, mz);
    heap.castShadow = castShadow;
    gravelGroup.add(heap);
  }

  group.add(woodGroup, steelGroup, concreteGroup, gravelGroup);

  const setCargoType = (cargo: CargoLoadId) => {
    woodGroup.visible = cargo === 'wood';
    steelGroup.visible = cargo === 'steel';
    concreteGroup.visible = cargo === 'concrete';
    gravelGroup.visible = cargo === 'gravel';
  };
  setCargoType('wood');

  return { group, setCargoType };
}

export interface HeavyVehicleBuildResult {
  cargoController: CargoLoadController;
  animateWorkMechanism?: (phase: number) => void;
}

export function buildHeavyMachineryChassis(
  style: 'fura' | 'kamaz' | 'zil' | 'excavator' | 'labo' | 'gazel' | 'isuzu' | 'howo',
  chassisGroup: THREE.Group,
  bodyPaintMat: THREE.MeshPhysicalMaterial,
  glassMat: THREE.MeshPhysicalMaterial,
  trimDarkMat: THREE.MeshStandardMaterial,
  chromeMat: THREE.MeshStandardMaterial,
  castShadow: boolean,
): HeavyVehicleBuildResult {
  const amberBeaconMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });

  if (style === 'labo') {
    // ==================== DAMAS LABO SUPER BORTLI MINI-GRUZOVOY ====================
    for (const rx of [-0.38, 0.38]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 4.05), trimDarkMat);
      rail.position.set(rx, 0.52, -0.02);
      chassisGroup.add(rail);
    }

    // Compact Forward-Control Flat-Nose Labo Cabin (+Z)
    const cabLower = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.92, 1.34), bodyPaintMat);
    cabLower.position.set(0, 0.98, 1.24);
    cabLower.castShadow = castShadow;
    cabLower.receiveShadow = true;

    const noseSlope = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.42, 0.34), bodyPaintMat);
    noseSlope.position.set(0, 0.86, 1.88);
    noseSlope.rotation.x = 0.22;

    const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.66, 1.16), glassMat);
    cabGlass.position.set(0, 1.66, 1.16);
    cabGlass.renderOrder = 2;

    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.18), bodyPaintMat);
    cabRoof.position.set(0, 2.03, 1.14);

    // Iconic Labo Rooftop Aero Wind-Deflector Fairing
    const roofSpoiler = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.28, 0.48), bodyPaintMat);
    roofSpoiler.position.set(0, 2.2, 1.06);
    roofSpoiler.rotation.x = 0.34;

    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.26, 0.22), trimDarkMat);
    frontBumper.position.set(0, 0.48, 1.98);
    const frontIntake = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.22, 0.08), trimDarkMat);
    frontIntake.position.set(0, 0.84, 2.02);

    // Pivoting Corrugated Dropside Mini-Cargo Bed + Tall Tubular Steel Duga Stake Rack
    const bedPivot = new THREE.Group();
    bedPivot.position.set(0, 0.66, -2.02);
    const bedLocalZ = 1.22;

    const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.12, 2.46), trimDarkMat);
    bedFloor.position.set(0, 0.06, bedLocalZ);
    bedFloor.castShadow = castShadow;
    bedPivot.add(bedFloor);

    const cagePipeMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.32,
      metalness: 0.82,
    });

    const sidePivots: Array<{ grp: THREE.Group; dir: 1 | -1 }> = [];
    for (const sx of [-0.83, 0.83] as const) {
      const sidePivot = new THREE.Group();
      sidePivot.position.set(sx, 0.11, bedLocalZ);
      const sideBoard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 2.44), bodyPaintMat);
      sideBoard.position.set(0, 0.21, 0);
      sideBoard.castShadow = castShadow;
      sidePivot.add(sideBoard);
      bedPivot.add(sidePivot);
      sidePivots.push({ grp: sidePivot, dir: sx > 0 ? -1 : 1 });

      // Tubular top stake rail ("Labo duga")
      const topRail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, 2.42, 8).rotateX(Math.PI / 2),
        cagePipeMat,
      );
      topRail.position.set(sx, 1.08, bedLocalZ);
      bedPivot.add(topRail);

      for (const pz of [-1.14, 0, 1.14]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.62, 8), cagePipeMat);
        post.position.set(sx, 0.78, bedLocalZ + pz);
        bedPivot.add(post);
      }
    }

    // Front headache rack behind cab window
    for (const hy of [0.68, 0.92, 1.12]) {
      const crossBar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 1.66, 8).rotateZ(Math.PI / 2),
        cagePipeMat,
      );
      crossBar.position.set(0, hy, bedLocalZ + 1.18);
      bedPivot.add(crossBar);
    }

    const tailgatePivot = new THREE.Group();
    tailgatePivot.position.set(0, 0.12, bedLocalZ - 1.22);
    const tailgate = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.42, 0.07), bodyPaintMat);
    tailgate.position.set(0, 0.21, 0);
    tailgatePivot.add(tailgate);
    bedPivot.add(tailgatePivot);

    const cargoController = createCargoLoadController(1.48, 2.22, 0.82, castShadow);
    cargoController.group.position.set(0, 0.13, bedLocalZ);
    bedPivot.add(cargoController.group);

    chassisGroup.add(
      cabLower,
      noseSlope,
      cabGlass,
      cabRoof,
      roofSpoiler,
      frontBumper,
      frontIntake,
      bedPivot,
    );

    return {
      cargoController,
      animateWorkMechanism: (phase: number) => {
        // Labo Job: All 3 dropside boards (left, right, rear) fold flat open for express market/shop delivery!
        tailgatePivot.rotation.x = -phase * 2.15;
        for (const sp of sidePivots) {
          sp.grp.rotation.z = sp.dir * phase * 2.15;
        }
      },
    };
  }

  if (style === 'gazel') {
    // ==================== GAZEL NEXT BORT-TENTLI GRUZOVOY ====================
    const canvasTentMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.86,
      metalness: 0.06,
    });
    const aluminumBoardMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.38,
      metalness: 0.65,
    });

    for (const rx of [-0.44, 0.44]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 5.55), trimDarkMat);
      rail.position.set(rx, 0.62, -0.05);
      chassisGroup.add(rail);
    }

    // Modern Sloped GAZel Next Nose Hood + Wide Grille + Bumper
    const noseHood = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.78, 1.08), bodyPaintMat);
    noseHood.position.set(0, 1.02, 2.34);
    noseHood.rotation.x = 0.14;
    noseHood.castShadow = castShadow;

    const gazelGrille = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.44, 0.1), trimDarkMat);
    gazelGrille.position.set(0, 0.96, 2.89);
    const chromeBar = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.07, 0.12), chromeMat);
    chromeBar.position.set(0, 1.02, 2.9);

    const gazelBumper = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.34, 0.26), trimDarkMat);
    gazelBumper.position.set(0, 0.56, 2.92);

    // Tall Panoramic GAZel Cabin
    const cabBody = new THREE.Mesh(new THREE.BoxGeometry(2.08, 1.04, 1.46), bodyPaintMat);
    cabBody.position.set(0, 1.18, 1.18);
    cabBody.castShadow = castShadow;

    const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.72, 1.32), glassMat);
    cabGlass.position.set(0, 1.96, 1.15);
    cabGlass.renderOrder = 2;

    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.15, 1.34), bodyPaintMat);
    cabRoof.position.set(0, 2.38, 1.12);

    // Dropside Cargo Box + Accordion Sliding Tent Canopy + Double Rear Barn Doors!
    const bortPivot = new THREE.Group();
    bortPivot.position.set(0, 0.82, -2.85);
    const bedLocalZ = 1.68;

    const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.15, 3.44), trimDarkMat);
    bedFloor.position.set(0, 0.08, bedLocalZ);
    bedFloor.castShadow = castShadow;
    bortPivot.add(bedFloor);

    const tentSlideGroup = new THREE.Group();
    tentSlideGroup.position.set(0, 0, bedLocalZ + 1.72); // Anchored at front bulkhead so scaling Z slides tent forward!

    for (const sx of [-1.08, 1.08]) {
      const sideBoard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 3.42), aluminumBoardMat);
      sideBoard.position.set(sx, 0.38, bedLocalZ);
      sideBoard.castShadow = castShadow;
      bortPivot.add(sideBoard);

      const rolledCurtain = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.085, 3.4, 10).rotateX(Math.PI / 2),
        canvasTentMat,
      );
      rolledCurtain.position.set(sx, 1.54, -1.72);
      tentSlideGroup.add(rolledCurtain);

      for (const archZ of [-1.58, -0.52, 0.52, 1.58]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.08, 0.05), chromeMat);
        post.position.set(sx, 1.12, bedLocalZ + archZ);
        bortPivot.add(post);
      }
    }

    const frontBulkhead = new THREE.Mesh(new THREE.BoxGeometry(2.22, 1.58, 0.09), aluminumBoardMat);
    frontBulkhead.position.set(0, 0.92, bedLocalZ + 1.68);

    // Double Rear Barn Doors (left & right doors swing 160° outward!)
    const leftDoorPivot = new THREE.Group();
    leftDoorPivot.position.set(1.08, 0.88, bedLocalZ - 1.7);
    const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.48, 0.07), aluminumBoardMat);
    leftDoor.position.set(-0.53, 0, 0);
    leftDoorPivot.add(leftDoor);

    const rightDoorPivot = new THREE.Group();
    rightDoorPivot.position.set(-1.08, 0.88, bedLocalZ - 1.7);
    const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.48, 0.07), aluminumBoardMat);
    rightDoor.position.set(0.53, 0, 0);
    rightDoorPivot.add(rightDoor);

    // Slide-out rear loading step
    const slideStep = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.07, 0.45), chromeMat);
    slideStep.position.set(0, -0.08, bedLocalZ - 1.52);

    // Arched Canvas Tarpaulin Roof ("Tent") inside tentSlideGroup
    const tentRoof = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.16, 3.48), canvasTentMat);
    tentRoof.position.set(0, 1.72, -1.74);
    tentRoof.castShadow = castShadow;
    const tentCrown = new THREE.Mesh(
      new THREE.CylinderGeometry(1.12, 1.12, 3.46, 12).rotateX(Math.PI / 2),
      canvasTentMat,
    );
    tentCrown.scale.set(1.0, 0.16, 1.0);
    tentCrown.position.set(0, 1.8, -1.74);
    tentSlideGroup.add(tentRoof, tentCrown);

    bortPivot.add(frontBulkhead, leftDoorPivot, rightDoorPivot, slideStep, tentSlideGroup);

    const cargoController = createCargoLoadController(1.94, 3.12, 0.95, castShadow);
    cargoController.group.position.set(0, 0.16, bedLocalZ);
    bortPivot.add(cargoController.group);

    chassisGroup.add(
      noseHood,
      gazelGrille,
      chromeBar,
      gazelBumper,
      cabBody,
      cabGlass,
      cabRoof,
      bortPivot,
    );

    return {
      cargoController,
      animateWorkMechanism: (phase: number) => {
        // GAZel Job: Accordion-slide the canvas tent forward + swing double barn doors wide open + extend step!
        tentSlideGroup.scale.z = Math.max(0.32, 1 - phase * 0.65);
        leftDoorPivot.rotation.y = phase * 2.55;
        rightDoorPivot.rotation.y = -phase * 2.55;
        slideStep.position.z = bedLocalZ - 1.52 - phase * 0.42;
      },
    };
  }

  if (style === 'isuzu') {
    // ==================== SAMAUTO ISUZU NPR-75 GIDROBORTLI GRUZOVOY 5T ====================
    const cleanWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.32,
      metalness: 0.22,
    });

    for (const rx of [-0.46, 0.46]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.22, 6.05), trimDarkMat);
      rail.position.set(rx, 0.68, -0.05);
      chassisGroup.add(rail);
    }

    // Upright Japanese / SamAuto Cab-Over-Engine Cabin (+Z)
    const cabLower = new THREE.Mesh(new THREE.BoxGeometry(2.22, 1.14, 1.72), bodyPaintMat);
    cabLower.position.set(0, 1.28, 2.08);
    cabLower.castShadow = castShadow;
    cabLower.receiveShadow = true;

    const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.78, 1.54), glassMat);
    cabGlass.position.set(0, 2.14, 2.04);
    cabGlass.renderOrder = 2;

    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.14, 1.58), bodyPaintMat);
    cabRoof.position.set(0, 2.58, 2.02);

    const windFairing = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.36, 0.86), cleanWhiteMat);
    windFairing.position.set(0, 2.78, 1.88);
    windFairing.rotation.x = 0.28;

    const vGrille = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.36, 0.09), chromeMat);
    vGrille.position.set(0, 1.14, 2.95);
    for (const sx of [-0.98, 0.98]) {
      const cornerSignal = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.38, 0.1), amberBeaconMat);
      cornerSignal.position.set(sx, 1.18, 2.94);
      const sideGuard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 1.65), chromeMat);
      sideGuard.position.set(sx * 1.08, 0.62, 0.15);
      chassisGroup.add(cornerSignal, sideGuard);
    }
    const fBumper = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.34, 0.24), trimDarkMat);
    fBumper.position.set(0, 0.62, 2.98);

    // Fixed Commercial Cargo Platform + Rear Hydraulic Tail-Lift Elevator ("Gidrobort")!
    const bedGroup = new THREE.Group();
    bedGroup.position.set(0, 0.86, -1.1);

    const bedDeck = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.16, 3.88), trimDarkMat);
    bedDeck.position.set(0, 0.08, 0);
    bedDeck.castShadow = castShadow;
    bedGroup.add(bedDeck);

    const frontHeadboard = new THREE.Mesh(new THREE.BoxGeometry(2.36, 1.24, 0.1), cleanWhiteMat);
    frontHeadboard.position.set(0, 0.74, 1.89);
    bedGroup.add(frontHeadboard);

    for (const sx of [-1.14, 1.14]) {
      const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 3.84), cleanWhiteMat);
      sidePanel.position.set(sx, 0.5, 0);
      sidePanel.castShadow = castShadow;
      bedGroup.add(sidePanel);
      for (const lz of [-1.25, 0, 1.25]) {
        const latchPost = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.76, 0.1), trimDarkMat);
        latchPost.position.set(sx * 1.01, 0.5, lz);
        bedGroup.add(latchPost);
      }
    }

    // Rear Hydraulic Tail-Lift Elevator Assembly (unfolds 90° flat, then lowers smoothly to street!)
    const tailLiftCarrier = new THREE.Group();
    tailLiftCarrier.position.set(0, 0.88, -3.05);

    for (const lx of [-0.76, 0.76]) {
      const liftArm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.46), trimDarkMat);
      liftArm.position.set(lx, -0.06, 0.18);
      const liftPiston = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.42, 8), chromeMat);
      liftPiston.position.set(lx * 0.85, -0.1, 0.22);
      liftPiston.rotation.x = 0.65;
      tailLiftCarrier.add(liftArm, liftPiston);
    }

    const tailLiftPlatePivot = new THREE.Group();
    const liftPlate = new THREE.Mesh(new THREE.BoxGeometry(2.28, 1.08, 0.08), chromeMat);
    liftPlate.position.set(0, 0.54, 0);
    liftPlate.castShadow = castShadow;
    const safetyStrip = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.1, 0.09), amberBeaconMat);
    safetyStrip.position.set(0, 1.03, 0);
    tailLiftPlatePivot.add(liftPlate, safetyStrip);
    tailLiftCarrier.add(tailLiftPlatePivot);

    const cargoController = createCargoLoadController(2.04, 3.52, 1.02, castShadow);
    cargoController.group.position.set(0, 0.17, 0);
    bedGroup.add(cargoController.group);

    chassisGroup.add(
      cabLower,
      cabGlass,
      cabRoof,
      windFairing,
      vGrille,
      fBumper,
      bedGroup,
      tailLiftCarrier,
    );

    return {
      cargoController,
      animateWorkMechanism: (phase: number) => {
        // Isuzu Job: Hydraulic Tail-Lift ("Gidrobort") unfolds 90° horizontal, then lowers down to street!
        const unfoldT = Math.min(1, phase / 0.4);
        const lowerT = Math.max(0, (phase - 0.4) / 0.6);
        tailLiftPlatePivot.rotation.x = -unfoldT * (Math.PI * 0.5);
        tailLiftCarrier.position.y = 0.88 - lowerT * 0.74;
        tailLiftCarrier.position.z = -3.05 - lowerT * 0.18;
      },
    };
  }

  if (style === 'howo') {
    // ==================== SINOTRUK HOWO / SHACMAN 8x4 OG'IR GRUZOVOY SAMOSVAL ====================
    for (const rx of [-0.52, 0.52]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.28, 7.55), trimDarkMat);
      rail.position.set(rx, 0.78, -0.02);
      chassisGroup.add(rail);
    }

    // Towering High-Clearance 8x4 Heavy Construction Cabin (+Z)
    const cabLower = new THREE.Mesh(new THREE.BoxGeometry(2.48, 1.32, 2.02), bodyPaintMat);
    cabLower.position.set(0, 1.52, 2.66);
    cabLower.castShadow = castShadow;
    cabLower.receiveShadow = true;

    const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.84, 1.82), glassMat);
    cabGlass.position.set(0, 2.48, 2.62);
    cabGlass.renderOrder = 2;

    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 1.88), bodyPaintMat);
    cabRoof.position.set(0, 2.98, 2.58);

    // Sun Visor + 5 Amber Roof Markers + Dual Quarry Beacons
    const sunVisor = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.16, 0.34), trimDarkMat);
    sunVisor.position.set(0, 2.86, 3.56);
    for (const mx of [-0.84, -0.42, 0, 0.42, 0.84]) {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.08), amberBeaconMat);
      marker.position.set(mx, 3.1, 3.46);
      chassisGroup.add(marker);
    }
    for (const bx of [-0.76, 0.76]) {
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 10), amberBeaconMat);
      beacon.position.set(bx, 3.16, 2.52);
      chassisGroup.add(beacon);
    }

    // Trapezoidal Multi-Bar HOWO Front Grille + Heavy 3-Piece Steel Quarry Bumper
    const mainGrille = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.92, 0.11), trimDarkMat);
    mainGrille.position.set(0, 1.52, 3.68);
    for (let s = 0; s < 4; s++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.78 - s * 0.08, 0.07, 0.14), chromeMat);
      bar.position.set(0, 1.2 + s * 0.2, 3.69);
      chassisGroup.add(bar);
    }
    const quarryBumper = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.44, 0.32), trimDarkMat);
    quarryBumper.position.set(0, 0.72, 3.74);

    // Stepped Fender Flares over Dual Steered Front Axles + Vertical Chrome Exhaust Stack
    for (const sx of [-1.18, 1.18]) {
      const dualFender = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 2.55), trimDarkMat);
      dualFender.position.set(sx, 1.06, 2.08);
      chassisGroup.add(dualFender);
    }
    const exhaustStack = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 2.68, 12), chromeMat);
    exhaustStack.position.set(-1.16, 2.28, 1.48);
    const fuelTank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 1.22, 14).rotateX(Math.PI / 2),
      chromeMat,
    );
    fuelTank.position.set(1.04, 0.78, 0.32);

    // Front Multi-Stage Telescopic Hydraulic Ram
    const hydroCylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.65, 12), chromeMat);
    hydroCylinder.position.set(0, 1.68, 1.22);

    // Colossal 4-Axle Quarry Ribbed Steel Dump Body (pivots at z = -3.65!)
    const dumpPivot = new THREE.Group();
    dumpPivot.position.set(0, 0.98, -3.65);
    const bedLocalZ = 2.34;

    const dumpFloor = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.22, 4.72), bodyPaintMat);
    dumpFloor.position.set(0, 0.11, bedLocalZ);
    dumpFloor.castShadow = castShadow;

    const cabShieldVisor = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.16, 0.95), bodyPaintMat);
    cabShieldVisor.position.set(0, 1.46, bedLocalZ + 2.52);

    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(2.52, 1.32, 0.16), bodyPaintMat);
    frontWall.position.set(0, 0.82, bedLocalZ + 2.28);
    const tailgatePivot = new THREE.Group();
    tailgatePivot.position.set(0, 1.32, bedLocalZ - 2.28);
    const tailgate = new THREE.Mesh(new THREE.BoxGeometry(2.48, 1.18, 0.14), bodyPaintMat);
    tailgate.position.set(0, -0.58, 0);
    tailgatePivot.add(tailgate);

    dumpPivot.add(dumpFloor, cabShieldVisor, frontWall, tailgatePivot);

    for (const sx of [-1.21, 1.21]) {
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.24, 4.68), bodyPaintMat);
      sideWall.position.set(sx, 0.76, bedLocalZ);
      sideWall.castShadow = castShadow;
      dumpPivot.add(sideWall);

      for (const rz of [-1.65, -0.82, 0, 0.82, 1.65]) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.18, 0.14), trimDarkMat);
        rib.position.set(sx * 1.02, 0.74, bedLocalZ + rz);
        dumpPivot.add(rib);
      }
    }

    const cargoController = createCargoLoadController(2.2, 4.25, 1.18, castShadow);
    cargoController.group.position.set(0, 0.24, bedLocalZ);
    dumpPivot.add(cargoController.group);

    chassisGroup.add(
      cabLower,
      cabGlass,
      cabRoof,
      sunVisor,
      mainGrille,
      quarryBumper,
      exhaustStack,
      fuelTank,
      hydroCylinder,
      dumpPivot,
    );

    return {
      cargoController,
      animateWorkMechanism: (phase: number) => {
        dumpPivot.rotation.x = phase * 0.7;
        tailgatePivot.rotation.x = phase * 0.88;
        hydroCylinder.scale.y = 1 + phase * 1.25;
        hydroCylinder.position.y = 1.68 + phase * 0.82;
        hydroCylinder.rotation.x = -phase * 0.25;
      },
    };
  }

  if (style === 'fura') {
    // ==================== EURO SEMI-TRAILER CARGO TRUCK (FURA 6x4 + FLATBED) ====================
    // Long steel frame rails spanning tractor + semi-trailer
    for (const rx of [-0.52, 0.52]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 8.2), trimDarkMat);
      rail.position.set(rx, 0.68, -0.05);
      chassisGroup.add(rail);
    }

    // High-Roof Tractor Cab at front (+Z)
    const cabLower = new THREE.Mesh(new THREE.BoxGeometry(2.46, 1.32, 2.15), bodyPaintMat);
    cabLower.position.set(0, 1.38, 2.75);
    cabLower.castShadow = castShadow;
    cabLower.receiveShadow = true;

    const cabWindshield = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.92, 1.92), glassMat);
    cabWindshield.position.set(0, 2.42, 2.72);
    cabWindshield.renderOrder = 2;

    const aeroSleeperRoof = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.52, 2.02), bodyPaintMat);
    aeroSleeperRoof.position.set(0, 3.12, 2.66);
    aeroSleeperRoof.castShadow = castShadow;

    // Multi-slat Heavy Front Radiator Grille + Heavy Bumper
    const frontGrille = new THREE.Mesh(new THREE.BoxGeometry(1.88, 1.05, 0.1), trimDarkMat);
    frontGrille.position.set(0, 1.36, 3.84);
    for (let s = 0; s < 4; s++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.06, 0.13), chromeMat);
      slat.position.set(0, 1.02 + s * 0.22, 3.85);
      chassisGroup.add(slat);
    }
    const fBumper = new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.42, 0.28), chromeMat);
    fBumper.position.set(0, 0.62, 3.88);

    // Sun Visor + Roof Marker Lights + Twin Chrome Air Horns
    const sunVisor = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.16, 0.34), trimDarkMat);
    sunVisor.position.set(0, 2.9, 3.74);
    for (const mx of [-0.8, -0.4, 0, 0.4, 0.8]) {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.08), amberBeaconMat);
      marker.position.set(mx, 3.4, 3.66);
      chassisGroup.add(marker);
    }
    for (const hx of [-0.82, 0.82]) {
      const horn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.09, 0.55, 10).rotateX(Math.PI / 2),
        chromeMat,
      );
      horn.position.set(hx, 3.44, 3.1);
      chassisGroup.add(horn);
    }

    // Twin Vertical Chrome Exhaust Stacks & Side Fuel Tanks
    for (const sx of [-1.14, 1.14]) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 2.65, 12), chromeMat);
      stack.position.set(sx, 2.25, 1.56);
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.32, 1.35, 14).rotateX(Math.PI / 2),
        chromeMat,
      );
      tank.position.set(sx * 0.92, 0.72, 0.95);
      chassisGroup.add(stack, tank);
    }

    // Long Heavy Flatbed Trailer Deck + Headboard + Side Stakes
    const trailerDeck = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.22, 5.55), trimDarkMat);
    trailerDeck.position.set(0, 1.04, -1.42);
    trailerDeck.castShadow = castShadow;
    trailerDeck.receiveShadow = true;

    const sideRailMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.4,
      metalness: 0.7,
    });
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(2.48, 1.15, 0.14), sideRailMat);
    headboard.position.set(0, 1.72, 1.28);

    for (const sx of [-1.22, 1.22]) {
      const rubRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 5.55), bodyPaintMat);
      rubRail.position.set(sx, 1.08, -1.42);
      chassisGroup.add(rubRail);
      for (const sz of [-3.95, -2.7, -1.45, -0.2, 1.05]) {
        const stake = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.96, 0.09), sideRailMat);
        stake.position.set(sx, 1.56, sz);
        chassisGroup.add(stake);
      }
    }

    const rearUnderride = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.26, 0.2), chromeMat);
    rearUnderride.position.set(0, 0.56, -4.18);

    // Hydraulic Trailer Landing Legs (Domkrat) under front of flatbed
    const landingLegsGroup = new THREE.Group();
    landingLegsGroup.position.set(0, 0, 0.62);
    for (const lx of [-0.88, 0.88]) {
      const legOuter = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.62, 0.14), trimDarkMat);
      legOuter.position.set(lx, 0.72, 0);
      const legInner = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.44, 0.1), chromeMat);
      legInner.position.set(lx, 0.42, 0);
      const footPad = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.28), trimDarkMat);
      footPad.position.set(lx, 0.2, 0);
      landingLegsGroup.add(legOuter, legInner, footPad);
    }

    // Twin Heavy Rear Unfolding Steel Loading Ramps (Apparel / Pandus)
    const rampPivots: THREE.Group[] = [];
    for (const rx of [-0.74, 0.74]) {
      const rampPivot = new THREE.Group();
      rampPivot.position.set(rx, 1.02, -4.18);
      const rampDeck = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.52, 0.09), sideRailMat);
      rampDeck.position.set(0, 0.76, 0);
      rampDeck.castShadow = castShadow;
      for (let g = 0; g < 5; g++) {
        const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.04, 0.13), trimDarkMat);
        cleat.position.set(0, 0.22 + g * 0.28, 0);
        rampPivot.add(cleat);
      }
      rampPivot.add(rampDeck);
      rampPivots.push(rampPivot);
      chassisGroup.add(rampPivot);
    }

    const cargoController = createCargoLoadController(2.26, 5.15, 1.28, castShadow);
    cargoController.group.position.set(0, 1.16, -1.48);

    chassisGroup.add(
      cabLower,
      cabWindshield,
      aeroSleeperRoof,
      frontGrille,
      fBumper,
      sunVisor,
      trailerDeck,
      headboard,
      rearUnderride,
      landingLegsGroup,
      cargoController.group,
    );

    return {
      cargoController,
      animateWorkMechanism: (phase: number) => {
        landingLegsGroup.position.y = -phase * 0.18;
        for (let i = 0; i < rampPivots.length; i++) {
          rampPivots[i].rotation.x = -phase * 1.98;
        }
      },
    };
  }

  if (style === 'kamaz') {
    // ==================== KAMAZ-6520 6x6 HEAVY DUMP TRUCK (SAMOSVAL) ====================
    for (const rx of [-0.48, 0.48]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.24, 6.55), trimDarkMat);
      rail.position.set(rx, 0.74, -0.05);
      chassisGroup.add(rail);
    }

    // Flat-front Cab-Over Engine Cabin
    const cabBody = new THREE.Mesh(new THREE.BoxGeometry(2.38, 1.18, 1.92), bodyPaintMat);
    cabBody.position.set(0, 1.38, 2.22);
    cabBody.castShadow = castShadow;
    cabBody.receiveShadow = true;

    const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.78, 1.72), glassMat);
    cabGlass.position.set(0, 2.28, 2.2);
    cabGlass.renderOrder = 2;

    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.16, 1.8), bodyPaintMat);
    cabRoof.position.set(0, 2.74, 2.18);

    // Dual Roof Amber Beacons
    for (const bx of [-0.68, 0.68]) {
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.18, 10), amberBeaconMat);
      beacon.position.set(bx, 2.9, 2.28);
      chassisGroup.add(beacon);
    }

    // Iconic Black Louvered Front Grille & Heavy Steel Bumper
    const kamazGrille = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.68, 0.1), trimDarkMat);
    kamazGrille.position.set(0, 1.28, 3.19);
    const steelBumper = new THREE.Mesh(new THREE.BoxGeometry(2.46, 0.38, 0.28), trimDarkMat);
    steelBumper.position.set(0, 0.66, 3.24);

    // Hydraulic Telescopic Cylinder mounted behind cab
    const hydroCylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.35, 10), chromeMat);
    hydroCylinder.position.set(0, 1.45, 0.98);

    // Pivoting Heavy Ribbed Steel Dump Bed (pivots at rear hinge z = -3.12!)
    const dumpBedPivot = new THREE.Group();
    dumpBedPivot.position.set(0, 0.94, -3.12);

    const bedLocalZ = 1.95; // center of 4.1m dump box relative to rear hinge
    const dumpFloor = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.18, 4.15), bodyPaintMat);
    dumpFloor.position.set(0, 0.1, bedLocalZ);
    dumpFloor.castShadow = castShadow;

    // Cab protector canopy lip at front of dump box
    const protectorShield = new THREE.Mesh(new THREE.BoxGeometry(2.42, 0.14, 0.72), bodyPaintMat);
    protectorShield.position.set(0, 1.24, bedLocalZ + 2.15);

    const frontBulkhead = new THREE.Mesh(new THREE.BoxGeometry(2.42, 1.08, 0.14), bodyPaintMat);
    frontBulkhead.position.set(0, 0.68, bedLocalZ + 2.0);

    const tailgatePivot = new THREE.Group();
    tailgatePivot.position.set(0, 1.12, bedLocalZ - 2.02);
    const tailgate = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.98, 0.12), bodyPaintMat);
    tailgate.position.set(0, -0.5, 0);
    tailgatePivot.add(tailgate);

    dumpBedPivot.add(dumpFloor, protectorShield, frontBulkhead, tailgatePivot);

    for (const sx of [-1.16, 1.16]) {
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.02, 4.12), bodyPaintMat);
      sideWall.position.set(sx, 0.64, bedLocalZ);
      sideWall.castShadow = castShadow;
      dumpBedPivot.add(sideWall);
      for (const rz of [-1.4, -0.5, 0.4, 1.3]) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.96, 0.12), trimDarkMat);
        rib.position.set(sx * 1.02, 0.62, bedLocalZ + rz);
        dumpBedPivot.add(rib);
      }
    }

    const cargoController = createCargoLoadController(2.14, 3.75, 1.05, castShadow);
    cargoController.group.position.set(0, 0.2, bedLocalZ);
    dumpBedPivot.add(cargoController.group);

    chassisGroup.add(cabBody, cabGlass, cabRoof, kamazGrille, steelBumper, hydroCylinder, dumpBedPivot);

    return {
      cargoController,
      animateWorkMechanism: (phase: number) => {
        // Tilt dump bed up to 38 degrees + swing tailgate open!
        const tiltRad = phase * 0.66;
        dumpBedPivot.rotation.x = tiltRad;
        tailgatePivot.rotation.x = phase * 0.85;
        hydroCylinder.scale.y = 1 + phase * 1.15;
        hydroCylinder.position.y = 1.35 + phase * 0.68;
        hydroCylinder.rotation.x = -phase * 0.26;
      },
    };
  }

  if (style === 'zil') {
    // ==================== ZIL-130 CLASSIC YON-SAMOSVAL BORTLI CARGO TRUCK ====================
    const whiteMaskMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.35,
      metalness: 0.25,
    });
    const woodSlatMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.68,
      metalness: 0.12,
    });

    for (const rx of [-0.46, 0.46]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 5.95), trimDarkMat);
      rail.position.set(rx, 0.68, -0.05);
      chassisGroup.add(rail);
    }

    // Classic Rounded Nose Engine Hood (+Z)
    const noseHood = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.92, 1.38), bodyPaintMat);
    noseHood.position.set(0, 1.24, 2.26);
    noseHood.castShadow = castShadow;

    const hoodCrown = new THREE.Mesh(
      new THREE.CylinderGeometry(0.84, 0.88, 1.36, 14).rotateX(Math.PI / 2),
      bodyPaintMat,
    );
    hoodCrown.scale.set(1.0, 0.28, 1.0);
    hoodCrown.position.set(0, 1.68, 2.26);

    // Wide Stepped Front Fenders
    for (const sx of [-0.96, 0.96]) {
      const fender = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.36, 1.42), bodyPaintMat);
      fender.position.set(sx, 0.98, 2.22);
      chassisGroup.add(fender);
    }

    // Iconic ZIL-130 White Front Radiator Grille Surround + Horizontal Slots
    const whiteMask = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.68, 0.1), whiteMaskMat);
    whiteMask.position.set(0, 1.18, 2.96);
    for (let s = 0; s < 3; s++) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.08, 0.13), trimDarkMat);
      slot.position.set(0, 1.02 + s * 0.16, 2.97);
      chassisGroup.add(slot);
    }
    const zilBumper = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.28, 0.24), whiteMaskMat);
    zilBumper.position.set(0, 0.64, 3.04);

    // Rounded ZIL Cab + Panoramic Windshield
    const zilCab = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.94, 1.48), bodyPaintMat);
    zilCab.position.set(0, 1.26, 0.92);
    zilCab.castShadow = castShadow;

    const zilGlass = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.68, 1.32), glassMat);
    zilGlass.position.set(0, 1.98, 0.88);
    zilGlass.renderOrder = 2;

    const zilRoof = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.16, 1.36), whiteMaskMat);
    zilRoof.position.set(0, 2.38, 0.86);

    // Side-Tipping Wooden-Slatted Bortli Cargo Box (pivots along right hinge x = -1.12 for Yon-Samosval side dump!)
    const bortPivot = new THREE.Group();
    bortPivot.position.set(-1.12, 0.88, -1.44);
    const bedLocalX = 1.12;

    const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.16, 3.22), trimDarkMat);
    bedFloor.position.set(bedLocalX, 0.08, 0);
    bedFloor.castShadow = castShadow;
    bortPivot.add(bedFloor);

    // Right Hinge-Side Opening Gate (x = -1.15 -> localX = -0.03)
    const sideGatePivot = new THREE.Group();
    sideGatePivot.position.set(-0.03, 0.88, 0);
    for (let b = 0; b < 3; b++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 3.2), woodSlatMat);
      plank.position.set(0, -0.6 + b * 0.24, 0);
      sideGatePivot.add(plank);
    }
    bortPivot.add(sideGatePivot);

    // Left Fixed Slatted Sideboard (x = +1.15 -> localX = 2.27)
    for (let b = 0; b < 3; b++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 3.2), woodSlatMat);
      plank.position.set(2.27, 0.28 + b * 0.24, 0);
      bortPivot.add(plank);
    }

    const frontBoard = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.88, 0.1), woodSlatMat);
    frontBoard.position.set(bedLocalX, 0.56, 1.56);
    const rearBoard = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.68, 0.1), woodSlatMat);
    rearBoard.position.set(bedLocalX, 0.46, -1.56);
    bortPivot.add(frontBoard, rearBoard);

    const cargoController = createCargoLoadController(2.08, 2.92, 0.95, castShadow);
    cargoController.group.position.set(bedLocalX, 0.18, 0);
    bortPivot.add(cargoController.group);

    chassisGroup.add(
      noseHood,
      hoodCrown,
      whiteMask,
      zilBumper,
      zilCab,
      zilGlass,
      zilRoof,
      bortPivot,
    );

    return {
      cargoController,
      animateWorkMechanism: (phase: number) => {
        bortPivot.rotation.z = phase * 0.58;
        sideGatePivot.rotation.z = -phase * 0.95;
      },
    };
  }

  // ==================== WHEELED HYDRAULIC EXCAVATOR (EKSKAVATOR) ====================
  // Lower heavy carrier frame + front bulldozer stabilizer blade
  const carrierDeck = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.46, 4.45), trimDarkMat);
  carrierDeck.position.set(0, 0.72, 0);
  carrierDeck.castShadow = castShadow;

  const dozerBlade = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.52, 0.24), bodyPaintMat);
  dozerBlade.position.set(0, 0.44, 2.52);
  for (const bx of [-0.72, 0.72]) {
    const bladeArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.68), trimDarkMat);
    bladeArm.position.set(bx, 0.52, 2.22);
    chassisGroup.add(bladeArm);
  }

  // Slewing Turret Ring + Upper House
  const slewRing = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.02, 0.26, 20), trimDarkMat);
  slewRing.position.set(0, 1.06, -0.05);

  const turretGroup = new THREE.Group();
  turretGroup.position.set(0, 1.18, -0.05);

  // Right-side Engine Deck + Heavy Rear Counterweight
  const engineHood = new THREE.Mesh(new THREE.BoxGeometry(1.32, 1.08, 2.35), bodyPaintMat);
  engineHood.position.set(-0.48, 0.56, -0.25);
  engineHood.castShadow = castShadow;

  const counterweight = new THREE.Mesh(new THREE.BoxGeometry(2.42, 1.02, 0.85), trimDarkMat);
  counterweight.position.set(0, 0.54, -1.58);
  counterweight.castShadow = castShadow;

  const cwStripe = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.22, 0.88), bodyPaintMat);
  cwStripe.position.set(0, 0.58, -1.58);

  // Left-side Panoramic Glass Operator Cab + ROPS Cage + Roof Beacon
  const opCabFrame = new THREE.Mesh(new THREE.BoxGeometry(0.96, 1.56, 1.55), glassMat);
  opCabFrame.position.set(0.62, 0.86, 0.25);
  opCabFrame.renderOrder = 2;

  const opRoof = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.12, 1.64), bodyPaintMat);
  opRoof.position.set(0.62, 1.68, 0.25);
  const cabBeacon = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.2, 10), amberBeaconMat);
  cabBeacon.position.set(0.62, 1.84, 0.25);

  turretGroup.add(engineHood, counterweight, cwStripe, opCabFrame, opRoof, cabBeacon);

  // 3-Part Articulated Hydraulic Boom + Dipper Stick + Toothed Steel Digging Bucket!
  const boomPivot = new THREE.Group();
  boomPivot.position.set(-0.18, 0.65, 0.68);
  boomPivot.rotation.x = -0.42; // Angled upward & forward (+Z)

  const boomLower = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 2.35), bodyPaintMat);
  boomLower.position.set(0, 0.52, 1.05);
  boomLower.rotation.x = -0.34;
  boomLower.castShadow = castShadow;

  const boomPiston = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.11, 1.55, 10).rotateX(Math.PI / 2),
    chromeMat,
  );
  boomPiston.position.set(0, 0.16, 0.88);
  boomPiston.rotation.x = -0.34;
  boomPivot.add(boomLower, boomPiston);

  // Dipper Stick Pivot at Boom Tip
  const stickPivot = new THREE.Group();
  stickPivot.position.set(0, 0.92, 2.08);
  stickPivot.rotation.x = 0.88; // Angled downward toward street

  const stickArm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.95, 0.32), bodyPaintMat);
  stickArm.position.set(0, -0.88, 0.12);
  stickArm.castShadow = castShadow;

  const stickPiston = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 1.35, 10), chromeMat);
  stickPiston.position.set(0, -0.35, 0.34);
  stickPivot.add(stickArm, stickPiston);

  // Toothed Steel Excavator Bucket at Stick Tip
  const bucketPivot = new THREE.Group();
  bucketPivot.position.set(0, -1.78, 0.15);
  bucketPivot.rotation.x = -0.55;

  const bucketShell = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.64, 0.82), trimDarkMat);
  bucketShell.position.set(0, -0.22, 0.28);
  bucketShell.castShadow = castShadow;
  bucketPivot.add(bucketShell);

  // 4 Forged Digging Teeth
  for (const tx of [-0.34, -0.11, 0.11, 0.34]) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 4).rotateX(Math.PI / 2), chromeMat);
    tooth.position.set(tx, -0.46, 0.76);
    bucketPivot.add(tooth);
  }

  // Bucket Scoop Load (Concrete / Gravel / Steel / Wood)
  const cargoController = createCargoLoadController(0.78, 0.62, 0.65, castShadow);
  cargoController.group.position.set(0, 0.08, 0.26);
  bucketPivot.add(cargoController.group);

  stickPivot.add(bucketPivot);
  boomPivot.add(stickPivot);
  turretGroup.add(boomPivot);

  chassisGroup.add(carrierDeck, dozerBlade, slewRing, turretGroup);

  return {
    cargoController,
    animateWorkMechanism: (phase: number) => {
      // Smoothly articulate boom, dipper stick, and bucket digging curl!
      const digWave = Math.sin(phase * Math.PI);
      turretGroup.rotation.y = Math.sin(phase * Math.PI * 2) * 0.22;
      boomPivot.rotation.x = -0.42 + digWave * 0.32;
      stickPivot.rotation.x = 0.88 - digWave * 0.55;
      bucketPivot.rotation.x = -0.55 - digWave * 0.75;
    },
  };
}
