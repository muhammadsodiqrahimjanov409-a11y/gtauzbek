import * as THREE from 'three';
import type { Vec3 } from '../types/game';
import { POLICE_HQ_PERIMETER } from '../game/gameConfig';
import type { CollisionWorld } from '../utils/collision';
import { audioEngine } from '../utils/audio';

export interface PoliceOfficerGuard {
  root: THREE.Group;
  gunArm: THREE.Group;
  flashMesh: THREE.Mesh;
  tracerMesh: THREE.Mesh;
  baseX: number;
  baseY: number;
  baseZ: number;
  aimYaw: number;
  shootCooldown: number;
  burstTimer: number;
}

export interface PoliceHQSystemHandle {
  group: THREE.Group;
  update: (
    dt: number,
    elapsed: number,
    playerPos: Vec3,
  ) => { isPlayerInHQ: boolean; policeFiringNow: boolean };
}

export function createPoliceHQCompound(
  collisionWorld: CollisionWorld,
  isSoftwareGl: boolean,
): PoliceHQSystemHandle {
  const group = new THREE.Group();

  const p = POLICE_HQ_PERIMETER;
  const cx = (p.minX + p.maxX) * 0.5; // -205
  const cz = (p.minZ + p.maxZ) * 0.5; // -85
  const width = p.maxX - p.minX; // 66
  const depth = p.maxZ - p.minZ; // 54

  // Materials
  const tarmacMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.88,
    metalness: 0.12,
  });
  const fenceMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.42,
    metalness: 0.75,
  });
  const yellowLineMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  const redWhiteMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const blueBeaconMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
  const searchlightMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const guardUniformMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a8a, // Police dark blue
    roughness: 0.62,
  });
  const badgeGoldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    metalness: 0.9,
    roughness: 0.2,
  });
  const gunMetalMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.8,
    roughness: 0.35,
  });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf5d0a9, roughness: 0.55 });
  const muzzleFlashMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.95,
  });
  const bulletTracerMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0.85,
  });

  // 1. Tarmac Ground Base + Runway Markings
  const tarmac = new THREE.Mesh(new THREE.PlaneGeometry(width + 8, depth + 8).rotateX(-Math.PI / 2), tarmacMat);
  tarmac.position.set(cx, 0.02, cz);
  tarmac.receiveShadow = true;
  group.add(tarmac);

  // Runway center stripes for the Police Airplane (running along Z from -106 to -62 at X = -188)
  for (let rz = p.minZ + 6; rz <= p.maxZ - 6; rz += 8) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 4.2).rotateX(-Math.PI / 2), yellowLineMat);
    stripe.position.set(-188, 0.03, rz);
    group.add(stripe);
  }

  // Runway threshold "POLICE RUNWAY" header
  const runThresholdA = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.8).rotateX(-Math.PI / 2), yellowLineMat);
  runThresholdA.position.set(-188, 0.03, p.minZ + 3);
  const runThresholdB = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.8).rotateX(-Math.PI / 2), yellowLineMat);
  runThresholdB.position.set(-188, 0.03, p.maxZ - 3);
  group.add(runThresholdA, runThresholdB);

  // Motor pool parking bay for the Tank at X = -222, Z = -72
  const tankBayBorder = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 8.8).rotateX(-Math.PI / 2), yellowLineMat);
  tankBayBorder.position.set(-222, 0.03, -72);
  const tankBayInner = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 8.2).rotateX(-Math.PI / 2), tarmacMat);
  tankBayInner.position.set(-222, 0.035, -72);
  group.add(tankBayBorder, tankBayInner);

  // 2. Perimeter Security Fence with Concrete Plinths & Barbed Wire Rollers
  const fenceH = 3.6;
  const postSpacing = 6;

  // North wall (Z = maxZ) with Main Security Gate at X = -205
  const buildFenceSegment = (x1: number, z1: number, x2: number, z2: number, idPrefix: string) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const ang = Math.atan2(x2 - x1, z2 - z1);
    const midX = (x1 + x2) * 0.5;
    const midZ = (z1 + z2) * 0.5;

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.6, len), fenceMat);
    plinth.position.set(midX, 0.3, midZ);
    plinth.rotation.y = ang;

    const fenceMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, fenceH - 0.6, len), fenceMat);
    fenceMesh.position.set(midX, fenceH * 0.5 + 0.3, midZ);
    fenceMesh.rotation.y = ang;

    // Barbed wire top rail
    const barbTop = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, len, 8).rotateX(Math.PI / 2), fenceMat);
    barbTop.position.set(midX, fenceH + 0.38, midZ);
    barbTop.rotation.y = ang;

    group.add(plinth, fenceMesh, barbTop);
    collisionWorld.addBox(`${idPrefix}_wall`, midX, midZ, len > 12 ? len : 1.2, len > 12 ? 1.2 : len, fenceH, 'building');
  };

  // South perimeter fence
  buildFenceSegment(p.minX, p.minZ, p.maxX, p.minZ, 'hq_south');
  // West perimeter fence
  buildFenceSegment(p.minX, p.minZ, p.minX, p.maxZ, 'hq_west');
  // East perimeter fence
  buildFenceSegment(p.maxX, p.minZ, p.maxX, p.maxZ, 'hq_east');
  // North perimeter fences (leaving 12m open security gate between -211 and -199)
  buildFenceSegment(p.minX, p.maxZ, -212, p.maxZ, 'hq_north_w');
  buildFenceSegment(-198, p.maxZ, p.maxX, p.maxZ, 'hq_north_e');

  // 3. Security Guard Gatehouse & Checkpoint Barriers
  for (const gx of [-212, -198]) {
    const postCol = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.2, 1.2), fenceMat);
    postCol.position.set(gx, 2.6, p.maxZ);

    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.42, 8), blueBeaconMat);
    beacon.position.set(gx, 5.4, p.maxZ);
    group.add(postCol, beacon);
  }

  // Guard Booth at X = -214, Z = p.maxZ - 2.5
  const booth = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.4, 3.2), fenceMat);
  booth.position.set(-214, 1.7, p.maxZ - 2.5);
  group.add(booth);
  collisionWorld.addBox('hq_guard_booth', -214, p.maxZ - 2.5, 3.4, 3.4, 3.5, 'building');

  // Watchtowers with Searchlights on NW and SE corners
  const towerPositions = [
    { x: p.minX + 2, z: p.minZ + 2 },
    { x: p.maxX - 2, z: p.minZ + 2 },
  ];
  const searchlightCones: THREE.Mesh[] = [];

  towerPositions.forEach((pos, idx) => {
    const towerMesh = new THREE.Mesh(new THREE.BoxGeometry(3.6, 12, 3.6), fenceMat);
    towerMesh.position.set(pos.x, 6, pos.z);
    towerMesh.castShadow = !isSoftwareGl;

    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.45, 8), redWhiteMat);
    beacon.position.set(pos.x, 12.3, pos.z);

    const sLight = new THREE.Mesh(
      new THREE.ConeGeometry(5.5, 22, 12, 1, true).rotateX(-Math.PI / 2),
      searchlightMat,
    );
    sLight.position.set(pos.x, 11.5, pos.z + 10);
    sLight.rotation.x = -0.45;
    group.add(towerMesh, beacon, sLight);
    searchlightCones.push(sLight);
    collisionWorld.addBox(`hq_tower_${idx}`, pos.x, pos.z, 3.8, 3.8, 12, 'building');
  });

  // 4. Six Armed 3D Police Officers Stationed Around Perimeter
  const officerGuardSpots = [
    { x: -210, y: 0, z: p.maxZ - 1.2, yaw: Math.PI }, // Main gate left
    { x: -200, y: 0, z: p.maxZ - 1.2, yaw: Math.PI }, // Main gate right
    { x: -218, y: 0, z: -76, yaw: Math.PI * 0.5 }, // Tank motor pool guard
    { x: -195, y: 0, z: -76, yaw: -Math.PI * 0.5 }, // Runway airstrip guard
    { x: p.minX + 3.5, y: 12, z: p.minZ + 3.5, yaw: 0.8 }, // Watchtower NW
    { x: -205, y: 0, z: -98, yaw: 0 }, // HQ entrance terrace guard
  ];

  const guards: PoliceOfficerGuard[] = officerGuardSpots.map((spot, idx) => {
    const root = new THREE.Group();
    root.position.set(spot.x, spot.y, spot.z);
    root.rotation.y = spot.yaw;
    group.add(root);

    // Legs
    for (const sx of [-0.14, 0.14]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.78, 0.22), guardUniformMat);
      leg.position.set(sx, 0.39, 0);
      root.add(leg);
    }

    // Torso with Tactical Vest and Golden Police Badge
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.68, 0.32), guardUniformMat);
    torso.position.y = 1.1;
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.52, 0.34), fenceMat);
    vest.position.set(0, 1.14, 0.01);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.06), badgeGoldMat);
    badge.position.set(0.14, 1.24, 0.18);
    root.add(torso, vest, badge);

    // Head with Police Peaked Cap
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skinMat);
    head.position.y = 1.62;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.14, 12), guardUniformMat);
    cap.position.set(0, 1.76, 0.02);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 0.16), fenceMat);
    visor.position.set(0, 1.72, 0.16);
    root.add(head, cap, visor);

    // Arms Holding Assault Rifle
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 0.14), guardUniformMat);
    leftArm.position.set(-0.31, 1.05, 0.15);
    leftArm.rotation.set(-0.85, 0.22, 0);

    const gunArm = new THREE.Group();
    gunArm.position.set(0.31, 1.25, 0);

    const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.52, 0.14), guardUniformMat);
    rightArmMesh.position.set(0, -0.22, 0.14);
    rightArmMesh.rotation.x = -0.85;

    // Assault Rifle
    const rifleBody = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.68), gunMetalMat);
    rifleBody.position.set(-0.16, -0.16, 0.44);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 6).rotateX(Math.PI / 2), gunMetalMat);
    barrel.position.set(-0.16, -0.14, 0.82);

    const flash = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 6).rotateX(Math.PI / 2), muzzleFlashMat);
    flash.position.set(-0.16, -0.14, 1.05);
    flash.visible = false;

    gunArm.add(rightArmMesh, rifleBody, barrel, flash);
    root.add(leftArm, gunArm);

    // Bullet tracer line from rifle tip towards target
    const tracerGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6).rotateX(Math.PI / 2);
    const tracerMesh = new THREE.Mesh(tracerGeo, bulletTracerMat);
    tracerMesh.visible = false;
    group.add(tracerMesh);

    return {
      root,
      gunArm,
      flashMesh: flash,
      tracerMesh,
      baseX: spot.x,
      baseY: spot.y,
      baseZ: spot.z,
      aimYaw: spot.yaw,
      shootCooldown: 0.1 + (idx % 3) * 0.15,
      burstTimer: 0,
    };
  });

  const update: PoliceHQSystemHandle['update'] = (dt, elapsed, playerPos) => {
    // Check if player entered the Police HQ restricted perimeter
    const isPlayerInHQ =
      playerPos.x >= p.minX &&
      playerPos.x <= p.maxX &&
      playerPos.z >= p.minZ &&
      playerPos.z <= p.maxZ &&
      playerPos.y < 16;

    let policeFiringNow = false;

    // Sweep searchlights
    for (let s = 0; s < searchlightCones.length; s++) {
      searchlightCones[s].rotation.z = Math.sin(elapsed * 0.85 + s) * 0.42;
    }

    for (let i = 0; i < guards.length; i++) {
      const g = guards[i];

      if (isPlayerInHQ) {
        // Track and lock on player
        const dx = playerPos.x - g.baseX;
        const dy = playerPos.y + 1.0 - (g.baseY + 1.25);
        const dz = playerPos.z - g.baseZ;
        const dist = Math.hypot(dx, dz);

        const targetYaw = Math.atan2(dx, dz);
        g.root.rotation.y = THREE.MathUtils.damp(g.root.rotation.y, targetYaw, 12, dt);
        const pitchAngle = Math.atan2(dy, dist);
        g.gunArm.rotation.x = THREE.MathUtils.damp(g.gunArm.rotation.x, -pitchAngle, 12, dt);

        // Firing sequence
        g.shootCooldown -= dt;
        if (g.shootCooldown <= 0) {
          g.shootCooldown = 0.14 + Math.random() * 0.12; // Rapid burst
          g.flashMesh.visible = true;
          policeFiringNow = true;

          // Connect bullet tracer from muzzle to player
          const muzzlePos = new THREE.Vector3(-0.16, -0.14, 1.05)
            .applyMatrix4(g.gunArm.matrixWorld);
          const targetChest = new THREE.Vector3(playerPos.x, playerPos.y + 1.0, playerPos.z);
          const tracerDist = muzzlePos.distanceTo(targetChest);

          g.tracerMesh.visible = true;
          g.tracerMesh.position.copy(muzzlePos).lerp(targetChest, 0.5);
          g.tracerMesh.scale.set(1, 1, Math.max(0.1, tracerDist));
          g.tracerMesh.lookAt(targetChest);

          audioEngine.playGunshot('ak47');
        } else {
          g.flashMesh.visible = false;
          g.tracerMesh.visible = false;
        }
      } else {
        // Return to idle patrol stance
        g.root.rotation.y = THREE.MathUtils.damp(g.root.rotation.y, g.aimYaw, 3, dt);
        g.gunArm.rotation.x = THREE.MathUtils.damp(g.gunArm.rotation.x, 0, 4, dt);
        g.flashMesh.visible = false;
        g.tracerMesh.visible = false;
      }
    }

    return { isPlayerInHQ, policeFiringNow };
  };

  return {
    group,
    update,
  };
}
