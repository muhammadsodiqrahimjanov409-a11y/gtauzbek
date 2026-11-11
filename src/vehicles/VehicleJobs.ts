import * as THREE from 'three';
import type { CargoLoadId, VehicleId, VehicleInstanceState } from '../types/game';
import {
  detectDistrict,
  ENTERABLE_BUILDINGS,
  getDefaultVehicleTuning,
  VEHICLE_CONFIGS,
} from '../game/gameConfig';
import { disposeObject3D } from '../utils/performance';

export type WorldCargoPropKind = 'wood' | 'steel' | 'concrete' | 'gravel' | 'crates';

export interface VehicleJobOutcome {
  kind:
    | 'unloaded_cargo'
    | 'reloaded_cargo'
    | 'retracted_mechanism'
    | 'excavator_dug'
    | 'excavator_loaded_truck'
    | 'none';
  nextHydraulicsTarget: 0 | 1;
  rewardCoins: number;
  bonusApplied: boolean;
  updatedOwnCargo?: CargoLoadId;
  loadedNearbyTruck?: {
    vehicleId: VehicleId;
    instanceId: string;
    cargoType: CargoLoadId;
  };
  unloadedCargoType?: CargoLoadId;
}

interface ActiveWorldProp {
  root: THREE.Group;
  age: number;
  targetScale: number;
}

const MAX_WORLD_PROPS = 18;

const JOB_BASE_PAYOUTS: Partial<Record<VehicleId, number>> = {
  labo: 35000,
  gazel: 48000,
  isuzu: 58000,
  zil: 52000,
  kamaz: 65000,
  howo: 85000,
  fura: 120000,
  pickup: 30000,
  excavator: 45000,
};

export const JOB_CAPABLE_VEHICLE_IDS: readonly VehicleId[] = [
  'labo',
  'gazel',
  'isuzu',
  'zil',
  'kamaz',
  'howo',
  'fura',
  'excavator',
  'pickup',
] as const;

export function isJobCapableVehicle(vehicleId: VehicleId): boolean {
  return (JOB_CAPABLE_VEHICLE_IDS as readonly string[]).includes(vehicleId);
}

export interface VehicleJobsSystem {
  group: THREE.Group;
  getActivePropCount: () => number;
  executeVehicleJob: (
    activeVeh: VehicleInstanceState,
    allVehicles: VehicleInstanceState[],
    currentTarget: number,
  ) => VehicleJobOutcome;
  update: (dt: number) => void;
  dispose: () => void;
}

export function createVehicleJobsSystem(
  scene: THREE.Scene,
  castShadow = false,
): VehicleJobsSystem {
  const group = new THREE.Group();
  scene.add(group);

  // Shared PBR Materials & Geometries across world cargo props (zero per-spawn shader compilation)
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0xc2854c,
    roughness: 0.82,
    metalness: 0.05,
  });
  const strapMat = new THREE.MeshStandardMaterial({
    color: 0xea580c,
    roughness: 0.55,
    metalness: 0.15,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.34,
    metalness: 0.86,
  });
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.9,
    metalness: 0.08,
  });
  const gravelMat = new THREE.MeshStandardMaterial({
    color: 0x78716c,
    roughness: 0.95,
    metalness: 0.05,
  });
  const earthMat = new THREE.MeshStandardMaterial({
    color: 0x713f12,
    roughness: 0.96,
    metalness: 0.04,
  });
  const crateMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.65,
    metalness: 0.1,
  });
  const palletMat = new THREE.MeshStandardMaterial({
    color: 0x92400e,
    roughness: 0.85,
    metalness: 0.05,
  });
  const shadowDiscMat = new THREE.MeshBasicMaterial({
    color: 0x020617,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });

  const shadowDiscGeo = new THREE.CircleGeometry(1.35, 20).rotateX(-Math.PI / 2);
  const plankGeo = new THREE.BoxGeometry(0.28, 0.12, 2.2);
  const strapGeo = new THREE.BoxGeometry(1.52, 0.54, 0.06);
  const beamWebGeo = new THREE.BoxGeometry(0.24, 0.22, 2.35);
  const concreteSlabGeo = new THREE.BoxGeometry(1.68, 0.24, 2.05);
  const liftLoopGeo = new THREE.TorusGeometry(0.08, 0.02, 6, 12);
  const moundMainGeo = new THREE.DodecahedronGeometry(0.92, 1);
  const moundSubGeo = new THREE.DodecahedronGeometry(0.58, 1);
  const palletBaseGeo = new THREE.BoxGeometry(1.48, 0.12, 1.48);
  const boxCrateGeo = new THREE.BoxGeometry(0.62, 0.52, 0.62);

  const sharedGeos: THREE.BufferGeometry[] = [
    shadowDiscGeo,
    plankGeo,
    strapGeo,
    beamWebGeo,
    concreteSlabGeo,
    liftLoopGeo,
    moundMainGeo,
    moundSubGeo,
    palletBaseGeo,
    boxCrateGeo,
  ];
  const sharedMats: THREE.Material[] = [
    woodMat,
    strapMat,
    steelMat,
    concreteMat,
    gravelMat,
    earthMat,
    crateMat,
    palletMat,
    shadowDiscMat,
  ];

  const activeProps: ActiveWorldProp[] = [];

  function buildWorldCargoProp(
    propKind: WorldCargoPropKind,
    scaleFactor: number,
    isExcavatedEarth = false,
  ): THREE.Group {
    const prop = new THREE.Group();

    const contactShadow = new THREE.Mesh(shadowDiscGeo, shadowDiscMat);
    contactShadow.position.y = 0.02;
    prop.add(contactShadow);

    if (propKind === 'crates') {
      const pallet = new THREE.Mesh(palletBaseGeo, palletMat);
      pallet.position.y = 0.06;
      pallet.castShadow = castShadow;
      prop.add(pallet);

      const offsets: Array<[number, number, number]> = [
        [-0.34, 0.38, -0.34],
        [0.34, 0.38, -0.34],
        [-0.34, 0.38, 0.34],
        [0.34, 0.38, 0.34],
        [0, 0.9, 0],
      ];
      for (const [cx, cy, cz] of offsets) {
        const box = new THREE.Mesh(boxCrateGeo, crateMat);
        box.position.set(cx, cy, cz);
        box.castShadow = castShadow;
        prop.add(box);
      }
    } else if (propKind === 'wood') {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          const plank = new THREE.Mesh(plankGeo, woodMat);
          plank.position.set(-0.48 + c * 0.32, 0.08 + r * 0.14, 0);
          plank.castShadow = castShadow;
          prop.add(plank);
        }
      }
      for (const sz of [-0.65, 0.65]) {
        const strap = new THREE.Mesh(strapGeo, strapMat);
        strap.position.set(0, 0.27, sz);
        prop.add(strap);
      }
    } else if (propKind === 'steel') {
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 4; c++) {
          const beam = new THREE.Mesh(beamWebGeo, steelMat);
          beam.position.set(-0.48 + c * 0.32, 0.12 + r * 0.24, 0);
          beam.castShadow = castShadow;
          prop.add(beam);
        }
      }
      for (const sz of [-0.72, 0.72]) {
        const strap = new THREE.Mesh(strapGeo, strapMat);
        strap.position.set(0, 0.26, sz);
        prop.add(strap);
      }
    } else if (propKind === 'concrete') {
      for (let s = 0; s < 3; s++) {
        const slab = new THREE.Mesh(concreteSlabGeo, concreteMat);
        slab.position.set(0, 0.13 + s * 0.26, 0);
        slab.castShadow = castShadow;
        prop.add(slab);
      }
      for (const lx of [-0.55, 0.55]) {
        const loop = new THREE.Mesh(liftLoopGeo, steelMat);
        loop.position.set(lx, 0.82, 0);
        prop.add(loop);
      }
    } else {
      // 'gravel' or excavated earth mound
      const mat = isExcavatedEarth ? earthMat : gravelMat;
      const mainHeap = new THREE.Mesh(moundMainGeo, mat);
      mainHeap.scale.set(1.35, 0.68, 1.45);
      mainHeap.position.set(0, 0.28, 0);
      mainHeap.castShadow = castShadow;
      prop.add(mainHeap);

      for (const [ox, oz] of [
        [-0.62, 0.35],
        [0.58, -0.32],
        [0.12, 0.62],
      ]) {
        const lump = new THREE.Mesh(moundSubGeo, mat);
        lump.scale.set(1.1, 0.55, 1.1);
        lump.position.set(ox, 0.18, oz);
        prop.add(lump);
      }
    }

    prop.scale.setScalar(0.08 * scaleFactor);
    return prop;
  }

  function spawnWorldProp(
    x: number,
    z: number,
    yaw: number,
    propKind: WorldCargoPropKind,
    scaleFactor: number,
    isExcavatedEarth = false,
  ): void {
    if (activeProps.length >= MAX_WORLD_PROPS) {
      const oldest = activeProps.shift();
      if (oldest) {
        group.remove(oldest.root);
      }
    }
    const root = buildWorldCargoProp(propKind, scaleFactor, isExcavatedEarth);
    root.position.set(x, 0, z);
    root.rotation.y = yaw;
    group.add(root);
    activeProps.push({
      root,
      age: 0,
      targetScale: scaleFactor,
    });
  }

  function checkBonusLocation(vehicleId: VehicleId, x: number, z: number): boolean {
    const district = detectDistrict(x, z);
    if (
      (vehicleId === 'fura' ||
        vehicleId === 'howo' ||
        vehicleId === 'kamaz' ||
        vehicleId === 'zil' ||
        vehicleId === 'excavator') &&
      district === 'industrial'
    ) {
      return true;
    }
    if (
      (vehicleId === 'labo' || vehicleId === 'gazel' || vehicleId === 'isuzu') &&
      district === 'commercial'
    ) {
      return true;
    }
    for (const b of ENTERABLE_BUILDINGS) {
      const d = Math.hypot(x - b.centerX, z - b.centerZ);
      if (d <= 44) {
        if (
          (vehicleId === 'labo' || vehicleId === 'gazel' || vehicleId === 'pickup') &&
          (b.category === 'shop' || b.category === 'restaurant')
        ) {
          return true;
        }
        if (
          (vehicleId === 'isuzu' ||
            vehicleId === 'fura' ||
            vehicleId === 'kamaz' ||
            vehicleId === 'howo' ||
            vehicleId === 'zil') &&
          (b.category === 'enterprise' || b.category === 'shop')
        ) {
          return true;
        }
      }
    }
    return false;
  }

  return {
    group,
    getActivePropCount: () => activeProps.length,

    executeVehicleJob: (activeVeh, allVehicles, currentTarget) => {
      const vid = activeVeh.vehicleId;
      if (!isJobCapableVehicle(vid)) {
        return {
          kind: 'none',
          nextHydraulicsTarget: 0,
          rewardCoins: 0,
          bonusApplied: false,
        };
      }

      const sinY = Math.sin(activeVeh.rotationY);
      const cosY = Math.cos(activeVeh.rotationY);

      // 1. EXCAVATOR: Digs earth/gravel OR loads a nearby Gruzovoy truck within 14m!
      if (vid === 'excavator') {
        if (currentTarget > 0.5) {
          return {
            kind: 'retracted_mechanism',
            nextHydraulicsTarget: 0,
            rewardCoins: 0,
            bonusApplied: false,
          };
        }

        // Check for a nearby cargo-capable truck within 14m to load gravel directly into its bed!
        let nearestTruck: VehicleInstanceState | null = null;
        let nearestDist = 14.0;
        for (const other of allVehicles) {
          if (other.instanceId === activeVeh.instanceId) continue;
          const oCfg = VEHICLE_CONFIGS[other.vehicleId];
          if (!oCfg.canCarryCargo) continue;
          const curCargo =
            (other.tuning ?? getDefaultVehicleTuning(other.vehicleId)).cargoType;
          const dist = Math.hypot(
            other.position.x - activeVeh.position.x,
            other.position.z - activeVeh.position.z,
          );
          if (dist <= nearestDist && (curCargo === 'empty' || nearestTruck === null)) {
            nearestDist = dist;
            nearestTruck = other;
          }
        }

        if (nearestTruck) {
          const bonus = checkBonusLocation(vid, activeVeh.position.x, activeVeh.position.z);
          const reward = (bonus ? 2 : 1) * 55000;
          return {
            kind: 'excavator_loaded_truck',
            nextHydraulicsTarget: 1,
            rewardCoins: reward,
            bonusApplied: bonus,
            loadedNearbyTruck: {
              vehicleId: nearestTruck.vehicleId,
              instanceId: nearestTruck.instanceId,
              cargoType: 'gravel',
            },
          };
        }

        // Otherwise excavate a real 3D earth/gravel heap right in front of the bucket (+4.6m forward)
        const digX = activeVeh.position.x + sinY * 4.65;
        const digZ = activeVeh.position.z + cosY * 4.65;
        spawnWorldProp(digX, digZ, activeVeh.rotationY, 'gravel', 1.05, true);

        const bonus = checkBonusLocation(vid, activeVeh.position.x, activeVeh.position.z);
        const basePay = JOB_BASE_PAYOUTS.excavator ?? 45000;
        return {
          kind: 'excavator_dug',
          nextHydraulicsTarget: 1,
          rewardCoins: bonus ? basePay * 2 : basePay,
          bonusApplied: bonus,
        };
      }

      // 2. CARGO GRUZOVOY TRUCKS & PICKUP:
      const curTuning = activeVeh.tuning ?? getDefaultVehicleTuning(vid);
      const curCargo = curTuning.cargoType;

      // If mechanism is currently open (target > 0.5), pressing X closes mechanism cleanly
      if (currentTarget > 0.5) {
        return {
          kind: 'retracted_mechanism',
          nextHydraulicsTarget: 0,
          rewardCoins: 0,
          bonusApplied: false,
        };
      }

      // If truck bed is currently EMPTY and mechanism is closed, pressing X reloads signature cargo!
      if (curCargo === 'empty') {
        const defaultCargo = getDefaultVehicleTuning(vid).cargoType;
        const nextLoad: CargoLoadId = defaultCargo === 'empty' ? 'wood' : defaultCargo;
        return {
          kind: 'reloaded_cargo',
          nextHydraulicsTarget: 0,
          rewardCoins: 0,
          bonusApplied: false,
          updatedOwnCargo: nextLoad,
        };
      }

      // Otherwise, truck is LOADED -> Open vehicle-specific mechanism, spawn 3D cargo prop on ground, empty bed, and pay N-Coins!
      const cfg = VEHICLE_CONFIGS[vid];
      let dropX = activeVeh.position.x - sinY * (cfg.halfLength + 1.85);
      let dropZ = activeVeh.position.z - cosY * (cfg.halfLength + 1.85);
      let dropYaw = activeVeh.rotationY;

      if (vid === 'zil') {
        // ZIL-130 Yon-Samosval dumps sideways to the right (-localX = -cosY, +sinY)
        const sideDist = cfg.halfWidth + 1.75;
        dropX = activeVeh.position.x - cosY * sideDist - sinY * 1.1;
        dropZ = activeVeh.position.z + sinY * sideDist - cosY * 1.1;
        dropYaw = activeVeh.rotationY + Math.PI * 0.5;
      } else if (vid === 'fura') {
        dropX = activeVeh.position.x - sinY * (cfg.halfLength + 2.45);
        dropZ = activeVeh.position.z - cosY * (cfg.halfLength + 2.45);
      } else if (vid === 'isuzu') {
        dropX = activeVeh.position.x - sinY * (cfg.halfLength + 2.1);
        dropZ = activeVeh.position.z - cosY * (cfg.halfLength + 2.1);
      }

      const propScale =
        vid === 'fura'
          ? 1.32
          : vid === 'howo'
            ? 1.25
            : vid === 'kamaz' || vid === 'isuzu' || vid === 'zil'
              ? 1.08
              : vid === 'gazel'
                ? 0.96
                : 0.84;

      const visualPropKind: WorldCargoPropKind =
        (vid === 'labo' || vid === 'gazel' || vid === 'isuzu' || vid === 'pickup') &&
        curCargo === 'wood'
          ? 'crates'
          : curCargo;

      spawnWorldProp(dropX, dropZ, dropYaw, visualPropKind, propScale, false);

      const bonus = checkBonusLocation(vid, activeVeh.position.x, activeVeh.position.z);
      const baseReward = JOB_BASE_PAYOUTS[vid] ?? 40000;
      const finalReward = bonus ? baseReward * 2 : baseReward;

      return {
        kind: 'unloaded_cargo',
        nextHydraulicsTarget: 1,
        rewardCoins: finalReward,
        bonusApplied: bonus,
        updatedOwnCargo: 'empty',
        unloadedCargoType: curCargo,
      };
    },

    update: (dt: number) => {
      for (let i = 0; i < activeProps.length; i++) {
        const item = activeProps[i];
        item.age += dt;
        const curS = item.root.scale.x;
        if (Math.abs(curS - item.targetScale) > 0.004) {
          const nextS = THREE.MathUtils.damp(curS, item.targetScale, 9.5, dt);
          item.root.scale.setScalar(nextS);
        }
      }
    },

    dispose: () => {
      activeProps.length = 0;
      scene.remove(group);
      for (const g of sharedGeos) g.dispose();
      for (const m of sharedMats) m.dispose();
      disposeObject3D(group);
    },
  };
}
