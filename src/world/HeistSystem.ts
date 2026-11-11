import * as THREE from 'three';
import { ENTERABLE_BUILDINGS, HEIST_TARGETS } from '../game/gameConfig';
import type { HeistTargetConfig } from '../types/game';

interface HeistRigInstance {
  config: HeistTargetConfig;
  root: THREE.Group;
  worldX: number;
  worldZ: number;
  doorPivot: THREE.Group;
  wheelMesh: THREE.Object3D | null;
  laserGroup: THREE.Group | null;
  lootGroup: THREE.Group;
  beaconMat: THREE.MeshStandardMaterial;
  openAmount: number; // 0..1
}

export interface HeistWorldSystem {
  group: THREE.Group;
  getTargetWorldPos: (buildingId: string) => { x: number; z: number } | null;
  update: (
    dt: number,
    elapsed: number,
    activeHeistBuildingId: string | null,
    activeProgress: number,
    robbedUntilByBuilding: Record<string, number>,
    nowMs: number,
  ) => void;
}

/**
 * Composite 6-part 3D Tactical Heist Duffel Bag strapped to a humanoid's back
 * when carrying freshly stolen Bank gold, Museum relics, or Shop cash.
 */
export function createHeistLootBag(): THREE.Group {
  const bag = new THREE.Group();
  bag.position.set(0, 1.22, -0.23);

  const canvasMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.78,
    metalness: 0.12,
  });
  const strapMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.65,
    metalness: 0.25,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xca8a04,
    emissiveIntensity: 0.25,
    roughness: 0.18,
    metalness: 0.92,
  });
  const cashMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    roughness: 0.55,
    metalness: 0.08,
  });

  // Main cylindrical duffel body
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.17, 0.46, 14).rotateZ(Math.PI * 0.5),
    canvasMat,
  );
  bag.add(body);

  // Side end-caps
  for (const side of [-1, 1] as const) {
    const pocket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.06, 12).rotateZ(Math.PI * 0.5),
      strapMat,
    );
    pocket.position.x = side * 0.24;
    bag.add(pocket);

    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.44, 0.22), strapMat);
    strap.position.set(side * 0.13, 0.03, 0.12);
    bag.add(strap);
  }

  // Gold bar & emerald cash bundle peeking out of top zipper
  const goldBar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.08), goldMat);
  goldBar.position.set(-0.05, 0.16, -0.01);
  goldBar.rotation.z = 0.14;
  const cashStack = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.09), cashMat);
  cashStack.position.set(0.08, 0.15, 0.01);
  cashStack.rotation.z = -0.18;
  bag.add(goldBar, cashStack);

  return bag;
}

export function createHeistWorldSystem(isSoftwareGl: boolean): HeistWorldSystem {
  const group = new THREE.Group();
  const rigs = new Map<string, HeistRigInstance>();

  const steelVaultMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.28,
    metalness: 0.88,
  });
  const brushedTitaniumMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.18,
    metalness: 0.94,
  });
  const darkArmorMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.45,
    metalness: 0.72,
  });
  const goldBullionMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xb45309,
    emissiveIntensity: 0.28,
    roughness: 0.16,
    metalness: 0.95,
  });
  const cashBundleMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    roughness: 0.52,
    metalness: 0.08,
  });
  const diamondMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.45,
    roughness: 0.06,
    metalness: 0.15,
    transparent: true,
    opacity: 0.88,
  });
  const armoredGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xe0f2fe,
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const laserBeamMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.86,
  });

  for (const b of ENTERABLE_BUILDINGS) {
    const cfg = HEIST_TARGETS[b.id];
    if (!cfg) continue;

    const hd = b.depth * 0.5;
    const fSign = b.doorFacing === 'south' ? 1 : -1;

    // Venue-local coordinates (matched to Interiors.ts venueRoot space)
    let lx = 0;
    let lz = 0;
    let localYaw = 0;

    if (cfg.kind === 'bank') {
      lx = 4.5;
      lz = 5.4;
      localYaw = -Math.PI * 0.25;
    } else if (cfg.kind === 'museum') {
      lx = 0;
      lz = -5.2;
      localYaw = 0;
    } else {
      // shop
      lx = 3.85;
      lz = -hd + 3.0;
      localYaw = 0;
    }

    const worldX = fSign === 1 ? b.centerX + lx : b.centerX - lx;
    const worldZ = fSign === 1 ? b.centerZ + lz : b.centerZ - lz;
    const worldRotY = (b.doorFacing === 'south' ? 0 : Math.PI) + localYaw;

    const rigRoot = new THREE.Group();
    rigRoot.position.set(worldX, 0.1, worldZ);
    rigRoot.rotation.y = worldRotY;
    group.add(rigRoot);

    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });

    const doorPivot = new THREE.Group();
    const lootGroup = new THREE.Group();
    let wheelMesh: THREE.Object3D | null = null;
    let laserGroup: THREE.Group | null = null;

    if (cfg.kind === 'bank') {
      // BANK VAULT CHAMBER: Heavy Steel Chamber + Circular Vault Door + 4-Spoke Wheel + Gold Bullion Stacks
      const chamber = new THREE.Mesh(new THREE.BoxGeometry(2.9, 2.75, 2.1), darkArmorMat);
      chamber.position.set(0, 1.375, 0);
      chamber.castShadow = !isSoftwareGl;
      chamber.receiveShadow = true;

      const frameRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.02, 0.13, 12, 32),
        brushedTitaniumMat,
      );
      frameRing.position.set(0, 1.38, 1.06);

      const alarmBar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.16, 0.22), beaconMat);
      alarmBar.position.set(0, 2.66, 1.08);
      rigRoot.add(chamber, frameRing, alarmBar);

      // Gold Bullion & Cash Pallets inside vault
      for (let row = 0; row < 3; row++) {
        for (let col = -1; col <= 1; col++) {
          const ingot = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.24), goldBullionMat);
          ingot.position.set(col * 0.52, 0.55 + row * 0.2, 0.15);
          lootGroup.add(ingot);
        }
      }
      for (const cx of [-0.48, 0.48]) {
        const cash = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.34), cashBundleMat);
        cash.position.set(cx, 1.35, -0.1);
        lootGroup.add(cash);
      }
      rigRoot.add(lootGroup);

      // Hinged Circular Steel Vault Door
      doorPivot.position.set(-1.02, 1.38, 1.08);
      const vaultDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.96, 0.96, 0.22, 28).rotateX(Math.PI * 0.5),
        steelVaultMat,
      );
      vaultDisc.position.set(1.02, 0, 0);
      doorPivot.add(vaultDisc);

      const spokeHub = new THREE.Group();
      spokeHub.position.set(1.02, 0, 0.15);
      const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 10, 24), brushedTitaniumMat);
      spokeHub.add(wheelRim);
      for (let s = 0; s < 4; s++) {
        const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.72, 8), brushedTitaniumMat);
        spoke.rotation.z = (s * Math.PI) / 4;
        spokeHub.add(spoke);
      }
      doorPivot.add(spokeHub);
      wheelMesh = spokeHub;
      rigRoot.add(doorPivot);
    } else if (cfg.kind === 'museum') {
      // MUSEUM RELIC CASE: Marble/Titanium Plinth + Sliding Armored Glass Hood + Red Security Laser Grid + Priceless Relic
      const pedestal = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 1.7), darkArmorMat);
      pedestal.position.set(0, 0.55, 0);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 1.8), goldBullionMat);
      trim.position.set(0, 1.12, 0);
      const beacon = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.18), beaconMat);
      beacon.position.set(0, 2.48, 0.82);
      rigRoot.add(pedestal, trim, beacon);

      // Priceless Relic inside case
      const crownBase = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.07, 10, 24).rotateX(Math.PI * 0.5), goldBullionMat);
      crownBase.position.set(0, 1.35, 0);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), diamondMat);
      gem.position.set(0, 1.72, 0);
      lootGroup.add(crownBase, gem);
      rigRoot.add(lootGroup);
      wheelMesh = gem;

      // Sliding / Hinged Armored Glass Case Hood
      doorPivot.position.set(0, 1.78, 0);
      const glassHood = new THREE.Mesh(new THREE.BoxGeometry(1.86, 1.28, 1.48), armoredGlassMat);
      glassHood.renderOrder = 3;
      const topCap = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.1, 1.56), brushedTitaniumMat);
      topCap.position.y = 0.66;
      doorPivot.add(glassHood, topCap);
      rigRoot.add(doorPivot);

      // Criss-crossing Crimson Security Laser Grid
      laserGroup = new THREE.Group();
      for (const ly of [1.38, 1.76, 2.12]) {
        const beamH = new THREE.Mesh(
          new THREE.CylinderGeometry(0.016, 0.016, 1.82, 6).rotateZ(Math.PI * 0.5),
          laserBeamMat,
        );
        beamH.position.set(0, ly, 0.72);
        laserGroup.add(beamH);
      }
      for (const lxOff of [-0.52, 0.52]) {
        const beamD = new THREE.Mesh(
          new THREE.CylinderGeometry(0.016, 0.016, 1.44, 6).rotateX(Math.PI * 0.5),
          laserBeamMat,
        );
        beamD.position.set(lxOff, 1.76, 0);
        laserGroup.add(beamD);
      }
      rigRoot.add(laserGroup);
    } else {
      // SHOP COMMERCIAL SAFE & TILL: Armored Back-Counter Safe + Keypad + Emerald Cash Stacks & Gold Coins
      const safeBody = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.65, 1.15), darkArmorMat);
      safeBody.position.set(0, 0.825, 0);
      safeBody.castShadow = !isSoftwareGl;
      const topBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.2), beaconMat);
      topBeacon.position.set(0, 1.7, 0.48);
      rigRoot.add(safeBody, topBeacon);

      for (let r = 0; r < 2; r++) {
        for (const cx of [-0.26, 0.26]) {
          const stack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.26), cashBundleMat);
          stack.position.set(cx, 0.58 + r * 0.42, 0.08);
          lootGroup.add(stack);
        }
      }
      const coinBar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.2), goldBullionMat);
      coinBar.position.set(0, 1.02, 0.12);
      lootGroup.add(coinBar);
      rigRoot.add(lootGroup);

      doorPivot.position.set(-0.6, 0.84, 0.58);
      const safeDoor = new THREE.Mesh(new THREE.BoxGeometry(1.18, 1.44, 0.12), steelVaultMat);
      safeDoor.position.set(0.6, 0, 0);
      const handleWheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.028, 8, 18), brushedTitaniumMat);
      handleWheel.position.set(0.88, 0.05, 0.09);
      const keypad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.05), goldBullionMat);
      keypad.position.set(0.45, 0.22, 0.08);
      doorPivot.add(safeDoor, handleWheel, keypad);
      wheelMesh = handleWheel;
      rigRoot.add(doorPivot);
    }

    rigs.set(b.id, {
      config: cfg,
      root: rigRoot,
      worldX,
      worldZ,
      doorPivot,
      wheelMesh,
      laserGroup,
      lootGroup,
      beaconMat,
      openAmount: 0,
    });
  }

  return {
    group,
    getTargetWorldPos: (buildingId: string) => {
      const rig = rigs.get(buildingId);
      return rig ? { x: rig.worldX, z: rig.worldZ } : null;
    },
    update: (dt, elapsed, activeHeistBuildingId, activeProgress, robbedUntilByBuilding, nowMs) => {
      for (const [bid, rig] of rigs.entries()) {
        const isRobbed = (robbedUntilByBuilding[bid] ?? 0) > nowMs;
        const isCracking = activeHeistBuildingId === bid && !isRobbed;

        const targetOpen = isRobbed ? 1 : isCracking ? activeProgress * 0.22 : 0;
        rig.openAmount = THREE.MathUtils.damp(rig.openAmount, targetOpen, 6.5, dt);

        if (rig.config.kind === 'museum') {
          // Slide armored glass hood upward when opened
          rig.doorPivot.position.y = 1.78 + rig.openAmount * 1.15;
          if (rig.laserGroup) {
            rig.laserGroup.visible = !isRobbed;
          }
          if (rig.wheelMesh) {
            rig.wheelMesh.rotation.y = elapsed * (isCracking ? 5.5 : 1.1);
          }
        } else {
          // Swing bank vault door or shop safe door wide open (-112 deg)
          rig.doorPivot.rotation.y = -rig.openAmount * 1.95;
          if (rig.wheelMesh) {
            rig.wheelMesh.rotation.z = isCracking
              ? elapsed * 9.5
              : rig.openAmount * Math.PI * 1.5;
          }
        }

        // Hide interior gold/relic/cash while robbed (waiting to restock)
        rig.lootGroup.visible = !isRobbed;

        // Status beacon color: Red strobe when cracking/robbed, Amber gold when ready!
        if (isCracking || isRobbed) {
          const flash = Math.sin(elapsed * 14) > 0 ? 1.4 : 0.35;
          rig.beaconMat.color.setHex(0xef4444);
          rig.beaconMat.emissive.setHex(0xef4444);
          rig.beaconMat.emissiveIntensity = flash;
        } else {
          rig.beaconMat.color.setHex(0xf59e0b);
          rig.beaconMat.emissive.setHex(0xf59e0b);
          rig.beaconMat.emissiveIntensity = 0.85;
        }
      }
    },
  };
}
