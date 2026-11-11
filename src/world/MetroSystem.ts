import * as THREE from 'three';
import type { InteractablePoint, MetroRideState, MetroStationConfig, Vec3 } from '../types/game';
import {
  METRO_ELEVATION_Y,
  METRO_LOOP_CORNERS,
  METRO_STATIONS,
  ROAD_COORDS,
} from '../game/gameConfig';
import type { WalkableSurfaceResult } from '../player/PlayerController';
import type { CollisionWorld } from '../utils/collision';

export const METRO_PLATFORM_TOP_Y = METRO_ELEVATION_Y + 0.56; // 9.76m

export interface MetroFrameStep {
  rideState: MetroRideState;
  ridingNow: boolean;
  riderPosition: Vec3;
  riderYaw: number;
  arrivedStation: MetroStationConfig | null;
  justStoppedStation: MetroStationConfig | null;
  autoBoardedStation: MetroStationConfig | null;
}

export interface DisembarkResult {
  station: MetroStationConfig;
  position: Vec3;
  yaw: number;
}

export interface MetroSystemHandle {
  group: THREE.Group;
  interactPoints: InteractablePoint[];
  startRide: (fromStationId: string, toStationId: string) => boolean;
  boardLiveTrain: (stationId?: string | null) => MetroStationConfig | null;
  disembarkLiveTrain: () => DisembarkResult | null;
  setDestinationWhileRiding: (toStationId: string) => boolean;
  skipRideImmediate: () => MetroStationConfig | null;
  isRiding: () => boolean;
  findBoardableStation: (pos: Vec3) => MetroStationConfig | null;
  resolveWalkableSurface: (x: number, z: number, currentY: number) => WalkableSurfaceResult;
  update: (
    dt: number,
    elapsed: number,
    ownedProperties?: string[],
    playerPos?: Vec3,
  ) => MetroFrameStep;
}

interface StationBeaconRef {
  stationId: string;
  material: THREE.MeshStandardMaterial;
  defaultColor: THREE.Color;
  ownedState: boolean;
}

interface DoorLeafRef {
  mesh: THREE.Mesh;
  closedZ: number;
  slideSign: number;
}

interface OnboardPassengerRef {
  root: THREE.Group;
  upperBody: THREE.Group;
  headPivot: THREE.Group;
  phase: number;
  standing: boolean;
  dynamicSlot: boolean;
  baseHeadYaw: number;
}

interface MetroCarRig {
  group: THREE.Group;
  doorLeaves: DoorLeafRef[];
  passengers: OnboardPassengerRef[];
}

interface AmbientMetroTrain {
  cars: MetroCarRig[];
  arcS: number;
  speed: number;
  prevSpeed: number;
  dwellTimer: number;
  dwellStationId: string | null;
  lastStationId: string;
  doorOpenRatio: number;
  stopCounter: number;
}

interface StationWalkableMeta {
  station: MetroStationConfig;
  uOutX: number;
  uOutZ: number;
  uAlongX: number;
  uAlongZ: number;
  platformPosition: Vec3;
  platformExitYaw: number;
}

type CommuterStage =
  | 'street_approach'
  | 'escalator_up'
  | 'skybridge_in'
  | 'platform_to_spot'
  | 'waiting_platform'
  | 'boarding_train'
  | 'inside_train_pool'
  | 'alighting_train'
  | 'platform_to_bridge'
  | 'skybridge_out'
  | 'escalator_down'
  | 'street_depart';

interface ArticulatedCommuterRig {
  root: THREE.Group;
  upperBody: THREE.Group;
  headPivot: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  hasPhone: boolean;
  hasBriefcase: boolean;
}

interface StationCommuterAgent {
  rig: ArticulatedCommuterRig;
  stationIdx: number;
  stage: CommuterStage;
  r: number;
  along: number;
  y: number;
  rotY: number;
  laneOffset: number;
  doorAlong: number;
  waitR: number;
  waitAlong: number;
  walkSpeed: number;
  walkPhase: number;
  idlePhase: number;
  stateTimer: number;
}

interface MetroCommuterAssets {
  shadowGeo: THREE.BufferGeometry;
  shoeGeo: THREE.BufferGeometry;
  legStandingGeo: THREE.BufferGeometry;
  thighSeatedGeo: THREE.BufferGeometry;
  calfSeatedGeo: THREE.BufferGeometry;
  pelvisGeo: THREE.BufferGeometry;
  torsoGeo: THREE.BufferGeometry;
  collarGeo: THREE.BufferGeometry;
  armGeo: THREE.BufferGeometry;
  handGeo: THREE.BufferGeometry;
  headGeo: THREE.BufferGeometry;
  hairCapGeo: THREE.BufferGeometry;
  hairBunGeo: THREE.BufferGeometry;
  eyeGeo: THREE.BufferGeometry;
  backpackGeo: THREE.BufferGeometry;
  briefcaseGeo: THREE.BufferGeometry;
  phoneGeo: THREE.BufferGeometry;
  shadowMat: THREE.MeshBasicMaterial;
  shoeMat: THREE.MeshStandardMaterial;
  eyeMat: THREE.MeshBasicMaterial;
  collarMat: THREE.MeshStandardMaterial;
  phoneBodyMat: THREE.MeshStandardMaterial;
  phoneScreenMat: THREE.MeshStandardMaterial;
  bagMats: THREE.MeshStandardMaterial[];
  skinMats: THREE.MeshStandardMaterial[];
  hairMats: THREE.MeshStandardMaterial[];
  jacketMats: THREE.MeshStandardMaterial[];
  pantsMats: THREE.MeshStandardMaterial[];
}

const DOOR_ALONG_SLOTS = [-11.9, -7.7, -2.15, 2.15, 7.7, 11.9] as const;

const OWNED_EMERALD = new THREE.Color(0x10b981);
const SAMPLE_COUNT = 2048;
const ESCALATOR_BOTTOM_R = 22.8; // Street level (y = 0m), safely outside 17m road & inside 24.2m forecourt
const ESCALATOR_TOP_R = 14.0; // Skybridge landing (y = 9.76m); at r = 17m road curb height is 6.43m (> 6m clear!)
const SKYBRIDGE_INNER_R = 5.0; // Connects into outward platform at r = 5.0m

function setCarDoorsOpenRatio(cars: MetroCarRig[], ratio: number): void {
  const clamped = THREE.MathUtils.clamp(ratio, 0, 1);
  const slideOffset = clamped * 0.68;
  for (let c = 0; c < cars.length; c++) {
    const leaves = cars[c].doorLeaves;
    for (let i = 0; i < leaves.length; i++) {
      const lf = leaves[i];
      lf.mesh.position.z = lf.closedZ + lf.slideSign * slideOffset;
    }
  }
}

function createStationSignTexture(
  stationNumber: number,
  accentHex: string,
  subtitle: string,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 512, 128);

    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 500, 116);

    ctx.fillStyle = accentHex;
    ctx.fillRect(18, 18, 92, 92);

    ctx.fillStyle = '#090d16';
    ctx.font = 'bold 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M', 64, 66);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(`NEXUS METRO · ${stationNumber}-BEKAT`, 128, 48);

    ctx.fillStyle = accentHex;
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(subtitle, 128, 88);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createTotemCubeTexture(accentHex: string, stationNumber: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, 112, 112);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 56px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M', 64, 52);

    ctx.fillStyle = accentHex;
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`${stationNumber}-BEKAT`, 64, 98);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds a hollow, walk-in 3D Metro carriage with transparent panoramic windows,
 * commuter seats, grab poles, warm cabin lighting, and 8 animated sliding door leaves.
 */
function createMetroCommuterAssets(): MetroCommuterAssets {
  const shadowGeo = new THREE.CircleGeometry(0.27, 12);
  shadowGeo.rotateX(-Math.PI * 0.5);

  const shoeGeo = new THREE.BoxGeometry(0.13, 0.08, 0.24);
  const legStandingGeo = new THREE.BoxGeometry(0.14, 0.67, 0.15);
  const thighSeatedGeo = new THREE.BoxGeometry(0.14, 0.13, 0.36);
  const calfSeatedGeo = new THREE.BoxGeometry(0.13, 0.31, 0.14);
  const pelvisGeo = new THREE.BoxGeometry(0.35, 0.14, 0.22);
  const torsoGeo = new THREE.BoxGeometry(0.38, 0.5, 0.23);
  const collarGeo = new THREE.BoxGeometry(0.2, 0.08, 0.24);
  const armGeo = new THREE.BoxGeometry(0.11, 0.48, 0.12);
  const handGeo = new THREE.SphereGeometry(0.052, 8, 8);
  const headGeo = new THREE.SphereGeometry(0.145, 12, 10);
  const hairCapGeo = new THREE.SphereGeometry(0.152, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58);
  const hairBunGeo = new THREE.SphereGeometry(0.068, 8, 8);
  const eyeGeo = new THREE.BoxGeometry(0.026, 0.026, 0.02);
  const backpackGeo = new THREE.BoxGeometry(0.27, 0.34, 0.13);
  const briefcaseGeo = new THREE.BoxGeometry(0.08, 0.24, 0.32);
  const phoneGeo = new THREE.BoxGeometry(0.075, 0.016, 0.135);

  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x020617,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.65,
    metalness: 0.15,
  });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
  const collarMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.55 });
  const phoneBodyMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.3,
    metalness: 0.6,
  });
  const phoneScreenMat = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.85,
    roughness: 0.15,
  });

  const bagMats = [0x1e293b, 0x7c2d12, 0x0f766e, 0x4338ca].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.62, metalness: 0.12 }),
  );
  const skinMats = [0xf5d0a9, 0xe8b48a, 0xc68652, 0x8d5524].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.58 }),
  );
  const hairMats = [0x111827, 0x3f2314, 0x78350f, 0x92400e, 0x475569].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.72 }),
  );
  const jacketMats = [
    0x0284c7,
    0xd97706,
    0x059669,
    0x7c3aed,
    0xe11d48,
    0x2563eb,
    0x0d9488,
    0x475569,
    0xea580c,
    0x4f46e5,
  ].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.52, metalness: 0.08 }));
  const pantsMats = [0x1e293b, 0x0f172a, 0x334155, 0x44403c, 0x1e3a8a].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.74 }),
  );

  return {
    shadowGeo,
    shoeGeo,
    legStandingGeo,
    thighSeatedGeo,
    calfSeatedGeo,
    pelvisGeo,
    torsoGeo,
    collarGeo,
    armGeo,
    handGeo,
    headGeo,
    hairCapGeo,
    hairBunGeo,
    eyeGeo,
    backpackGeo,
    briefcaseGeo,
    phoneGeo,
    shadowMat,
    shoeMat,
    eyeMat,
    collarMat,
    phoneBodyMat,
    phoneScreenMat,
    bagMats,
    skinMats,
    hairMats,
    jacketMats,
    pantsMats,
  };
}

function buildHeadGroup(assets: MetroCommuterAssets, seed: number): THREE.Group {
  const headPivot = new THREE.Group();
  const skinMat = assets.skinMats[seed % assets.skinMats.length];
  const hairMat = assets.hairMats[(seed * 3 + 1) % assets.hairMats.length];

  const head = new THREE.Mesh(assets.headGeo, skinMat);
  head.position.y = 0.04;

  const hairCap = new THREE.Mesh(assets.hairCapGeo, hairMat);
  hairCap.position.set(0, 0.055, -0.01);
  hairCap.rotation.x = -0.14;

  const eyeL = new THREE.Mesh(assets.eyeGeo, assets.eyeMat);
  eyeL.position.set(-0.048, 0.052, 0.134);
  const eyeR = new THREE.Mesh(assets.eyeGeo, assets.eyeMat);
  eyeR.position.set(0.048, 0.052, 0.134);

  headPivot.add(head, hairCap, eyeL, eyeR);

  if (seed % 3 === 1) {
    const bun = new THREE.Mesh(assets.hairBunGeo, hairMat);
    bun.position.set(0, 0.09, -0.155);
    headPivot.add(bun);
  }
  return headPivot;
}

function createSeatedPassenger(
  assets: MetroCommuterAssets,
  seed: number,
  dynamicSlot: boolean,
): OnboardPassengerRef {
  const root = new THREE.Group();
  const skinMat = assets.skinMats[seed % assets.skinMats.length];
  const jacketMat = assets.jacketMats[(seed * 5 + 2) % assets.jacketMats.length];
  const pantsMat = assets.pantsMats[(seed * 3 + 1) % assets.pantsMats.length];
  const bagMat = assets.bagMats[seed % assets.bagMats.length];

  // Seated feet + calves + thighs resting on bench (root y = 0 is cabin floor y = 0.64, bench top is +0.35m)
  for (const side of [-1, 1] as const) {
    const lx = side * 0.1;
    const shoe = new THREE.Mesh(assets.shoeGeo, assets.shoeMat);
    shoe.position.set(lx, 0.04, 0.31);
    const calf = new THREE.Mesh(assets.calfSeatedGeo, pantsMat);
    calf.position.set(lx, 0.22, 0.27);
    const thigh = new THREE.Mesh(assets.thighSeatedGeo, pantsMat);
    thigh.position.set(lx, 0.39, 0.13);
    root.add(shoe, calf, thigh);
  }

  const pelvis = new THREE.Mesh(assets.pelvisGeo, pantsMat);
  pelvis.position.set(0, 0.42, 0);
  root.add(pelvis);

  const upperBody = new THREE.Group();
  upperBody.position.set(0, 0.48, -0.01);
  root.add(upperBody);

  const torso = new THREE.Mesh(assets.torsoGeo, jacketMat);
  torso.position.set(0, 0.24, 0);
  const collar = new THREE.Mesh(assets.collarGeo, assets.collarMat);
  collar.position.set(0, 0.49, 0.01);
  upperBody.add(torso, collar);

  const hasPhone = seed % 2 === 0;
  for (const side of [-1, 1] as const) {
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.235, 0.44, 0);
    const arm = new THREE.Mesh(assets.armGeo, jacketMat);
    arm.position.set(0, -0.22, 0);
    const hand = new THREE.Mesh(assets.handGeo, skinMat);
    hand.position.set(0, -0.46, 0);
    armPivot.add(arm, hand);

    if (hasPhone && side === 1) {
      armPivot.rotation.set(-0.98, -0.28, 0);
      const phone = new THREE.Mesh(assets.phoneGeo, assets.phoneBodyMat);
      phone.position.set(-0.03, -0.49, 0.05);
      const screen = new THREE.Mesh(assets.phoneGeo, assets.phoneScreenMat);
      screen.scale.set(0.84, 0.5, 0.86);
      screen.position.set(-0.03, -0.482, 0.05);
      armPivot.add(phone, screen);
    } else {
      armPivot.rotation.set(-0.56, side * -0.14, 0);
    }
    upperBody.add(armPivot);
  }

  if (!hasPhone && seed % 3 === 0) {
    // Lap bag / backpack resting on lap
    const lapBag = new THREE.Mesh(assets.briefcaseGeo, bagMat);
    lapBag.rotation.y = Math.PI * 0.5;
    lapBag.position.set(0, 0.06, 0.2);
    upperBody.add(lapBag);
  }

  const headPivot = buildHeadGroup(assets, seed);
  headPivot.position.set(0, 0.62, 0);
  const baseHeadYaw = hasPhone ? 0 : ((seed % 5) - 2) * 0.11;
  if (hasPhone) {
    headPivot.rotation.x = 0.26;
  }
  headPivot.rotation.y = baseHeadYaw;
  upperBody.add(headPivot);

  return {
    root,
    upperBody,
    headPivot,
    phase: seed * 1.37,
    standing: false,
    dynamicSlot,
    baseHeadYaw,
  };
}

function createArticulatedCommuter(
  assets: MetroCommuterAssets,
  seed: number,
  includeShadow = true,
): ArticulatedCommuterRig {
  const root = new THREE.Group();
  const skinMat = assets.skinMats[seed % assets.skinMats.length];
  const jacketMat = assets.jacketMats[(seed * 7 + 3) % assets.jacketMats.length];
  const pantsMat = assets.pantsMats[(seed * 5 + 2) % assets.pantsMats.length];
  const bagMat = assets.bagMats[(seed * 3) % assets.bagMats.length];

  if (includeShadow) {
    const shadow = new THREE.Mesh(assets.shadowGeo, assets.shadowMat);
    shadow.position.y = 0.012;
    root.add(shadow);
  }

  const makeLeg = (xOff: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(xOff, 0.75, 0);
    const leg = new THREE.Mesh(assets.legStandingGeo, pantsMat);
    leg.position.set(0, -0.335, 0);
    const shoe = new THREE.Mesh(assets.shoeGeo, assets.shoeMat);
    shoe.position.set(0, -0.71, 0.035);
    pivot.add(leg, shoe);
    root.add(pivot);
    return pivot;
  };

  const leftLeg = makeLeg(-0.095);
  const rightLeg = makeLeg(0.095);

  const pelvis = new THREE.Mesh(assets.pelvisGeo, pantsMat);
  pelvis.position.set(0, 0.79, 0);
  root.add(pelvis);

  const upperBody = new THREE.Group();
  upperBody.position.set(0, 0.85, 0);
  root.add(upperBody);

  const torso = new THREE.Mesh(assets.torsoGeo, jacketMat);
  torso.position.set(0, 0.26, 0);
  const collar = new THREE.Mesh(assets.collarGeo, assets.collarMat);
  collar.position.set(0, 0.52, 0.01);
  upperBody.add(torso, collar);

  if (seed % 2 === 0) {
    const backpack = new THREE.Mesh(assets.backpackGeo, bagMat);
    backpack.position.set(0, 0.26, -0.17);
    upperBody.add(backpack);
  }

  const makeArm = (xOff: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(xOff, 0.47, 0);
    const arm = new THREE.Mesh(assets.armGeo, jacketMat);
    arm.position.set(0, -0.22, 0);
    const hand = new THREE.Mesh(assets.handGeo, skinMat);
    hand.position.set(0, -0.47, 0);
    pivot.add(arm, hand);
    upperBody.add(pivot);
    return pivot;
  };

  const leftArm = makeArm(-0.245);
  const rightArm = makeArm(0.245);

  const hasBriefcase = seed % 4 === 1;
  const hasPhone = !hasBriefcase && seed % 3 === 2;

  if (hasBriefcase) {
    const briefcase = new THREE.Mesh(assets.briefcaseGeo, bagMat);
    briefcase.position.set(0.03, -0.58, 0.02);
    rightArm.add(briefcase);
  } else if (hasPhone) {
    const phone = new THREE.Mesh(assets.phoneGeo, assets.phoneBodyMat);
    phone.position.set(-0.02, -0.49, 0.05);
    const screen = new THREE.Mesh(assets.phoneGeo, assets.phoneScreenMat);
    screen.scale.set(0.84, 0.5, 0.86);
    screen.position.set(-0.02, -0.482, 0.05);
    rightArm.add(phone, screen);
  }

  const headPivot = buildHeadGroup(assets, seed);
  headPivot.position.set(0, 0.66, 0);
  upperBody.add(headPivot);

  return {
    root,
    upperBody,
    headPivot,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    hasPhone,
    hasBriefcase,
  };
}

/**
 * Builds a hollow, walk-in 3D Metro carriage with transparent panoramic windows,
 * commuter seats, grab poles, warm cabin lighting, 8 animated sliding door leaves,
 * and 9 composite 3D seated & standing fellow passengers inside!
 */
function createSingleMetroCar(
  accentHex: number,
  role: 'front' | 'middle' | 'rear',
  castShadow: boolean,
  commuterAssets: MetroCommuterAssets,
  carSeed: number,
): MetroCarRig {
  const car = new THREE.Group();
  const doorLeaves: DoorLeafRef[] = [];
  const passengers: OnboardPassengerRef[] = [];

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.24,
    metalness: 0.76,
  });
  const darkRoofMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.48,
    metalness: 0.62,
  });
  const cabinFloorMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.68,
    metalness: 0.18,
  });
  const seatMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.42,
    metalness: 0.15,
  });
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.16,
    metalness: 0.92,
  });
  const clearGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbae6fd,
    roughness: 0.06,
    metalness: 0.1,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.78,
    roughness: 0.25,
  });
  const cabinGlowMat = new THREE.MeshBasicMaterial({
    color: 0xfef3c7,
  });
  const bogieMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.7,
    metalness: 0.5,
  });

  const carLen = 9.0;
  const carW = 2.74;
  const carH = 2.82;

  // 1. Lower chassis skirt + cabin floor deck (top at y = 0.64)
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(carW, 0.38, carLen), darkRoofMat);
  chassis.position.y = 0.36;
  chassis.castShadow = castShadow;
  const cabinFloor = new THREE.Mesh(new THREE.BoxGeometry(carW - 0.12, 0.1, carLen - 0.12), cabinFloorMat);
  cabinFloor.position.y = 0.59;
  cabinFloor.receiveShadow = true;
  car.add(chassis, cabinFloor);

  // 2. Hollow Side Walls with 2 Real Open Doorways per side at dz = -2.15 and dz = +2.15 (doorway width = 1.48m)
  const baySpecs: Array<{ zCenter: number; zLen: number }> = [
    { zCenter: -3.675, zLen: 1.55 },
    { zCenter: 0, zLen: 2.8 },
    { zCenter: 3.675, zLen: 1.55 },
  ];

  for (const side of [-1, 1] as const) {
    const wallX = side * (carW * 0.5 - 0.06);

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, carLen - 0.12), bodyMat);
    lintel.position.set(wallX, 2.66, 0);
    car.add(lintel);

    for (const bay of baySpecs) {
      const lowerPanel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.84, bay.zLen), bodyMat);
      lowerPanel.position.set(wallX, 1.06, bay.zCenter);
      lowerPanel.castShadow = castShadow;

      const stripeSeg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.16, bay.zLen + 0.02), stripeMat);
      stripeSeg.position.set(wallX + side * 0.01, 1.38, bay.zCenter);

      const winPane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, bay.zLen - 0.14), clearGlassMat);
      winPane.position.set(wallX, 1.98, bay.zCenter);
      winPane.renderOrder = 3;

      const pillarA = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.88, 0.12), darkRoofMat);
      pillarA.position.set(wallX, 1.58, bay.zCenter - bay.zLen * 0.5 + 0.06);
      const pillarB = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.88, 0.12), darkRoofMat);
      pillarB.position.set(wallX, 1.58, bay.zCenter + bay.zLen * 0.5 - 0.06);

      // Interior commuter bench seats along each window bay
      const seatBench = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, bay.zLen - 0.34), seatMat);
      seatBench.position.set(side * (carW * 0.5 - 0.34), 0.92, bay.zCenter);
      const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, bay.zLen - 0.34), seatMat);
      seatBack.position.set(side * (carW * 0.5 - 0.17), 1.18, bay.zCenter);

      car.add(lowerPanel, stripeSeg, winPane, pillarA, pillarB, seatBench, seatBack);
    }

    // 3. Animated Sliding Double Doors at dz = -2.15 and dz = +2.15 (2 leaves per doorway)
    for (const dz of [-2.15, 2.15]) {
      for (const leafSign of [-1, 1] as const) {
        const closedZ = dz + leafSign * 0.37;
        const leafGroupMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.86, 0.72), darkRoofMat);
        leafGroupMesh.position.set(wallX + side * 0.02, 1.57, closedZ);

        const leafWin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.88, 0.52), clearGlassMat);
        leafWin.position.set(0, 0.24, 0);
        leafWin.renderOrder = 3;
        leafGroupMesh.add(leafWin);

        const leafAccent = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.7), stripeMat);
        leafAccent.position.set(0, -0.22, 0);
        leafGroupMesh.add(leafAccent);

        car.add(leafGroupMesh);
        doorLeaves.push({
          mesh: leafGroupMesh,
          closedZ,
          slideSign: leafSign,
        });
      }
    }
  }

  // 4. Brushed-chrome interior grab stanchions (twin aisle poles at z = 0 keep center spot clear for player!)
  const poleCoords: Array<[number, number]> = [
    [0, -1.25],
    [-0.48, 0],
    [0.48, 0],
    [0, 1.25],
  ];
  for (const [px, pz] of poleCoords) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.1, 8), poleMat);
    pole.position.set(px, 1.68, pz);
    car.add(pole);
  }

  // 4B. Populate Carriage with 6 Seated Window-Bench Passengers + 3 Standing Fellow Passengers!
  const seatedSlots: Array<{ side: -1 | 1; z: number; dyn: boolean }> = [
    { side: -1, z: -3.66, dyn: false },
    { side: 1, z: -3.64, dyn: true },
    { side: -1, z: -0.72, dyn: false },
    { side: 1, z: -0.68, dyn: false },
    { side: -1, z: 0.74, dyn: false },
    { side: 1, z: 3.66, dyn: false },
  ];

  seatedSlots.forEach((slot, sIdx) => {
    const pSeed = carSeed * 13 + sIdx * 7 + (slot.side === 1 ? 3 : 0);
    const seated = createSeatedPassenger(commuterAssets, pSeed, slot.dyn);
    seated.root.position.set(slot.side * 0.98, 0.64, slot.z);
    seated.root.rotation.y = slot.side === -1 ? Math.PI * 0.5 : -Math.PI * 0.5;
    car.add(seated.root);
    passengers.push(seated);
  });

  // Standing passengers holding grab poles / looking out panoramic windows (leaving (0,0) & doorways ±2.15 clear!)
  const standingSlots: Array<{ x: number; z: number; yaw: number; holdLeft: boolean; dyn: boolean }> =
    role === 'middle'
      ? [
          { x: -0.34, z: -1.18, yaw: 0.48, holdLeft: false, dyn: false },
          { x: 0.36, z: 1.18, yaw: -0.52, holdLeft: true, dyn: true },
          { x: -0.32, z: 3.32, yaw: 1.35, holdLeft: false, dyn: false },
        ]
      : [
          { x: -0.32, z: -1.18, yaw: 0.42, holdLeft: false, dyn: false },
          { x: 0.22, z: 0.12, yaw: -1.35, holdLeft: false, dyn: true },
          { x: 0.34, z: 1.18, yaw: -0.55, holdLeft: true, dyn: false },
        ];

  standingSlots.forEach((stSlot, sIdx) => {
    const pSeed = carSeed * 19 + 41 + sIdx * 11;
    const rig = createArticulatedCommuter(commuterAssets, pSeed, true);
    rig.root.position.set(stSlot.x, 0.64, stSlot.z);
    rig.root.rotation.y = stSlot.yaw;

    // Natural standing posture inside moving carriage: one arm raised holding grab stanchion or phone
    if (stSlot.holdLeft) {
      rig.leftArm.rotation.set(-1.12, 0.22, 0.18);
    } else {
      rig.rightArm.rotation.set(-1.08, -0.22, -0.16);
    }
    if (rig.hasPhone && stSlot.holdLeft) {
      rig.rightArm.rotation.set(-0.92, -0.25, 0);
      rig.headPivot.rotation.x = 0.22;
    }

    const baseHeadYaw = ((pSeed % 5) - 2) * 0.12;
    rig.headPivot.rotation.y = baseHeadYaw;
    car.add(rig.root);
    passengers.push({
      root: rig.root,
      upperBody: rig.upperBody,
      headPivot: rig.headPivot,
      phase: pSeed * 0.93,
      standing: true,
      dynamicSlot: stSlot.dyn,
      baseHeadYaw,
    });
  });

  const roof = new THREE.Mesh(new THREE.BoxGeometry(carW - 0.08, 0.22, carLen - 0.2), darkRoofMat);
  roof.position.y = carH + 0.12;
  const hvac = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.24, 2.3), bodyMat);
  hvac.position.y = carH + 0.32;
  const interiorLight = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, carLen - 1.2), cabinGlowMat);
  interiorLight.position.y = carH - 0.04;
  car.add(roof, hvac, interiorLight);

  // 5. Twin rail bogies underneath
  for (const bz of [-2.9, 2.9]) {
    const bogie = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.34, 1.7), bogieMat);
    bogie.position.set(0, 0.2, bz);
    car.add(bogie);
  }

  // 6. End bulkheads, gangway bellows, pantograph (middle), or aerodynamic cab nose (front/rear)
  if (role === 'middle') {
    const pantoBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 1.4), darkRoofMat);
    pantoBase.position.set(0, carH + 0.28, 0);
    const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.05, 6), poleMat);
    arm1.position.set(0, carH + 0.65, -0.22);
    arm1.rotation.x = 0.45;
    const contactBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.12), stripeMat);
    contactBar.position.set(0, carH + 1.06, 0.15);
    car.add(pantoBase, arm1, contactBar);

    for (const endSign of [-1, 1] as const) {
      for (const sideX of [-0.95, 0.95]) {
        const bellowPost = new THREE.Mesh(new THREE.BoxGeometry(0.46, 2.15, 0.82), bogieMat);
        bellowPost.position.set(sideX, 1.65, endSign * (carLen * 0.5 + 0.28));
        car.add(bellowPost);
      }
      const bellowTop = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.34, 0.82), bogieMat);
      bellowTop.position.set(0, 2.62, endSign * (carLen * 0.5 + 0.28));
      car.add(bellowTop);
    }
  } else {
    const noseSign = role === 'front' ? 1 : -1;
    const innerSign = -noseSign;

    for (const sideX of [-0.95, 0.95]) {
      const innerPost = new THREE.Mesh(new THREE.BoxGeometry(0.46, 2.15, 0.55), bogieMat);
      innerPost.position.set(sideX, 1.65, innerSign * (carLen * 0.5 + 0.15));
      car.add(innerPost);
    }

    const noseCone = new THREE.Mesh(new THREE.BoxGeometry(carW - 0.12, 1.15, 1.05), bodyMat);
    noseCone.position.set(0, 1.06, noseSign * (carLen * 0.5 + 0.35));
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(carW - 0.26, 1.08, 0.12), clearGlassMat);
    windshield.position.set(0, 2.12, noseSign * (carLen * 0.5 + 0.32));
    windshield.rotation.x = noseSign * -0.26;
    windshield.renderOrder = 3;

    const lampColor = role === 'front' ? 0xf8fafc : 0xef4444;
    const lampMat = new THREE.MeshBasicMaterial({ color: lampColor });
    for (const lx of [-0.88, 0.88]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.2, 0.14), lampMat);
      lamp.position.set(lx, 0.92, noseSign * (carLen * 0.5 + 0.88));
      car.add(lamp);
    }
    const destLed = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.22, 0.1), stripeMat);
    destLed.position.set(0, 2.68, noseSign * (carLen * 0.5 + 0.28));

    car.add(noseCone, windshield, destLed);
  }

  return { group: car, doorLeaves, passengers };
}

export function buildMetroSystem(
  collisionWorld: CollisionWorld,
  isSoftwareGl: boolean,
): MetroSystemHandle {
  const group = new THREE.Group();
  const interactPoints: InteractablePoint[] = [];
  const stationBeacons: StationBeaconRef[] = [];
  const stationWalkables: StationWalkableMeta[] = [];
  const commuterAssets = createMetroCommuterAssets();
  const stationCommuters: StationCommuterAgent[] = [];

  // ==================== 1. CLOSED ELEVATED VIADUCT CURVE PATH ====================
  const curvePath = new THREE.CurvePath<THREE.Vector3>();
  const cornerRadius = 20;
  const nCorners = METRO_LOOP_CORNERS.length;

  for (let i = 0; i < nCorners; i++) {
    const prev = METRO_LOOP_CORNERS[(i - 1 + nCorners) % nCorners];
    const curr = METRO_LOOP_CORNERS[i];
    const next = METRO_LOOP_CORNERS[(i + 1) % nCorners];

    const inDx = Math.sign(curr.x - prev.x);
    const inDz = Math.sign(curr.z - prev.z);
    const outDx = Math.sign(next.x - curr.x);
    const outDz = Math.sign(next.z - curr.z);

    const lineStart = new THREE.Vector3(
      prev.x + inDx * cornerRadius,
      METRO_ELEVATION_Y,
      prev.z + inDz * cornerRadius,
    );
    const lineEnd = new THREE.Vector3(
      curr.x - inDx * cornerRadius,
      METRO_ELEVATION_Y,
      curr.z - inDz * cornerRadius,
    );
    curvePath.add(new THREE.LineCurve3(lineStart, lineEnd));

    const turnCtrl = new THREE.Vector3(curr.x, METRO_ELEVATION_Y, curr.z);
    const turnEnd = new THREE.Vector3(
      curr.x + outDx * cornerRadius,
      METRO_ELEVATION_Y,
      curr.z + outDz * cornerRadius,
    );
    curvePath.add(new THREE.QuadraticBezierCurve3(lineEnd, turnCtrl, turnEnd));
  }

  const totalLoopLength = curvePath.getLength();
  const spacedPts = curvePath.getSpacedPoints(SAMPLE_COUNT);

  const sampleX = new Float32Array(SAMPLE_COUNT);
  const sampleY = new Float32Array(SAMPLE_COUNT);
  const sampleZ = new Float32Array(SAMPLE_COUNT);
  const sampleTanX = new Float32Array(SAMPLE_COUNT);
  const sampleTanZ = new Float32Array(SAMPLE_COUNT);

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const p = spacedPts[i];
    const pNext = spacedPts[(i + 1) % SAMPLE_COUNT];
    sampleX[i] = p.x;
    sampleY[i] = p.y;
    sampleZ[i] = p.z;
    const dx = pNext.x - p.x;
    const dz = pNext.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    sampleTanX[i] = dx / len;
    sampleTanZ[i] = dz / len;
  }

  const sampleLoopPose = (arcS: number, outPos: Vec3): number => {
    const wrapped = ((arcS % totalLoopLength) + totalLoopLength) % totalLoopLength;
    const fIdx = (wrapped / totalLoopLength) * SAMPLE_COUNT;
    const idx0 = Math.floor(fIdx) % SAMPLE_COUNT;
    const idx1 = (idx0 + 1) % SAMPLE_COUNT;
    const frac = fIdx - Math.floor(fIdx);

    outPos.x = sampleX[idx0] + (sampleX[idx1] - sampleX[idx0]) * frac;
    outPos.y = sampleY[idx0] + (sampleY[idx1] - sampleY[idx0]) * frac;
    outPos.z = sampleZ[idx0] + (sampleZ[idx1] - sampleZ[idx0]) * frac;

    const tx = sampleTanX[idx0] + (sampleTanX[idx1] - sampleTanX[idx0]) * frac;
    const tz = sampleTanZ[idx0] + (sampleTanZ[idx1] - sampleTanZ[idx0]) * frac;
    return Math.atan2(tx, tz);
  };

  // Precompute exact arc-length S of all 6 stations sorted along loop
  const stationArcMap = new Map<string, number>();
  for (const st of METRO_STATIONS) {
    let bestIdx = 0;
    let bestD2 = Infinity;
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const dx = sampleX[i] - st.trackX;
      const dz = sampleZ[i] - st.trackZ;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestIdx = i;
      }
    }
    stationArcMap.set(st.id, (bestIdx / SAMPLE_COUNT) * totalLoopLength);
  }

  const stationsOrderedByArc = [...METRO_STATIONS].sort(
    (a, b) => (stationArcMap.get(a.id) ?? 0) - (stationArcMap.get(b.id) ?? 0),
  );

  // ==================== 2. INSTANCED ELEVATED VIADUCT DECK & DUAL STEEL RAILS ====================
  const concreteDeckMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.72,
    metalness: 0.25,
  });
  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.42,
    metalness: 0.78,
  });
  const railSteelMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.22,
    metalness: 0.92,
  });
  const viaductGlowMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
  });

  const deckSegments = 512;
  const segStepLen = totalLoopLength / deckSegments;

  const deckGeo = new THREE.BoxGeometry(5.6, 0.72, segStepLen + 0.35);
  const railPairGeo = new THREE.BoxGeometry(0.16, 0.18, segStepLen + 0.35);
  const sideGlowGeo = new THREE.BoxGeometry(5.76, 0.12, segStepLen + 0.25);

  const deckInst = new THREE.InstancedMesh(deckGeo, concreteDeckMat, deckSegments);
  const leftRailInst = new THREE.InstancedMesh(railPairGeo, railSteelMat, deckSegments);
  const rightRailInst = new THREE.InstancedMesh(railPairGeo, railSteelMat, deckSegments);
  const glowInst = new THREE.InstancedMesh(sideGlowGeo, viaductGlowMat, deckSegments);

  deckInst.castShadow = !isSoftwareGl;
  deckInst.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const poseScratch: Vec3 = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < deckSegments; i++) {
    const s = (i + 0.5) * segStepLen;
    const yaw = sampleLoopPose(s, poseScratch);

    dummy.position.set(poseScratch.x, METRO_ELEVATION_Y - 0.38, poseScratch.z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    deckInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(poseScratch.x, METRO_ELEVATION_Y - 0.24, poseScratch.z);
    dummy.updateMatrix();
    glowInst.setMatrixAt(i, dummy.matrix);

    const perpX = Math.cos(yaw);
    const perpZ = -Math.sin(yaw);
    const railOffset = 0.92;

    dummy.position.set(
      poseScratch.x - perpX * railOffset,
      METRO_ELEVATION_Y + 0.08,
      poseScratch.z - perpZ * railOffset,
    );
    dummy.updateMatrix();
    leftRailInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(
      poseScratch.x + perpX * railOffset,
      METRO_ELEVATION_Y + 0.08,
      poseScratch.z + perpZ * railOffset,
    );
    dummy.updateMatrix();
    rightRailInst.setMatrixAt(i, dummy.matrix);
  }

  deckInst.instanceMatrix.needsUpdate = true;
  leftRailInst.instanceMatrix.needsUpdate = true;
  rightRailInst.instanceMatrix.needsUpdate = true;
  glowInst.instanceMatrix.needsUpdate = true;
  deckInst.computeBoundingSphere();
  leftRailInst.computeBoundingSphere();
  rightRailInst.computeBoundingSphere();
  glowInst.computeBoundingSphere();
  group.add(deckInst, leftRailInst, rightRailInst, glowInst);

  // ==================== 3. WIDE OUTER-SIDEWALK PORTAL FRAMES (ZERO ROAD OBSTRUCTION) ====================
  const portalOffset = 18.2;
  const portalFrames: Array<{ x: number; z: number; axis: 'ns' | 'ew' }> = [];

  for (let i = 0; i < nCorners; i++) {
    const cA = METRO_LOOP_CORNERS[i];
    const cB = METRO_LOOP_CORNERS[(i + 1) % nCorners];
    const isNS = cA.x === cB.x;
    const fixedCoord = isNS ? cA.x : cA.z;
    const minVar = Math.min(isNS ? cA.z : cA.x, isNS ? cB.z : cB.x);
    const maxVar = Math.max(isNS ? cA.z : cA.x, isNS ? cB.z : cB.x);

    for (let v = minVar + 36; v <= maxVar - 36; v += 44) {
      const nearIntersection = ROAD_COORDS.some((rc) => Math.abs(v - rc) < 28);
      if (nearIntersection) continue;
      const wx = isNS ? fixedCoord : v;
      const wz = isNS ? v : fixedCoord;
      const nearStation = METRO_STATIONS.some(
        (st) => Math.hypot(st.trackX - wx, st.trackZ - wz) < 24,
      );
      if (nearStation) continue;
      portalFrames.push({ x: wx, z: wz, axis: isNS ? 'ns' : 'ew' });
    }
  }

  const colGeo = new THREE.BoxGeometry(1.05, METRO_ELEVATION_Y - 0.4, 1.05);
  const beamGeo = new THREE.BoxGeometry(portalOffset * 2 + 1.4, 0.72, 1.15);
  const colInst = new THREE.InstancedMesh(colGeo, concreteDeckMat, portalFrames.length * 2);
  const beamInst = new THREE.InstancedMesh(beamGeo, darkSteelMat, portalFrames.length);
  colInst.castShadow = !isSoftwareGl;

  portalFrames.forEach((pf, idx) => {
    const rotY = pf.axis === 'ns' ? 0 : Math.PI * 0.5;
    const offX = pf.axis === 'ns' ? portalOffset : 0;
    const offZ = pf.axis === 'ns' ? 0 : portalOffset;

    dummy.position.set(pf.x - offX, (METRO_ELEVATION_Y - 0.4) * 0.5, pf.z - offZ);
    dummy.rotation.set(0, rotY, 0);
    dummy.updateMatrix();
    colInst.setMatrixAt(idx * 2, dummy.matrix);

    dummy.position.set(pf.x + offX, (METRO_ELEVATION_Y - 0.4) * 0.5, pf.z + offZ);
    dummy.updateMatrix();
    colInst.setMatrixAt(idx * 2 + 1, dummy.matrix);

    dummy.position.set(pf.x, METRO_ELEVATION_Y - 0.75, pf.z);
    dummy.rotation.set(0, rotY, 0);
    dummy.updateMatrix();
    beamInst.setMatrixAt(idx, dummy.matrix);

    collisionWorld.addBox(`metro_pier_${idx}_a`, pf.x - offX, pf.z - offZ, 1.15, 1.15, 9, 'prop');
    collisionWorld.addBox(`metro_pier_${idx}_b`, pf.x + offX, pf.z + offZ, 1.15, 1.15, 9, 'prop');
  });

  colInst.instanceMatrix.needsUpdate = true;
  beamInst.instanceMatrix.needsUpdate = true;
  colInst.computeBoundingSphere();
  beamInst.computeBoundingSphere();
  group.add(colInst, beamInst);

  // ==================== 4. 6 WALK-UP STATIONS: ESCALATOR + HOLLOW GLASS SKYBRIDGE + ELEVATED PLATFORM ====================
  const canopyGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xbae6fd,
    roughness: 0.08,
    metalness: 0.12,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const platformTileMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.42,
    metalness: 0.15,
  });
  const warmLightMat = new THREE.MeshBasicMaterial({ color: 0xfef3c7 });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.18,
    metalness: 0.9,
  });

  const stationSubtitles = [
    'TURAR JOY VA QARORGOH BEKATI',
    'YASHIL PARK VA KOINOT MUZEYI',
    'MARKAZIY DOWNTOWN VA MUZEYLAR',
    'SANOAT VA KORXONALAR ZONASI',
    'SAVDO MARKAZI VA AVTOSALON',
    'JANUBIY SOHIL VA POYGA STARTI',
  ];

  METRO_STATIONS.forEach((st, idx) => {
    const accentColor = new THREE.Color(st.accentColor);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.88,
      roughness: 0.22,
    });
    stationBeacons.push({
      stationId: st.id,
      material: beaconMat,
      defaultColor: accentColor.clone(),
      ownedState: false,
    });

    const entDx = st.entrancePos.x - st.trackX;
    const entDz = st.entrancePos.z - st.trackZ;
    const entLen = Math.hypot(entDx, entDz) || 1;
    const uOutX = Math.round(entDx / entLen);
    const uOutZ = Math.round(entDz / entLen);
    const uAlongX = -uOutZ;
    const uAlongZ = uOutX;

    const platformWorldPos: Vec3 = {
      x: st.trackX + uOutX * 3.55,
      y: METRO_PLATFORM_TOP_Y,
      z: st.trackZ + uOutZ * 3.55,
    };
    const platformExitYaw = Math.atan2(uOutX, uOutZ);

    stationWalkables.push({
      station: st,
      uOutX,
      uOutZ,
      uAlongX,
      uAlongZ,
      platformPosition: platformWorldPos,
      platformExitYaw,
    });

    // Determine which local X side (+1 or -1) of deckGroup points toward uOut
    const deckRotY = st.axis === 'ns' ? 0 : Math.PI * 0.5;
    const deckLocalPlusXWorldX = Math.round(Math.cos(deckRotY));
    const deckLocalPlusXWorldZ = Math.round(-Math.sin(deckRotY));
    const entranceSide: 1 | -1 =
      deckLocalPlusXWorldX * uOutX + deckLocalPlusXWorldZ * uOutZ >= 0 ? 1 : -1;

    // A) Elevated Station Canopy & Twin Platforms at (st.trackX, 0, st.trackZ)
    const deckGroup = new THREE.Group();
    deckGroup.position.set(st.trackX, 0, st.trackZ);
    deckGroup.rotation.y = deckRotY;
    group.add(deckGroup);

    const platLen = 27;
    for (const side of [-1, 1] as const) {
      const plat = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.56, platLen), platformTileMat);
      plat.position.set(side * 3.55, METRO_ELEVATION_Y + 0.28, 0);
      plat.receiveShadow = true;

      const safetyLine = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, platLen - 0.6), beaconMat);
      safetyLine.position.set(side * 2.18, METRO_PLATFORM_TOP_Y + 0.02, 0);

      // Split the outer glass guard on the Skybridge side so the 3.9m archway is 100% open to walk through!
      if (side === entranceSide) {
        const segLen = (platLen - 3.9) * 0.5;
        for (const zSign of [-1, 1] as const) {
          const guardSeg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.35, segLen), canopyGlassMat);
          guardSeg.position.set(side * 4.95, METRO_PLATFORM_TOP_Y + 0.68, zSign * (1.95 + segLen * 0.5));
          guardSeg.renderOrder = 2;
          deckGroup.add(guardSeg);
        }
        // Archway portal frame welcoming players onto the platform
        for (const zSign of [-1, 1] as const) {
          const archPillar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.85, 0.24), beaconMat);
          archPillar.position.set(side * 4.95, METRO_PLATFORM_TOP_Y + 1.42, zSign * 1.92);
          deckGroup.add(archPillar);
        }
      } else {
        const glassGuard = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.35, platLen), canopyGlassMat);
        glassGuard.position.set(side * 4.95, METRO_PLATFORM_TOP_Y + 0.68, 0);
        glassGuard.renderOrder = 2;
        deckGroup.add(glassGuard);
      }

      // Platform benches on outward & opposite platforms
      for (const bz of [-7.2, 7.2]) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.46, 2.1), darkSteelMat);
        bench.position.set(side * 4.25, METRO_PLATFORM_TOP_Y + 0.23, bz);
        deckGroup.add(bench);
      }

      // Grand station portal columns on outer sidewalk (±18.2m)
      for (const pz of [-9.5, 9.5]) {
        const stPier = new THREE.Mesh(new THREE.BoxGeometry(1.25, METRO_ELEVATION_Y + 3.8, 1.25), darkSteelMat);
        stPier.position.set(side * portalOffset, (METRO_ELEVATION_Y + 3.8) * 0.5, pz);
        deckGroup.add(stPier);
      }

      deckGroup.add(plat, safetyLine);
    }

    for (const pz of [-9.5, 9.5]) {
      const crossGirder = new THREE.Mesh(
        new THREE.BoxGeometry(portalOffset * 2 + 1.6, 0.78, 1.25),
        darkSteelMat,
      );
      crossGirder.position.set(0, METRO_ELEVATION_Y - 0.75, pz);
      deckGroup.add(crossGirder);
    }

    // Vaulted Station Roof Canopy & Glowing Beacon Crown
    const roofFrame = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.45, platLen + 1.4), darkSteelMat);
    roofFrame.position.set(0, METRO_ELEVATION_Y + 4.45, 0);
    const roofGlass = new THREE.Mesh(new THREE.BoxGeometry(9.8, 0.22, platLen + 0.4), canopyGlassMat);
    roofGlass.position.set(0, METRO_ELEVATION_Y + 4.62, 0);
    roofGlass.renderOrder = 2;
    const roofBeaconTrim = new THREE.Mesh(new THREE.BoxGeometry(11.9, 0.28, platLen + 1.7), beaconMat);
    roofBeaconTrim.position.set(0, METRO_ELEVATION_Y + 4.75, 0);
    const lightStrip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, platLen - 2), warmLightMat);
    lightStrip.position.set(0, METRO_ELEVATION_Y + 4.18, 0);
    deckGroup.add(roofFrame, roofGlass, roofBeaconTrim, lightStrip);

    const signTex = createStationSignTexture(
      st.stationNumber,
      st.accentColor,
      stationSubtitles[idx] ?? 'NEXUS METRO LINE',
    );
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });
    for (const side of [-1, 1] as const) {
      const signMesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.55, 6.8), signMat);
      signMesh.position.set(side * 5.75, METRO_ELEVATION_Y + 3.42, 0);
      if (side === -1) signMesh.rotation.y = Math.PI;
      deckGroup.add(signMesh);
    }

    // B) Hollow Walk-Through Glass Skybridge + Full 28-Step Walk-Up Escalator!
    // Oriented so local +Z points along uOut (from track center r = 0 out to street r = 24.2m)
    const accessGroup = new THREE.Group();
    accessGroup.position.set(st.trackX, 0, st.trackZ);
    accessGroup.rotation.y = Math.atan2(uOutX, uOutZ);
    group.add(accessGroup);

    // 1. Hollow Skybridge Corridor (r = 5.0m .. 14.0m, floor top at METRO_PLATFORM_TOP_Y = 9.76m)
    const bridgeSpan = ESCALATOR_TOP_R - SKYBRIDGE_INNER_R; // 9.0m
    const bridgeMidZ = SKYBRIDGE_INNER_R + bridgeSpan * 0.5; // 9.5m
    const bridgeFloor = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.44, bridgeSpan + 0.2), platformTileMat);
    bridgeFloor.position.set(0, METRO_PLATFORM_TOP_Y - 0.22, bridgeMidZ);
    bridgeFloor.receiveShadow = true;
    const bridgeUnderBeam = new THREE.Mesh(new THREE.BoxGeometry(3.75, 0.28, bridgeSpan + 0.2), darkSteelMat);
    bridgeUnderBeam.position.set(0, METRO_PLATFORM_TOP_Y - 0.56, bridgeMidZ);

    for (const wx of [-1.72, 1.72]) {
      const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.75, bridgeSpan), canopyGlassMat);
      sideGlass.position.set(wx, METRO_PLATFORM_TOP_Y + 1.38, bridgeMidZ);
      sideGlass.renderOrder = 2;
      const handrailBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, bridgeSpan), chromeMat);
      handrailBar.position.set(wx - Math.sign(wx) * 0.08, METRO_PLATFORM_TOP_Y + 1.02, bridgeMidZ);
      accessGroup.add(sideGlass, handrailBar);
    }

    const bridgeRoof = new THREE.Mesh(new THREE.BoxGeometry(3.82, 0.24, bridgeSpan + 0.4), darkSteelMat);
    bridgeRoof.position.set(0, METRO_PLATFORM_TOP_Y + 2.86, bridgeMidZ);
    const bridgeBeaconCap = new THREE.Mesh(new THREE.BoxGeometry(3.96, 0.18, bridgeSpan + 0.5), beaconMat);
    bridgeBeaconCap.position.set(0, METRO_PLATFORM_TOP_Y + 3.05, bridgeMidZ);
    const bridgeLight = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, bridgeSpan - 0.6), warmLightMat);
    bridgeLight.position.set(0, METRO_PLATFORM_TOP_Y + 2.7, bridgeMidZ);
    accessGroup.add(bridgeFloor, bridgeUnderBeam, bridgeRoof, bridgeBeaconCap, bridgeLight);

    // 2. Full 28-Step Walk-Up Illuminated Escalator (from r = 22.8m @ Y = 0m up to r = 14.0m @ Y = 9.76m)
    const escRun = ESCALATOR_BOTTOM_R - ESCALATOR_TOP_R; // 8.8m horizontal run
    const escRise = METRO_PLATFORM_TOP_Y; // 9.76m vertical rise
    const escHypot = Math.hypot(escRun, escRise);
    const escPitch = Math.atan2(escRise, escRun); // slopes upward as local Z decreases from 22.8 -> 14.0
    const escMidZ = (ESCALATOR_BOTTOM_R + ESCALATOR_TOP_R) * 0.5; // 18.4m
    const escMidY = escRise * 0.5; // 4.88m

    // Inclined structural steel stringer spine underneath steps
    const escSpine = new THREE.Mesh(new THREE.BoxGeometry(3.52, 0.42, escHypot + 0.4), darkSteelMat);
    escSpine.position.set(0, escMidY - 0.34, escMidZ);
    escSpine.rotation.x = escPitch;
    accessGroup.add(escSpine);

    // 28 distinct metallic escalator steps + accent edge LED strips
    const nSteps = 28;
    const stepGeo = new THREE.BoxGeometry(3.08, 0.36, 0.42);
    const stepLedGeo = new THREE.BoxGeometry(3.1, 0.05, 0.06);
    for (let sIdx = 0; sIdx < nSteps; sIdx++) {
      const t = (sIdx + 0.5) / nSteps;
      const stepZ = ESCALATOR_BOTTOM_R - t * escRun;
      const stepTopY = t * escRise;
      const stepMesh = new THREE.Mesh(stepGeo, platformTileMat);
      stepMesh.position.set(0, stepTopY - 0.18, stepZ);
      stepMesh.receiveShadow = true;

      const ledMesh = new THREE.Mesh(stepLedGeo, beaconMat);
      ledMesh.position.set(0, stepTopY - 0.02, stepZ + 0.19);
      accessGroup.add(stepMesh, ledMesh);
    }

    // Twin inclined chrome balustrades + glass side shields + overhead sloped canopy
    for (const bx of [-1.64, 1.64]) {
      const glassBalustrade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.05, escHypot), canopyGlassMat);
      glassBalustrade.position.set(bx, escMidY + 0.56, escMidZ);
      glassBalustrade.rotation.x = escPitch;
      glassBalustrade.renderOrder = 2;

      const chromeRail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, escHypot + 0.3), chromeMat);
      chromeRail.position.set(bx, escMidY + 1.12, escMidZ);
      chromeRail.rotation.x = escPitch;
      accessGroup.add(glassBalustrade, chromeRail);
    }

    const escCanopyGlass = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.16, escHypot + 0.6), canopyGlassMat);
    escCanopyGlass.position.set(0, escMidY + 3.15, escMidZ);
    escCanopyGlass.rotation.x = escPitch;
    escCanopyGlass.renderOrder = 2;
    const escCanopyTrim = new THREE.Mesh(new THREE.BoxGeometry(3.94, 0.14, escHypot + 0.6), beaconMat);
    escCanopyTrim.position.set(0, escMidY + 3.26, escMidZ);
    escCanopyTrim.rotation.x = escPitch;
    accessGroup.add(escCanopyGlass, escCanopyTrim);

    // Street-level Welcome Portal Arch at the foot of the Escalator (r = 22.8m)
    const footPlinth = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.08, 3.6), platformTileMat);
    footPlinth.position.set(0, 0.04, ESCALATOR_BOTTOM_R + 0.4);
    footPlinth.receiveShadow = true;
    accessGroup.add(footPlinth);

    for (const px of [-2.25, 2.25]) {
      const pCol = new THREE.Mesh(new THREE.BoxGeometry(0.32, 4.1, 0.32), darkSteelMat);
      pCol.position.set(px, 2.05, ESCALATOR_BOTTOM_R + 0.35);
      accessGroup.add(pCol);
    }
    const pavCanopy = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.32, 2.6), darkSteelMat);
    pavCanopy.position.set(0, 4.18, ESCALATOR_BOTTOM_R + 0.35);
    const pavBeaconBand = new THREE.Mesh(new THREE.BoxGeometry(5.38, 0.2, 2.76), beaconMat);
    pavBeaconBand.position.set(0, 4.38, ESCALATOR_BOTTOM_R + 0.35);
    const pavSign = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.15, 0.22), signMat);
    pavSign.position.set(0, 5.08, ESCALATOR_BOTTOM_R + 1.55);
    const pavDownlight = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 1.1), warmLightMat);
    pavDownlight.position.set(0, 3.98, ESCALATOR_BOTTOM_R + 0.45);
    accessGroup.add(pavCanopy, pavBeaconBand, pavSign, pavDownlight);

    // Smart Fare Turnstile Kiosk (offset right at x = +2.65 so escalator mouth is 100% unobstructed)
    const kiosk = new THREE.Mesh(new THREE.BoxGeometry(0.64, 1.5, 0.5), darkSteelMat);
    kiosk.position.set(2.65, 0.78, ESCALATOR_BOTTOM_R + 0.65);
    const kioskScreen = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.4, 0.06), beaconMat);
    kioskScreen.position.set(2.65, 1.15, ESCALATOR_BOTTOM_R + 0.92);
    accessGroup.add(kiosk, kioskScreen);

    // Iconic Illuminated 'M' Metro Street Totem Pylon (offset left at x = -3.65, z = 21.65)
    const totemGroup = new THREE.Group();
    totemGroup.position.set(-3.65, 0, ESCALATOR_BOTTOM_R - 1.1);
    const totemPost = new THREE.Mesh(new THREE.BoxGeometry(0.48, 4.8, 0.48), darkSteelMat);
    totemPost.position.y = 2.4;
    const totemTrim = new THREE.Mesh(new THREE.BoxGeometry(0.56, 3.2, 0.14), beaconMat);
    totemTrim.position.y = 2.1;
    const cubeTex = createTotemCubeTexture(st.accentColor, st.stationNumber);
    const totemCube = new THREE.Mesh(
      new THREE.BoxGeometry(1.28, 1.28, 1.28),
      new THREE.MeshBasicMaterial({ map: cubeTex }),
    );
    totemCube.position.y = 5.35;
    totemGroup.add(totemPost, totemTrim, totemCube);
    accessGroup.add(totemGroup);

    const totemWorldX = st.trackX + uOutX * (ESCALATOR_BOTTOM_R - 1.1) + uAlongX * -3.65;
    const totemWorldZ = st.trackZ + uOutZ * (ESCALATOR_BOTTOM_R - 1.1) + uAlongZ * -3.65;
    collisionWorld.addBox(`${st.id}_totem`, totemWorldX, totemWorldZ, 0.9, 0.9, 6, 'prop');

    // Register BOTH Street-Level Entrance AND Elevated Platform Boarding Interactables!
    interactPoints.push({
      id: `metro_board_street_${st.id}`,
      type: 'metro_station',
      position: {
        x: st.trackX + uOutX * (ESCALATOR_BOTTOM_R + 0.2),
        y: 0,
        z: st.trackZ + uOutZ * (ESCALATOR_BOTTOM_R + 0.2),
      },
      radius: 8.2,
      keyHint: 'F',
      labelKey: 'prompts.boardMetro',
      payloadId: st.id,
    });

    interactPoints.push({
      id: `metro_board_plat_${st.id}`,
      type: 'metro_station',
      position: { ...platformWorldPos },
      radius: 14.0,
      keyHint: 'F',
      labelKey: 'prompts.boardMetro',
      payloadId: st.id,
    });
    // Spawn 9 Articulated Animated Station Commuters for this station (Escalator + Skybridge + Platform + Train Boarding/Alighting!)
    const initialStages: CommuterStage[] = [
      'waiting_platform',
      'waiting_platform',
      'waiting_platform',
      'platform_to_spot',
      'skybridge_in',
      'escalator_up',
      'escalator_up',
      'escalator_down',
      'inside_train_pool',
    ];
    for (let cIdx = 0; cIdx < initialStages.length; cIdx++) {
      const seed = idx * 31 + cIdx * 13 + 7;
      const rig = createArticulatedCommuter(commuterAssets, seed, true);
      group.add(rig.root);

      const doorAlong = DOOR_ALONG_SLOTS[(idx + cIdx) % DOOR_ALONG_SLOTS.length];
      const sideSign = cIdx % 2 === 0 ? 1 : -1;
      const waitAlong = THREE.MathUtils.clamp(doorAlong + sideSign * (0.58 + (cIdx % 3) * 0.16), -12.6, 12.6);
      const waitR = 2.68 + (cIdx % 3) * 0.26;
      const laneOffset = ((cIdx % 3) - 1) * 0.14;
      const stage = initialStages[cIdx];

      let initR = waitR;
      let initAlong = waitAlong;
      let initY = METRO_PLATFORM_TOP_Y;
      let initVis = true;

      if (stage === 'platform_to_spot') {
        initR = 4.25;
        initAlong = 0.68;
      } else if (stage === 'skybridge_in') {
        initR = 11.2;
        initAlong = 0.68 + laneOffset;
      } else if (stage === 'escalator_up') {
        initR = cIdx === 5 ? 20.6 : 16.4;
        initAlong = 0.68 + laneOffset;
        initY = ((ESCALATOR_BOTTOM_R - initR) / (ESCALATOR_BOTTOM_R - ESCALATOR_TOP_R)) * METRO_PLATFORM_TOP_Y;
      } else if (stage === 'escalator_down') {
        initR = 18.2;
        initAlong = -0.68 + laneOffset;
        initY = ((ESCALATOR_BOTTOM_R - initR) / (ESCALATOR_BOTTOM_R - ESCALATOR_TOP_R)) * METRO_PLATFORM_TOP_Y;
      } else if (stage === 'inside_train_pool') {
        initR = 0.62;
        initAlong = doorAlong;
        initY = METRO_ELEVATION_Y + 0.76;
        initVis = false;
      }

      const initYaw = Math.atan2(-uOutX, -uOutZ);
      rig.root.visible = initVis;
      rig.root.position.set(
        st.trackX + uOutX * initR + uAlongX * initAlong,
        initY,
        st.trackZ + uOutZ * initR + uAlongZ * initAlong,
      );
      rig.root.rotation.y = initYaw;

      stationCommuters.push({
        rig,
        stationIdx: idx,
        stage,
        r: initR,
        along: initAlong,
        y: initY,
        rotY: initYaw,
        laneOffset,
        doorAlong,
        waitR,
        waitAlong,
        walkSpeed: 1.95 + (seed % 5) * 0.16,
        walkPhase: seed * 0.85,
        idlePhase: seed * 1.41,
        stateTimer: (cIdx % 4) * 0.28,
      });
    }
  });

  // ==================== 5. 2 AMBIENT SCHEDULED 3-CAR METRO TRAINS + 1 PLAYER RIDE TRAIN ====================
  const createThreeCarTrain = (
    accentHex: number,
    castShadow: boolean,
    trainSeed: number,
  ): MetroCarRig[] => {
    const cFront = createSingleMetroCar(accentHex, 'front', castShadow, commuterAssets, trainSeed * 3 + 1);
    const cMid = createSingleMetroCar(accentHex, 'middle', castShadow, commuterAssets, trainSeed * 3 + 2);
    const cRear = createSingleMetroCar(accentHex, 'rear', castShadow, commuterAssets, trainSeed * 3 + 3);
    group.add(cFront.group, cMid.group, cRear.group);
    return [cFront, cMid, cRear];
  };

  const ambientTrains: AmbientMetroTrain[] = [
    {
      cars: createThreeCarTrain(0x06b6d4, !isSoftwareGl, 1),
      arcS: totalLoopLength * 0.12,
      speed: 25,
      prevSpeed: 25,
      dwellTimer: 0,
      dwellStationId: null,
      lastStationId: '',
      doorOpenRatio: 0,
      stopCounter: 1,
    },
    {
      cars: createThreeCarTrain(0x10b981, !isSoftwareGl, 2),
      arcS: totalLoopLength * 0.62,
      speed: 25,
      prevSpeed: 25,
      dwellTimer: 0,
      dwellStationId: null,
      lastStationId: '',
      doorOpenRatio: 0,
      stopCounter: 2,
    },
  ];

  const playerTrainCars = createThreeCarTrain(0xf59e0b, !isSoftwareGl, 3);
  let playerTrainStopCounter = 5;
  let playerPrevSpeed = 0;

  const refreshCarDynamicPassengers = (cars: MetroCarRig[], stopCounter: number) => {
    for (let c = 0; c < cars.length; c++) {
      const pList = cars[c].passengers;
      for (let i = 0; i < pList.length; i++) {
        const p = pList[i];
        if (p.dynamicSlot) {
          p.root.visible = (stopCounter + c + i) % 3 !== 0;
        }
      }
    }
  };

  const animateTrainPassengers = (
    cars: MetroCarRig[],
    accel: number,
    speed: number,
    elapsed: number,
    dt: number,
  ) => {
    const targetPitch = THREE.MathUtils.clamp(-accel * 0.008, -0.065, 0.065);
    const speedVib = Math.min(1, Math.abs(speed) / 30);
    for (let c = 0; c < cars.length; c++) {
      if (!cars[c].group.visible) continue;
      const pList = cars[c].passengers;
      for (let i = 0; i < pList.length; i++) {
        const p = pList[i];
        if (!p.root.visible) continue;
        const sway =
          Math.sin(elapsed * 2.8 + p.phase) * 0.022 * speedVib +
          Math.sin(elapsed * 1.35 + p.phase) * 0.008;
        if (p.standing) {
          p.upperBody.rotation.z = THREE.MathUtils.damp(
            p.upperBody.rotation.z,
            sway * 1.4,
            7,
            dt,
          );
          p.upperBody.rotation.x = THREE.MathUtils.damp(
            p.upperBody.rotation.x,
            targetPitch + Math.sin(elapsed * 2.1 + p.phase) * 0.015,
            7,
            dt,
          );
        } else {
          p.upperBody.rotation.z = sway * 0.65;
          p.upperBody.rotation.x = Math.sin(elapsed * 1.7 + p.phase) * 0.012;
        }
        p.headPivot.rotation.y = p.baseHeadYaw + Math.sin(elapsed * 0.95 + p.phase) * 0.16;
      }
    }
  };

  const setCarsVisible = (cars: MetroCarRig[], vis: boolean) => {
    for (let i = 0; i < cars.length; i++) {
      cars[i].group.visible = vis;
    }
  };
  setCarsVisible(playerTrainCars, false);

  const positionThreeCarTrain = (cars: MetroCarRig[], leadArcS: number, reverseHeading = false) => {
    const spacing = 9.85;
    const dirSign = reverseHeading ? -1 : 1;
    for (let i = 0; i < 3; i++) {
      const carArc = leadArcS - dirSign * i * spacing;
      const yaw = sampleLoopPose(carArc, poseScratch);
      cars[i].group.position.set(poseScratch.x, METRO_ELEVATION_Y + 0.12, poseScratch.z);
      cars[i].group.rotation.y = reverseHeading ? yaw + Math.PI : yaw;
    }
  };

  // ==================== 6. WALKABLE SURFACE RESOLVER & BOARDING HELPERS ====================
  const isAmbientTrainOpenAtStation = (stationId: string): boolean => {
    for (let i = 0; i < ambientTrains.length; i++) {
      const tr = ambientTrains[i];
      if (tr.dwellStationId === stationId && tr.dwellTimer > 0.25 && tr.doorOpenRatio > 0.55) {
        return true;
      }
    }
    return false;
  };

  const findElevatedPlatformStationAt = (pos: Vec3): StationWalkableMeta | null => {
    for (let i = 0; i < stationWalkables.length; i++) {
      const sw = stationWalkables[i];
      const dx = pos.x - sw.station.trackX;
      const dz = pos.z - sw.station.trackZ;
      const r = dx * sw.uOutX + dz * sw.uOutZ;
      const s = dx * sw.uAlongX + dz * sw.uAlongZ;
      if (pos.y > 4.2 && r >= 1.5 && r <= 15.5 && Math.abs(s) <= 14.0) {
        return sw;
      }
    }
    return null;
  };

  const findBoardableStation = (pos: Vec3): MetroStationConfig | null => {
    const onPlat = findElevatedPlatformStationAt(pos);
    if (onPlat) return onPlat.station;

    let best: MetroStationConfig | null = null;
    let bestD2 = 9.2 * 9.2;
    if (pos.y < 3.8) {
      for (let i = 0; i < stationWalkables.length; i++) {
        const sw = stationWalkables[i];
        const footX = sw.station.trackX + sw.uOutX * (ESCALATOR_BOTTOM_R + 0.2);
        const footZ = sw.station.trackZ + sw.uOutZ * (ESCALATOR_BOTTOM_R + 0.2);
        const dx = pos.x - footX;
        const dz = pos.z - footZ;
        const d2 = dx * dx + dz * dz;
        if (d2 <= bestD2) {
          bestD2 = d2;
          best = sw.station;
        }
      }
    }
    return best;
  };

  const resolveWalkableSurface = (
    x: number,
    z: number,
    currentY: number,
  ): WalkableSurfaceResult => {
    for (let i = 0; i < stationWalkables.length; i++) {
      const sw = stationWalkables[i];
      const dx = x - sw.station.trackX;
      const dz = z - sw.station.trackZ;
      const r = dx * sw.uOutX + dz * sw.uOutZ;
      const s = dx * sw.uAlongX + dz * sw.uAlongZ;

      // 1. Escalator Ramp Zone: r in [14.0, 23.0], |s| <= 1.72
      if (r >= ESCALATOR_TOP_R && r <= ESCALATOR_BOTTOM_R + 0.25 && Math.abs(s) <= 1.78) {
        const t = THREE.MathUtils.clamp(
          (ESCALATOR_BOTTOM_R - r) / (ESCALATOR_BOTTOM_R - ESCALATOR_TOP_R),
          0,
          1,
        );
        const rampY = t * METRO_PLATFORM_TOP_Y;
        // Player enters smoothly from street (r = 22.8, rampY = 0) or walks down from skybridge (currentY ~ 9.76).
        // Meanwhile, someone walking on the sidewalk at r = 18m (currentY = 0, rampY = 5.3m) passes cleanly underneath!
        if (currentY >= rampY - 1.45 && currentY <= rampY + 2.8) {
          const clampedS = rampY > 0.32 ? THREE.MathUtils.clamp(s, -1.5, 1.5) : s;
          return {
            groundY: rampY,
            clampedX: sw.station.trackX + sw.uOutX * r + sw.uAlongX * clampedS,
            clampedZ: sw.station.trackZ + sw.uOutZ * r + sw.uAlongZ * clampedS,
          };
        }
      }

      // 2. Elevated Skybridge & Platform Zone (when player is elevated above y > 6.2m)
      if (currentY > 6.2 && r >= 1.4 && r <= ESCALATOR_TOP_R + 0.35 && Math.abs(s) <= 13.6) {
        if (r > SKYBRIDGE_INNER_R - 0.05) {
          // Inside Hollow Glass Skybridge (r in [4.95, 14.0]) -> keep between ±1.52m glass walls
          const clampedS = THREE.MathUtils.clamp(s, -1.52, 1.52);
          const clampedR = Math.min(r, ESCALATOR_TOP_R + 0.05);
          return {
            groundY: METRO_PLATFORM_TOP_Y,
            clampedX: sw.station.trackX + sw.uOutX * clampedR + sw.uAlongX * clampedS,
            clampedZ: sw.station.trackZ + sw.uOutZ * clampedR + sw.uAlongZ * clampedS,
          };
        } else {
          // On the 27m Outward Station Platform (r in [1.65, 5.0])
          const clampedS = THREE.MathUtils.clamp(s, -13.05, 13.05);
          let clampedR = r;
          // Outer glass guardrails (except the ±1.52m open Skybridge archway)
          if (Math.abs(clampedS) > 1.52 && clampedR > 4.78) {
            clampedR = 4.78;
          }
          // Trackside safety edge: open down to r = 1.65 when a train is stopped with open doors so player can walk inside!
          const minR = isAmbientTrainOpenAtStation(sw.station.id) ? 1.65 : 2.22;
          if (clampedR < minR) {
            clampedR = minR;
          }
          return {
            groundY: METRO_PLATFORM_TOP_Y,
            clampedX: sw.station.trackX + sw.uOutX * clampedR + sw.uAlongX * clampedS,
            clampedZ: sw.station.trackZ + sw.uOutZ * clampedR + sw.uAlongZ * clampedS,
          };
        }
      }
    }

    return {
      groundY: 0,
      clampedX: x,
      clampedZ: z,
    };
  };

  // ==================== 7. ACTIVE PLAYER METRO RIDE STATE (BOTH LIVE_LOOP & EXPRESS) ====================
  let rideActive = false;
  let rideMode: 'express' | 'live_loop' = 'express';
  let rideFromId: string | null = null;
  let rideToId: string | null = null;

  // Express mode interpolation state
  let rideStartArcS = 0;
  let rideSignedDeltaS = 0;
  let rideElapsedSec = 0;
  let rideDurationSec = 5.5;

  // Live-loop physical ride state (press E or walk through open doors!)
  let liveCenterArcS = 0;
  let liveSpeed = 0;
  let liveDwellTimer = 0;
  let liveCurrentStationId: string | null = null;
  let liveLastStoppedId = '';
  let liveTargetStopStationId: string | null = null;
  let playerDoorOpenRatio = 0;

  const riderWorldScratch: Vec3 = { x: 0, y: METRO_ELEVATION_Y + 0.76, z: 0 };

  const getNextOrderedStation = (currentId: string): MetroStationConfig => {
    const idx = stationsOrderedByArc.findIndex((s) => s.id === currentId);
    if (idx < 0) return stationsOrderedByArc[0];
    return stationsOrderedByArc[(idx + 1) % stationsOrderedByArc.length];
  };

  const findStationByArcClosest = (arcS: number): { station: MetroStationConfig; dist: number } => {
    let best = METRO_STATIONS[0];
    let bestDiff = Infinity;
    for (let i = 0; i < METRO_STATIONS.length; i++) {
      const st = METRO_STATIONS[i];
      const stS = stationArcMap.get(st.id) ?? 0;
      let diff = Math.abs(arcS - stS);
      diff = Math.min(diff, totalLoopLength - diff);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = st;
      }
    }
    return { station: best, dist: bestDiff };
  };

  // Track last train stop tag per station so alighting passengers step out once per train arrival
  const stationLastStopTag = new Map<string, string>();

  const getOpenTrainStopAtStation = (
    stationId: string,
  ): { open: boolean; canStartBoard: boolean; stopTag: string } => {
    // Check live player train first (so player sees commuters board & exit THEIR train at stations!)
    if (
      rideActive &&
      rideMode === 'live_loop' &&
      liveCurrentStationId === stationId &&
      playerDoorOpenRatio > 0.55
    ) {
      return {
        open: true,
        canStartBoard: liveDwellTimer > 0.85,
        stopTag: `player_${playerTrainStopCounter}`,
      };
    }

    for (let i = 0; i < ambientTrains.length; i++) {
      const tr = ambientTrains[i];
      if (tr.dwellStationId === stationId && tr.dwellTimer > 0.2 && tr.doorOpenRatio > 0.55) {
        return {
          open: true,
          canStartBoard: tr.dwellTimer > 0.85,
          stopTag: `amb_${i}_${tr.stopCounter}`,
        };
      }
    }

    return { open: false, canStartBoard: false, stopTag: '' };
  };

  const stepCommuterToward = (
    c: StationCommuterAgent,
    sw: StationWalkableMeta,
    targetR: number,
    targetAlong: number,
    speed: number,
    dt: number,
  ): boolean => {
    const dr = targetR - c.r;
    const da = targetAlong - c.along;
    const dist = Math.hypot(dr, da);
    if (dist <= 0.001) return true;

    const step = speed * dt;
    const dirR = dr / dist;
    const dirA = da / dist;
    const worldDirX = sw.uOutX * dirR + sw.uAlongX * dirA;
    const worldDirZ = sw.uOutZ * dirR + sw.uAlongZ * dirA;
    const targetYaw = Math.atan2(worldDirX, worldDirZ);

    let yawDiff = targetYaw - c.rotY;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    c.rotY += yawDiff * Math.min(1, dt * 10);

    if (dist <= step) {
      c.r = targetR;
      c.along = targetAlong;
      return true;
    }
    c.r += dirR * step;
    c.along += dirA * step;
    return false;
  };

  const reassignDoorTarget = (c: StationCommuterAgent, seedBump: number) => {
    const slotIdx = Math.abs(Math.round(c.idlePhase * 7 + seedBump)) % DOOR_ALONG_SLOTS.length;
    c.doorAlong = DOOR_ALONG_SLOTS[slotIdx];
    const sideSign = seedBump % 2 === 0 ? 1 : -1;
    c.waitAlong = THREE.MathUtils.clamp(c.doorAlong + sideSign * 0.64, -12.6, 12.6);
    c.waitR = 2.66 + (seedBump % 3) * 0.25;
  };

  const stepStationCommuters = (dt: number, elapsed: number, playerPos?: Vec3) => {
    // 1. Trigger 2-3 Alighting Passengers whenever a train newly opens its doors at any station!
    for (let sIdx = 0; sIdx < stationWalkables.length; sIdx++) {
      const sw = stationWalkables[sIdx];
      const stopInfo = getOpenTrainStopAtStation(sw.station.id);
      if (stopInfo.open && stopInfo.stopTag && stationLastStopTag.get(sw.station.id) !== stopInfo.stopTag) {
        stationLastStopTag.set(sw.station.id, stopInfo.stopTag);

        let spawnedAlighters = 0;
        for (let i = 0; i < stationCommuters.length && spawnedAlighters < 3; i++) {
          const c = stationCommuters[i];
          if (c.stationIdx !== sIdx) continue;
          if (
            c.stage === 'inside_train_pool' ||
            (spawnedAlighters < 2 && c.stage === 'street_depart')
          ) {
            const dAlong =
              DOOR_ALONG_SLOTS[(sIdx + spawnedAlighters * 2 + 1) % DOOR_ALONG_SLOTS.length];
            c.stage = 'alighting_train';
            c.doorAlong = dAlong;
            c.r = 0.62;
            c.along = dAlong + (spawnedAlighters - 1) * 0.18;
            c.y = METRO_ELEVATION_Y + 0.76;
            c.rotY = Math.atan2(sw.uOutX, sw.uOutZ);
            c.stateTimer = spawnedAlighters * 0.22;
            c.rig.root.visible = true;
            spawnedAlighters++;
          }
        }
      }
    }

    // 2. Advance every Station Commuter along Escalator <-> Skybridge <-> Platform <-> Open Train Doors
    for (let i = 0; i < stationCommuters.length; i++) {
      const c = stationCommuters[i];
      const sw = stationWalkables[c.stationIdx];
      const stopInfo = getOpenTrainStopAtStation(sw.station.id);
      let movingSpeed = 0;
      let pitchLean = 0;

      switch (c.stage) {
        case 'inside_train_pool': {
          c.rig.root.visible = false;
          c.stateTimer += dt;
          // If no train arrived for a while, recycle as an arriving street commuter so escalators stay lively
          if (c.stateTimer > 11.5) {
            c.stateTimer = 0;
            c.stage = 'street_approach';
            c.r = ESCALATOR_BOTTOM_R + 2.4;
            c.along = 0.9 + c.laneOffset * 2;
            c.y = 0;
            c.rotY = Math.atan2(-sw.uOutX, -sw.uOutZ);
            c.rig.root.visible = true;
            reassignDoorTarget(c, i + Math.floor(elapsed));
          }
          break;
        }

        case 'street_approach': {
          c.y = 0;
          movingSpeed = c.walkSpeed;
          const done = stepCommuterToward(
            c,
            sw,
            ESCALATOR_BOTTOM_R,
            0.68 + c.laneOffset,
            movingSpeed,
            dt,
          );
          if (done) {
            c.stage = 'escalator_up';
          }
          break;
        }

        case 'escalator_up': {
          movingSpeed = c.walkSpeed * 1.12;
          pitchLean = 0.08;
          const done = stepCommuterToward(
            c,
            sw,
            ESCALATOR_TOP_R,
            0.68 + c.laneOffset,
            movingSpeed,
            dt,
          );
          const t = THREE.MathUtils.clamp(
            (ESCALATOR_BOTTOM_R - c.r) / (ESCALATOR_BOTTOM_R - ESCALATOR_TOP_R),
            0,
            1,
          );
          c.y = t * METRO_PLATFORM_TOP_Y;
          if (done) {
            c.y = METRO_PLATFORM_TOP_Y;
            c.stage = 'skybridge_in';
          }
          break;
        }

        case 'skybridge_in': {
          c.y = METRO_PLATFORM_TOP_Y;
          movingSpeed = c.walkSpeed;
          const done = stepCommuterToward(c, sw, 4.35, 0.68 + c.laneOffset, movingSpeed, dt);
          if (done) {
            c.stage = 'platform_to_spot';
          }
          break;
        }

        case 'platform_to_spot': {
          c.y = METRO_PLATFORM_TOP_Y;
          movingSpeed = c.walkSpeed * 0.95;
          const done = stepCommuterToward(c, sw, c.waitR, c.waitAlong, movingSpeed, dt);
          if (done) {
            c.stage = 'waiting_platform';
            c.stateTimer = (i % 3) * 0.28 + 0.2;
          }
          break;
        }

        case 'waiting_platform': {
          c.y = METRO_PLATFORM_TOP_Y;
          movingSpeed = 0;
          // Face tracks (-uOut) waiting for the next train
          const trackFaceYaw = Math.atan2(-sw.uOutX, -sw.uOutZ);
          let diff = trackFaceYaw - c.rotY;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          c.rotY += diff * Math.min(1, dt * 6);

          if (stopInfo.canStartBoard) {
            c.stateTimer -= dt;
            if (c.stateTimer <= 0) {
              c.stage = 'boarding_train';
            }
          } else {
            c.stateTimer = (i % 3) * 0.25 + 0.18;
          }
          break;
        }

        case 'boarding_train': {
          // If doors started closing before commuter crossed yellow safety line, step back politely
          if (!stopInfo.open && c.r > 1.95) {
            c.stage = 'platform_to_spot';
            break;
          }
          movingSpeed = c.walkSpeed * 1.24;
          // Align tightly with open doorway first, then walk straight inside cabin (r -> 0.58)
          const targetAlong = c.doorAlong;
          const targetR = Math.abs(c.along - targetAlong) > 0.32 ? Math.max(2.2, c.r) : 0.56;
          const done = stepCommuterToward(c, sw, targetR, targetAlong, movingSpeed, dt);
          c.y =
            c.r < 1.85
              ? THREE.MathUtils.lerp(METRO_ELEVATION_Y + 0.76, METRO_PLATFORM_TOP_Y, Math.max(0, (c.r - 1.15) / 0.7))
              : METRO_PLATFORM_TOP_Y;
          if (done && c.r <= 0.62) {
            c.stage = 'inside_train_pool';
            c.stateTimer = 0;
            c.rig.root.visible = false;
          }
          break;
        }

        case 'alighting_train': {
          if (c.stateTimer > 0) {
            c.stateTimer -= dt;
            break;
          }
          movingSpeed = c.walkSpeed * 1.18;
          const done = stepCommuterToward(c, sw, 3.35, c.doorAlong, movingSpeed, dt);
          c.y =
            c.r < 1.85
              ? THREE.MathUtils.lerp(METRO_ELEVATION_Y + 0.76, METRO_PLATFORM_TOP_Y, Math.max(0, (c.r - 1.15) / 0.7))
              : METRO_PLATFORM_TOP_Y;
          if (done) {
            c.y = METRO_PLATFORM_TOP_Y;
            c.stage = 'platform_to_bridge';
          }
          break;
        }

        case 'platform_to_bridge': {
          c.y = METRO_PLATFORM_TOP_Y;
          movingSpeed = c.walkSpeed;
          const done = stepCommuterToward(
            c,
            sw,
            4.55,
            -0.68 + c.laneOffset,
            movingSpeed,
            dt,
          );
          if (done) {
            c.stage = 'skybridge_out';
          }
          break;
        }

        case 'skybridge_out': {
          c.y = METRO_PLATFORM_TOP_Y;
          movingSpeed = c.walkSpeed;
          const done = stepCommuterToward(
            c,
            sw,
            ESCALATOR_TOP_R,
            -0.68 + c.laneOffset,
            movingSpeed,
            dt,
          );
          if (done) {
            c.stage = 'escalator_down';
          }
          break;
        }

        case 'escalator_down': {
          movingSpeed = c.walkSpeed * 1.1;
          pitchLean = -0.05;
          const done = stepCommuterToward(
            c,
            sw,
            ESCALATOR_BOTTOM_R,
            -0.68 + c.laneOffset,
            movingSpeed,
            dt,
          );
          const t = THREE.MathUtils.clamp(
            (ESCALATOR_BOTTOM_R - c.r) / (ESCALATOR_BOTTOM_R - ESCALATOR_TOP_R),
            0,
            1,
          );
          c.y = t * METRO_PLATFORM_TOP_Y;
          if (done) {
            c.y = 0;
            c.stage = 'street_depart';
          }
          break;
        }

        case 'street_depart': {
          c.y = 0;
          movingSpeed = c.walkSpeed;
          const done = stepCommuterToward(
            c,
            sw,
            ESCALATOR_BOTTOM_R + 2.6,
            -1.05 + c.laneOffset * 2,
            movingSpeed,
            dt,
          );
          if (done) {
            reassignDoorTarget(c, i + Math.floor(elapsed));
            c.stage = 'street_approach';
          }
          break;
        }
      }

      if (!c.rig.root.visible) continue;

      const wx = sw.station.trackX + sw.uOutX * c.r + sw.uAlongX * c.along;
      const wz = sw.station.trackZ + sw.uOutZ * c.r + sw.uAlongZ * c.along;
      c.rig.root.position.set(wx, c.y, wz);
      c.rig.root.rotation.y = c.rotY;

      // Skip detailed limb swing if very far from active player camera (> 235m)
      if (playerPos) {
        const pdx = wx - playerPos.x;
        const pdz = wz - playerPos.z;
        if (pdx * pdx + pdz * pdz > 235 * 235) continue;
      }

      if (movingSpeed > 0.05) {
        c.walkPhase += dt * movingSpeed * 3.85;
        const swing = Math.sin(c.walkPhase) * 0.56;
        c.rig.leftLeg.rotation.x = swing;
        c.rig.rightLeg.rotation.x = -swing;
        c.rig.leftArm.rotation.x = -swing * 0.72;
        c.rig.rightArm.rotation.x = c.rig.hasPhone
          ? -0.82 + swing * 0.12
          : c.rig.hasBriefcase
            ? swing * 0.24
            : swing * 0.72;
        c.rig.upperBody.rotation.x = pitchLean + 0.04;
        c.rig.upperBody.position.y = 0.85 + Math.abs(Math.cos(c.walkPhase)) * 0.022;
        c.rig.headPivot.rotation.y = Math.sin(elapsed * 0.9 + c.idlePhase) * 0.08;
        c.rig.headPivot.rotation.x = c.rig.hasPhone ? 0.2 : 0;
      } else {
        c.rig.leftLeg.rotation.x = THREE.MathUtils.damp(c.rig.leftLeg.rotation.x, 0, 10, dt);
        c.rig.rightLeg.rotation.x = THREE.MathUtils.damp(c.rig.rightLeg.rotation.x, 0, 10, dt);
        c.rig.leftArm.rotation.x = THREE.MathUtils.damp(c.rig.leftArm.rotation.x, 0, 10, dt);
        const idleRightArm = c.rig.hasPhone ? -0.92 : 0;
        c.rig.rightArm.rotation.x = THREE.MathUtils.damp(c.rig.rightArm.rotation.x, idleRightArm, 10, dt);
        c.rig.upperBody.rotation.x = THREE.MathUtils.damp(c.rig.upperBody.rotation.x, 0, 8, dt);
        c.rig.upperBody.position.y = 0.85 + Math.sin(elapsed * 2.1 + c.idlePhase) * 0.008;
        // Waiting commuters glance down the viaduct toward oncoming trains!
        c.rig.headPivot.rotation.y = c.rig.hasPhone
          ? Math.sin(elapsed * 0.8 + c.idlePhase) * 0.06
          : Math.sin(elapsed * 1.15 + c.idlePhase) * 0.34;
        c.rig.headPivot.rotation.x = c.rig.hasPhone ? 0.24 : 0;
      }
    }
  };

  const startRide = (fromStationId: string, toStationId: string): boolean => {
    const fromSt = METRO_STATIONS.find((s) => s.id === fromStationId) ?? METRO_STATIONS[0];
    const toSt = METRO_STATIONS.find((s) => s.id === toStationId);
    if (!toSt) return false;

    const sFrom = stationArcMap.get(fromSt.id) ?? 0;
    const sTo = stationArcMap.get(toSt.id) ?? 0;

    let delta = sTo - sFrom;
    if (delta > totalLoopLength * 0.5) delta -= totalLoopLength;
    if (delta < -totalLoopLength * 0.5) delta += totalLoopLength;
    if (Math.abs(delta) < 5) {
      delta = 180;
    }

    rideActive = true;
    rideMode = 'express';
    rideFromId = fromSt.id;
    rideToId = toSt.id;
    rideStartArcS = sFrom;
    rideSignedDeltaS = delta;
    rideElapsedSec = 0;
    rideDurationSec = Math.max(4.4, Math.min(7.2, 3.2 + Math.abs(delta) / 260));
    playerDoorOpenRatio = 0.85;
    playerTrainStopCounter++;
    refreshCarDynamicPassengers(playerTrainCars, playerTrainStopCounter);
    setCarsVisible(playerTrainCars, true);
    setCarDoorsOpenRatio(playerTrainCars, playerDoorOpenRatio);
    positionThreeCarTrain(
      playerTrainCars,
      rideStartArcS + (rideSignedDeltaS < 0 ? -9.85 : 9.85),
      rideSignedDeltaS < 0,
    );
    return true;
  };

  const boardLiveTrain = (stationId?: string | null): MetroStationConfig | null => {
    const st =
      (stationId ? METRO_STATIONS.find((s) => s.id === stationId) : null) ?? METRO_STATIONS[0];
    if (!st) return null;

    const stArc = stationArcMap.get(st.id) ?? 0;
    const nextSt = getNextOrderedStation(st.id);

    // Clear any ambient train currently overlapping this station so meshes don't overlap
    for (let i = 0; i < ambientTrains.length; i++) {
      const tr = ambientTrains[i];
      let diff = Math.abs(tr.arcS - stArc);
      diff = Math.min(diff, totalLoopLength - diff);
      if (diff < 45) {
        playerTrainStopCounter = tr.stopCounter;
        tr.arcS = (stArc + totalLoopLength * 0.35 + i * 120) % totalLoopLength;
        tr.dwellTimer = 0;
        tr.dwellStationId = null;
      }
    }

    rideActive = true;
    rideMode = 'live_loop';
    rideFromId = st.id;
    rideToId = nextSt.id;
    liveCenterArcS = stArc;
    liveSpeed = 0;
    playerPrevSpeed = 0;
    liveDwellTimer = 1.15; // Brief pause so fellow boarding commuters finish stepping in before doors close!
    liveCurrentStationId = st.id;
    liveLastStoppedId = st.id;
    liveTargetStopStationId = null;
    playerDoorOpenRatio = 1.0;

    refreshCarDynamicPassengers(playerTrainCars, playerTrainStopCounter);
    setCarsVisible(playerTrainCars, true);
    setCarDoorsOpenRatio(playerTrainCars, 1.0);
    positionThreeCarTrain(playerTrainCars, liveCenterArcS + 9.85, false);
    return st;
  };

  const setDestinationWhileRiding = (toStationId: string): boolean => {
    if (!rideActive) return false;
    const target = METRO_STATIONS.find((s) => s.id === toStationId);
    if (!target) return false;
    if (rideMode === 'live_loop') {
      liveTargetStopStationId = target.id;
      rideToId = target.id;
      return true;
    }
    return false;
  };

  const disembarkLiveTrain = (): DisembarkResult | null => {
    if (!rideActive) return null;
    const targetSt =
      (rideMode === 'live_loop' && liveCurrentStationId
        ? METRO_STATIONS.find((s) => s.id === liveCurrentStationId)
        : null) ??
      (rideMode === 'express' && rideToId
        ? METRO_STATIONS.find((s) => s.id === rideToId)
        : null) ??
      findStationByArcClosest(liveCenterArcS).station;

    const sw = stationWalkables.find((w) => w.station.id === targetSt.id) ?? stationWalkables[0];

    // Park one ambient train right at this station with open doors so the train & fellow passengers stay visibly beside the player!
    const stArc = stationArcMap.get(sw.station.id) ?? 0;
    ambientTrains[0].arcS = stArc;
    ambientTrains[0].speed = 0;
    ambientTrains[0].prevSpeed = 0;
    ambientTrains[0].dwellTimer = 7.5;
    ambientTrains[0].dwellStationId = sw.station.id;
    ambientTrains[0].lastStationId = sw.station.id;
    ambientTrains[0].doorOpenRatio = 1.0;
    ambientTrains[0].stopCounter++;
    refreshCarDynamicPassengers(ambientTrains[0].cars, ambientTrains[0].stopCounter);
    setCarDoorsOpenRatio(ambientTrains[0].cars, 1.0);
    positionThreeCarTrain(ambientTrains[0].cars, stArc + 9.85, false);

    rideActive = false;
    rideFromId = null;
    rideToId = null;
    liveCurrentStationId = null;
    liveTargetStopStationId = null;
    setCarsVisible(playerTrainCars, false);

    return {
      station: sw.station,
      position: { ...sw.platformPosition },
      yaw: sw.platformExitYaw,
    };
  };

  const skipRideImmediate = (): MetroStationConfig | null => {
    if (!rideActive) return null;
    const destId = rideToId ?? liveCurrentStationId;
    const dest =
      (destId ? METRO_STATIONS.find((s) => s.id === destId) : null) ??
      findStationByArcClosest(liveCenterArcS).station;
    rideActive = false;
    rideFromId = null;
    rideToId = null;
    rideElapsedSec = 0;
    liveCurrentStationId = null;
    liveTargetStopStationId = null;
    setCarsVisible(playerTrainCars, false);
    return dest;
  };

  const update: MetroSystemHandle['update'] = (dt, elapsed, ownedProperties, playerPos) => {
    let justStoppedStation: MetroStationConfig | null = null;
    let autoBoardedStation: MetroStationConfig | null = null;
    const safeDt = Math.max(0.001, dt);

    // 1. Update Station Ownership Beacons (turns Emerald Green when owned!)
    if (ownedProperties) {
      for (let i = 0; i < stationBeacons.length; i++) {
        const ref = stationBeacons[i];
        const isOwned = ownedProperties.includes(ref.stationId);
        if (isOwned !== ref.ownedState) {
          ref.ownedState = isOwned;
          const col = isOwned ? OWNED_EMERALD : ref.defaultColor;
          ref.material.color.copy(col);
          ref.material.emissive.copy(col);
          ref.material.emissiveIntensity = isOwned ? 1.08 : 0.88;
        }
      }
    }

    // Check if the player is currently standing on or climbing up to an Elevated Metro Platform!
    const waitingPlatformMeta =
      !rideActive && playerPos ? findElevatedPlatformStationAt(playerPos) : null;
    const waitingStArc = waitingPlatformMeta
      ? stationArcMap.get(waitingPlatformMeta.station.id) ?? 0
      : null;

    let summonedTrainIdx = -1;
    if (waitingPlatformMeta && waitingStArc !== null) {
      let bestForwardDist = Infinity;
      for (let tIdx = 0; tIdx < ambientTrains.length; tIdx++) {
        const tr = ambientTrains[tIdx];
        if (tr.dwellStationId === waitingPlatformMeta.station.id && tr.dwellTimer > 0) {
          summonedTrainIdx = -1;
          bestForwardDist = 0;
          break;
        }
        const fwdDist =
          ((waitingStArc - tr.arcS) % totalLoopLength + totalLoopLength) % totalLoopLength;
        if (fwdDist < bestForwardDist) {
          bestForwardDist = fwdDist;
          summonedTrainIdx = tIdx;
        }
      }
      if (summonedTrainIdx >= 0) {
        const tr = ambientTrains[summonedTrainIdx];
        if (tr.dwellTimer > 0 && tr.dwellStationId !== waitingPlatformMeta.station.id) {
          tr.dwellTimer = 0;
          tr.dwellStationId = null;
        }
        if (bestForwardDist > 150) {
          tr.arcS = ((waitingStArc - 95) % totalLoopLength + totalLoopLength) % totalLoopLength;
          tr.dwellTimer = 0;
          tr.dwellStationId = null;
          tr.lastStationId = '';
          tr.speed = 46;
        } else if (bestForwardDist <= 50) {
          summonedTrainIdx = -1;
        }
      }
    }

    // 2. Step Ambient Scheduled 3-Car Metro Trains + Animated Sliding Doors + Onboard Passengers
    for (let tIdx = 0; tIdx < ambientTrains.length; tIdx++) {
      const tr = ambientTrains[tIdx];
      tr.prevSpeed = tr.speed;

      if (tr.dwellTimer > 0) {
        if (waitingPlatformMeta && tr.dwellStationId === waitingPlatformMeta.station.id) {
          tr.dwellTimer = Math.max(tr.dwellTimer, 3.5);
        } else {
          tr.dwellTimer = Math.max(0, tr.dwellTimer - dt);
        }
        tr.speed = 0;
        const wantOpen = tr.dwellTimer > 0.45 ? 1 : 0;
        tr.doorOpenRatio = THREE.MathUtils.damp(tr.doorOpenRatio, wantOpen, 9, dt);
        if (tr.dwellTimer <= 0) {
          tr.dwellStationId = null;
        }
      } else {
        tr.doorOpenRatio = THREE.MathUtils.damp(tr.doorOpenRatio, 0, 10, dt);

        let minStationDist = Infinity;
        let hitStation: MetroStationConfig | null = null;
        for (let sIdx = 0; sIdx < METRO_STATIONS.length; sIdx++) {
          const st = METRO_STATIONS[sIdx];
          const stS = stationArcMap.get(st.id) ?? 0;
          let diff = Math.abs(tr.arcS - stS);
          diff = Math.min(diff, totalLoopLength - diff);
          if (diff < minStationDist) {
            minStationDist = diff;
            hitStation = st;
          }
        }

        const isSummoned = tIdx === summonedTrainIdx;
        const shouldStopHere =
          hitStation &&
          minStationDist < 3.4 &&
          tr.lastStationId !== hitStation.id &&
          (!isSummoned || hitStation.id === waitingPlatformMeta?.station.id);

        if (shouldStopHere && hitStation) {
          tr.arcS = stationArcMap.get(hitStation.id) ?? tr.arcS;
          tr.lastStationId = hitStation.id;
          tr.dwellStationId = hitStation.id;
          tr.dwellTimer = waitingPlatformMeta?.station.id === hitStation.id ? 8.0 : 4.2;
          tr.speed = 0;
          tr.stopCounter++;
          refreshCarDynamicPassengers(tr.cars, tr.stopCounter);
          if (waitingPlatformMeta?.station.id === hitStation.id) {
            justStoppedStation = hitStation;
          }
        } else {
          if (minStationDist > 18) {
            tr.lastStationId = '';
          }
          const cruiseSpd = isSummoned ? 52 : 27;
          const targetSpd =
            !isSummoned && minStationDist < 28 ? 11 + (minStationDist / 28) * 16 : cruiseSpd;
          tr.speed += (targetSpd - tr.speed) * Math.min(1, dt * 4.5);
          tr.arcS = (tr.arcS + tr.speed * dt) % totalLoopLength;
        }
      }

      setCarDoorsOpenRatio(tr.cars, tr.doorOpenRatio);
      positionThreeCarTrain(tr.cars, tr.arcS + 9.85, false);

      // Animate onboard passengers if within view distance
      let nearTrain = true;
      if (playerPos) {
        const midPos = tr.cars[1].group.position;
        const dx = midPos.x - playerPos.x;
        const dz = midPos.z - playerPos.z;
        nearTrain = dx * dx + dz * dz < 260 * 260;
      }
      if (nearTrain) {
        const accel = (tr.speed - tr.prevSpeed) / safeDt;
        animateTrainPassengers(tr.cars, accel, tr.speed, elapsed, dt);
      }
    }

    // 3. Walk-In Open-Door Boarding Detection!
    if (!rideActive && waitingPlatformMeta && playerPos && playerPos.y > 8.2) {
      const dx = playerPos.x - waitingPlatformMeta.station.trackX;
      const dz = playerPos.z - waitingPlatformMeta.station.trackZ;
      const r = dx * waitingPlatformMeta.uOutX + dz * waitingPlatformMeta.uOutZ;
      const s = dx * waitingPlatformMeta.uAlongX + dz * waitingPlatformMeta.uAlongZ;
      if (
        r < 2.15 &&
        Math.abs(s) < 11.8 &&
        isAmbientTrainOpenAtStation(waitingPlatformMeta.station.id)
      ) {
        const boarded = boardLiveTrain(waitingPlatformMeta.station.id);
        if (boarded) {
          autoBoardedStation = boarded;
        }
      }
    }

    // 4. Step Active Player Ride (Live-Loop OR Express)
    let arrivedStation: MetroStationConfig | null = null;
    let riderYaw = 0;
    let stepResult: MetroFrameStep | null = null;

    if (rideActive && rideMode === 'live_loop') {
      const prevSpd = liveSpeed;
      if (liveDwellTimer > 0) {
        liveDwellTimer = Math.max(0, liveDwellTimer - dt);
        liveSpeed = 0;
        const wantDoors = liveDwellTimer > 0.65 ? 1 : 0;
        playerDoorOpenRatio = THREE.MathUtils.damp(playerDoorOpenRatio, wantDoors, 10, dt);

        if (liveDwellTimer <= 0 && liveCurrentStationId) {
          const nextSt = getNextOrderedStation(liveCurrentStationId);
          rideFromId = liveCurrentStationId;
          if (!liveTargetStopStationId) {
            rideToId = nextSt.id;
          }
          liveCurrentStationId = null;
        }
      } else {
        playerDoorOpenRatio = THREE.MathUtils.damp(playerDoorOpenRatio, 0, 10, dt);

        const upcomingSt =
          (rideFromId ? getNextOrderedStation(rideFromId) : null) ?? stationsOrderedByArc[0];
        const upcomingArc = stationArcMap.get(upcomingSt.id) ?? 0;
        const distToNext =
          ((upcomingArc - liveCenterArcS) % totalLoopLength + totalLoopLength) % totalLoopLength;

        if (distToNext < 3.6 && liveLastStoppedId !== upcomingSt.id) {
          liveCenterArcS = upcomingArc;
          liveLastStoppedId = upcomingSt.id;
          liveCurrentStationId = upcomingSt.id;
          liveSpeed = 0;
          playerTrainStopCounter++;
          refreshCarDynamicPassengers(playerTrainCars, playerTrainStopCounter);
          justStoppedStation = upcomingSt;

          if (liveTargetStopStationId === upcomingSt.id) {
            arrivedStation = upcomingSt;
            rideActive = false;
            rideFromId = null;
            rideToId = null;
            liveCurrentStationId = null;
            liveTargetStopStationId = null;
            setCarsVisible(playerTrainCars, false);

            ambientTrains[0].arcS = upcomingArc;
            ambientTrains[0].speed = 0;
            ambientTrains[0].prevSpeed = 0;
            ambientTrains[0].dwellTimer = 7.5;
            ambientTrains[0].dwellStationId = upcomingSt.id;
            ambientTrains[0].lastStationId = upcomingSt.id;
            ambientTrains[0].doorOpenRatio = 1.0;
            ambientTrains[0].stopCounter = playerTrainStopCounter;
            refreshCarDynamicPassengers(ambientTrains[0].cars, ambientTrains[0].stopCounter);
            setCarDoorsOpenRatio(ambientTrains[0].cars, 1.0);
            positionThreeCarTrain(ambientTrains[0].cars, upcomingArc + 9.85, false);

            stepResult = {
              rideState: {
                active: false,
                fromStationId: null,
                toStationId: null,
                progress: 1,
                mode: 'live_loop',
                currentStationId: null,
                doorsOpen: true,
              },
              ridingNow: false,
              riderPosition: { ...upcomingSt.arrivalPos },
              riderYaw: upcomingSt.arrivalYaw,
              arrivedStation,
              justStoppedStation,
              autoBoardedStation,
            };
          } else {
            liveDwellTimer = 4.6;
          }
        } else {
          if (distToNext > 22) {
            liveLastStoppedId = '';
          }
          const targetSpd = distToNext < 42 ? 10 + (distToNext / 42) * 28 : 38;
          liveSpeed += (targetSpd - liveSpeed) * Math.min(1, dt * 3.5);
          liveCenterArcS = (liveCenterArcS + liveSpeed * dt) % totalLoopLength;
        }
      }

      if (!stepResult) {
        setCarDoorsOpenRatio(playerTrainCars, playerDoorOpenRatio);
        positionThreeCarTrain(playerTrainCars, liveCenterArcS + 9.85, false);
        animateTrainPassengers(
          playerTrainCars,
          (liveSpeed - prevSpd) / safeDt,
          liveSpeed,
          elapsed,
          dt,
        );

        riderYaw = sampleLoopPose(liveCenterArcS, riderWorldScratch);
        riderWorldScratch.y = METRO_ELEVATION_Y + 0.76;

        const fromArc = rideFromId ? stationArcMap.get(rideFromId) ?? 0 : 0;
        const nextLegSt = rideFromId ? getNextOrderedStation(rideFromId) : stationsOrderedByArc[0];
        const nextLegArc = stationArcMap.get(nextLegSt.id) ?? 1;
        const legSpan = Math.max(
          1,
          ((nextLegArc - fromArc) % totalLoopLength + totalLoopLength) % totalLoopLength,
        );
        const legCovered =
          ((liveCenterArcS - fromArc) % totalLoopLength + totalLoopLength) % totalLoopLength;
        const legProgress = liveCurrentStationId
          ? 1
          : THREE.MathUtils.clamp(legCovered / legSpan, 0, 1);

        stepResult = {
          rideState: {
            active: true,
            fromStationId: rideFromId,
            toStationId: liveTargetStopStationId ?? nextLegSt.id,
            progress: legProgress,
            mode: 'live_loop',
            currentStationId: liveCurrentStationId,
            doorsOpen: playerDoorOpenRatio > 0.45,
          },
          ridingNow: true,
          riderPosition: { ...riderWorldScratch },
          riderYaw,
          arrivedStation: null,
          justStoppedStation,
          autoBoardedStation,
        };
      }
    } else if (rideActive && rideMode === 'express' && rideToId) {
      rideElapsedSec += dt;
      const rawT = Math.min(1, rideElapsedSec / Math.max(0.1, rideDurationSec));
      const easedT =
        rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;

      const wantDoors = rawT > 0.92 ? 1 : 0;
      playerDoorOpenRatio = THREE.MathUtils.damp(playerDoorOpenRatio, wantDoors, 10, dt);
      setCarDoorsOpenRatio(playerTrainCars, playerDoorOpenRatio);

      const currentCenterArc = rideStartArcS + rideSignedDeltaS * easedT;
      const reverseDir = rideSignedDeltaS < 0;
      const leadArc = currentCenterArc + (reverseDir ? -9.85 : 9.85);
      positionThreeCarTrain(playerTrainCars, leadArc, reverseDir);

      const approxSpd = Math.sin(rawT * Math.PI) * 38;
      animateTrainPassengers(
        playerTrainCars,
        (approxSpd - playerPrevSpeed) / safeDt,
        approxSpd,
        elapsed,
        dt,
      );
      playerPrevSpeed = approxSpd;

      const trackYaw = sampleLoopPose(currentCenterArc, riderWorldScratch);
      riderYaw = reverseDir ? trackYaw + Math.PI : trackYaw;
      riderWorldScratch.y = METRO_ELEVATION_Y + 0.76;

      if (rawT >= 1) {
        arrivedStation = METRO_STATIONS.find((s) => s.id === rideToId) ?? null;
        rideActive = false;
        rideFromId = null;
        rideToId = null;
        rideElapsedSec = 0;
        setCarsVisible(playerTrainCars, false);
      }

      stepResult = {
        rideState: {
          active: rideActive,
          fromStationId: rideFromId,
          toStationId: rideToId,
          progress: rawT,
          mode: 'express',
          currentStationId: null,
          doorsOpen: playerDoorOpenRatio > 0.45,
        },
        ridingNow: rideActive,
        riderPosition: { ...riderWorldScratch },
        riderYaw,
        arrivedStation,
        justStoppedStation,
        autoBoardedStation,
      };
    }

    // 5. Always step all 6 stations' Escalator, Skybridge, Platform & Open-Door Boarding/Alighting Commuters!
    const effectiveFocusPos = stepResult?.ridingNow ? stepResult.riderPosition : playerPos;
    stepStationCommuters(dt, elapsed, effectiveFocusPos);

    if (stepResult) {
      return stepResult;
    }

    return {
      rideState: {
        active: false,
        fromStationId: null,
        toStationId: null,
        progress: 0,
        mode: 'express',
        currentStationId: null,
        doorsOpen: false,
      },
      ridingNow: false,
      riderPosition: { x: 0, y: 0, z: 0 },
      riderYaw: 0,
      arrivedStation: null,
      justStoppedStation,
      autoBoardedStation,
    };
  };

  return {
    group,
    interactPoints,
    startRide,
    boardLiveTrain,
    disembarkLiveTrain,
    setDestinationWhileRiding,
    skipRideImmediate,
    isRiding: () => rideActive,
    findBoardableStation,
    resolveWalkableSurface,
    update,
  };
}
