import * as THREE from 'three';
import type { Vec3, WeaponId } from '../types/game';
import { WORLD_PLAYABLE_LIMIT } from '../game/gameConfig';
import type { CollisionWorld } from '../utils/collision';
import type { PedestrianTarget } from '../vehicles/Pedestrians';

interface ActiveTracer {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

interface ActiveSpark {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

interface GolfBallEntity {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  active: boolean;
  age: number;
}

export interface PedestrianHitEvent {
  id: number;
  dirX: number;
  dirZ: number;
}

export interface WeaponTriggerOutcome {
  fired: boolean;
  alertedPolice: boolean;
  recoilAmount: number;
  soundType?: 'pistol' | 'ak47' | 'golf_club';
  hitPedestrians: PedestrianHitEvent[];
}

export interface PlayerArsenalSystem {
  handGroup: THREE.Group;
  worldEffectsGroup: THREE.Group;
  setEquippedWeapon: (weapon: WeaponId) => void;
  getActionTimer: () => number;
  triggerAction: (
    weapon: WeaponId,
    playerPos: Vec3,
    aimYaw: number,
    aimPitch: number,
    collisionWorld: CollisionWorld,
    pedestrianTargets: PedestrianTarget[],
    policePositions: Array<{ x: number; z: number }>,
  ) => WeaponTriggerOutcome;
  update: (
    dt: number,
    collisionWorld: CollisionWorld,
    pedestrianTargets?: PedestrianTarget[],
  ) => { golfBallHitPedestrians: PedestrianHitEvent[] };
}

export function createPlayerArsenalSystem(castShadow = true): PlayerArsenalSystem {
  const handGroup = new THREE.Group();
  const worldEffectsGroup = new THREE.Group();

  // Shared PBR Materials across weapon parts (varied roughness & metalness)
  const gunmetalMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.34,
    metalness: 0.85,
  });
  const mattePolymerMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.76,
    metalness: 0.15,
  });
  const akWoodMat = new THREE.MeshStandardMaterial({
    color: 0x9a3412,
    roughness: 0.58,
    metalness: 0.08,
  });
  const chromeShaftMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.14,
    metalness: 0.94,
  });
  const muzzleFlashMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.92,
  });

  // 1. PISTOL (To'pponcha) — 6-part composite model
  const pistolGroup = new THREE.Group();
  const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.08), mattePolymerMat);
  pGrip.position.set(0, -0.04, 0.02);
  pGrip.rotation.x = -0.22;
  const pSlide = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.072, 0.28), gunmetalMat);
  pSlide.position.set(0, 0.055, 0.11);
  pSlide.castShadow = castShadow;
  const pBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.016, 0.08, 8).rotateX(Math.PI / 2),
    chromeShaftMat,
  );
  pBarrel.position.set(0, 0.058, 0.26);
  const pGuard = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.07), mattePolymerMat);
  pGuard.position.set(0, 0.0, 0.09);
  const pSight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.025), chromeShaftMat);
  pSight.position.set(0, 0.1, 0.22);
  const pFlash = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.18, 7).rotateX(Math.PI / 2), muzzleFlashMat);
  pFlash.position.set(0, 0.058, 0.36);
  pFlash.visible = false;
  pistolGroup.add(pGrip, pSlide, pBarrel, pGuard, pSight, pFlash);
  pistolGroup.visible = false;

  // 2. AK-47 (Kalashnikov) — 8-part composite model
  const akGroup = new THREE.Group();
  const akReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.1, 0.38), gunmetalMat);
  akReceiver.position.set(0, 0.04, 0.16);
  akReceiver.castShadow = castShadow;
  const akGrip = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.15, 0.07), akWoodMat);
  akGrip.position.set(0, -0.05, 0.04);
  akGrip.rotation.x = -0.26;
  const akStock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.28), akWoodMat);
  akStock.position.set(0, 0.01, -0.14);
  akStock.rotation.x = 0.12;
  const akHandguard = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.085, 0.24), akWoodMat);
  akHandguard.position.set(0, 0.045, 0.45);
  const akMag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.09), mattePolymerMat);
  akMag.position.set(0, -0.1, 0.26);
  akMag.rotation.x = 0.34;
  const akBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.02, 0.36, 8).rotateX(Math.PI / 2),
    gunmetalMat,
  );
  akBarrel.position.set(0, 0.055, 0.72);
  const akGasTube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.24, 8).rotateX(Math.PI / 2),
    gunmetalMat,
  );
  akGasTube.position.set(0, 0.088, 0.64);
  const akSight = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.06, 0.03), gunmetalMat);
  akSight.position.set(0, 0.09, 0.86);
  const akFlash = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 8).rotateX(Math.PI / 2), muzzleFlashMat);
  akFlash.position.set(0, 0.055, 0.98);
  akFlash.visible = false;
  akGroup.add(akReceiver, akGrip, akStock, akHandguard, akMag, akBarrel, akGasTube, akSight, akFlash);
  akGroup.visible = false;

  // 3. GOLF CLUB (Golf tayoqchasi) — Rubber Grip + Tapered Chrome Shaft + Titanium Driver Head
  const golfGroup = new THREE.Group();
  const gGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.28, 10), mattePolymerMat);
  gGrip.position.set(0, 0.04, 0);
  const gShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.009, 0.88, 10), chromeShaftMat);
  gShaft.position.set(0, -0.52, 0.04);
  gShaft.rotation.x = 0.08;
  gShaft.castShadow = castShadow;
  const gClubHead = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.075, 0.16), gunmetalMat);
  gClubHead.position.set(0.04, -0.96, 0.12);
  gClubHead.rotation.y = 0.15;
  const gFacePlate = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.065, 0.02), chromeShaftMat);
  gFacePlate.position.set(0.04, -0.96, 0.2);
  golfGroup.add(gGrip, gShaft, gClubHead, gFacePlate);
  golfGroup.visible = false;

  handGroup.add(pistolGroup, akGroup, golfGroup);

  const weaponFlashes: Partial<Record<WeaponId, THREE.Mesh>> = {
    pistol: pFlash,
    ak47: akFlash,
  };

  // Tracer & Spark & Golf Ball Pools
  const activeTracers: ActiveTracer[] = [];
  const activeSparks: ActiveSpark[] = [];
  const sparkGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
  const hitBloodSparkMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

  const golfBallGeo = new THREE.SphereGeometry(0.09, 12, 12);
  const golfBallMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.28,
    metalness: 0.05,
  });
  const golfBalls: GolfBallEntity[] = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(golfBallGeo, golfBallMat);
    m.visible = false;
    m.castShadow = castShadow;
    worldEffectsGroup.add(m);
    golfBalls.push({
      mesh: m,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      active: false,
      age: 0,
    });
  }
  let nextGolfBallIdx = 0;

  let cooldown = 0;
  let flashTimer = 0;
  let actionAnimTimer = 0;

  const spawnImpactSparks = (hx: number, hy: number, hz: number, count: number, crimson = false) => {
    const mat = crimson ? hitBloodSparkMat : sparkMat;
    for (let i = 0; i < count; i++) {
      const sm = new THREE.Mesh(sparkGeo, mat);
      sm.position.set(hx, hy, hz);
      worldEffectsGroup.add(sm);
      activeSparks.push({
        mesh: sm,
        vx: (Math.random() - 0.5) * 9,
        vy: 1.5 + Math.random() * 5.5,
        vz: (Math.random() - 0.5) * 9,
        life: 0.24 + Math.random() * 0.16,
      });
    }
  };

  const spawnBulletTracer = (start: THREE.Vector3, end: THREE.Vector3, colorHex: number, thickness: number) => {
    const dist = start.distanceTo(end);
    if (dist < 0.2) return;
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.92,
    });
    const geo = new THREE.CylinderGeometry(thickness, thickness, dist, 6);
    geo.rotateX(Math.PI / 2);
    const beam = new THREE.Mesh(geo, mat);
    beam.position.copy(start).lerp(end, 0.5);
    beam.lookAt(end);
    worldEffectsGroup.add(beam);
    activeTracers.push({
      mesh: beam,
      mat,
      life: 0.13,
      maxLife: 0.13,
    });
  };

  let currentEquipped: WeaponId = 'unarmed';

  return {
    handGroup,
    worldEffectsGroup,
    setEquippedWeapon: (weapon: WeaponId) => {
      if (weapon === currentEquipped) return;
      currentEquipped = weapon;
      cooldown = 0;
      actionAnimTimer = 0;
      pistolGroup.visible = weapon === 'pistol';
      akGroup.visible = weapon === 'ak47';
      golfGroup.visible = weapon === 'golf_club';
    },
    getActionTimer: () => actionAnimTimer,
    triggerAction: (
      weapon,
      playerPos,
      aimYaw,
      aimPitch,
      collisionWorld,
      pedestrianTargets,
      policePositions,
    ) => {
      if (weapon === 'unarmed' || cooldown > 0) {
        return { fired: false, alertedPolice: false, recoilAmount: 0, hitPedestrians: [] };
      }

      const hitPedestrians: PedestrianHitEvent[] = [];

      // Golf Club Swing + Launch 3D Golf Ball!
      if (weapon === 'golf_club') {
        cooldown = 0.65;
        actionAnimTimer = 0.52;

        const dirX = Math.sin(aimYaw);
        const dirZ = Math.cos(aimYaw);

        // Close-range melee golf club strike check against nearby pedestrians
        for (const ped of pedestrianTargets) {
          const rx = ped.x - playerPos.x;
          const rz = ped.z - playerPos.z;
          const dist = Math.hypot(rx, rz);
          if (dist <= 3.1) {
            const dot = dist > 0.05 ? (rx * dirX + rz * dirZ) / dist : 1;
            if (dot >= 0.18 || dist < 1.35) {
              hitPedestrians.push({ id: ped.id, dirX, dirZ });
              spawnImpactSparks(ped.x, 1.15, ped.z, 7, true);
            }
          }
        }

        const gb = golfBalls[nextGolfBallIdx % golfBalls.length];
        nextGolfBallIdx++;

        gb.x = playerPos.x + dirX * 0.85;
        gb.y = playerPos.y + 0.35;
        gb.z = playerPos.z + dirZ * 0.85;

        const launchSpeed = 31;
        gb.vx = dirX * launchSpeed;
        gb.vy = 8.5;
        gb.vz = dirZ * launchSpeed;
        gb.active = true;
        gb.age = 0;
        gb.mesh.position.set(gb.x, gb.y, gb.z);
        gb.mesh.visible = true;

        let hitPolice = hitPedestrians.length > 0;
        for (const pp of policePositions) {
          if (Math.hypot(pp.x - gb.x, pp.z - gb.z) < 3.6) {
            hitPolice = true;
            spawnImpactSparks(gb.x, 0.9, gb.z, 5);
          }
        }

        return {
          fired: true,
          alertedPolice: hitPolice,
          recoilAmount: 1.0,
          soundType: 'golf_club',
          hitPedestrians,
        };
      }

      // Firearms: Pistol & AK-47
      const fireRates: Record<'pistol' | 'ak47', number> = {
        pistol: 0.22,
        ak47: 0.105,
      };
      const maxRanges: Record<'pistol' | 'ak47', number> = {
        pistol: 85,
        ak47: 130,
      };
      const spreads: Record<'pistol' | 'ak47', number> = {
        pistol: 0.01,
        ak47: 0.02,
      };

      cooldown = fireRates[weapon];
      actionAnimTimer = 0.16;
      flashTimer = 0.055;

      const flashMesh = weaponFlashes[weapon];
      if (flashMesh) {
        flashMesh.visible = true;
        flashMesh.rotation.z = Math.random() * Math.PI * 2;
      }

      const spread = spreads[weapon];
      const yawWithSpread = aimYaw + (Math.random() - 0.5) * spread;
      const pitchAngle = -(aimPitch - 0.28) * 0.26;
      const cosP = Math.cos(pitchAngle);
      const dx = Math.sin(yawWithSpread) * cosP;
      const dy = Math.sin(pitchAngle);
      const dz = Math.cos(yawWithSpread) * cosP;

      const muzzleStart = new THREE.Vector3(
        playerPos.x + Math.sin(aimYaw) * 0.72 + Math.cos(aimYaw) * 0.2,
        playerPos.y + 1.36,
        playerPos.z + Math.cos(aimYaw) * 0.72 - Math.sin(aimYaw) * 0.2,
      );

      const range = maxRanges[weapon];
      let hitX = muzzleStart.x + dx * range;
      let hitY = muzzleStart.y + dy * range;
      let hitZ = muzzleStart.z + dz * range;
      let wallDist3D = range;
      let didHitSurface = false;

      // Step along ray to find first building or ground impact
      const steps = 64;
      for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * range;
        const sx = muzzleStart.x + dx * t;
        const sy = muzzleStart.y + dy * t;
        const sz = muzzleStart.z + dz * t;

        if (sy <= 0.05) {
          hitX = sx;
          hitY = 0.05;
          hitZ = sz;
          wallDist3D = t;
          didHitSurface = true;
          break;
        }
        if (collisionWorld.intersectsPoint(sx, sz, 0.1, sy)) {
          hitX = sx;
          hitY = sy;
          hitZ = sz;
          wallDist3D = t;
          didHitSurface = true;
          break;
        }
      }

      // Check ray intersection against all living pedestrians before wallDist3D
      const horizLen = Math.max(0.001, Math.hypot(dx, dz));
      const dir2DX = dx / horizLen;
      const dir2DZ = dz / horizLen;
      const maxHorizDist = wallDist3D * horizLen;
      const hitRadius = 0.85;

      const candidatePedHits: Array<{ ped: PedestrianTarget; along: number; impactY: number }> = [];
      for (const ped of pedestrianTargets) {
        const relX = ped.x - muzzleStart.x;
        const relZ = ped.z - muzzleStart.z;
        const along = relX * dir2DX + relZ * dir2DZ;
        if (along < 0.25 || along > maxHorizDist + 0.5) continue;
        const perpX = muzzleStart.x + dir2DX * along - ped.x;
        const perpZ = muzzleStart.z + dir2DZ * along - ped.z;
        const perpDist = Math.hypot(perpX, perpZ);
        if (perpDist <= hitRadius) {
          const t3D = along / horizLen;
          const rayY = muzzleStart.y + dy * t3D;
          if (rayY >= -0.35 && rayY <= 2.45) {
            candidatePedHits.push({
              ped,
              along,
              impactY: Math.max(0.65, Math.min(1.65, rayY)),
            });
          }
        }
      }

      candidatePedHits.sort((a, b) => a.along - b.along);

      if (candidatePedHits.length > 0) {
        const first = candidatePedHits[0];
        hitPedestrians.push({ id: first.ped.id, dirX: dir2DX, dirZ: dir2DZ });
        hitX = first.ped.x;
        hitY = first.impactY;
        hitZ = first.ped.z;
        didHitSurface = false;
        spawnImpactSparks(hitX, hitY, hitZ, 7, true);
      }

      const endVec = new THREE.Vector3(hitX, hitY, hitZ);
      spawnBulletTracer(muzzleStart, endVec, 0xfde047, 0.018);

      if (didHitSurface) {
        spawnImpactSparks(hitX, hitY, hitZ, 4, false);
      }

      // Check if gunfire hit/endangered pedestrians or targeted police cruisers
      let endangeredPublic = hitPedestrians.length > 0;
      if (!endangeredPublic) {
        for (const ped of pedestrianTargets) {
          const distPlayer = Math.hypot(ped.x - playerPos.x, ped.z - playerPos.z);
          const distImpact = Math.hypot(ped.x - hitX, ped.z - hitZ);
          if (distImpact < 6.5 || distPlayer < 16) {
            endangeredPublic = true;
            break;
          }
        }
      }
      if (!endangeredPublic) {
        for (const pol of policePositions) {
          const distPol = Math.hypot(pol.x - hitX, pol.z - hitZ);
          if (distPol < 5.5 || Math.hypot(pol.x - playerPos.x, pol.z - playerPos.z) < 28) {
            endangeredPublic = true;
            break;
          }
        }
      }

      return {
        fired: true,
        alertedPolice: endangeredPublic,
        recoilAmount: weapon === 'ak47' ? 0.22 : 0.28,
        soundType: weapon,
        hitPedestrians,
      };
    },
    update: (dt, collisionWorld, pedestrianTargets = []) => {
      const golfBallHitPedestrians: PedestrianHitEvent[] = [];

      if (cooldown > 0) cooldown = Math.max(0, cooldown - dt);
      if (actionAnimTimer > 0) actionAnimTimer = Math.max(0, actionAnimTimer - dt);

      if (flashTimer > 0) {
        flashTimer -= dt;
        if (flashTimer <= 0) {
          pFlash.visible = false;
          akFlash.visible = false;
        }
      }

      // Update bullet tracers
      for (let i = activeTracers.length - 1; i >= 0; i--) {
        const tr = activeTracers[i];
        tr.life -= dt;
        if (tr.life <= 0) {
          worldEffectsGroup.remove(tr.mesh);
          tr.mesh.geometry.dispose();
          tr.mat.dispose();
          activeTracers.splice(i, 1);
        } else {
          tr.mat.opacity = (tr.life / tr.maxLife) * 0.9;
        }
      }

      // Update impact sparks
      for (let i = activeSparks.length - 1; i >= 0; i--) {
        const sp = activeSparks[i];
        sp.life -= dt;
        if (sp.life <= 0) {
          worldEffectsGroup.remove(sp.mesh);
          activeSparks.splice(i, 1);
        } else {
          sp.vy -= 18 * dt;
          sp.mesh.position.x += sp.vx * dt;
          sp.mesh.position.y = Math.max(0.05, sp.mesh.position.y + sp.vy * dt);
          sp.mesh.position.z += sp.vz * dt;
        }
      }

      // Step 3D Golf Balls physics + pedestrian strike check
      for (const gb of golfBalls) {
        if (!gb.active) continue;
        gb.age += dt;
        if (gb.age > 14 || Math.abs(gb.x) > WORLD_PLAYABLE_LIMIT || Math.abs(gb.z) > WORLD_PLAYABLE_LIMIT) {
          gb.active = false;
          gb.mesh.visible = false;
          continue;
        }

        gb.vy -= 19.6 * dt;
        const nextX = gb.x + gb.vx * dt;
        const nextZ = gb.z + gb.vz * dt;

        if (collisionWorld.intersectsPoint(nextX, gb.z, 0.14, gb.y)) {
          gb.vx = -gb.vx * 0.55;
        } else {
          gb.x = nextX;
        }

        if (collisionWorld.intersectsPoint(gb.x, nextZ, 0.14, gb.y)) {
          gb.vz = -gb.vz * 0.55;
        } else {
          gb.z = nextZ;
        }

        gb.y += gb.vy * dt;
        if (gb.y <= 0.09) {
          gb.y = 0.09;
          if (Math.abs(gb.vy) > 1.4) {
            gb.vy = -gb.vy * 0.56;
          } else {
            gb.vy = 0;
          }
          gb.vx *= Math.max(0, 1 - 1.8 * dt);
          gb.vz *= Math.max(0, 1 - 1.8 * dt);
        }

        const horizSpd = Math.hypot(gb.vx, gb.vz);
        if (horizSpd > 3.5 && gb.y <= 2.3 && pedestrianTargets.length > 0) {
          for (const ped of pedestrianTargets) {
            if (Math.hypot(ped.x - gb.x, ped.z - gb.z) <= 0.95) {
              golfBallHitPedestrians.push({
                id: ped.id,
                dirX: gb.vx / horizSpd,
                dirZ: gb.vz / horizSpd,
              });
              spawnImpactSparks(ped.x, Math.max(0.5, gb.y), ped.z, 7, true);
              gb.vx *= -0.4;
              gb.vz *= -0.4;
              break;
            }
          }
        }

        gb.mesh.position.set(gb.x, gb.y, gb.z);
      }

      return { golfBallHitPedestrians };
    },
  };
}
