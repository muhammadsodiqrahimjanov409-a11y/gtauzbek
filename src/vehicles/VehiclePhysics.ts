import * as THREE from 'three';
import type { VehicleConfig, VehicleInstanceState } from '../types/game';
import type { CollisionWorld } from '../utils/collision';

export interface VehicleControlInputs {
  throttle: number; // 0..1
  reverse: number; // 0..1
  steer: number; // -1..1 (positive = left turn in right-handed +Y)
  handbrake: boolean;
}

export interface VehicleStepResult {
  distanceMeters: number;
  collidedHard: boolean;
  bodyPitch: number;
  bodyRoll: number;
}

export function stepVehiclePhysics(
  veh: VehicleInstanceState,
  cfg: VehicleConfig,
  inputs: VehicleControlInputs,
  collisionWorld: CollisionWorld,
  otherObstacles: Array<{ x: number; z: number; radius: number }>,
  dt: number,
): VehicleStepResult {
  const prevSpeed = veh.speed;

  // Longitudinal acceleration / braking / drag
  let isBraking = false;
  if (inputs.handbrake) {
    isBraking = true;
    const brakeDecel = cfg.braking * 1.15;
    if (Math.abs(veh.speed) <= brakeDecel * dt) {
      veh.speed = 0;
    } else {
      veh.speed -= Math.sign(veh.speed) * brakeDecel * dt;
    }
  } else if (inputs.throttle > 0.05) {
    if (veh.speed < -0.5) {
      // Braking while reversing
      isBraking = true;
      veh.speed += cfg.braking * inputs.throttle * dt;
    } else {
      const speedRatio = Math.max(0, veh.speed / cfg.maxSpeed);
      const torqueCurve = 1 - speedRatio * 0.55;
      veh.speed += cfg.acceleration * inputs.throttle * torqueCurve * dt;
      veh.speed = Math.min(cfg.maxSpeed, veh.speed);
    }
  } else if (inputs.reverse > 0.05) {
    if (veh.speed > 0.8) {
      // Foot brake while moving forward
      isBraking = true;
      veh.speed -= cfg.braking * inputs.reverse * dt;
    } else {
      veh.speed -= cfg.acceleration * 0.72 * inputs.reverse * dt;
      veh.speed = Math.max(-cfg.reverseSpeed, veh.speed);
    }
  } else {
    // Natural rolling resistance + air drag
    const drag = 4.2 + Math.abs(veh.speed) * 0.14;
    if (Math.abs(veh.speed) <= drag * dt) {
      veh.speed = 0;
    } else {
      veh.speed -= Math.sign(veh.speed) * drag * dt;
    }
  }

  veh.braking = isBraking;

  // Speed-sensitive steering & subtle handbrake drift boost
  const targetSteerAngle = inputs.steer * 0.52;
  veh.steerAngle = THREE.MathUtils.damp(veh.steerAngle, targetSteerAngle, 14, dt);

  const absSpeed = Math.abs(veh.speed);
  if (absSpeed > 0.25) {
    const lowSpeedFactor = Math.min(1, absSpeed / 4.5);
    const highSpeedDampen = 1 / (1 + absSpeed * 0.024);
    const driftBoost = inputs.handbrake && absSpeed > 6 ? 1.32 : 1.0;
    const dirSign = veh.speed >= 0 ? 1 : -1;
    veh.rotationY += inputs.steer * cfg.turnSpeed * lowSpeedFactor * highSpeedDampen * driftBoost * dirSign * dt;
  }

  // Airplane Flight Dynamics (Takeoff, Lift, Climb, Banking & Altitude)
  const isAirplane = cfg.bodyStyle === 'airplane';
  if (isAirplane) {
    if (veh.position.y === undefined) veh.position.y = 0;
    const isAirborne = veh.position.y > 0.25;

    if (absSpeed > 13 && inputs.throttle > 0.4) {
      // Supersonic jet lift generation & climb
      const climbForce = inputs.handbrake ? 24 : 14;
      veh.position.y = Math.min(135, veh.position.y + climbForce * (absSpeed / cfg.maxSpeed) * dt);
    } else if (isAirborne) {
      if (inputs.reverse > 0.2 || absSpeed < 10) {
        // Controlled descent or glide
        veh.position.y = Math.max(0, veh.position.y - 12 * dt);
      } else {
        // Natural cruise altitude hold with slight drift
        veh.position.y = Math.min(135, veh.position.y + (inputs.throttle > 0.7 ? 6 : -2) * dt);
      }
    }
    if (veh.position.y <= 0.08) {
      veh.position.y = 0;
    }
  }

  // Advance position with two-circle capsule approximation (front & rear axle checks)
  const sinY = Math.sin(veh.rotationY);
  const cosY = Math.cos(veh.rotationY);
  const prevX = veh.position.x;
  const prevZ = veh.position.z;

  let nextX = prevX + sinY * veh.speed * dt;
  let nextZ = prevZ + cosY * veh.speed * dt;

  let collidedHard = false;

  // In flight above 18m, planes clear all low traffic and obstacles (above 95m clears all skyscrapers)
  const isHighFlight = isAirplane && (veh.position.y || 0) > 18;

  if (!isHighFlight) {
    // Check center, front bumper, and rear bumper against static world AABBs
    const checkRadius = cfg.halfWidth * 1.08;
    const axleOffset = cfg.halfLength - checkRadius * 0.65;

    const frontRes = collisionWorld.resolveCircle(
      nextX + sinY * axleOffset,
      nextZ + cosY * axleOffset,
      checkRadius,
    );
    if (frontRes.hit) {
      nextX = frontRes.x - sinY * axleOffset;
      nextZ = frontRes.z - cosY * axleOffset;
      if (absSpeed > 4.2) collidedHard = true;
      veh.speed *= 0.35;
    }

    const rearRes = collisionWorld.resolveCircle(
      nextX - sinY * axleOffset,
      nextZ - cosY * axleOffset,
      checkRadius,
    );
    if (rearRes.hit) {
      nextX = rearRes.x + sinY * axleOffset;
      nextZ = rearRes.z + cosY * axleOffset;
      if (absSpeed > 4.2) collidedHard = true;
      veh.speed *= 0.35;
    }

    const centerRes = collisionWorld.resolveCircle(nextX, nextZ, checkRadius);
    nextX = centerRes.x;
    nextZ = centerRes.z;
    if (centerRes.hit && absSpeed > 4.2) {
      collidedHard = true;
      veh.speed *= 0.35;
    }

    // Check against dynamic vehicles (AI traffic & parked cars)
    const carBubbleRadius = cfg.halfWidth * 1.45;
    for (let i = 0; i < otherObstacles.length; i++) {
      const obs = otherObstacles[i];
      const dx = nextX - obs.x;
      const dz = nextZ - obs.z;
      const minDist = carBubbleRadius + obs.radius;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDist * minDist && dSq > 0.0001) {
        const d = Math.sqrt(dSq);
        const overlap = minDist - d;
        nextX += (dx / d) * overlap;
        nextZ += (dz / d) * overlap;
        if (absSpeed > 3.5) collidedHard = true;
        veh.speed *= 0.3;
      }
    }
  }

  veh.position.x = nextX;
  veh.position.z = nextZ;
  veh.wheelSpin += (veh.speed * dt) / 0.38;

  const distanceMeters = Math.hypot(nextX - prevX, nextZ - prevZ);
  const accel = (veh.speed - prevSpeed) / Math.max(0.008, dt);
  
  let bodyPitch = THREE.MathUtils.clamp(-accel * 0.0022, -0.045, 0.055);
  let bodyRoll = THREE.MathUtils.clamp(inputs.steer * (veh.speed / cfg.maxSpeed) * 0.055, -0.065, 0.065);

  if (isAirplane && (veh.position.y || 0) > 0.5) {
    // Aircraft aerodynamic banking & pitch in flight
    bodyRoll = THREE.MathUtils.clamp(inputs.steer * -0.45, -0.48, 0.48);
    bodyPitch = THREE.MathUtils.clamp(
      (inputs.handbrake ? 0.32 : 0.08) - (inputs.reverse > 0.2 ? 0.25 : 0),
      -0.28,
      0.38,
    );
  }

  return {
    distanceMeters,
    collidedHard,
    bodyPitch,
    bodyRoll,
  };
}
