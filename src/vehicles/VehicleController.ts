import type { VehicleInstanceState } from '../types/game';
import { ROAD_COORDS } from '../game/gameConfig';
import type { TouchInputVector } from '../state/gameStore';
import type { VehicleControlInputs } from './VehiclePhysics';

export function readVehicleControlInputs(
  keys: Set<string>,
  touch: TouchInputVector,
  isCombatVehicle = false,
): VehicleControlInputs {
  let throttle = 0;
  let reverse = 0;
  let steer = 0;

  if (keys.has('KeyW') || keys.has('ArrowUp') || touch.gas) {
    throttle = 1;
  }
  if (keys.has('KeyS') || keys.has('ArrowDown') || touch.brake || touch.reverse) {
    reverse = 1;
  }

  if (keys.has('KeyA') || keys.has('ArrowLeft') || touch.steerLeft) {
    steer += 1;
  }
  if (keys.has('KeyD') || keys.has('ArrowRight') || touch.steerRight) {
    steer -= 1;
  }
  if (Math.abs(touch.moveX) > 0.08 && !touch.steerLeft && !touch.steerRight) {
    steer -= touch.moveX;
  }

  const handbrake = isCombatVehicle ? touch.handbrake : (keys.has('Space') || touch.handbrake);

  return {
    throttle,
    reverse,
    steer: Math.max(-1, Math.min(1, steer)),
    handbrake,
  };
}

export function resetVehicleOntoRoad(veh: VehicleInstanceState): void {
  let bestRoad: number = ROAD_COORDS[0];
  let minD = Math.abs(veh.position.x - bestRoad);
  let snapToX = true;

  for (const r of ROAD_COORDS) {
    const dx = Math.abs(veh.position.x - r);
    if (dx < minD) {
      minD = dx;
      bestRoad = r;
      snapToX = true;
    }
    const dz = Math.abs(veh.position.z - r);
    if (dz < minD) {
      minD = dz;
      bestRoad = r;
      snapToX = false;
    }
  }

  if (snapToX) {
    veh.position.x = bestRoad + 8.5;
    veh.rotationY = 0;
  } else {
    veh.position.z = bestRoad + 8.5;
    veh.rotationY = Math.PI * 0.5;
  }
  veh.position.y = 0;
  veh.speed = 0;
  veh.steerAngle = 0;
}
