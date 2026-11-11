import * as THREE from 'three';
import type { Vec3 } from '../types/game';
import { audioEngine } from '../utils/audio';

export interface ViltrumiteInfo {
  id: string;
  name: string;
  locationTitle: string;
  pos: Vec3;
  baseY: number;
  hp: number;
  maxHp: number;
  isFiringLaser: boolean;
  distToPlayer: number;
}

export interface ViltrumiteSystemHandle {
  group: THREE.Group;
  update: (dt: number, elapsed: number, playerPos: Vec3) => { activeNearBoss: ViltrumiteInfo | null };
  damageBoss: (id: string, amount: number) => void;
  getAllBosses: () => ViltrumiteInfo[];
}

interface ViltrumiteRig {
  id: string;
  name: string;
  locationTitle: string;
  baseX: number;
  baseY: number;
  baseZ: number;
  hp: number;
  maxHp: number;
  root: THREE.Group;
  capeSegments: THREE.Mesh[];
  headPivot: THREE.Group;
  laserBeamL: THREE.Mesh;
  laserBeamR: THREE.Mesh;
  energyRing: THREE.Mesh;
  isFiringLaser: boolean;
  laserCooldown: number;
  laserFireTimer: number;
  distToPlayer: number;
}

export function createViltrumiteSystem(isSoftwareGl: boolean): ViltrumiteSystemHandle {
  const group = new THREE.Group();

  // PBR Materials for legendary Viltrumite suits & effects
  const whiteSuitMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.38,
    metalness: 0.15,
  });
  const redEmblemMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    emissive: 0x991b1b,
    emissiveIntensity: 0.72,
    roughness: 0.28,
  });
  const capeMat = new THREE.MeshStandardMaterial({
    color: 0xb91c1c,
    roughness: 0.65,
    side: THREE.DoubleSide,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xf6d3b3,
    roughness: 0.52,
  });
  const darkHairMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.85,
  });
  const laserEyeMat = new THREE.MeshBasicMaterial({
    color: 0xff1e1e,
  });
  const laserBeamMat = new THREE.MeshBasicMaterial({
    color: 0xff2a2a,
    transparent: true,
    opacity: 0.88,
  });
  const auraMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const specs = [
    {
      id: 'viltrumite_omni',
      name: 'VILTEROYT: OMNI-KOMANDIR',
      locationTitle: 'MILITSIYA BOSH BOSH QARMASI (MARKAZIY BAZA)',
      x: -205,
      y: 19.5,
      z: -85,
    },
    {
      id: 'viltrumite_apex',
      name: 'VILTEROYT: KANON',
      locationTitle: 'APEX MOLIYA BANKI SKYSCRAPER TOMI',
      x: -44,
      y: 98.5,
      z: -170,
    },
    {
      id: 'viltrumite_orion',
      name: 'VILTEROYT: ANISSA',
      locationTitle: 'ORION MEDIA HOLDING MINORASI TOMI',
      x: 86,
      y: 92.5,
      z: -170,
    },
    {
      id: 'viltrumite_imax',
      name: 'VILTEROYT: THULA',
      locationTitle: 'IMAX GRAND KINOTEATR SKYSCRAPER TOMI',
      x: -86,
      y: 84.5,
      z: -44,
    },
  ];

  const bosses: ViltrumiteRig[] = specs.map((sp) => {
    const root = new THREE.Group();
    root.position.set(sp.x, sp.y, sp.z);
    group.add(root);

    // 1. Muscular Upper Body Torso (White hero suit with red crest)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.88, 0.44), whiteSuitMat);
    torso.position.y = 1.35;
    torso.castShadow = !isSoftwareGl;

    // Iconic red chest chevron / crest
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.52, 0.08), redEmblemMat);
    crest.position.set(0, 1.45, 0.23);

    // Red hero belt
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.14, 0.46), redEmblemMat);
    belt.position.set(0, 0.94, 0);

    // Pelvis & Legs
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.26, 0.4), whiteSuitMat);
    pelvis.position.set(0, 0.78, 0);

    for (const sx of [-0.18, 0.18]) {
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.72, 0.28), whiteSuitMat);
      thigh.position.set(sx, 0.44, 0);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.44, 0.34), redEmblemMat);
      boot.position.set(sx, -0.08, 0.04);
      root.add(thigh, boot);
    }

    // Heroic Arms with Red Gauntlets
    for (const sx of [-0.48, 0.48]) {
      const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.62, 0.28), whiteSuitMat);
      shoulder.position.set(sx, 1.45, 0);
      const gauntlet = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.38, 0.3), redEmblemMat);
      gauntlet.position.set(sx, 1.02, 0);
      root.add(shoulder, gauntlet);
    }

    // 2. Chiseled Head with dark hair, mustache and glowing red laser eyes
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 1.95, 0);

    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.36), skinMat);
    headMesh.position.y = 0.14;

    const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.38), darkHairMat);
    hairMesh.position.set(0, 0.32, -0.02);

    // Viltrumite signature mustache
    const mustache = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.08), darkHairMat);
    mustache.position.set(0, 0.08, 0.19);

    // Glowing laser eyes
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.04, 0.04), laserEyeMat);
    eyeL.position.set(-0.085, 0.18, 0.185);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.04, 0.04), laserEyeMat);
    eyeR.position.set(0.085, 0.18, 0.185);

    headPivot.add(headMesh, hairMesh, mustache, eyeL, eyeR);
    root.add(headPivot);

    // 3. Flowing 4-segment Crimson Hero Cape
    const capeSegments: THREE.Mesh[] = [];
    for (let c = 0; c < 4; c++) {
      const cMesh = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.42, 0.05), capeMat);
      cMesh.position.set(0, 1.62 - c * 0.38, -0.25 - c * 0.06);
      root.add(cMesh);
      capeSegments.push(cMesh);
    }

    // 4. Twin Blazing Crimson Eye Laser Beams (scaled dynamically when attacking)
    const beamGeoL = new THREE.CylinderGeometry(0.06, 0.06, 1, 8);
    beamGeoL.rotateX(Math.PI / 2);
    const laserBeamL = new THREE.Mesh(beamGeoL, laserBeamMat);
    laserBeamL.visible = false;

    const beamGeoR = new THREE.CylinderGeometry(0.06, 0.06, 1, 8);
    beamGeoR.rotateX(Math.PI / 2);
    const laserBeamR = new THREE.Mesh(beamGeoR, laserBeamMat);
    laserBeamR.visible = false;
    group.add(laserBeamL, laserBeamR);

    // 5. Supersonic energy distortion aura ring
    const energyRing = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.65, 32), auraMat);
    energyRing.rotation.x = Math.PI * 0.5;
    energyRing.position.y = 0.85;
    root.add(energyRing);

    root.add(torso, crest, belt, pelvis);

    return {
      id: sp.id,
      name: sp.name,
      locationTitle: sp.locationTitle,
      baseX: sp.x,
      baseY: sp.y,
      baseZ: sp.z,
      hp: 1000,
      maxHp: 1000,
      root,
      capeSegments,
      headPivot,
      laserBeamL,
      laserBeamR,
      energyRing,
      isFiringLaser: false,
      laserCooldown: 0.5,
      laserFireTimer: 0,
      distToPlayer: 999,
    };
  });

  const update: ViltrumiteSystemHandle['update'] = (dt, elapsed, playerPos) => {
    let closestBoss: ViltrumiteRig | null = null;
    let closestDist = Infinity;

    for (let i = 0; i < bosses.length; i++) {
      const b = bosses[i];

      // Levitating hover motion
      const hoverY = b.baseY + Math.sin(elapsed * 2.2 + i * 1.5) * 0.65;
      b.root.position.y = hoverY;

      // Aura rotation
      b.energyRing.rotation.z += dt * 2.5;

      // Fluttering cape in supersonic updraft
      for (let c = 0; c < b.capeSegments.length; c++) {
        const wave = Math.sin(elapsed * 7.5 + c * 1.2 + i) * 0.14 * (c + 1);
        b.capeSegments[c].rotation.x = 0.22 + wave;
        b.capeSegments[c].position.z = -0.24 - c * 0.08 + wave * 0.15;
      }

      // Distance to active player
      const dx = playerPos.x - b.baseX;
      const dy = playerPos.y - hoverY;
      const dz = playerPos.z - b.baseZ;
      const dist = Math.hypot(dx, dy, dz);
      b.distToPlayer = dist;

      if (dist < closestDist) {
        closestDist = dist;
        closestBoss = b;
      }

      // If player within 36m, turn and lock eyes on the player!
      if (dist < 36) {
        const lookYaw = Math.atan2(dx, dz);
        b.root.rotation.y = THREE.MathUtils.damp(b.root.rotation.y, lookYaw, 8, dt);
        const pitchAngle = Math.atan2(dy, Math.hypot(dx, dz));
        b.headPivot.rotation.x = THREE.MathUtils.damp(b.headPivot.rotation.x, -pitchAngle, 8, dt);

        // Eye Laser Attack State!
        if (b.laserFireTimer > 0) {
          b.laserFireTimer -= dt;
          b.isFiringLaser = true;

          // Connect twin lasers from eyes to player chest
          const eyeWorldL = new THREE.Vector3(-0.085, 2.12, 0.2).applyMatrix4(b.root.matrixWorld);
          const eyeWorldR = new THREE.Vector3(0.085, 2.12, 0.2).applyMatrix4(b.root.matrixWorld);
          const aimChest = new THREE.Vector3(playerPos.x, playerPos.y + 1.1, playerPos.z);

          const lenL = eyeWorldL.distanceTo(aimChest);
          const lenR = eyeWorldR.distanceTo(aimChest);

          b.laserBeamL.visible = true;
          b.laserBeamL.position.copy(eyeWorldL).lerp(aimChest, 0.5);
          b.laserBeamL.scale.set(1, 1, Math.max(0.1, lenL));
          b.laserBeamL.lookAt(aimChest);

          b.laserBeamR.visible = true;
          b.laserBeamR.position.copy(eyeWorldR).lerp(aimChest, 0.5);
          b.laserBeamR.scale.set(1, 1, Math.max(0.1, lenR));
          b.laserBeamR.lookAt(aimChest);

          if (b.laserFireTimer <= 0) {
            b.isFiringLaser = false;
            b.laserBeamL.visible = false;
            b.laserBeamR.visible = false;
            b.laserCooldown = 2.4;
          }
        } else {
          b.laserBeamL.visible = false;
          b.laserBeamR.visible = false;
          b.isFiringLaser = false;
          b.laserCooldown -= dt;
          if (b.laserCooldown <= 0) {
            b.laserFireTimer = 1.4; // 1.4s laser burst
            audioEngine.playLaserBeam();
          }
        }
      } else {
        b.laserBeamL.visible = false;
        b.laserBeamR.visible = false;
        b.isFiringLaser = false;
        b.root.rotation.y = THREE.MathUtils.damp(b.root.rotation.y, i * 1.5, 2, dt);
        b.headPivot.rotation.x = THREE.MathUtils.damp(b.headPivot.rotation.x, 0, 4, dt);
      }
    }

    const activeNearBoss: ViltrumiteInfo | null =
      closestBoss && closestDist < 75
        ? {
            id: closestBoss.id,
            name: closestBoss.name,
            locationTitle: closestBoss.locationTitle,
            pos: { x: closestBoss.baseX, y: closestBoss.baseY, z: closestBoss.baseZ },
            baseY: closestBoss.baseY,
            hp: closestBoss.hp,
            maxHp: closestBoss.maxHp,
            isFiringLaser: closestBoss.isFiringLaser,
            distToPlayer: Math.round(closestDist),
          }
        : null;

    return { activeNearBoss };
  };

  const damageBoss = (id: string, amount: number) => {
    const b = bosses.find((x) => x.id === id);
    if (b) {
      b.hp = Math.max(0, b.hp - amount);
    }
  };

  const getAllBosses = (): ViltrumiteInfo[] => {
    return bosses.map((b) => ({
      id: b.id,
      name: b.name,
      locationTitle: b.locationTitle,
      pos: { x: b.baseX, y: b.baseY, z: b.baseZ },
      baseY: b.baseY,
      hp: b.hp,
      maxHp: b.maxHp,
      isFiringLaser: b.isFiringLaser,
      distToPlayer: Math.round(b.distToPlayer),
    }));
  };

  return {
    group,
    update,
    damageBoss,
    getAllBosses,
  };
}
