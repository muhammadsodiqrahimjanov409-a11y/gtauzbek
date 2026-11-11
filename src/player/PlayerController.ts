import * as THREE from 'three';
import type { Vec3 } from '../types/game';
import type { TouchInputVector } from '../state/gameStore';
import type { CollisionWorld } from '../utils/collision';
import { audioEngine } from '../utils/audio';

export interface PlayerRuntimeState {
  position: Vec3;
  rotationY: number;
  velocityY: number;
  isGrounded: boolean;
  horizontalSpeed: number;
  isSprinting: boolean;
}

export interface WalkableSurfaceResult {
  groundY: number;
  clampedX: number;
  clampedZ: number;
}

const WALK_SPEED = 5.6;
const SPRINT_SPEED = 9.8;
const JUMP_VELOCITY = 6.8;
const GRAVITY = 19.5;
const PLAYER_RADIUS = 0.46;

function normalizeAngleDelta(a: number): number {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function stepPlayerController(
  state: PlayerRuntimeState,
  keys: Set<string>,
  touch: TouchInputVector,
  cameraYaw: number,
  touchSensitivity: number,
  collisionWorld: CollisionWorld,
  dt: number,
  resolveWalkableSurface?: (x: number, z: number, currentY: number) => WalkableSurfaceResult,
): number {
  let inputForward = 0;
  let inputRight = 0;

  if (keys.has('KeyW') || keys.has('ArrowUp')) inputForward += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) inputForward -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) inputRight += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) inputRight -= 1;

  if (Math.abs(touch.moveX) > 0.05 || Math.abs(touch.moveY) > 0.05) {
    const sens = Math.min(1.4, Math.max(0.5, touchSensitivity));
    inputRight += touch.moveX * sens;
    inputForward += touch.moveY * sens;
  }

  const mag = Math.hypot(inputRight, inputForward);
  if (mag > 1) {
    inputRight /= mag;
    inputForward /= mag;
  }

  const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.sprint;
  state.isSprinting = sprinting && mag > 0.1;

  // Camera forward on XZ plane is (-sin(cameraYaw), -cos(cameraYaw))
  const forwardX = -Math.sin(cameraYaw);
  const forwardZ = -Math.cos(cameraYaw);
  const rightX = Math.cos(cameraYaw);
  const rightZ = -Math.sin(cameraYaw);

  const moveDirX = forwardX * inputForward + rightX * inputRight;
  const moveDirZ = forwardZ * inputForward + rightZ * inputRight;
  const moveLen = Math.hypot(moveDirX, moveDirZ);

  const targetSpeed =
    moveLen > 0.05 ? (state.isSprinting ? SPRINT_SPEED : WALK_SPEED) * Math.min(1, moveLen) : 0;
  state.horizontalSpeed = THREE.MathUtils.damp(state.horizontalSpeed, targetSpeed, 12, dt);

  let stepDist = 0;
  if (moveLen > 0.05 && state.horizontalSpeed > 0.05) {
    const nx = moveDirX / moveLen;
    const nz = moveDirZ / moveLen;

    const desiredYaw = Math.atan2(nx, nz);
    const deltaYaw = normalizeAngleDelta(desiredYaw - state.rotationY);
    state.rotationY += deltaYaw * (1 - Math.exp(-12 * dt));

    const prevX = state.position.x;
    const prevZ = state.position.z;

    const rawX = prevX + nx * state.horizontalSpeed * dt;
    const rawZ = prevZ + nz * state.horizontalSpeed * dt;

    // When elevated on a Sky-Metro bridge/platform (Y > 2.2), skip ground-level curb/pier pushout
    if (state.position.y > 2.2) {
      state.position.x = rawX;
      state.position.z = rawZ;
    } else {
      const resolved = collisionWorld.resolveCircle(rawX, rawZ, PLAYER_RADIUS);
      state.position.x = resolved.x;
      state.position.z = resolved.z;
    }

    stepDist = Math.hypot(state.position.x - prevX, state.position.z - prevZ);
    if (state.isGrounded && stepDist > 0.01) {
      audioEngine.playFootstep(state.isSprinting);
    }
  } else if (state.position.y <= 2.2) {
    const resolved = collisionWorld.resolveCircle(state.position.x, state.position.z, PLAYER_RADIUS);
    state.position.x = resolved.x;
    state.position.z = resolved.z;
  }

  let groundY = 0;
  if (resolveWalkableSurface) {
    const surf = resolveWalkableSurface(state.position.x, state.position.z, state.position.y);
    groundY = surf.groundY;
    state.position.x = surf.clampedX;
    state.position.z = surf.clampedZ;
  }

  // Jump & Gravity relative to dynamic groundY (street Y=0 OR Metro escalator/platform Y=0..9.76m)
  const wantsJump = keys.has('Space') || touch.jump;
  if (wantsJump && state.isGrounded) {
    state.velocityY = JUMP_VELOCITY;
    state.isGrounded = false;
  }

  if (!state.isGrounded) {
    state.velocityY -= GRAVITY * dt;
    state.position.y += state.velocityY * dt;
    if (state.position.y <= groundY) {
      state.position.y = groundY;
      state.velocityY = 0;
      state.isGrounded = true;
    }
  } else {
    // Smoothly follow stair/escalator ramps up and down while grounded
    if (Math.abs(state.position.y - groundY) <= 2.4) {
      state.position.y = groundY;
      state.velocityY = 0;
    } else if (state.position.y > groundY) {
      state.isGrounded = false;
    } else {
      state.position.y = groundY;
    }
  }

  return stepDist;
}
