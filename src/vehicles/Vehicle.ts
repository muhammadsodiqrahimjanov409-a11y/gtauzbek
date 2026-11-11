import * as THREE from 'three';
import type { VehicleBodyStyle, VehicleCustomTuning, VehicleId } from '../types/game';
import { getDefaultVehicleTuning, VEHICLE_CONFIGS } from '../game/gameConfig';
import {
  buildCabinInterior,
  buildHeavyMachineryChassis,
  createCargoLoadController,
  createCustomizableWheelAssembly,
  type CargoLoadController,
  type WheelAssemblyHandle,
} from './VehicleCargoAndWheels';

export interface VehicleRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  bodyPaintMat: THREE.MeshPhysicalMaterial;
  tireMat: THREE.MeshStandardMaterial;
  interiorMat: THREE.MeshStandardMaterial;
  rimMat: THREE.MeshStandardMaterial;
  headlightMat: THREE.MeshStandardMaterial;
  taillightMat: THREE.MeshStandardMaterial;
  frontLeftSteer: THREE.Group;
  frontRightSteer: THREE.Group;
  wheelMeshes: THREE.Group[];
  headlightCones: THREE.Mesh[];
  setPaintColor: (hexOrCss: string) => void;
  applyTuning: (tuning: VehicleCustomTuning) => void;
  updateVisuals: (
    wheelSpin: number,
    steerAngle: number,
    headlightsOn: boolean,
    braking: boolean,
    bodyPitch?: number,
    bodyRoll?: number,
    workAnimPhase?: number,
  ) => void;
}

let sharedShadowTex: THREE.Texture | null = null;
function getVehicleShadowTexture(): THREE.Texture {
  if (sharedShadowTex) return sharedShadowTex;
  if (typeof document === 'undefined') {
    const data = new Uint8Array([0, 0, 0, 120]);
    const dt = new THREE.DataTexture(data, 1, 1);
    dt.needsUpdate = true;
    sharedShadowTex = dt;
    return sharedShadowTex;
  }
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 14, 64, 64, 60);
  g.addColorStop(0, 'rgba(0,0,0,0.62)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  sharedShadowTex = tex;
  return sharedShadowTex;
}

export function createProceduralVehicleModel(
  type: VehicleId,
  initialColor: string,
  castShadow = true,
  initialTuning?: VehicleCustomTuning,
): VehicleRig {
  const cfg = VEHICLE_CONFIGS[type] ?? VEHICLE_CONFIGS.sedan;
  const style: VehicleBodyStyle = cfg.bodyStyle;
  const defaultTuning = initialTuning ?? getDefaultVehicleTuning(type);
  const root = new THREE.Group();

  const shadowW =
    style === 'airplane'
      ? 6.6
      : style === 'tank'
        ? 3.4
        : style === 'fura' || style === 'howo' || style === 'kamaz' || style === 'excavator'
          ? 3.15
          : style === 'zil' || style === 'isuzu' || style === 'gazel' || style === 'suv' || style === 'pickup'
            ? 2.85
            : style === 'limo'
              ? 2.7
              : style === 'labo'
                ? 2.2
                : 2.55;
  const shadowL =
    style === 'airplane'
      ? 8.2
      : style === 'tank'
        ? 6.6
        : style === 'fura'
          ? 9.1
          : style === 'howo'
            ? 8.2
            : style === 'kamaz'
              ? 7.2
              : style === 'zil' || style === 'isuzu'
                ? 6.5
                : style === 'gazel' || style === 'limo'
                  ? 6.2
                  : style === 'excavator' || style === 'pickup' || style === 'suv'
                    ? 5.45
                    : style === 'labo' || style === 'hatchback'
                      ? 4.45
                      : 4.95;

  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(shadowW, shadowL).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: getVehicleShadowTexture(),
      transparent: true,
      depthWrite: false,
    }),
  );
  shadowPlane.position.y = 0.048;
  root.add(shadowPlane);

  const isIndustrial =
    style === 'fura' ||
    style === 'howo' ||
    style === 'kamaz' ||
    style === 'zil' ||
    style === 'isuzu' ||
    style === 'gazel' ||
    style === 'labo' ||
    style === 'excavator';

  const bodyPaintMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(initialColor),
    metalness: type === 'cyber' ? 0.92 : isIndustrial ? 0.62 : 0.82,
    roughness: type === 'armored' ? 0.48 : isIndustrial ? 0.32 : 0.22,
    clearcoat: type === 'armored' ? 0.3 : isIndustrial ? 0.65 : 1.0,
    clearcoatRoughness: 0.14,
  });

  const trimDarkMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.58,
    metalness: 0.35,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.18,
    metalness: 0.92,
  });

  const accentNeonMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.9,
    roughness: 0.2,
  });

  // Semi-transparent clearcoat glass so custom 3D Cabin Interior (seats, console, steering wheel) is clearly visible
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbae6fd,
    roughness: 0.08,
    metalness: 0.12,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });

  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: 0xe0f2fe,
    emissiveIntensity: 0.6,
    roughness: 0.15,
  });

  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0x7f1d1d,
    emissive: 0xef4444,
    emissiveIntensity: 0.45,
    roughness: 0.25,
  });

  const tireMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(defaultTuning.tireColor),
    roughness: 0.84,
    metalness: 0.08,
  });

  const interiorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(defaultTuning.interiorColor),
    roughness: 0.54,
    metalness: 0.12,
  });

  const rimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(defaultTuning.rimColor),
    roughness: 0.22,
    metalness: 0.88,
  });

  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  let cargoController: CargoLoadController | null = null;
  let animateWorkMechanism: ((phase: number) => void) | undefined;

  if (
    style === 'fura' ||
    style === 'howo' ||
    style === 'kamaz' ||
    style === 'zil' ||
    style === 'isuzu' ||
    style === 'gazel' ||
    style === 'labo' ||
    style === 'excavator'
  ) {
    const heavyBuild = buildHeavyMachineryChassis(
      style,
      chassisGroup,
      bodyPaintMat,
      glassMat,
      trimDarkMat,
      chromeMat,
      castShadow,
    );
    cargoController = heavyBuild.cargoController;
    animateWorkMechanism = heavyBuild.animateWorkMechanism;
  } else if (style === 'sedan') {
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.56, 4.5), bodyPaintMat);
    lowerBody.position.y = 0.56;
    lowerBody.castShadow = castShadow;
    lowerBody.receiveShadow = true;

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.52, 2.28), glassMat);
    cabin.position.set(0, 1.08, -0.12);
    cabin.renderOrder = 2;
    const roofCap = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.08, 1.94), bodyPaintMat);
    roofCap.position.set(0, 1.35, -0.12);

    const fBumper = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.24, 0.25), trimDarkMat);
    fBumper.position.set(0, 0.36, 2.22);
    const rBumper = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.24, 0.25), trimDarkMat);
    rBumper.position.set(0, 0.36, -2.22);
    const grille = new THREE.Mesh(
      new THREE.BoxGeometry(type === 'gt_tourer' ? 1.32 : 1.12, 0.28, 0.08),
      chromeMat,
    );
    grille.position.set(0, 0.56, 2.24);

    chassisGroup.add(lowerBody, cabin, roofCap, fBumper, rBumper, grille);
  } else if (style === 'hatchback') {
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.54, 3.92), bodyPaintMat);
    lowerBody.position.y = 0.54;
    lowerBody.castShadow = castShadow;
    lowerBody.receiveShadow = true;

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.54, 2.25), glassMat);
    cabin.position.set(0, 1.06, -0.36);
    cabin.renderOrder = 2;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.09, 2.15), bodyPaintMat);
    roof.position.set(0, 1.35, -0.36);

    const hatchSpoiler = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.08, 0.34), trimDarkMat);
    hatchSpoiler.position.set(0, 1.38, -1.48);

    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.14, 4.02), trimDarkMat);
    splitter.position.y = 0.26;

    chassisGroup.add(lowerBody, cabin, roof, hatchSpoiler, splitter);

    if (type === 'rally') {
      const roofScoop = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.52), trimDarkMat);
      roofScoop.position.set(0, 1.43, 0.12);
      chassisGroup.add(roofScoop);
      for (const lx of [-0.36, -0.12, 0.12, 0.36]) {
        const rallyLamp = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 0.08, 10).rotateX(Math.PI / 2),
          headlightMat,
        );
        rallyLamp.position.set(lx, 0.64, 1.98);
        chassisGroup.add(rallyLamp);
      }
    }
  } else if (style === 'limo') {
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.58, 5.75), bodyPaintMat);
    lowerBody.position.y = 0.58;
    lowerBody.castShadow = castShadow;
    lowerBody.receiveShadow = true;

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.54, 3.65), glassMat);
    cabin.position.set(0, 1.12, -0.18);
    cabin.renderOrder = 2;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.09, 3.45), chromeMat);
    roof.position.set(0, 1.41, -0.18);

    const waterfallGrille = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.38, 0.1), chromeMat);
    waterfallGrille.position.set(0, 0.62, 2.86);

    const sideTrim = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.06, 5.6), chromeMat);
    sideTrim.position.y = 0.44;

    chassisGroup.add(lowerBody, cabin, roof, waterfallGrille, sideTrim);
  } else if (style === 'suv') {
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.68, 4.82), bodyPaintMat);
    lowerBody.position.y = 0.72;
    lowerBody.castShadow = castShadow;
    lowerBody.receiveShadow = true;

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.68, 2.98), glassMat);
    cabin.position.set(0, 1.36, -0.35);
    cabin.renderOrder = 2;
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.1, 2.88),
      type === 'lux_suv' ? chromeMat : bodyPaintMat,
    );
    roof.position.set(0, 1.72, -0.35);

    for (const side of [-0.78, 0.78]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.1, 2.5),
        type === 'lux_suv' ? chromeMat : trimDarkMat,
      );
      rail.position.set(side, 1.82, -0.35);
      chassisGroup.add(rail);
    }

    const bullbar = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.42, 0.22),
      type === 'lux_suv' ? chromeMat : trimDarkMat,
    );
    bullbar.position.set(0, 0.58, 2.46);
    const spareWheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.24, 16).rotateX(Math.PI / 2),
      trimDarkMat,
    );
    spareWheel.position.set(0, 1.05, -2.48);

    const skid = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.22, 4.86), trimDarkMat);
    skid.position.y = 0.36;

    chassisGroup.add(lowerBody, cabin, roof, bullbar, spareWheel, skid);
  } else if (style === 'pickup') {
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.66, 5.05), bodyPaintMat);
    lowerBody.position.y = 0.74;
    lowerBody.castShadow = castShadow;
    lowerBody.receiveShadow = true;

    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.68, 1.85), glassMat);
    cab.position.set(0, 1.38, 0.42);
    cab.renderOrder = 2;
    const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.12, 1.78), bodyPaintMat);
    cabRoof.position.set(0, 1.74, 0.42);

    const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.12, 1.85), trimDarkMat);
    bedFloor.position.set(0, 1.02, -1.52);

    if (type === 'cyber') {
      const wedgeTop = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.55, 2.2), bodyPaintMat);
      wedgeTop.position.set(0, 1.36, -1.2);
      wedgeTop.rotation.x = -0.22;
      const cyberBar = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.08, 0.08), accentNeonMat);
      cyberBar.position.set(0, 0.96, 2.54);
      chassisGroup.add(wedgeTop, cyberBar);
    } else if (type === 'armored') {
      const rearCanopy = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.72, 2.1), trimDarkMat);
      rearCanopy.position.set(0, 1.4, -1.45);
      const roofHatch = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.22, 8), trimDarkMat);
      roofHatch.position.set(0, 1.88, 0.35);
      chassisGroup.add(rearCanopy, roofHatch);
    } else {
      const rollBar = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.62, 0.12), trimDarkMat);
      rollBar.position.set(0, 1.36, -0.62);
      const pickupGatePivot = new THREE.Group();
      pickupGatePivot.position.set(0, 1.02, -2.48);
      const pickupGate = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.44, 0.08), bodyPaintMat);
      pickupGate.position.set(0, 0.22, 0);
      pickupGatePivot.add(pickupGate);
      cargoController = createCargoLoadController(1.66, 1.62, 0.85, castShadow);
      cargoController.group.position.set(0, 1.09, -1.54);
      chassisGroup.add(rollBar, pickupGatePivot, cargoController.group);
      animateWorkMechanism = (phase: number) => {
        pickupGatePivot.rotation.x = -phase * (Math.PI * 0.5);
      };
    }

    const heavyBumper = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.34, 0.28), trimDarkMat);
    heavyBumper.position.set(0, 0.52, 2.54);
    chassisGroup.add(lowerBody, cab, cabRoof, bedFloor, heavyBumper);
  } else if (style === 'muscle') {
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.52, 4.68), bodyPaintMat);
    lowerBody.position.y = 0.52;
    lowerBody.castShadow = castShadow;
    lowerBody.receiveShadow = true;

    const fastbackCabin = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.46, 2.02), glassMat);
    fastbackCabin.position.set(0, 0.96, -0.26);
    fastbackCabin.renderOrder = 2;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.08, 1.68), bodyPaintMat);
    roof.position.set(0, 1.21, -0.28);

    const hoodScoop = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.18, 0.95),
      type === 'classic' ? chromeMat : trimDarkMat,
    );
    hoodScoop.position.set(0, 0.84, 1.18);

    for (const sx of [-0.22, 0.22]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 4.62), chromeMat);
      stripe.position.set(sx, 0.79, 0);
      chassisGroup.add(stripe);
    }

    const bumperMat = type === 'classic' ? chromeMat : trimDarkMat;
    const fBump = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.22, 0.22), bumperMat);
    fBump.position.set(0, 0.36, 2.36);
    const rBump = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.22, 0.22), bumperMat);
    rBump.position.set(0, 0.36, -2.36);

    chassisGroup.add(lowerBody, fastbackCabin, roof, hoodScoop, fBump, rBump);
  } else if (style === 'hypercar') {
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.38, 4.68), bodyPaintMat);
    lowerBody.position.y = 0.4;
    lowerBody.castShadow = castShadow;
    lowerBody.receiveShadow = true;

    const frontWedge = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.24, 1.45), bodyPaintMat);
    frontWedge.position.set(0, 0.43, 1.72);
    frontWedge.rotation.x = 0.15;

    const teardropCanopy = new THREE.Mesh(
      new THREE.BoxGeometry(1.54, type === 'roadster' ? 0.32 : 0.4, 1.85),
      glassMat,
    );
    teardropCanopy.position.set(0, 0.76, 0.05);
    teardropCanopy.renderOrder = 2;

    if (type !== 'roadster') {
      const aeroRoof = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.07, 1.32), trimDarkMat);
      aeroRoof.position.set(0, 0.98, 0.02);
      chassisGroup.add(aeroRoof);
    }

    for (const sx of [-1.09, 1.09]) {
      const intake = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 1.25), trimDarkMat);
      intake.position.set(sx, 0.46, -0.45);
      chassisGroup.add(intake);
    }

    if (type === 'hypercar' || type === 'track') {
      const dorsalFin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 1.35), trimDarkMat);
      dorsalFin.position.set(0, 0.92, -1.35);
      const neonDiffuser = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.06, 0.08), accentNeonMat);
      neonDiffuser.position.set(0, 0.26, -2.35);
      chassisGroup.add(dorsalFin, neonDiffuser);
    }

    const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.07, 0.38), trimDarkMat);
    wingBlade.position.set(0, 0.96, -2.18);
    for (const sx of [-0.72, 0.72]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.38, 0.24), trimDarkMat);
      strut.position.set(sx, 0.76, -2.15);
      chassisGroup.add(strut);
    }

    const carbonSplitter = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.09, 4.8), trimDarkMat);
    carbonSplitter.position.y = 0.2;

    chassisGroup.add(lowerBody, frontWedge, teardropCanopy, wingBlade, carbonSplitter);
  } else if (style === 'tank') {
    // Military Main Battle Tank (Armored Hull, Treads, Rotating Turret, 120mm Gun Barrel, Muzzle Brake)
    const hullBase = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.74, 5.2), bodyPaintMat);
    hullBase.position.y = 0.64;
    hullBase.castShadow = castShadow;
    hullBase.receiveShadow = true;

    const glacisFront = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.38, 1.8), bodyPaintMat);
    glacisFront.position.set(0, 0.88, 1.7);
    glacisFront.rotation.x = -0.25;

    const engineDeck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.38, 2.1), bodyPaintMat);
    engineDeck.position.set(0, 0.86, -1.45);

    const exhaustGrille = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.8), trimDarkMat);
    exhaustGrille.position.set(0, 1.06, -1.8);

    for (const sx of [-1.36, 1.36]) {
      const treadHousing = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 5.35), trimDarkMat);
      treadHousing.position.set(sx, 0.44, 0);
      const sideSkirt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 5.1), bodyPaintMat);
      sideSkirt.position.set(sx + Math.sign(sx) * 0.28, 0.46, 0);
      chassisGroup.add(treadHousing, sideSkirt);

      for (let rz = -2.1; rz <= 2.1; rz += 0.84) {
        const roller = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.28, 0.28, 12).rotateZ(Math.PI / 2),
          chromeMat,
        );
        roller.position.set(sx, 0.34, rz);
        chassisGroup.add(roller);
      }
    }

    const turretBaseRing = new THREE.Mesh(
      new THREE.CylinderGeometry(1.22, 1.3, 0.24, 16),
      trimDarkMat,
    );
    turretBaseRing.position.set(0, 1.12, 0.05);

    const turretMain = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 2.65), bodyPaintMat);
    turretMain.position.set(0, 1.48, 0.05);
    turretMain.castShadow = castShadow;

    const turretCheekL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.58, 1.8), bodyPaintMat);
    turretCheekL.position.set(-0.95, 1.48, 0.4);
    turretCheekL.rotation.y = 0.22;
    const turretCheekR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.58, 1.8), bodyPaintMat);
    turretCheekR.position.set(0.95, 1.48, 0.4);
    turretCheekR.rotation.y = -0.22;

    const cupola = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.38, 0.22, 12),
      trimDarkMat,
    );
    cupola.position.set(-0.48, 1.88, -0.35);

    const gunnerSight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.35), chromeMat);
    gunnerSight.position.set(0.55, 1.82, 0.45);

    const mantlet = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.48, 0.65), trimDarkMat);
    mantlet.position.set(0, 1.48, 1.4);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.105, 3.8, 16).rotateX(Math.PI / 2),
      trimDarkMat,
    );
    barrel.position.set(0, 1.48, 3.4);

    const boreEvac = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.65, 14).rotateX(Math.PI / 2),
      bodyPaintMat,
    );
    boreEvac.position.set(0, 1.48, 2.9);

    const muzzleBrake = new THREE.Mesh(
      new THREE.CylinderGeometry(0.125, 0.125, 0.32, 12).rotateX(Math.PI / 2),
      chromeMat,
    );
    muzzleBrake.position.set(0, 1.48, 5.35);

    chassisGroup.add(
      hullBase,
      glacisFront,
      engineDeck,
      exhaustGrille,
      turretBaseRing,
      turretMain,
      turretCheekL,
      turretCheekR,
      cupola,
      gunnerSight,
      mantlet,
      barrel,
      boreEvac,
      muzzleBrake,
    );
  } else if (style === 'airplane') {
    // Supersonic Fighter Jet (Sleek Fuselage, Delta Wings, Glass Bubble Canopy, Twin Tail Fins, Twin Afterburners)
    const fuselage = new THREE.Mesh(
      new THREE.CylinderGeometry(0.68, 0.82, 7.4, 16).rotateX(Math.PI / 2),
      bodyPaintMat,
    );
    fuselage.position.set(0, 0.95, -0.3);
    fuselage.castShadow = castShadow;
    fuselage.receiveShadow = true;

    const radome = new THREE.Mesh(
      new THREE.ConeGeometry(0.68, 2.4, 16).rotateX(Math.PI / 2),
      trimDarkMat,
    );
    radome.position.set(0, 0.95, 4.45);

    const pitotProbe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.65, 8).rotateX(Math.PI / 2),
      chromeMat,
    );
    pitotProbe.position.set(0, 0.95, 5.85);

    const bubbleCanopy = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.52, 2.5), glassMat);
    bubbleCanopy.position.set(0, 1.48, 1.35);
    bubbleCanopy.renderOrder = 2;

    const cockpitSpine = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 2.8), bodyPaintMat);
    cockpitSpine.position.set(0, 1.32, -1.0);

    const mainWings = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.11, 3.2), bodyPaintMat);
    mainWings.position.set(0, 0.88, -0.75);

    for (const sx of [-1, 1]) {
      const lex = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.09, 2.2), bodyPaintMat);
      lex.position.set(sx * 1.05, 0.88, 1.2);
      chassisGroup.add(lex);

      const missileRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.1), trimDarkMat);
      missileRail.position.set(sx * 3.32, 0.88, -0.75);
      const missile = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.065, 1.8, 10).rotateX(Math.PI / 2),
        chromeMat,
      );
      missile.position.set(sx * 3.32, 0.78, -0.65);
      chassisGroup.add(missileRail, missile);
    }

    for (const sx of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.55, 1.35), bodyPaintMat);
      fin.position.set(sx * 0.75, 1.95, -2.85);
      fin.rotation.z = -sx * 0.24;
      const finCap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1.38), trimDarkMat);
      finCap.position.set(sx * 0.75, 2.7, -2.85);
      finCap.rotation.z = -sx * 0.24;
      chassisGroup.add(fin, finCap);

      const stab = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.08, 1.05), bodyPaintMat);
      stab.position.set(sx * 1.25, 0.88, -3.45);
      chassisGroup.add(stab);
    }

    for (const sx of [-0.52, 0.52]) {
      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.42, 0.52, 14).rotateX(Math.PI / 2),
        trimDarkMat,
      );
      nozzle.position.set(sx, 0.92, -3.98);

      const flameCone = new THREE.Mesh(
        new THREE.ConeGeometry(0.28, 0.85, 10).rotateX(-Math.PI / 2),
        accentNeonMat,
      );
      flameCone.position.set(sx, 0.92, -4.38);
      chassisGroup.add(nozzle, flameCone);
    }

    chassisGroup.add(
      fuselage,
      radome,
      pitotProbe,
      bubbleCanopy,
      cockpitSpine,
      mainWings,
    );
  } else {
    // Sport GT Coupe ('sport', 'coupe', 'drift', 'electric_gt')
    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.44, 4.56), bodyPaintMat);
    lowerBody.position.y = 0.44;
    lowerBody.castShadow = castShadow;
    lowerBody.receiveShadow = true;

    const noseSlope = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.26, 1.25), bodyPaintMat);
    noseSlope.position.set(0, 0.48, 1.72);
    noseSlope.rotation.x = 0.12;

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.42, 1.95), glassMat);
    canopy.position.set(0, 0.84, -0.18);
    canopy.renderOrder = 2;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.07, 1.45), bodyPaintMat);
    roof.position.set(0, 1.06, -0.22);

    const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.1, 4.68), trimDarkMat);
    splitter.position.y = 0.22;

    if (type !== 'coupe') {
      const wingBlade = new THREE.Mesh(
        new THREE.BoxGeometry(type === 'drift' ? 2.12 : 1.96, 0.08, 0.36),
        trimDarkMat,
      );
      wingBlade.position.set(0, type === 'drift' ? 1.08 : 0.98, -2.12);
      for (const sx of [-0.68, 0.68]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.22), trimDarkMat);
        strut.position.set(sx, 0.82, -2.1);
        chassisGroup.add(strut);
      }
      chassisGroup.add(wingBlade);
    }

    if (type === 'electric_gt') {
      const frontGlowBar = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.06, 0.08), accentNeonMat);
      frontGlowBar.position.set(0, 0.5, 2.29);
      chassisGroup.add(frontGlowBar);
    } else {
      for (const ex of [-0.46, 0.46]) {
        const pipe = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 0.25, 10).rotateX(Math.PI / 2),
          chromeMat,
        );
        pipe.position.set(ex, 0.28, -2.32);
        chassisGroup.add(pipe);
      }
    }

    chassisGroup.add(lowerBody, noseSlope, canopy, roof, splitter);
  }

  // 3D Cabin Interior (Custom Leather Seats, Console, Infotainment, Rotatable Steering Wheel)
  const cabinInterior = buildCabinInterior(style, interiorMat, trimDarkMat, chromeMat);
  chassisGroup.add(cabinInterior.group);

  // Side mirrors
  if (style !== 'excavator' && style !== 'tank' && style !== 'airplane') {
    const mirrorY =
      style === 'howo'
        ? 2.48
        : style === 'fura'
          ? 2.38
          : style === 'kamaz'
            ? 2.24
            : style === 'isuzu'
              ? 2.12
              : style === 'zil' || style === 'gazel'
                ? 1.94
                : style === 'labo'
                  ? 1.62
                  : style === 'suv' || style === 'pickup'
                    ? 1.18
                    : style === 'hypercar' || style === 'sport'
                      ? 0.72
                      : 0.92;
    const mirrorX =
      style === 'howo' || style === 'fura'
        ? 1.34
        : style === 'kamaz'
          ? 1.28
          : style === 'zil' || style === 'isuzu'
            ? 1.2
            : style === 'gazel' || style === 'suv' || style === 'pickup' || style === 'hypercar'
              ? 1.13
              : style === 'labo'
                ? 0.91
                : 1.02;
    const mirrorZ =
      style === 'fura'
        ? 3.55
        : style === 'howo'
          ? 3.42
          : style === 'kamaz'
            ? 2.95
            : style === 'isuzu'
              ? 2.75
              : style === 'labo'
                ? 1.68
                : style === 'gazel'
                  ? 1.72
                  : style === 'zil'
                    ? 1.45
                    : 0.62;
    const mirrorH = isIndustrial ? 0.3 : 0.11;

    for (const sx of [-1, 1]) {
      const mirror = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, mirrorH, 0.14),
        isIndustrial ? trimDarkMat : bodyPaintMat,
      );
      mirror.position.set(sx * mirrorX, mirrorY, mirrorZ);
      chassisGroup.add(mirror);
    }
  }

  // Headlights, Taillights & Volumetric Night Cones
  const frontLightZ =
    style === 'airplane'
      ? 4.6
      : style === 'tank'
        ? 2.62
        : style === 'fura'
      ? 3.88
      : style === 'howo'
        ? 3.74
        : style === 'kamaz'
          ? 3.24
          : style === 'zil'
            ? 3.02
            : style === 'isuzu'
              ? 2.96
              : style === 'gazel'
                ? 2.91
                : style === 'limo'
                  ? 2.88
                  : style === 'pickup'
                    ? 2.52
                    : style === 'suv'
                      ? 2.41
                      : style === 'excavator'
                        ? 2.22
                        : style === 'labo'
                          ? 2.02
                          : style === 'hatchback'
                            ? 1.97
                            : 2.32;
  const rearLightZ =
    style === 'airplane'
      ? -3.95
      : style === 'tank'
        ? -2.62
        : style === 'fura'
      ? -4.2
      : style === 'howo'
        ? -3.62
        : style === 'kamaz'
          ? -3.22
          : style === 'isuzu'
            ? -3.02
            : style === 'zil'
              ? -2.98
              : style === 'gazel'
                ? -2.86
                : style === 'labo'
                  ? -2.02
                  : style === 'excavator'
                    ? -1.64
                    : -frontLightZ;
  const frontLightY =
    style === 'airplane'
      ? 0.95
      : style === 'tank'
        ? 0.92
        : style === 'howo'
      ? 0.96
      : style === 'fura'
        ? 0.92
        : style === 'kamaz'
          ? 0.86
          : style === 'zil'
            ? 0.96
            : style === 'isuzu' || style === 'gazel' || style === 'excavator' || style === 'suv' || style === 'pickup'
              ? 0.86
              : style === 'labo'
                ? 0.78
                : style === 'hypercar' || style === 'sport'
                  ? 0.46
                  : 0.6;
  const rearLightY =
    style === 'airplane'
      ? 0.95
      : style === 'tank'
        ? 0.78
        : style === 'excavator'
          ? 1.52
          : style === 'labo'
            ? 0.62
            : frontLightY + 0.04;
  const lightSpreadX = style === 'tank' ? 1.05 : style === 'airplane' ? 0.52 : style === 'labo' ? 0.62 : isIndustrial ? 0.86 : 0.68;

  const headlightCones: THREE.Mesh[] = [];
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  for (const sx of [-lightSpreadX, lightSpreadX]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.08), headlightMat);
    hl.position.set(sx, frontLightY, frontLightZ);
    chassisGroup.add(hl);

    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.08), taillightMat);
    tl.position.set(sx, rearLightY, rearLightZ);
    chassisGroup.add(tl);

    const beamCone = new THREE.Mesh(
      new THREE.ConeGeometry(1.65, 9.5, 14, 1, true).rotateX(-Math.PI / 2),
      coneMat,
    );
    beamCone.position.set(sx, frontLightY - 0.18, frontLightZ + 4.8);
    beamCone.visible = false;
    chassisGroup.add(beamCone);
    headlightCones.push(beamCone);
  }

  // Multi-Axle Customizable Wheel Assemblies (4, 6, or 8 wheels depending on chassis!)
  const wheelRadius =
    style === 'tank'
      ? 0.32
      : style === 'airplane'
        ? 0.28
        : style === 'excavator'
      ? 0.56
      : style === 'howo'
        ? 0.54
        : style === 'fura' || style === 'kamaz'
          ? 0.52
          : style === 'zil'
            ? 0.49
            : style === 'isuzu'
              ? 0.46
              : style === 'pickup'
                ? 0.46
                : style === 'gazel' || style === 'suv'
                  ? 0.43
                  : style === 'labo' || style === 'hypercar' || style === 'sport'
                    ? 0.35
                    : 0.37;
  const wheelWidth =
    style === 'tank'
      ? 0.36
      : style === 'airplane'
        ? 0.18
        : style === 'excavator'
      ? 0.38
      : style === 'howo'
        ? 0.31
        : style === 'kamaz' || style === 'hypercar' || style === 'sport'
          ? 0.3
          : style === 'pickup'
            ? 0.29
            : style === 'fura'
              ? 0.28
              : style === 'zil' || style === 'isuzu'
                ? 0.26
                : style === 'gazel'
                  ? 0.24
                  : style === 'labo'
                    ? 0.21
                    : 0.25;
  const trackX =
    style === 'tank'
      ? 1.36
      : style === 'airplane'
        ? 1.12
        : style === 'howo' || style === 'fura' || style === 'excavator'
      ? 1.13
      : style === 'kamaz'
        ? 1.1
        : style === 'zil' || style === 'isuzu' || style === 'pickup' || style === 'suv'
          ? 1.05
          : style === 'gazel' || style === 'hypercar'
            ? 1.01
            : style === 'sport'
              ? 0.99
              : style === 'labo'
                ? 0.78
                : 0.92;
  const frontAxleZ =
    style === 'airplane'
      ? 2.5
      : style === 'tank'
        ? 1.8
        : style === 'fura'
      ? 2.85
      : style === 'howo'
        ? 2.76
        : style === 'kamaz'
          ? 2.25
          : style === 'zil'
            ? 2.22
            : style === 'isuzu'
              ? 2.05
              : style === 'gazel'
                ? 1.98
                : style === 'limo'
                  ? 1.92
                  : style === 'pickup'
                    ? 1.56
                    : style === 'excavator' || style === 'suv'
                      ? 1.48
                      : style === 'labo'
                        ? 1.28
                        : style === 'hatchback'
                          ? 1.22
                          : 1.38;

  const rearAxleZs: number[] =
    style === 'tank'
      ? [-0.1, -1.8]
      : style === 'airplane'
        ? [-0.9]
        : style === 'fura'
      ? [0.28, -2.42, -3.52]
      : style === 'howo'
        ? [-1.55, -2.78]
        : style === 'kamaz'
          ? [-1.35, -2.52]
          : style === 'isuzu'
            ? [-1.78]
            : style === 'zil'
              ? [-1.68]
              : style === 'gazel'
                ? [-1.62]
                : style === 'labo'
                  ? [-1.25]
                  : style === 'excavator'
                    ? [-1.48]
                    : [-frontAxleZ];

  const useDualRear =
    style === 'fura' ||
    style === 'howo' ||
    style === 'kamaz' ||
    style === 'zil' ||
    style === 'isuzu' ||
    style === 'gazel';

  const wheelHandles: WheelAssemblyHandle[] = [];
  const wheelMeshes: THREE.Group[] = [];
  const secondarySteerGroups: THREE.Group[] = [];

  const flHandle = createCustomizableWheelAssembly(
    wheelRadius,
    wheelWidth,
    tireMat,
    rimMat,
    trimDarkMat,
    castShadow,
    false,
  );
  const frontLeftSteer = new THREE.Group();
  frontLeftSteer.position.set(trackX, wheelRadius, frontAxleZ);
  frontLeftSteer.add(flHandle.group);

  const frHandle = createCustomizableWheelAssembly(
    wheelRadius,
    wheelWidth,
    tireMat,
    rimMat,
    trimDarkMat,
    castShadow,
    false,
  );
  const frontRightSteer = new THREE.Group();
  frontRightSteer.position.set(-trackX, wheelRadius, frontAxleZ);
  frontRightSteer.add(frHandle.group);

  root.add(frontLeftSteer, frontRightSteer);
  wheelHandles.push(flHandle, frHandle);
  wheelMeshes.push(flHandle.group, frHandle.group);

  // Second Steered Front Axle for 4-Axle (8x4) HOWO Gruzovoy Samosval!
  if (style === 'howo') {
    for (const side of [1, -1] as const) {
      const f2Handle = createCustomizableWheelAssembly(
        wheelRadius,
        wheelWidth,
        tireMat,
        rimMat,
        trimDarkMat,
        castShadow,
        false,
      );
      const steer2 = new THREE.Group();
      steer2.position.set(side * trackX, wheelRadius, 1.42);
      steer2.add(f2Handle.group);
      root.add(steer2);
      secondarySteerGroups.push(steer2);
      wheelHandles.push(f2Handle);
      wheelMeshes.push(f2Handle.group);
    }
  }

  for (const rz of rearAxleZs) {
    for (const side of [1, -1] as const) {
      const rHandle = createCustomizableWheelAssembly(
        wheelRadius,
        wheelWidth,
        tireMat,
        rimMat,
        trimDarkMat,
        castShadow,
        useDualRear,
      );
      rHandle.group.position.set(side * trackX, wheelRadius, rz);
      root.add(rHandle.group);
      wheelHandles.push(rHandle);
      wheelMeshes.push(rHandle.group);
    }
  }

  const applyTuning = (tuning: VehicleCustomTuning) => {
    tireMat.color.set(tuning.tireColor);
    interiorMat.color.set(tuning.interiorColor);
    rimMat.color.set(tuning.rimColor);
    for (const wh of wheelHandles) {
      wh.setRimStyle(tuning.rimStyle);
    }
    if (cargoController) {
      cargoController.setCargoType(tuning.cargoType);
    }
  };

  applyTuning(defaultTuning);

  return {
    root,
    chassisGroup,
    bodyPaintMat,
    tireMat,
    interiorMat,
    rimMat,
    headlightMat,
    taillightMat,
    frontLeftSteer,
    frontRightSteer,
    wheelMeshes,
    headlightCones,
    setPaintColor: (hexOrCss: string) => {
      bodyPaintMat.color.set(hexOrCss);
    },
    applyTuning,
    updateVisuals: (
      wheelSpin,
      steerAngle,
      headlightsOn,
      braking,
      bodyPitch = 0,
      bodyRoll = 0,
      workAnimPhase = 0,
    ) => {
      frontLeftSteer.rotation.y = steerAngle;
      frontRightSteer.rotation.y = steerAngle;
      for (const s2 of secondarySteerGroups) {
        s2.rotation.y = steerAngle * 0.72;
      }
      cabinInterior.steeringWheel.rotation.z = -steerAngle * 2.6;
      for (const wm of wheelMeshes) {
        wm.rotation.x = wheelSpin;
      }
      headlightMat.emissiveIntensity = headlightsOn ? 2.6 : 0.45;
      for (const cone of headlightCones) {
        cone.visible = headlightsOn;
      }
      taillightMat.emissiveIntensity = braking ? 3.2 : headlightsOn ? 1.1 : 0.35;
      chassisGroup.rotation.x = bodyPitch;
      chassisGroup.rotation.z = bodyRoll;
      if (animateWorkMechanism) {
        animateWorkMechanism(workAnimPhase);
      }
    },
  };
}
