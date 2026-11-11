import * as THREE from 'three';
import type { CameraMode, Vec3, VehicleBodyStyle } from '../types/game';
import type { CollisionWorld } from '../utils/collision';

const _desiredPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();

export class ThirdPersonCameraController {
  public yaw = 0;
  public pitch = 0.28;
  private currentPos = new THREE.Vector3(-65, 5.2, 166);
  private currentLook = new THREE.Vector3(-65, 1.5, 156);
  private manualLookCooldown = 0;

  public rotate(deltaX: number, deltaY: number, sensitivity: number): void {
    this.yaw -= deltaX * 0.0042 * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + deltaY * 0.0035 * sensitivity, -0.35, 1.18);
    this.manualLookCooldown = 1.8;
  }

  public snapBehind(pos: Vec3, headingYaw: number): void {
    this.yaw = headingYaw + Math.PI;
    this.currentPos.set(pos.x + Math.sin(this.yaw) * 7, pos.y + 3.2, pos.z + Math.cos(this.yaw) * 7);
    this.currentLook.set(pos.x, pos.y + 1.4, pos.z);
  }

  public updateMenuFlyover(camera: THREE.PerspectiveCamera, elapsed: number): void {
    const radius = 215;
    const angle = elapsed * 0.085;
    camera.position.set(Math.cos(angle) * radius, 68 + Math.sin(elapsed * 0.25) * 8, Math.sin(angle) * radius);
    camera.lookAt(0, 16, -45);
    if (Math.abs(camera.fov - 58) > 0.5) {
      camera.fov = 58;
      camera.updateProjectionMatrix();
    }
  }

  public updateGameplay(
    camera: THREE.PerspectiveCamera,
    focusPos: Vec3,
    actorHeadingYaw: number,
    inVehicle: boolean,
    vehicleSpeed: number,
    mode: CameraMode,
    baseDistance: number,
    baseFov: number,
    collisionWorld: CollisionWorld,
    dt: number,
    indoorCeilingHeight: number | null = null,
    vehicleBodyStyle: VehicleBodyStyle | null = null,
  ): void {
    if (this.manualLookCooldown > 0) {
      this.manualLookCooldown = Math.max(0, this.manualLookCooldown - dt);
    } else if (inVehicle && Math.abs(vehicleSpeed) > 2.2) {
      const desiredYaw = vehicleSpeed >= 0 ? actorHeadingYaw + Math.PI : actorHeadingYaw;
      let diff = (desiredYaw - this.yaw) % (Math.PI * 2);
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * (1 - Math.exp(-3.2 * dt));
    }

    const useFirstPerson = mode === 'first_person' || (inVehicle && mode === 'hood');

    if (useFirstPerson) {
      let eyeHeight = 1.58;
      let forwardOffset = 0.22;
      let lateralOffset = 0;

      if (inVehicle) {
        if (vehicleBodyStyle === 'fura') {
          eyeHeight = mode === 'hood' ? 2.58 : 2.38;
          forwardOffset = mode === 'hood' ? 3.92 : 2.85;
        } else if (vehicleBodyStyle === 'howo') {
          eyeHeight = mode === 'hood' ? 2.56 : 2.34;
          forwardOffset = mode === 'hood' ? 3.82 : 2.72;
        } else if (vehicleBodyStyle === 'kamaz') {
          eyeHeight = mode === 'hood' ? 2.38 : 2.18;
          forwardOffset = mode === 'hood' ? 3.28 : 2.28;
        } else if (vehicleBodyStyle === 'isuzu') {
          eyeHeight = mode === 'hood' ? 2.18 : 2.02;
          forwardOffset = mode === 'hood' ? 3.12 : 2.18;
        } else if (vehicleBodyStyle === 'gazel') {
          eyeHeight = mode === 'hood' ? 1.98 : 1.88;
          forwardOffset = mode === 'hood' ? 2.75 : 1.38;
        } else if (vehicleBodyStyle === 'labo') {
          eyeHeight = mode === 'hood' ? 1.76 : 1.66;
          forwardOffset = mode === 'hood' ? 2.02 : 1.18;
        } else if (vehicleBodyStyle === 'zil') {
          eyeHeight = mode === 'hood' ? 1.98 : 1.92;
          forwardOffset = mode === 'hood' ? 2.85 : 0.98;
        } else if (vehicleBodyStyle === 'excavator') {
          eyeHeight = 2.08;
          forwardOffset = 0.42;
          lateralOffset = 0.56;
        } else {
          eyeHeight = mode === 'hood' ? 1.42 : 1.28;
          forwardOffset = mode === 'hood' ? 0.85 : 0.15;
        }
      }

      const lookYaw = inVehicle ? actorHeadingYaw : this.yaw + Math.PI;
      const fx = Math.sin(lookYaw);
      const fz = Math.cos(lookYaw);
      const rx = Math.cos(lookYaw);
      const rz = -Math.sin(lookYaw);

      const camX = focusPos.x + fx * forwardOffset + rx * lateralOffset;
      const camY = focusPos.y + eyeHeight;
      const camZ = focusPos.z + fz * forwardOffset + rz * lateralOffset;

      const lx = camX + fx * 30;
      const ly = camY - Math.sin(this.pitch * 0.5) * 16;
      const lz = camZ + fz * 30;

      this.currentPos.set(camX, camY, camZ);
      this.currentLook.lerp(_targetLook.set(lx, ly, lz), 1 - Math.exp(-18 * dt));

      camera.position.copy(this.currentPos);
      camera.lookAt(this.currentLook);
    } else {
      const distMult = mode === 'far_chase' ? 1.45 : 1.0;
      const heavyMult =
        vehicleBodyStyle === 'fura'
          ? 1.72
          : vehicleBodyStyle === 'howo'
            ? 1.64
            : vehicleBodyStyle === 'kamaz'
              ? 1.48
              : vehicleBodyStyle === 'isuzu' || vehicleBodyStyle === 'zil' || vehicleBodyStyle === 'excavator'
                ? 1.42
                : vehicleBodyStyle === 'gazel'
                  ? 1.36
                  : vehicleBodyStyle === 'labo'
                    ? 1.28
                    : 1.25;
      const vehMult = inVehicle ? heavyMult : indoorCeilingHeight !== null ? 0.68 : 0.85;
      const dist = baseDistance * distMult * vehMult;

      const vehPivotH =
        vehicleBodyStyle === 'fura' || vehicleBodyStyle === 'howo'
          ? 2.05
          : vehicleBodyStyle === 'kamaz'
            ? 1.85
            : vehicleBodyStyle === 'isuzu' || vehicleBodyStyle === 'zil' || vehicleBodyStyle === 'excavator'
              ? 1.72
              : vehicleBodyStyle === 'gazel'
                ? 1.62
                : vehicleBodyStyle === 'labo'
                  ? 1.48
                  : 1.35;
      const pivotY = focusPos.y + (inVehicle ? vehPivotH : 1.48);
      const horizDist = Math.cos(Math.max(-0.08, this.pitch)) * dist;
      const vertDist = Math.sin(Math.max(-0.08, this.pitch)) * dist;

      const rawX = focusPos.x + Math.sin(this.yaw) * horizDist;
      const unclampedY = Math.max(0.75, pivotY + vertDist);
      const rawY =
        indoorCeilingHeight !== null
          ? Math.min(unclampedY, indoorCeilingHeight - 0.85)
          : unclampedY;
      const rawZ = focusPos.z + Math.cos(this.yaw) * horizDist;

      const clipT = collisionWorld.clipCameraSegment(
        focusPos.x,
        pivotY,
        focusPos.z,
        rawX,
        rawY,
        rawZ,
        0.55,
      );

      _desiredPos.set(
        focusPos.x + (rawX - focusPos.x) * clipT,
        Math.max(0.7, pivotY + (rawY - pivotY) * clipT),
        focusPos.z + (rawZ - focusPos.z) * clipT,
      );

      const minCharDist = inVehicle
        ? vehicleBodyStyle === 'fura' || vehicleBodyStyle === 'howo'
          ? 5.2
          : vehicleBodyStyle === 'kamaz' ||
              vehicleBodyStyle === 'isuzu' ||
              vehicleBodyStyle === 'zil' ||
              vehicleBodyStyle === 'excavator'
            ? 3.85
            : vehicleBodyStyle === 'gazel'
              ? 3.45
              : 2.8
        : 1.35;
      const dx = _desiredPos.x - focusPos.x;
      const dz = _desiredPos.z - focusPos.z;
      const flatD = Math.hypot(dx, dz);
      if (flatD < minCharDist && flatD > 0.001) {
        _desiredPos.x = focusPos.x + (dx / flatD) * minCharDist;
        _desiredPos.z = focusPos.z + (dz / flatD) * minCharDist;
      }

      const dampRate = inVehicle ? 11 : 14;
      this.currentPos.lerp(_desiredPos, 1 - Math.exp(-dampRate * dt));
      _targetLook.set(focusPos.x, pivotY + 0.15, focusPos.z);
      this.currentLook.lerp(_targetLook, 1 - Math.exp(-16 * dt));

      camera.position.copy(this.currentPos);
      camera.lookAt(this.currentLook);
    }

    const speedAddFov = inVehicle ? Math.min(12, Math.abs(vehicleSpeed) * 0.24) : 0;
    const targetFov = THREE.MathUtils.clamp(baseFov + speedAddFov, 50, 96);
    if (Math.abs(camera.fov - targetFov) > 0.15) {
      camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 6, dt);
      camera.updateProjectionMatrix();
    }
  }
}
