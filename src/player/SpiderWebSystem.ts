import * as THREE from 'three';
import type { Vec3 } from '../types/game';
import type { CollisionWorld } from '../utils/collision';
import { audioEngine } from '../utils/audio';

export interface WebAimTarget {
  point: Vec3;
  normal: Vec3;
  distance: number;
  label: string;
}

export interface SpiderWebSystemHandle {
  group: THREE.Group;
  isZipping: boolean;
  aimTarget: WebAimTarget | null;
  update: (
    dt: number,
    camera: THREE.Camera,
    playerPos: Vec3,
    collisionWorld: CollisionWorld,
  ) => void;
  triggerWebZip: (playerPos: Vec3) => boolean;
  stepFlight: (
    dt: number,
    playerPos: Vec3,
    setPos: (x: number, y: number, z: number) => void,
    setGrounded: (grounded: boolean) => void,
  ) => { finished: boolean };
  reset: () => void;
}

export function createSpiderWebSystem(isSoftwareGl: boolean): SpiderWebSystemHandle {
  const group = new THREE.Group();

  // 1. Sleek 3D Spider-Man Web Crosshair Reticle projected onto targeted surface
  const reticleGroup = new THREE.Group();
  reticleGroup.visible = false;
  group.add(reticleGroup);

  const ringGeo = new THREE.RingGeometry(0.55, 0.68, 24);
  const spiderWebMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const reticleRing = new THREE.Mesh(ringGeo, spiderWebMat);
  reticleGroup.add(reticleRing);

  // Cross hair spider diagonals
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.04, 0.02),
      spiderWebMat,
    );
    spoke.rotation.z = (i * Math.PI) / 4;
    reticleGroup.add(spoke);
  }

  const centerDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.14, 12),
    new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, depthWrite: false }),
  );
  reticleGroup.add(centerDot);

  // 2. High-Tensile 3D Web Strand (stretches from player hand to target anchor point)
  const webLineGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 8);
  webLineGeo.rotateX(Math.PI / 2);
  const webMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.65,
    roughness: 0.2,
    metalness: 0.1,
  });
  const webStrandMesh = new THREE.Mesh(webLineGeo, webMat);
  webStrandMesh.visible = false;
  group.add(webStrandMesh);

  // 3. Web anchor impact sparkles / dust puff
  const sparkGeo = new THREE.BufferGeometry();
  const sparkCount = 18;
  const sparkPositions = new Float32Array(sparkCount * 3);
  for (let i = 0; i < sparkCount; i++) {
    sparkPositions[i * 3 + 0] = (Math.random() - 0.5) * 0.8;
    sparkPositions[i * 3 + 1] = (Math.random() - 0.5) * 0.8;
    sparkPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
  }
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: 0x38bdf8,
    size: 0.22,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const sparkMesh = new THREE.Points(sparkGeo, sparkMat);
  sparkMesh.visible = false;
  group.add(sparkMesh);

  // Flight trajectory state
  let isZipping = false;
  let flightT = 0;
  let flightDuration = 0.8;
  let startX = 0;
  let startY = 0;
  let startZ = 0;
  let targetX = 0;
  let targetY = 0;
  let targetZ = 0;
  let arcHeight = 5;

  let currentAimTarget: WebAimTarget | null = null;
  const camRayDir = new THREE.Vector3();

  const update: SpiderWebSystemHandle['update'] = (dt, camera, playerPos, collisionWorld) => {
    // Spin reticle subtly
    if (reticleGroup.visible) {
      reticleGroup.rotation.z += dt * 3.5;
    }

    if (isZipping) {
      // Keep web strand visually attached from current player hand to target
      webStrandMesh.visible = true;
      const dx = targetX - playerPos.x;
      const dy = targetY - (playerPos.y + 1.2);
      const dz = targetZ - playerPos.z;
      const dist = Math.hypot(dx, dy, dz);

      webStrandMesh.position.set(
        playerPos.x + dx * 0.5,
        playerPos.y + 1.2 + dy * 0.5,
        playerPos.z + dz * 0.5,
      );
      webStrandMesh.scale.set(1, 1, Math.max(0.1, dist));
      webStrandMesh.lookAt(targetX, targetY, targetZ);
      return;
    }

    // Cast ray forward from camera to detect where Spider-Man web will anchor!
    camera.getWorldDirection(camRayDir);

    const origin = camera.position;
    const maxRange = 260;
    let hitFound = false;
    let hitX = 0;
    let hitY = 0;
    let hitZ = 0;
    let normX = 0;
    let normY = 1;
    let normZ = 0;
    let hitDist = maxRange;
    let label = "Ko'cha";

    // 1. Raycast ground plane Y = 0
    if (camRayDir.y < -0.01) {
      const tGround = -origin.y / camRayDir.y;
      if (tGround > 2 && tGround < maxRange) {
        hitFound = true;
        hitDist = tGround;
        hitX = origin.x + camRayDir.x * tGround;
        hitY = 0.05;
        hitZ = origin.z + camRayDir.z * tGround;
        normX = 0;
        normY = 1;
        normZ = 0;
        label = 'Yer / Ko‘cha';
      }
    }

    // 2. Raycast static world collision boxes (buildings, towers, sky-metro viaduct piers)
    const boxes = collisionWorld.getBoxes();
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      // AABB ray intersection in XZ and height
      const tminX = (b.minX - origin.x) / (camRayDir.x || 1e-6);
      const tmaxX = (b.maxX - origin.x) / (camRayDir.x || 1e-6);
      const t1X = Math.min(tminX, tmaxX);
      const t2X = Math.max(tminX, tmaxX);

      const tminZ = (b.minZ - origin.z) / (camRayDir.z || 1e-6);
      const tmaxZ = (b.maxZ - origin.z) / (camRayDir.z || 1e-6);
      const t1Z = Math.min(tminZ, tmaxZ);
      const t2Z = Math.max(tminZ, tmaxZ);

      const tNear = Math.max(t1X, t1Z);
      const tFar = Math.min(t2X, t2Z);

      if (tNear < tFar && tFar > 2 && tNear < hitDist) {
        const testT = Math.max(2, tNear);
        const yAtHit = origin.y + camRayDir.y * testT;
        if (yAtHit >= -0.5 && yAtHit <= b.height + 2) {
          hitDist = testT;
          hitFound = true;
          hitX = origin.x + camRayDir.x * testT;
          hitY = Math.max(0.1, yAtHit);
          hitZ = origin.z + camRayDir.z * testT;

          // Determine surface normal
          if (Math.abs(hitY - b.height) < 1.2) {
            normX = 0;
            normY = 1;
            normZ = 0;
            label = 'Bino Tomi';
          } else {
            normX = Math.abs(hitX - b.minX) < 0.6 ? -1 : Math.abs(hitX - b.maxX) < 0.6 ? 1 : 0;
            normZ = Math.abs(hitZ - b.minZ) < 0.6 ? -1 : Math.abs(hitZ - b.maxZ) < 0.6 ? 1 : 0;
            normY = 0;
            label = 'Bino Devori';
          }
        }
      }
    }

    // 3. Fallback: elevated point forward if looking high into sky
    if (!hitFound && camRayDir.y > 0.1) {
      hitDist = 120;
      hitX = origin.x + camRayDir.x * hitDist;
      hitY = Math.min(110, Math.max(15, origin.y + camRayDir.y * hitDist));
      hitZ = origin.z + camRayDir.z * hitDist;
      normX = 0;
      normY = 1;
      normZ = 0;
      label = 'Havo / Osmono‘par';
      hitFound = true;
    }

    if (hitFound && hitDist < maxRange) {
      currentAimTarget = {
        point: { x: hitX, y: hitY, z: hitZ },
        normal: { x: normX, y: normY, z: normZ },
        distance: Math.round(hitDist),
        label,
      };

      reticleGroup.visible = true;
      reticleGroup.position.set(hitX, hitY, hitZ);
      if (Math.abs(normY) > 0.8) {
        reticleGroup.rotation.set(-Math.PI * 0.5, 0, 0);
      } else {
        reticleGroup.rotation.set(0, Math.atan2(normX, normZ), 0);
      }
    } else {
      currentAimTarget = null;
      reticleGroup.visible = false;
    }
  };

  const triggerWebZip = (playerPos: Vec3): boolean => {
    if (!currentAimTarget) return false;
    const tgt = currentAimTarget.point;

    startX = playerPos.x;
    startY = playerPos.y;
    startZ = playerPos.z;

    targetX = tgt.x;
    targetY = tgt.y;
    targetZ = tgt.z;

    const dist = Math.hypot(targetX - startX, targetY - startY, targetZ - startZ);
    if (dist < 2.5) return false;

    isZipping = true;
    flightT = 0;
    // Speed ~46 m/s
    flightDuration = Math.max(0.35, Math.min(2.4, dist / 46));
    arcHeight = Math.max(2.5, Math.min(24, dist * 0.18));

    audioEngine.playWebThwip();

    sparkMesh.visible = true;
    sparkMesh.position.set(targetX, targetY, targetZ);
    reticleGroup.visible = false;
    return true;
  };

  const stepFlight: SpiderWebSystemHandle['stepFlight'] = (
    dt,
    playerPos,
    setPos,
    setGrounded,
  ) => {
    if (!isZipping) return { finished: true };

    flightT += dt / Math.max(0.01, flightDuration);
    if (flightT >= 1) {
      isZipping = false;
      webStrandMesh.visible = false;
      sparkMesh.visible = false;
      setPos(targetX, Math.max(0, targetY + 0.15), targetZ);
      setGrounded(true);
      audioEngine.playFootstep(true);
      return { finished: true };
    }

    // Parabolic slingshot bezier trajectory
    const t = flightT;
    const smoothT = t * t * (3 - 2 * t);
    const curX = startX + (targetX - startX) * smoothT;
    const curZ = startZ + (targetZ - startZ) * smoothT;

    const baseHeight = startY + (targetY - startY) * smoothT;
    const arcLift = Math.sin(t * Math.PI) * arcHeight;
    const curY = baseHeight + arcLift;

    setPos(curX, curY, curZ);
    setGrounded(false);

    return { finished: false };
  };

  const reset = () => {
    isZipping = false;
    webStrandMesh.visible = false;
    sparkMesh.visible = false;
    reticleGroup.visible = false;
    currentAimTarget = null;
  };

  return {
    group,
    get isZipping() {
      return isZipping;
    },
    get aimTarget() {
      return currentAimTarget;
    },
    update,
    triggerWebZip,
    stepFlight,
    reset,
  };
}
