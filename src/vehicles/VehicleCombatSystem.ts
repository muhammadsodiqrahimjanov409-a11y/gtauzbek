import * as THREE from 'three';
import type { Vec3 } from '../types/game';
import type { CollisionWorld } from '../utils/collision';
import type { ViltrumiteInfo } from '../world/ViltrumiteSystem';
import {
  audioEngine,
  playTankCannon,
  playAirplaneCannon,
  playBombDrop,
  playBombExplosion,
} from '../utils/audio';

export interface CombatShell {
  mesh: THREE.Mesh;
  light?: THREE.PointLight;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  distanceTraveled: number;
  maxDistance: number;
  type: 'tank_shell' | 'airplane_bullet' | 'airplane_bomb';
  active: boolean;
}

export interface ExplosionParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  scaleRate: number;
  life: number;
  maxLife: number;
}

export interface ShockwaveRing {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxRadius: number;
}

export interface MuzzleFlashItem {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

export interface VehicleCombatSystem {
  group: THREE.Group;
  fireTankCannon: (
    vehPos: Vec3,
    vehRotY: number,
    vehSpeed: number,
  ) => boolean;
  fireAirplaneGuns: (
    vehPos: Vec3,
    vehRotY: number,
    vehSpeed: number,
  ) => boolean;
  dropAirplaneBomb: (
    vehPos: Vec3,
    vehRotY: number,
    vehSpeed: number,
  ) => boolean;
  getTankCooldownRatio: () => number;
  getBombCooldownRatio: () => number;
  update: (
    dt: number,
    collisionWorld: CollisionWorld,
    bosses: ViltrumiteInfo[],
    onBossDamage: (id: string, dmg: number) => void,
    onExplosionBlast: (x: number, z: number, radius: number, isMajor: boolean) => void,
  ) => { screenShakeAmount: number };
  dispose: () => void;
}

export function createVehicleCombatSystem(): VehicleCombatSystem {
  const group = new THREE.Group();

  // Reusable Materials
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xffaa22,
    emissive: 0xff5500,
    emissiveIntensity: 2.8,
    metalness: 0.9,
    roughness: 0.1,
  });

  const bulletMat = new THREE.MeshBasicMaterial({
    color: 0xffee44,
  });

  const bombBodyMat = new THREE.MeshStandardMaterial({
    color: 0x3d493a, // Military olive drab
    metalness: 0.6,
    roughness: 0.35,
  });

  const bombStripeMat = new THREE.MeshBasicMaterial({
    color: 0xffcc00, // Yellow hazard band
  });

  const bombFinMat = new THREE.MeshStandardMaterial({
    color: 0x222622,
    metalness: 0.8,
    roughness: 0.3,
  });

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xfff0aa,
    transparent: true,
    opacity: 0.95,
  });

  const fireMat = new THREE.MeshBasicMaterial({
    color: 0xff6600,
    transparent: true,
    opacity: 0.9,
  });

  const smokeMat = new THREE.MeshBasicMaterial({
    color: 0x444444,
    transparent: true,
    opacity: 0.5,
  });

  const shockwaveMat = new THREE.MeshBasicMaterial({
    color: 0xffaa44,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  });

  // Reusable Geometries
  const shellGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.1, 12).rotateX(Math.PI / 2);
  const bulletGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.4, 8).rotateX(Math.PI / 2);
  const flashGeo = new THREE.OctahedronGeometry(0.7, 1);
  const fireGeo = new THREE.SphereGeometry(1, 8, 8);
  const smokeGeo = new THREE.DodecahedronGeometry(1);
  const shockwaveGeo = new THREE.RingGeometry(0.2, 1, 24).rotateX(-Math.PI / 2);

  // Active collections
  const activeShells: CombatShell[] = [];
  const activeExplosions: ExplosionParticle[] = [];
  const activeShockwaves: ShockwaveRing[] = [];
  const activeFlashes: MuzzleFlashItem[] = [];

  // Cooldown timers
  let tankCooldown = 0;
  let airplaneGunCooldown = 0;
  let airplaneBombCooldown = 0;
  let gunSideToggle = false;
  let queuedShake = 0;

  function createBombMesh(): THREE.Mesh {
    const bombRoot = new THREE.Group();

    // Cylindrical main warhead
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.35, 1.6, 14).rotateX(Math.PI / 2),
      bombBodyMat,
    );
    // Rounded nose
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2),
      bombBodyMat,
    );
    nose.position.z = 0.8;

    // Yellow explosive marker stripe
    const stripe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.325, 0.325, 0.22, 14).rotateX(Math.PI / 2),
      bombStripeMat,
    );
    stripe.position.z = 0.45;

    // Conical tail taper
    const tailCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 0.9, 12).rotateX(-Math.PI / 2),
      bombBodyMat,
    );
    tailCone.position.z = -1.25;

    // 4 Stabilizing Tail Fins
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.65, 0.7),
        bombFinMat,
      );
      fin.position.set(Math.cos(angle) * 0.32, Math.sin(angle) * 0.32, -1.35);
      fin.rotation.z = angle;
      bombRoot.add(fin);
    }

    bombRoot.add(body, nose, stripe, tailCone);

    // Wrap in standard Mesh container for uniform interface
    const container = new THREE.Mesh();
    container.add(bombRoot);
    return container;
  }

  function spawnExplosion(pos: Vec3, radius: number, isMajor: boolean) {
    playBombExplosion();
    queuedShake = Math.max(queuedShake, isMajor ? 1.4 : 0.85);

    // Primary fireball sphere
    const fireball = new THREE.Mesh(fireGeo, fireMat.clone());
    fireball.position.set(pos.x, Math.max(0.6, pos.y), pos.z);
    fireball.scale.set(0.6, 0.6, 0.6);
    group.add(fireball);
    activeExplosions.push({
      mesh: fireball,
      vx: 0,
      vy: 1.5,
      vz: 0,
      scaleRate: radius * 3.8,
      life: 0,
      maxLife: isMajor ? 0.75 : 0.45,
    });

    // Expanding shockwave ring along ground
    const ring = new THREE.Mesh(shockwaveGeo, shockwaveMat.clone());
    ring.position.set(pos.x, Math.max(0.12, pos.y * 0.1), pos.z);
    group.add(ring);
    activeShockwaves.push({
      mesh: ring,
      life: 0,
      maxLife: isMajor ? 0.65 : 0.38,
      maxRadius: radius * 1.6,
    });

    // Dynamic point light blast
    const pLight = new THREE.PointLight(0xff6600, isMajor ? 12 : 6, radius * 3.2);
    pLight.position.set(pos.x, Math.max(1, pos.y + 0.8), pos.z);
    group.add(pLight);

    // Flying fiery debris particles
    const particleCount = isMajor ? 14 : 7;
    for (let i = 0; i < particleCount; i++) {
      const pMesh = new THREE.Mesh(smokeGeo, smokeMat.clone());
      pMesh.position.set(pos.x, Math.max(0.4, pos.y), pos.z);
      const angle = Math.random() * Math.PI * 2;
      const speed = (isMajor ? 16 : 9) * (0.4 + Math.random() * 0.7);
      pMesh.scale.setScalar(0.4 + Math.random() * 0.4);
      group.add(pMesh);

      activeExplosions.push({
        mesh: pMesh,
        vx: Math.cos(angle) * speed,
        vy: (isMajor ? 14 : 8) * (0.5 + Math.random() * 0.6),
        vz: Math.sin(angle) * speed,
        scaleRate: isMajor ? 3.0 : 1.8,
        life: 0,
        maxLife: (isMajor ? 0.85 : 0.5) * (0.8 + Math.random() * 0.4),
      });
    }

    // Auto-remove light after flash
    setTimeout(() => {
      group.remove(pLight);
      pLight.dispose();
    }, (isMajor ? 400 : 250));
  }

  const fireTankCannon = (vehPos: Vec3, vehRotY: number, vehSpeed: number): boolean => {
    if (tankCooldown > 0) return false;
    tankCooldown = 0.95; // 0.95s reload cooldown

    playTankCannon();
    queuedShake = 0.9;

    const sinY = Math.sin(vehRotY);
    const cosY = Math.cos(vehRotY);

    // Muzzle position at tip of 120mm barrel
    const muzzleX = vehPos.x + sinY * 5.4;
    const muzzleY = (vehPos.y || 0) + 1.48;
    const muzzleZ = vehPos.z + cosY * 5.4;

    // Visual Muzzle Flash
    const flash = new THREE.Mesh(flashGeo, flashMat.clone());
    flash.position.set(muzzleX, muzzleY, muzzleZ);
    flash.scale.set(1.4, 1.4, 2.2);
    flash.rotation.y = vehRotY;
    group.add(flash);
    activeFlashes.push({ mesh: flash, life: 0, maxLife: 0.12 });

    // High velocity artillery shell
    const shellSpeed = 125 + Math.max(0, vehSpeed);
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.position.set(muzzleX, muzzleY, muzzleZ);
    shell.rotation.y = vehRotY;
    group.add(shell);

    activeShells.push({
      mesh: shell,
      x: muzzleX,
      y: muzzleY,
      z: muzzleZ,
      vx: sinY * shellSpeed,
      vy: 0.8, // slight flat ballistic arc
      vz: cosY * shellSpeed,
      distanceTraveled: 0,
      maxDistance: 190,
      type: 'tank_shell',
      active: true,
    });

    return true;
  };

  const fireAirplaneGuns = (vehPos: Vec3, vehRotY: number, vehSpeed: number): boolean => {
    if (airplaneGunCooldown > 0) return false;
    airplaneGunCooldown = 0.085; // rapid 30mm stream (~12 rounds/sec)

    playAirplaneCannon();
    gunSideToggle = !gunSideToggle;
    const sideX = gunSideToggle ? 1.05 : -1.05;

    const sinY = Math.sin(vehRotY);
    const cosY = Math.cos(vehRotY);

    // Wing autocannon position
    const wingX = vehPos.x + cosY * sideX + sinY * 2.3;
    const wingY = (vehPos.y || 0) + 0.88;
    const wingZ = vehPos.z - sinY * sideX + cosY * 2.3;

    // Muzzle spark
    const flash = new THREE.Mesh(flashGeo, flashMat.clone());
    flash.position.set(wingX, wingY, wingZ);
    flash.scale.set(0.5, 0.5, 0.8);
    group.add(flash);
    activeFlashes.push({ mesh: flash, life: 0, maxLife: 0.06 });

    // Supersonic tracer bullet
    const bulletSpeed = 210 + Math.max(0, vehSpeed);
    const bullet = new THREE.Mesh(bulletGeo, bulletMat);
    bullet.position.set(wingX, wingY, wingZ);
    bullet.rotation.y = vehRotY;
    group.add(bullet);

    activeShells.push({
      mesh: bullet,
      x: wingX,
      y: wingY,
      z: wingZ,
      vx: sinY * bulletSpeed,
      vy: -0.4, // slight forward dive
      vz: cosY * bulletSpeed,
      distanceTraveled: 0,
      maxDistance: 240,
      type: 'airplane_bullet',
      active: true,
    });

    return true;
  };

  const dropAirplaneBomb = (vehPos: Vec3, vehRotY: number, vehSpeed: number): boolean => {
    if (airplaneBombCooldown > 0) return false;
    airplaneBombCooldown = 1.25; // 1.25s bomb reload

    playBombDrop();
    audioEngine.vibrate(80, true);

    const sinY = Math.sin(vehRotY);
    const cosY = Math.cos(vehRotY);

    // Release from fuselage belly
    const releaseX = vehPos.x;
    const releaseY = Math.max(1.0, (vehPos.y || 0) - 0.45);
    const releaseZ = vehPos.z;

    const bombMesh = createBombMesh();
    bombMesh.position.set(releaseX, releaseY, releaseZ);
    bombMesh.rotation.y = vehRotY;
    group.add(bombMesh);

    // Inherit plane forward velocity vector
    const forwardSpeed = Math.max(8, vehSpeed);
    activeShells.push({
      mesh: bombMesh,
      x: releaseX,
      y: releaseY,
      z: releaseZ,
      vx: sinY * forwardSpeed,
      vy: -2.0, // initial drop push
      vz: cosY * forwardSpeed,
      distanceTraveled: 0,
      maxDistance: 450,
      type: 'airplane_bomb',
      active: true,
    });

    return true;
  };

  const update = (
    dt: number,
    collisionWorld: CollisionWorld,
    bosses: ViltrumiteInfo[],
    onBossDamage: (id: string, dmg: number) => void,
    onExplosionBlast: (x: number, z: number, radius: number, isMajor: boolean) => void,
  ): { screenShakeAmount: number } => {
    if (tankCooldown > 0) tankCooldown = Math.max(0, tankCooldown - dt);
    if (airplaneGunCooldown > 0) airplaneGunCooldown = Math.max(0, airplaneGunCooldown - dt);
    if (airplaneBombCooldown > 0) airplaneBombCooldown = Math.max(0, airplaneBombCooldown - dt);

    const shakeResult = queuedShake;
    queuedShake = THREE.MathUtils.damp(queuedShake, 0, 7.5, dt);

    // Update active projectiles
    for (let i = activeShells.length - 1; i >= 0; i--) {
      const s = activeShells[i];
      if (!s.active) {
        group.remove(s.mesh);
        activeShells.splice(i, 1);
        continue;
      }

      if (s.type === 'airplane_bomb') {
        // Heavy gravity acceleration for aerial bomb
        s.vy -= 24 * dt;
      }

      const dx = s.vx * dt;
      const dy = s.vy * dt;
      const dz = s.vz * dt;

      s.x += dx;
      s.y += dy;
      s.z += dz;
      s.distanceTraveled += Math.hypot(dx, dz);

      s.mesh.position.set(s.x, s.y, s.z);

      if (s.type === 'airplane_bomb') {
        // Point bomb nose toward its trajectory vector
        const horizSpeed = Math.hypot(s.vx, s.vz);
        const pitch = Math.atan2(-s.vy, Math.max(0.1, horizSpeed));
        s.mesh.rotation.x = pitch;
      }

      let hitOccurred = false;
      let hitDamage = 0;
      let blastRadius = 8;
      let isMajor = false;

      // 1. Ground collision
      if (s.y <= 0.15) {
        hitOccurred = true;
        s.y = 0.2;
      }

      // 2. Skyscraper and Building collision
      if (!hitOccurred && collisionWorld.intersectsPoint(s.x, s.z, 0.45, s.y)) {
        hitOccurred = true;
      }

      // 3. Boss Direct Hit Detection
      if (!hitOccurred) {
        for (const b of bosses) {
          const bossDist = Math.hypot(b.pos.x - s.x, b.pos.z - s.z);
          const bossYDist = Math.abs(b.pos.y - s.y);
          if (bossDist < 3.8 && bossYDist < 4.2) {
            hitOccurred = true;
            hitDamage = s.type === 'airplane_bomb' ? 650 : s.type === 'tank_shell' ? 320 : 65;
            onBossDamage(b.id, hitDamage);
            break;
          }
        }
      }

      // 4. Max Range Exceeded
      if (!hitOccurred && s.distanceTraveled >= s.maxDistance) {
        hitOccurred = true;
        s.y = Math.max(0.2, s.y);
      }

      if (hitOccurred) {
        s.active = false;
        group.remove(s.mesh);
        activeShells.splice(i, 1);

        if (s.type === 'airplane_bomb') {
          blastRadius = 22;
          isMajor = true;
          hitDamage = hitDamage || 550;
        } else if (s.type === 'tank_shell') {
          blastRadius = 12;
          isMajor = true;
          hitDamage = hitDamage || 280;
        } else {
          blastRadius = 3.8;
          isMajor = false;
          hitDamage = hitDamage || 50;
        }

        spawnExplosion({ x: s.x, y: s.y, z: s.z }, blastRadius, isMajor);
        onExplosionBlast(s.x, s.z, blastRadius, isMajor);

        // Radial boss damage within blast radius
        for (const b of bosses) {
          const dist = Math.hypot(b.pos.x - s.x, b.pos.z - s.z);
          if (dist < blastRadius + 2.5) {
            const factor = Math.max(0.2, 1 - dist / (blastRadius + 2.5));
            onBossDamage(b.id, Math.round(hitDamage * factor));
          }
        }
      }
    }

    // Update Explosions
    for (let i = activeExplosions.length - 1; i >= 0; i--) {
      const exp = activeExplosions[i];
      exp.life += dt;
      if (exp.life >= exp.maxLife) {
        group.remove(exp.mesh);
        activeExplosions.splice(i, 1);
        continue;
      }

      exp.mesh.position.x += exp.vx * dt;
      exp.mesh.position.y += exp.vy * dt;
      exp.mesh.position.z += exp.vz * dt;
      exp.vy -= 12 * dt; // gravity on debris

      const progress = exp.life / exp.maxLife;
      const s = 1 + exp.scaleRate * progress;
      exp.mesh.scale.set(s, s, s);

      if (exp.mesh.material instanceof THREE.Material) {
        exp.mesh.material.opacity = Math.max(0, 1 - progress);
      }
    }

    // Update Shockwaves
    for (let i = activeShockwaves.length - 1; i >= 0; i--) {
      const sw = activeShockwaves[i];
      sw.life += dt;
      if (sw.life >= sw.maxLife) {
        group.remove(sw.mesh);
        activeShockwaves.splice(i, 1);
        continue;
      }

      const progress = sw.life / sw.maxLife;
      const r = THREE.MathUtils.lerp(0.5, sw.maxRadius, progress);
      sw.mesh.scale.set(r, r, r);
      if (sw.mesh.material instanceof THREE.Material) {
        sw.mesh.material.opacity = Math.max(0, (1 - progress) * 0.85);
      }
    }

    // Update Muzzle Flashes
    for (let i = activeFlashes.length - 1; i >= 0; i--) {
      const fl = activeFlashes[i];
      fl.life += dt;
      if (fl.life >= fl.maxLife) {
        group.remove(fl.mesh);
        activeFlashes.splice(i, 1);
        continue;
      }
      const progress = fl.life / fl.maxLife;
      if (fl.mesh.material instanceof THREE.Material) {
        fl.mesh.material.opacity = Math.max(0, 1 - progress);
      }
    }

    return { screenShakeAmount: shakeResult };
  };

  const getTankCooldownRatio = (): number => Math.min(1, tankCooldown / 0.95);
  const getBombCooldownRatio = (): number => Math.min(1, airplaneBombCooldown / 1.25);

  const dispose = (): void => {
    for (const s of activeShells) group.remove(s.mesh);
    for (const exp of activeExplosions) group.remove(exp.mesh);
    for (const sw of activeShockwaves) group.remove(sw.mesh);
    for (const fl of activeFlashes) group.remove(fl.mesh);
    activeShells.length = 0;
    activeExplosions.length = 0;
    activeShockwaves.length = 0;
    activeFlashes.length = 0;
  };

  return {
    group,
    fireTankCannon,
    fireAirplaneGuns,
    dropAirplaneBomb,
    getTankCooldownRatio,
    getBombCooldownRatio,
    update,
    dispose,
  };
}
